"""
InventraAI Backend Application Factory
"""
import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

from .config import Config

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()


def create_app(config_class=Config):
    """Application factory pattern"""
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app)
    
    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.datasets import datasets_bp
    from .routes.training import training_bp
    from .routes.predictions import predictions_bp
    from .routes.models import models_bp
    from .routes.orders import orders_bp
    from .routes.inventory_routes import inventory_bp
    from .routes.sales_routes import sales_bp
    from .routes.forecast_routes import forecast_bp
    from .routes.daily_items_routes import daily_items_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(datasets_bp, url_prefix='/api/datasets')
    app.register_blueprint(training_bp, url_prefix='/api/training')
    app.register_blueprint(predictions_bp, url_prefix='/api/predict')
    app.register_blueprint(models_bp, url_prefix='/api/models')
    app.register_blueprint(orders_bp, url_prefix='/api/orders')
    app.register_blueprint(inventory_bp, url_prefix='/api/inventory')
    app.register_blueprint(sales_bp, url_prefix='/api/sales')
    app.register_blueprint(forecast_bp, url_prefix='/api/forecast')
    app.register_blueprint(daily_items_bp, url_prefix='/api/daily-items')

    
    # Health check endpoint
    @app.route('/api/health')
    def health_check():
        return {'status': 'healthy', 'service': 'InferX-ML API'}
    
    return app
