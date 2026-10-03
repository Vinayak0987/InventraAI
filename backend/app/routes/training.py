"""
Training Routes
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.dataset import Dataset
from app.models.experiment import Experiment, TrainingJob
import pandas as pd
import io
from sklearn.preprocessing import LabelEncoder, StandardScaler

training_bp = Blueprint('training', __name__)


def _fail_experiment(experiment, message: str):
    """Mark experiment failed and persist a user-visible error message."""
    experiment.status = 'failed'
    results = dict(experiment.results or {})
    results['error_message'] = message
    experiment.results = results
    db.session.commit()


# CombinedPreprocessor at module level for pickle compatibility
class CombinedPreprocessor:
    """Preprocessor that handles both categorical encoding and scaling"""
    
    def __init__(self):
        self.label_encoders = {}
        self.target_encoder = None
        self.scaler = StandardScaler()
        self.feature_columns = None
        self.categorical_columns = []
        self.numeric_columns = []
    
    def fit_transform(self, X):
        self.feature_columns = list(X.columns)
        self.categorical_columns = list(
            X.select_dtypes(include=['object', 'category', 'string', 'bool']).columns
        )
        self.numeric_columns = [c for c in self.feature_columns if c not in self.categorical_columns]
        
        X_processed = X.copy()
        
        # Encode categorical features
        for col in self.categorical_columns:
            self.label_encoders[col] = LabelEncoder()
            X_processed[col] = self.label_encoders[col].fit_transform(X_processed[col].astype(str))
        
        # Fill missing values
        X_processed = X_processed.fillna(X_processed.median())
        
        # Scale all features
        return self.scaler.fit_transform(X_processed)
    
    def transform(self, X):
        import pandas as pd
        X_processed = X.copy()
        
        # Encode categorical features
        for col in self.categorical_columns:
            if col in X_processed.columns and col in self.label_encoders:
                le = self.label_encoders[col]
                # Handle unseen labels by using the most frequent class
                X_processed[col] = X_processed[col].astype(str).apply(
                    lambda x: le.transform([x])[0] if x in le.classes_ else 0
                )
        
        # Handle missing columns (fill with 0)
        for col in self.feature_columns:
            if col not in X_processed.columns:
                X_processed[col] = 0
        
        # Reorder columns and fill missing values
        X_processed = X_processed[self.feature_columns].fillna(0)
        
        return self.scaler.transform(X_processed)


@training_bp.route('/analyze-prompt', methods=['POST'])
@jwt_required()
def analyze_with_prompt():
    """
    Analyze a dataset with a natural language prompt using Gemini AI.
    Returns suggested target column, problem type, and reasoning.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    dataset_id = data.get('dataset_id')
    prompt = data.get('prompt', '')
    
    if not dataset_id:
        return jsonify({'error': 'Dataset ID is required'}), 400
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    # Verify dataset exists and belongs to user
    dataset = Dataset.query.filter_by(id=dataset_id, user_id=user_id).first()
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    try:
        # Import Gemini service
        from app.services.gemini_service import get_gemini_service
        from app.services.minio_service import get_minio_service
        
        # Load dataset to get sample data
        minio_service = get_minio_service()
        file_content = minio_service.download_bytes('datasets', dataset.file_path)
        
        if not file_content:
            return jsonify({'error': 'Could not load dataset'}), 500
        
        df = pd.read_csv(io.BytesIO(file_content))
        
        # Prepare data for Gemini
        columns = list(df.columns)
        column_types = {col: str(df[col].dtype) for col in columns}
        sample_data = df.head(10).to_dict(orient='records')
        
        # Call Gemini to analyze
        gemini_service = get_gemini_service()
        result = gemini_service.analyze_dataset_with_prompt(
            columns=columns,
            column_types=column_types,
            sample_data=sample_data,
            user_prompt=prompt
        )
        
        return jsonify({
            'success': True,
            'analysis': result
        }), 200
        
    except ValueError as e:
        # Gemini API key not configured
        return jsonify({
            'error': str(e),
            'suggestion': 'Please configure GEMINI_API_KEY in your environment'
        }), 500
    except Exception as e:
        return jsonify({
            'error': f'Analysis failed: {str(e)}'
        }), 500


@training_bp.route('/start', methods=['POST'])
@jwt_required()
def start_training():
    """Start a new training job"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    dataset_id = data.get('dataset_id')
    name = data.get('name', 'Untitled Experiment')
    target_column = data.get('target_column')
    goal_description = data.get('goal_description', '')
    
    if not dataset_id:
        return jsonify({'error': 'Dataset ID is required'}), 400
    
    # Verify dataset exists and belongs to user
    dataset = Dataset.query.filter_by(id=dataset_id, user_id=user_id).first()
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    # Create experiment
    experiment = Experiment(
        name=name,
        target_column=target_column,
        goal_description=goal_description,
        status='training',
        user_id=user_id,
        dataset_id=dataset_id,
        config=data.get('config', {})
    )
    
    db.session.add(experiment)
    db.session.commit()
    
    # Run training synchronously for now (for simplicity in development)
    import threading
    from flask import current_app
    
    # Capture the real app object while we're still in the request context
    app = current_app._get_current_object()
    
    # Extract data needed for thread to avoid DetachedInstanceError
    experiment_id = experiment.id
    file_path = dataset.file_path
    column_info = dataset.column_info
    
    def run_training(app_instance):
        print("🧵 Training thread started...", flush=True)
        try:
            with app_instance.app_context():
                print(f"🔄 Running training task for experiment {experiment_id}", flush=True)
                print(f"📂 Dataset Path: {file_path}", flush=True)
                _run_training_task(experiment_id, file_path, target_column, column_info)
        except Exception as e:
            print(f"❌ Training thread error: {e}", flush=True)
            import traceback
            traceback.print_exc()
    
    # Start training in background thread
    print(f"🚀 Launching training thread for Expt {experiment_id}...", flush=True)
    thread = threading.Thread(target=run_training, args=(app,))
    thread.daemon = True
    thread.start()
    print("✅ Training thread launched", flush=True)
    
    return jsonify({
        'message': 'Training started',
        'experiment': experiment.to_dict()
    }), 201


def _run_training_task(experiment_id, file_path, target_column, column_info):
    """Run the actual training task"""
    import pandas as pd
    import numpy as np
    from sklearn.model_selection import train_test_split, cross_val_score
    from sklearn.preprocessing import LabelEncoder, StandardScaler
    from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.metrics import accuracy_score, f1_score, r2_score, mean_squared_error
    import joblib
    import io
    import json
    
    experiment = Experiment.query.get(experiment_id)
    if not experiment:
        return
    
    print(f"\n{'='*60}", flush=True)
    print(f"🚀 STARTING TRAINING - Experiment #{experiment_id}", flush=True)
    print(f"{'='*60}", flush=True)
    
    try:
        # Load dataset from MinIO or local uploads
        dataset_record = Dataset.query.get(experiment.dataset_id)
        file_type = dataset_record.file_type if dataset_record else 'csv'
        try:
            from app.services.dataset_loader import load_dataset_dataframe
            print(f"📂 Loading dataset file: {file_path}", flush=True)
            df = load_dataset_dataframe(file_path, file_type=file_type)
            print(f"📊 DataFrame loaded: {df.shape}", flush=True)
        except FileNotFoundError as e:
            print(f"⚠️ Dataset load failed: {e}", flush=True)
            _fail_experiment(
                experiment,
                f'Could not load dataset file. Upload a CSV on the Datasets page, '
                f'then train on that upload (not the demo sample). Details: {e}',
            )
            return
        except Exception as e:
            print(f"⚠️ Dataset load failed: {e}", flush=True)
            _fail_experiment(experiment, f'Could not read dataset: {e}')
            return

        # Prepare data
        if target_column not in df.columns:
            _fail_experiment(
                experiment,
                f'Target column "{target_column}" not found in dataset.',
            )
            return
        
        X = df.drop(columns=[target_column])
        y_raw = df[target_column]

        # Detect problem type and encode target (required for XGBoost/LightGBM)
        target_encoder = None
        if pd.api.types.is_numeric_dtype(y_raw) and y_raw.nunique() >= 10:
            problem_type = 'regression'
            y = pd.to_numeric(y_raw, errors='coerce').values
        else:
            problem_type = 'classification'
            target_encoder = LabelEncoder()
            y = target_encoder.fit_transform(y_raw.astype(str))

        experiment.problem_type = problem_type
        db.session.commit()

        # Use the module-level CombinedPreprocessor for pickle compatibility
        preprocessor = CombinedPreprocessor()
        preprocessor.target_encoder = target_encoder
        X_scaled = preprocessor.fit_transform(X)
        y = np.asarray(y, dtype=np.int64 if problem_type == 'classification' else np.float64)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)
        
        # Define models to try - ALL AVAILABLE ALGORITHMS
        if problem_type == 'classification':
            from sklearn.ensemble import GradientBoostingClassifier, AdaBoostClassifier, ExtraTreesClassifier
            from sklearn.svm import SVC
            from sklearn.neighbors import KNeighborsClassifier
            from sklearn.tree import DecisionTreeClassifier
            
            models = [
                ('Logistic Regression', LogisticRegression(max_iter=1000, random_state=42)),
                ('Random Forest', RandomForestClassifier(n_estimators=100, random_state=42)),
                ('Gradient Boosting', GradientBoostingClassifier(n_estimators=100, random_state=42, max_depth=5)),
                ('SVM', SVC(kernel='rbf', probability=True, random_state=42)),
                ('KNN', KNeighborsClassifier(n_neighbors=5)),
                ('Decision Tree', DecisionTreeClassifier(random_state=42, max_depth=10)),
                ('AdaBoost', AdaBoostClassifier(n_estimators=100, random_state=42)),
                ('Extra Trees', ExtraTreesClassifier(n_estimators=100, random_state=42)),
            ]
            
            # Add XGBoost if available
            try:
                from xgboost import XGBClassifier
                models.append(('XGBoost', XGBClassifier(
                    n_estimators=100,
                    random_state=42,
                    eval_metric='mlogloss' if len(np.unique(y_train)) > 2 else 'logloss',
                )))
            except ImportError:
                print("⚠️ XGBoost not available, skipping...", flush=True)
            
            # Add LightGBM if available
            try:
                from lightgbm import LGBMClassifier
                models.append(('LightGBM', LGBMClassifier(n_estimators=100, random_state=42, verbose=-1)))
            except ImportError:
                print("⚠️ LightGBM not available, skipping...", flush=True)
            
            scoring = 'accuracy'
        else:
            from sklearn.linear_model import Lasso, ElasticNet
            from sklearn.ensemble import GradientBoostingRegressor, AdaBoostRegressor, ExtraTreesRegressor
            from sklearn.svm import SVR
            from sklearn.neighbors import KNeighborsRegressor
            from sklearn.tree import DecisionTreeRegressor
            
            models = [
                ('Linear Regression', LinearRegression()),
                ('Ridge Regression', Ridge(random_state=42)),
                ('Lasso Regression', Lasso(random_state=42, max_iter=2000)),
                ('ElasticNet', ElasticNet(random_state=42, max_iter=2000)),
                ('Random Forest', RandomForestRegressor(n_estimators=100, random_state=42)),
                ('Gradient Boosting', GradientBoostingRegressor(n_estimators=100, random_state=42, max_depth=5)),
                ('SVR', SVR(kernel='rbf')),
                ('KNN', KNeighborsRegressor(n_neighbors=5)),
                ('Decision Tree', DecisionTreeRegressor(random_state=42, max_depth=10)),
                ('AdaBoost', AdaBoostRegressor(n_estimators=100, random_state=42)),
                ('Extra Trees', ExtraTreesRegressor(n_estimators=100, random_state=42)),
            ]
            
            # Add XGBoost if available
            try:
                from xgboost import XGBRegressor
                models.append(('XGBoost', XGBRegressor(n_estimators=100, random_state=42)))
            except ImportError:
                print("⚠️ XGBoost not available, skipping...", flush=True)
            
            # Add LightGBM if available
            try:
                from lightgbm import LGBMRegressor
                models.append(('LightGBM', LGBMRegressor(n_estimators=100, random_state=42, verbose=-1)))
            except ImportError:
                print("⚠️ LightGBM not available, skipping...", flush=True)
            
            scoring = 'r2'

        
        print(f"\n📊 Problem Type: {problem_type.upper()}")
        print(f"📈 Models to train: {len(models)}")
        print(f"{'─'*40}")
        
        best_model = None
        best_score = -float('inf')
        best_model_name = ''
        all_results = []
        
        for model_name, model in models:
            # Create training job record
            job = TrainingJob(
                experiment_id=experiment.id,
                model_name=model_name,
                status='training',
                logs=f"🚀 Starting training for {model_name}...\n"
            )
            db.session.add(job)
            db.session.commit()
            
            try:
                # Train model
                print(f"\n⏳ Training {model_name}...", flush=True)
                job.logs += f"⏳ Training model...\n"
                db.session.commit()
                
                model.fit(X_train, y_train)
                
                # Evaluate
                if problem_type == 'classification':
                    y_pred = model.predict(X_test)
                    score = accuracy_score(y_test, y_pred)
                    f1 = f1_score(y_test, y_pred, average='weighted')
                    job.metrics = {'accuracy': score, 'f1_score': f1}
                    log_msg = f"✅ Training completed.\n📊 Accuracy: {score:.4f}\n📊 F1 Score: {f1:.4f}\n"
                else:
                    y_pred = model.predict(X_test)
                    score = r2_score(y_test, y_pred)
                    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
                    job.metrics = {'r2_score': score, 'rmse': rmse}
                    log_msg = f"✅ Training completed.\n📊 R² Score: {score:.4f}\n📊 RMSE: {rmse:.4f}\n"
                
                job.cv_score = score
                job.status = 'completed'
                job.logs += log_msg
                db.session.commit()
                
                # Print score
                print(log_msg.replace('\n', ' '), flush=True)
                
                all_results.append({
                    'model': model_name,
                    'score': score,
                    'metrics': job.metrics
                })
                
                if score > best_score:
                    best_score = score
                    best_model = model
                    best_model_name = model_name
                    
            except Exception as e:
                job.status = 'failed'
                job.error_message = str(e)
                job.logs += f"❌ Training failed: {str(e)}\n"
                db.session.commit()
                print(f"   ❌ {model_name}: FAILED - {e}", flush=True)
        
        # Update experiment with results
        experiment.status = 'completed'
        experiment.best_model_name = best_model_name
        experiment.best_score = float(best_score)
        experiment.results = {
            'all_models': all_results,
            'best_model': best_model_name,
            'best_score': float(best_score),
            'problem_type': problem_type,
            'feature_names': list(X.columns)
        }
        db.session.commit()
        
        print(f"\n{'='*60}")
        print(f"🏆 TRAINING COMPLETE!")
        print(f"{'='*60}")
        print(f"   Best Model: {best_model_name}")
        print(f"   Best Score: {best_score:.4f}")
        print(f"{'='*60}\n")
        
        # Package the best model into a ZIP file
        if best_model is not None:
            try:
                import tempfile
                import sys
                import os
                project_root = os.path.abspath(
                    os.path.join(os.path.dirname(__file__), '..', '..', '..')
                )
                if project_root not in sys.path:
                    sys.path.insert(0, project_root)
                from ml_engine.packaging.model_packager import ModelPackager, create_feature_schema
                from app.services.minio_service import get_minio_service
                
                print("📦 Packaging model...", flush=True)
                
                with tempfile.TemporaryDirectory() as tmp_dir:
                    packager = ModelPackager(tmp_dir)
                    
                    # Create feature schema from DataFrame
                    feature_schema = create_feature_schema(df, target_column)
                    
                    # Prepare metadata
                    metadata = {
                        'name': experiment.name or f"Model_{experiment.id}",
                        'experiment_id': experiment.id,
                        'problem_type': problem_type,
                        'target_column': target_column,
                        'best_model': best_model_name,
                        'best_score': float(best_score),
                        'training_results': all_results,
                        'target_classes': (
                            list(target_encoder.classes_)
                            if target_encoder is not None
                            else None
                        ),
                    }
                    
                    # Create the package directory with all files
                    package_dir = packager.package(
                        model=best_model,
                        preprocessor=preprocessor,  # The CombinedPreprocessor we created
                        feature_schema=feature_schema,
                        metadata=metadata,
                        model_format='pkl'
                    )
                    
                    # Create ZIP file
                    zip_path = packager.create_zip(package_dir)
                    print(f"📦 ZIP created: {zip_path}", flush=True)
                    
                    # Upload to MinIO
                    minio_service = get_minio_service()
                    zip_filename = f"user_{experiment.user_id}/experiment_{experiment.id}/model_package.zip"
                    
                    with open(zip_path, 'rb') as f:
                        zip_content = f.read()
                    
                    minio_service.upload_bytes(
                        bucket='models',
                        object_name=zip_filename,
                        data=zip_content,
                        content_type='application/zip'
                    )
                    
                    # Update experiment with model path
                    # Need to copy and update to trigger SQLAlchemy change detection
                    updated_results = dict(experiment.results or {})
                    updated_results['model_package_path'] = zip_filename
                    experiment.results = updated_results
                    db.session.commit()
                    
                    print(f"✅ Model package uploaded: {zip_filename}", flush=True)
                    
            except Exception as pack_error:
                print(f"⚠️ Model packaging failed: {pack_error}", flush=True)
                import traceback
                traceback.print_exc()
        
        # FINAL ENSURE: Make absolutely sure experiment status is 'completed'
        # Re-fetch to avoid stale session issues in background thread
        try:
            db.session.expire_all()
            final_exp = Experiment.query.get(experiment_id)
            if final_exp and final_exp.status != 'completed':
                print(f"⚠️ Fixing status: was '{final_exp.status}', setting to 'completed'", flush=True)
                final_exp.status = 'completed'
                final_exp.completed_at = datetime.utcnow()
                db.session.commit()
                print(f"✅ Status fixed to 'completed'", flush=True)
        except Exception as fix_error:
            print(f"❌ Failed to fix status: {fix_error}", flush=True)
        
    except Exception as e:
        _fail_experiment(experiment, str(e))
        print(f"Training failed: {e}")



@training_bp.route('/<int:job_id>/status', methods=['GET'])
@jwt_required()
def get_training_status(job_id):
    """Get training job status"""
    user_id = int(get_jwt_identity())
    
    experiment = Experiment.query.filter_by(id=job_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    # Get all training jobs for this experiment
    jobs = TrainingJob.query.filter_by(experiment_id=experiment.id).all()
    
    return jsonify({
        'experiment': experiment.to_dict(),
        'jobs': [j.to_dict() for j in jobs]
    }), 200


@training_bp.route('/<int:job_id>/logs', methods=['GET'])
@jwt_required()
def get_training_logs(job_id):
    """Get training logs"""
    user_id = int(get_jwt_identity())
    
    experiment = Experiment.query.filter_by(id=job_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    jobs = TrainingJob.query.filter_by(experiment_id=experiment.id).all()
    
    logs = []
    for job in jobs:
        logs.append({
            'model_name': job.model_name,
            'status': job.status,
            'logs': job.logs,
            'error': job.error_message
        })
    
    return jsonify({'logs': logs}), 200


@training_bp.route('/<int:job_id>/cancel', methods=['POST'])
@jwt_required()
def cancel_training(job_id):
    """Cancel a training job"""
    user_id = int(get_jwt_identity())
    
    experiment = Experiment.query.filter_by(id=job_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Experiment not found'}), 404
    
    if experiment.status != 'training':
        return jsonify({'error': 'Experiment is not currently training'}), 400
    
    # TODO: Cancel Celery task
    
    experiment.status = 'cancelled'
    db.session.commit()
    
    return jsonify({'message': 'Training cancelled'}), 200
