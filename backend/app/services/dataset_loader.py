"""
Load dataset files from MinIO or local upload storage.
"""
import io
import os

import pandas as pd

UPLOAD_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'uploads')
)


def _read_csv_bytes(file_content: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(file_content))


def load_dataset_dataframe(file_path: str, file_type: str = 'csv') -> pd.DataFrame:
    """Load a dataset from MinIO or the local uploads directory."""
    errors = []

    # MinIO (paths like "1/data.csv" or "demo/sample_churn.csv")
    if not file_path.startswith('local/'):
        try:
            from app.services.minio_service import get_minio_service

            minio_service = get_minio_service()
            file_content = minio_service.download_bytes('datasets', file_path)
            if file_content:
                if file_type == 'csv':
                    return _read_csv_bytes(file_content)
                if file_type in ('xlsx', 'xls'):
                    return pd.read_excel(io.BytesIO(file_content))
        except Exception as e:
            errors.append(f'MinIO: {e}')

    # Local uploads (paths like "local/1/data.csv")
    rel_path = file_path[6:] if file_path.startswith('local/') else file_path
    local_file = os.path.join(UPLOAD_ROOT, rel_path.replace('/', os.sep))
    if os.path.isfile(local_file):
        if file_type == 'csv':
            return pd.read_csv(local_file)
        if file_type in ('xlsx', 'xls'):
            return pd.read_excel(local_file)

    errors.append(f'Local file not found: {local_file}')
    raise FileNotFoundError(
        f'Could not load dataset "{file_path}". ' + ' | '.join(errors)
    )
