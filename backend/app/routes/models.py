"""
Models Routes
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.experiment import Experiment

models_bp = Blueprint('models', __name__)


@models_bp.route('', methods=['GET'])
@jwt_required()
def list_models():
    """List all trained models for current user"""
    user_id = int(get_jwt_identity())
    
    # Get completed experiments (trained models)
    experiments = Experiment.query.filter_by(
        user_id=user_id,
        status='completed'
    ).order_by(Experiment.completed_at.desc()).all()
    
    return jsonify({
        'models': [e.to_dict() for e in experiments],
        'total': len(experiments)
    }), 200


@models_bp.route('/<int:model_id>', methods=['GET'])
@jwt_required()
def get_model(model_id):
    """Get model details"""
    user_id = int(get_jwt_identity())
    
    experiment = Experiment.query.filter_by(id=model_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Model not found'}), 404
    
    return jsonify({'model': experiment.to_dict()}), 200


@models_bp.route('/<int:model_id>/download', methods=['GET'])
@jwt_required()
def download_model(model_id):
    """Download model package as ZIP file"""
    from flask import Response
    from app.services.minio_service import get_minio_service
    
    user_id = int(get_jwt_identity())
    
    experiment = Experiment.query.filter_by(id=model_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Model not found'}), 404
    
    if experiment.status != 'completed':
        return jsonify({'error': 'Model training not completed'}), 400
    
    # Get model package path from results
    results = experiment.results or {}
    model_package_path = results.get('model_package_path')
    
    print(f"📥 Download request for model {model_id}", flush=True)
    print(f"   Results: {results}", flush=True)
    print(f"   Package path: {model_package_path}", flush=True)
    
    if not model_package_path:
        print(f"   ❌ No model_package_path in results", flush=True)
        return jsonify({'error': 'Model package not available. Please train a new model.'}), 404
    
    try:
        # Download from MinIO
        minio_service = get_minio_service()
        print(f"   📦 Downloading from MinIO: {model_package_path}", flush=True)
        
        # Handle legacy paths that might have incorrect 'models/' prefix
        if model_package_path.startswith('models/'):
            corrected_path = model_package_path[7:]  # Remove 'models/' prefix
            print(f"   🔄 Corrected path (removed 'models/' prefix): {corrected_path}", flush=True)
        else:
            corrected_path = model_package_path
        
        zip_content = minio_service.download_bytes('models', corrected_path)
        
        if not zip_content:
            print(f"   ❌ download_bytes returned None", flush=True)
            return jsonify({'error': 'Failed to download model package'}), 500
        
        # Return as downloadable file
        filename = f"{experiment.name.replace(' ', '_')}_model.zip"
        
        return Response(
            zip_content,
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Length': str(len(zip_content))
            }
        )
        
    except Exception as e:
        return jsonify({'error': f'Download failed: {str(e)}'}), 500


@models_bp.route('/<int:model_id>/schema', methods=['GET'])
@jwt_required()
def get_model_schema(model_id):
    """Get model UI schema for prediction form generation"""
    from app.services.minio_service import get_minio_service
    import zipfile
    import tempfile
    
    user_id = int(get_jwt_identity())
    
    experiment = Experiment.query.filter_by(id=model_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Model not found'}), 404
    
    # Get schema from model package
    results = experiment.results or {}
    model_package_path = results.get('model_package_path')
    
    ui_schema = {'fields': []}
    
    if model_package_path:
        try:
            minio_service = get_minio_service()
            # Handle legacy paths with incorrect 'models/' prefix
            corrected_path = model_package_path[7:] if model_package_path.startswith('models/') else model_package_path
            zip_content = minio_service.download_bytes('models', corrected_path)
            
            if zip_content:
                import io
                import json
                
                zip_buffer = io.BytesIO(zip_content)
                with zipfile.ZipFile(zip_buffer, 'r') as zip_ref:
                    # Try to read ui_schema.json
                    if 'ui_schema.json' in zip_ref.namelist():
                        with zip_ref.open('ui_schema.json') as f:
                            ui_schema = json.load(f)
        except Exception as e:
            print(f"Error loading schema: {e}")
    
    return jsonify({
        'model_id': model_id,
        'model_name': experiment.name,
        'target_column': experiment.target_column,
        'ui_schema': ui_schema
    }), 200


@models_bp.route('/<int:model_id>', methods=['DELETE'])
@jwt_required()
def delete_model(model_id):
    """Delete a model and all related records"""
    from app.models.order import Order
    from app.models.experiment import TrainingJob
    
    user_id = int(get_jwt_identity())
    
    experiment = Experiment.query.filter_by(id=model_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Model not found'}), 404
    
    try:
        # Delete related orders first (foreign key constraint)
        Order.query.filter_by(experiment_id=model_id).delete()
        
        # Delete related training jobs
        TrainingJob.query.filter_by(experiment_id=model_id).delete()
        
        # TODO: Delete model files from MinIO
        
        # Now delete the experiment
        db.session.delete(experiment)
        db.session.commit()
        
        return jsonify({'message': 'Model deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting model {model_id}: {e}", flush=True)
        return jsonify({'error': f'Failed to delete model: {str(e)}'}), 500


@models_bp.route('/analyze-reasoning', methods=['POST'])
@jwt_required()
def analyze_reasoning():
    """Generate AI reasoning for model predictions"""
    import json
    
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    model_id = data.get('model_id')
    input_features = data.get('input_features', {})
    prediction_result = data.get('prediction_result')
    
    if not model_id:
        return jsonify({'error': 'Model ID is required'}), 400
    
    experiment = Experiment.query.filter_by(id=model_id, user_id=user_id).first()
    if not experiment:
        return jsonify({'error': 'Model not found'}), 404
    
    # Get model info
    model_name = experiment.best_model_name or 'Unknown'
    problem_type = experiment.problem_type or 'classification'
    feature_names = (experiment.results or {}).get('feature_names', [])
    best_score = experiment.best_score or 0
    
    try:
        # Use Gemini for AI reasoning
        from app.services.gemini_service import get_gemini_service
        gemini_service = get_gemini_service()
        
        # Build reasoning prompt
        prompt = f"""
        Analyze this machine learning prediction and provide detailed reasoning:
        
        MODEL INFORMATION:
        - Algorithm: {model_name}
        - Problem Type: {problem_type}
        - Model Accuracy/Score: {best_score:.2%}
        - Features Used: {', '.join(feature_names[:10])}
        
        INPUT VALUES:
        {json.dumps(input_features, indent=2)}
        
        PREDICTION RESULT:
        {prediction_result}
        
        Please provide:
        1. FEATURE IMPORTANCE: Estimate which input features most influenced this prediction (return as percentages)
        2. KEY FACTORS: List 3-5 key factors that led to this prediction
        3. EXPLANATION: A clear, non-technical explanation of why the model made this prediction
        4. CONFIDENCE: Your confidence level in this prediction (0-100%)
        5. RECOMMENDATIONS: Any suggestions for improving the input data or model
        
        Format your response as JSON:
        {{
            "feature_importance": {{"feature1": 0.3, "feature2": 0.25, ...}},
            "key_factors": [
                {{"description": "...", "impact": 0.8}},
                ...
            ],
            "explanation": "...",
            "confidence": 0.85,
            "recommendations": ["...", "..."]
        }}
        """
        
        response = gemini_service.generate_text(prompt)
        
        # Try to parse JSON from response
        import re
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            reasoning = json.loads(json_match.group())
        else:
            reasoning = {
                'explanation': response,
                'confidence': 0.75
            }
        
        return jsonify(reasoning), 200
        
    except Exception as e:
        # Fallback: Generate basic reasoning without AI
        fallback_reasoning = {
            'feature_importance': {f: 1.0/len(feature_names) for f in feature_names[:5]} if feature_names else {},
            'explanation': f"The {model_name} model analyzed the input features and produced this prediction based on patterns learned during training.",
            'confidence': best_score if best_score else 0.7,
            'key_factors': [
                {'description': f'Model used {model_name} algorithm', 'impact': 0.8},
                {'description': f'Problem type: {problem_type}', 'impact': 0.5}
            ],
            'recommendations': ['Provide more training data for better accuracy', 'Consider feature engineering']
        }
        return jsonify(fallback_reasoning), 200


@models_bp.route('/generate-inventory-report', methods=['POST'])
@jwt_required()
def generate_inventory_report():
    """Generate comprehensive AI inventory report using all agent analyses"""
    import json
    
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    model_id = data.get('model_id')
    stock_analysis = data.get('stock_analysis', {})
    expiry_analysis = data.get('expiry_analysis', {})
    order_suggestions = data.get('order_suggestions', {})
    trends_analysis = data.get('trends_analysis', {})
    
    # Get model info if provided
    model_name = "AI Model"
    if model_id:
        experiment = Experiment.query.filter_by(id=model_id, user_id=user_id).first()
        if experiment:
            model_name = experiment.best_model_name or experiment.name
    
    try:
        from app.services.gemini_service import get_gemini_service
        gemini_service = get_gemini_service()
        
        # Build comprehensive prompt
        prompt = f"""
        You are an AI business analyst. Generate a comprehensive inventory management report based on the following data:
        
        STOCK ANALYSIS:
        - Health Score: {stock_analysis.get('health_score', 0)}%
        - Total Items: {stock_analysis.get('total_items', 0)}
        - Low Stock Items: {stock_analysis.get('low_stock', {}).get('count', 0)}
        - Out of Stock Items: {stock_analysis.get('out_of_stock', {}).get('count', 0)}
        
        EXPIRY ANALYSIS:
        - Expired Items: {expiry_analysis.get('expired', {}).get('count', 0)}
        - Expiring Soon (7 days): {expiry_analysis.get('expiring_soon', {}).get('count', 0)}
        
        ORDER SUGGESTIONS:
        - Items to Order: {order_suggestions.get('total_items', 0)}
        - Critical Items: {order_suggestions.get('critical_count', 0)}
        - Estimated Cost: Rs. {order_suggestions.get('estimated_total_cost', 0):.0f}
        
        LOCAL TRENDS:
        - Upcoming Events: {trends_analysis.get('total_events', 0)}
        - Events: {json.dumps([e.get('name') for e in trends_analysis.get('events', [])[:3]])}
        
        Please provide:
        1. A brief executive summary (2-3 sentences)
        2. 5 key actionable recommendations
        3. Risk assessment (low/medium/high) with reason
        4. Expected impact if recommendations are followed
        
        Format response as JSON:
        {{
            "summary": "...",
            "recommendations": ["...", "...", ...],
            "risk_level": "medium",
            "risk_reason": "...",
            "expected_impact": "..."
        }}
        """
        
        response = gemini_service.generate_text(prompt)
        
        # Parse JSON from response
        import re
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            report = json.loads(json_match.group())
        else:
            report = {
                'summary': response[:500],
                'recommendations': [
                    'Restock critical out-of-stock items immediately',
                    'Apply discounts to expiring products',
                    'Review and approve pending purchase orders',
                    'Prepare inventory for upcoming local events',
                    'Optimize stock levels based on demand patterns'
                ]
            }
        
        return jsonify(report), 200
        
    except Exception as e:
        # Fallback report
        return jsonify({
            'summary': f'Based on analysis: {stock_analysis.get("total_items", 0)} items tracked, {stock_analysis.get("out_of_stock", {}).get("count", 0)} out of stock, {order_suggestions.get("total_items", 0)} items need ordering.',
            'recommendations': [
                f'Order {order_suggestions.get("critical_count", 0)} critical items immediately',
                f'Review {expiry_analysis.get("expiring_soon", {}).get("count", 0)} items expiring soon',
                'Apply promotions to clear expiring stock',
                'Prepare for upcoming local events and festivals',
                'Maintain minimum stock levels for high-demand items'
            ],
            'risk_level': 'medium' if stock_analysis.get('out_of_stock', {}).get('count', 0) > 0 else 'low',
            'risk_reason': 'Some items are out of stock which may lead to lost sales'
        }), 200


# ============ Internal Endpoints (for Streamlit) ============


@models_bp.route('/internal/<int:model_id>/download', methods=['GET'])
def internal_download_model(model_id):
    """Internal endpoint for Streamlit to download model package (no auth required within Docker network)"""
    from flask import Response, request
    from app.services.minio_service import get_minio_service
    import os
    
    # Only allow internal access (from within Docker network)
    # Check for internal secret or allow any Docker internal request
    internal_secret = os.environ.get('INTERNAL_API_SECRET', 'inferx-internal-2024')
    provided_secret = request.headers.get('X-Internal-Secret', '')
    
    # Allow if correct secret or if coming from Docker network (streamlit container)
    remote_addr = request.remote_addr
    is_internal = remote_addr.startswith('172.') or remote_addr == '127.0.0.1' or provided_secret == internal_secret
    
    if not is_internal:
        return jsonify({'error': 'Unauthorized'}), 403
    
    experiment = Experiment.query.filter_by(id=model_id).first()
    if not experiment:
        return jsonify({'error': 'Model not found'}), 404
    
    if experiment.status != 'completed':
        return jsonify({'error': 'Model training not completed'}), 400
    
    results = experiment.results or {}
    model_package_path = results.get('model_package_path')
    
    if not model_package_path:
        return jsonify({'error': 'Model package not available'}), 404
    
    try:
        minio_service = get_minio_service()
        # Handle legacy paths with incorrect 'models/' prefix
        corrected_path = model_package_path[7:] if model_package_path.startswith('models/') else model_package_path
        zip_content = minio_service.download_bytes('models', corrected_path)
        
        if not zip_content:
            return jsonify({'error': 'Failed to download model package'}), 500
        
        filename = f"{experiment.name.replace(' ', '_')}_model.zip"
        
        return Response(
            zip_content,
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Length': str(len(zip_content))
            }
        )
        
    except Exception as e:
        return jsonify({'error': f'Download failed: {str(e)}'}), 500


@models_bp.route('/internal/list', methods=['GET'])
def internal_list_models():
    """Internal endpoint to list all models (for Streamlit model selector)"""
    from flask import request
    import os
    
    # Same internal access check
    internal_secret = os.environ.get('INTERNAL_API_SECRET', 'inferx-internal-2024')
    provided_secret = request.headers.get('X-Internal-Secret', '')
    remote_addr = request.remote_addr
    is_internal = remote_addr.startswith('172.') or remote_addr == '127.0.0.1' or provided_secret == internal_secret
    
    if not is_internal:
        return jsonify({'error': 'Unauthorized'}), 403
    
    experiments = Experiment.query.filter_by(status='completed').all()
    
    return jsonify({
        'models': [
            {
                'id': e.id,
                'name': e.name,
                'problem_type': e.problem_type,
                'target_column': e.target_column,
                'best_model_name': e.best_model_name,
                'best_score': e.best_score,
                'has_package': bool((e.results or {}).get('model_package_path'))
            }
            for e in experiments
        ]
    }), 200
