"""
Dataset Routes
"""
import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app import db
from app.models.dataset import Dataset
from app.services.dataset_loader import UPLOAD_ROOT

datasets_bp = Blueprint('datasets', __name__)

ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls', 'jpg', 'jpeg', 'png', 'zip'}


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@datasets_bp.route('', methods=['GET'])
@jwt_required()
def list_datasets():
    """List all datasets for current user"""
    user_id = int(get_jwt_identity())
    datasets = Dataset.query.filter_by(user_id=user_id).order_by(Dataset.created_at.desc()).all()
    
    return jsonify({
        'datasets': [d.to_dict() for d in datasets],
        'total': len(datasets)
    }), 200


@datasets_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_dataset():
    """Upload a new dataset"""
    user_id = int(get_jwt_identity())
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Allowed: {ALLOWED_EXTENSIONS}'}), 400
    
    filename = secure_filename(file.filename)
    name = request.form.get('name', filename)
    description = request.form.get('description', '')
    
    file_type = filename.rsplit('.', 1)[1].lower()
    
    # Read file content for size calculation
    file_content = file.read()
    file_size = len(file_content)
    file.seek(0)  # Reset file pointer

    # Always save a local copy (used when MinIO is unavailable)
    user_upload_dir = os.path.join(UPLOAD_ROOT, str(user_id))
    os.makedirs(user_upload_dir, exist_ok=True)
    local_disk_path = os.path.join(user_upload_dir, filename)
    with open(local_disk_path, 'wb') as f:
        f.write(file_content)

    # Upload to MinIO
    file_path = f'{user_id}/{filename}'
    try:
        from app.services.minio_service import get_minio_service
        minio_service = get_minio_service()
        minio_service.upload_bytes(
            bucket='datasets',
            object_name=file_path,
            data=file_content,
            content_type=file.content_type or 'application/octet-stream'
        )
    except Exception as e:
        print(f"MinIO upload failed, using local storage: {e}")
        file_path = f'local/{user_id}/{filename}'
    
    # Create database record
    dataset = Dataset(
        name=name,
        description=description,
        file_path=file_path,
        file_type=file_type,
        file_size=file_size,
        user_id=user_id,
        profile_status='pending'
    )
    
    db.session.add(dataset)
    db.session.commit()
    
    # For tabular data, do quick profiling synchronously (for small files)
    if file_type in ['csv', 'xlsx', 'xls'] and file_size < 10 * 1024 * 1024:  # < 10MB
        try:
            import pandas as pd
            import io
            
            if file_type == 'csv':
                df = pd.read_csv(io.BytesIO(file_content))
            else:
                df = pd.read_excel(io.BytesIO(file_content))
            
            # Basic profiling
            dataset.num_rows = len(df)
            dataset.num_columns = len(df.columns)
            dataset.data_type = 'tabular'
            dataset.column_info = {
                col: {'dtype': str(df[col].dtype), 'null_count': int(df[col].isnull().sum())}
                for col in df.columns
            }
            dataset.profile_status = 'completed'
            db.session.commit()
        except Exception as e:
            print(f"Profiling failed: {e}")
            dataset.profile_status = 'failed'
            db.session.commit()
    
    return jsonify({
        'message': 'Dataset uploaded successfully',
        'dataset': dataset.to_dict()
    }), 201


@datasets_bp.route('/<int:dataset_id>', methods=['GET'])
@jwt_required()
def get_dataset(dataset_id):
    """Get dataset details"""
    user_id = int(get_jwt_identity())
    dataset = Dataset.query.filter_by(id=dataset_id, user_id=user_id).first()
    
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    return jsonify({'dataset': dataset.to_dict()}), 200


def _ensure_column_info(dataset):
    """Populate column_info from stored file when missing (e.g. legacy seed data)."""
    if dataset.column_info:
        return dataset.column_info

    try:
        from app.services.dataset_loader import load_dataset_dataframe
        df = load_dataset_dataframe(dataset.file_path, file_type=dataset.file_type)
        dataset.num_rows = len(df)
        dataset.num_columns = len(df.columns)
        dataset.data_type = dataset.data_type or 'tabular'
        dataset.column_info = {
            col: {
                'dtype': str(df[col].dtype),
                'null_count': int(df[col].isnull().sum()),
            }
            for col in df.columns
        }
        dataset.profile_status = 'completed'
        db.session.commit()
        return dataset.column_info
    except Exception as e:
        print(f"Profiling from file failed: {e}")

    return None


@datasets_bp.route('/<int:dataset_id>/profile', methods=['GET'])
@jwt_required()
def get_dataset_profile(dataset_id):
    """Get dataset profile (stats, types, distributions)"""
    user_id = int(get_jwt_identity())
    dataset = Dataset.query.filter_by(id=dataset_id, user_id=user_id).first()
    
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404

    column_info = _ensure_column_info(dataset)
    
    return jsonify({
        'dataset_id': dataset.id,
        'profile_status': dataset.profile_status,
        'profile_data': dataset.profile_data,
        'column_info': column_info
    }), 200


@datasets_bp.route('/<int:dataset_id>', methods=['DELETE'])
@jwt_required()
def delete_dataset(dataset_id):
    """Delete a dataset"""
    user_id = int(get_jwt_identity())
    dataset = Dataset.query.filter_by(id=dataset_id, user_id=user_id).first()
    
    if not dataset:
        return jsonify({'error': 'Dataset not found'}), 404
    
    # TODO: Delete from MinIO
    
    db.session.delete(dataset)
    db.session.commit()
    
    return jsonify({'message': 'Dataset deleted successfully'}), 200
