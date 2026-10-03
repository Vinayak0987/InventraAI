"""
Sales Routes
API endpoints for logging and querying sales data
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from collections import defaultdict
import csv
import io

from app import db
from app.models.sales_models import SalesRecord

sales_bp = Blueprint('sales', __name__)


@sales_bp.route('', methods=['POST'])
@jwt_required()
def log_sale():
    """Log a single sale transaction"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    required = ['product_name', 'quantity_sold', 'unit_price']
    for field in required:
        if field not in data:
            return jsonify({'error': f'{field} is required'}), 400
    
    sale_date = datetime.utcnow().date()
    if data.get('sale_date'):
        sale_date = datetime.fromisoformat(data['sale_date']).date()
    
    sale = SalesRecord(
        user_id=user_id,
        inventory_item_id=data.get('inventory_item_id'),
        product_name=data['product_name'],
        category=data.get('category'),
        sku=data.get('sku'),
        quantity_sold=data['quantity_sold'],
        unit_price=data['unit_price'],
        total_amount=data['quantity_sold'] * data['unit_price'],
        sale_date=sale_date,
        sale_time=datetime.utcnow().time() if not data.get('sale_time') else datetime.strptime(data['sale_time'], '%H:%M:%S').time(),
        is_holiday=data.get('is_holiday', False)
    )
    
    db.session.add(sale)
    db.session.commit()
    
    return jsonify({
        'message': 'Sale logged successfully',
        'sale': sale.to_dict()
    }), 201


@sales_bp.route('/bulk', methods=['POST'])
@jwt_required()
def bulk_import_sales():
    """Bulk import sales from CSV or JSON"""
    user_id = int(get_jwt_identity())
    
    # Check if file upload
    if 'file' in request.files:
        file = request.files['file']
        if file.filename.endswith('.csv'):
            return _import_csv_sales(file, user_id)
    
    # JSON bulk import
    data = request.get_json()
    if not data or 'sales' not in data:
        return jsonify({'error': 'No sales data provided'}), 400
    
    sales_data = data['sales']
    imported = 0
    errors = []
    
    for i, sale_data in enumerate(sales_data):
        try:
            sale_date = datetime.utcnow().date()
            if sale_data.get('sale_date'):
                if isinstance(sale_data['sale_date'], str):
                    sale_date = datetime.fromisoformat(sale_data['sale_date'].replace('Z', '')).date()
            
            sale = SalesRecord(
                user_id=user_id,
                product_name=sale_data['product_name'],
                category=sale_data.get('category'),
                sku=sale_data.get('sku'),
                quantity_sold=float(sale_data['quantity_sold']),
                unit_price=float(sale_data.get('unit_price', 0)),
                total_amount=float(sale_data.get('total_amount', 0)) or float(sale_data['quantity_sold']) * float(sale_data.get('unit_price', 0)),
                sale_date=sale_date,
                is_holiday=sale_data.get('is_holiday', False)
            )
            db.session.add(sale)
            imported += 1
        except Exception as e:
            errors.append({'row': i, 'error': str(e)})
    
    db.session.commit()
    
    return jsonify({
        'message': f'Imported {imported} sales records',
        'imported': imported,
        'errors': errors[:10]  # Limit errors shown
    }), 201


def _import_csv_sales(file, user_id):
    """Import sales from CSV file"""
    try:
        content = file.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(content))
        
        imported = 0
        errors = []
        
        for i, row in enumerate(reader):
            try:
                # Flexible column mapping
                product_name = row.get('product_name') or row.get('Product') or row.get('item') or row.get('name')
                quantity = row.get('quantity_sold') or row.get('quantity') or row.get('qty') or row.get('Quantity')
                price = row.get('unit_price') or row.get('price') or row.get('Price') or 0
                date_str = row.get('sale_date') or row.get('date') or row.get('Date')
                category = row.get('category') or row.get('Category')
                
                if not product_name or not quantity:
                    errors.append({'row': i, 'error': 'Missing product_name or quantity'})
                    continue
                
                # Parse date
                sale_date = datetime.utcnow().date()
                if date_str:
                    for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y']:
                        try:
                            sale_date = datetime.strptime(date_str, fmt).date()
                            break
                        except:
                            continue
                
                sale = SalesRecord(
                    user_id=user_id,
                    product_name=product_name,
                    category=category,
                    quantity_sold=float(quantity),
                    unit_price=float(price) if price else 0,
                    total_amount=float(quantity) * float(price) if price else 0,
                    sale_date=sale_date
                )
                db.session.add(sale)
                imported += 1
                
            except Exception as e:
                errors.append({'row': i, 'error': str(e)})
        
        db.session.commit()
        
        return jsonify({
            'message': f'CSV imported: {imported} records',
            'imported': imported,
            'errors': errors[:10]
        }), 201
        
    except Exception as e:
        return jsonify({'error': f'Failed to parse CSV: {str(e)}'}), 400


@sales_bp.route('/daily', methods=['GET'])
@jwt_required()
def get_daily_sales():
    """Get today's sales summary"""
    user_id = int(get_jwt_identity())
    date_str = request.args.get('date')
    
    if date_str:
        target_date = datetime.fromisoformat(date_str).date()
    else:
        target_date = datetime.utcnow().date()
    
    sales = SalesRecord.query.filter_by(
        user_id=user_id,
        sale_date=target_date
    ).all()
    
    # Aggregate by product
    product_summary = defaultdict(lambda: {'quantity': 0, 'total': 0})
    for sale in sales:
        product_summary[sale.product_name]['quantity'] += sale.quantity_sold
        product_summary[sale.product_name]['total'] += sale.total_amount
    
    return jsonify({
        'date': target_date.isoformat(),
        'total_sales': sum(s.total_amount for s in sales),
        'total_items': sum(s.quantity_sold for s in sales),
        'transaction_count': len(sales),
        'by_product': [
            {'product': name, **data} 
            for name, data in sorted(product_summary.items(), key=lambda x: -x[1]['total'])
        ],
        'sales': [s.to_dict() for s in sales]
    }), 200


@sales_bp.route('/history', methods=['GET'])
@jwt_required()
def get_sales_history():
    """Get historical sales data"""
    user_id = int(get_jwt_identity())
    
    # Parse date range
    days = int(request.args.get('days', 30))
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    product = request.args.get('product')
    category = request.args.get('category')
    
    if start_date:
        start = datetime.fromisoformat(start_date).date()
    else:
        start = datetime.utcnow().date() - timedelta(days=days)
    
    if end_date:
        end = datetime.fromisoformat(end_date).date()
    else:
        end = datetime.utcnow().date()
    
    # Build query
    query = SalesRecord.query.filter(
        SalesRecord.user_id == user_id,
        SalesRecord.sale_date >= start,
        SalesRecord.sale_date <= end
    )
    
    if product:
        query = query.filter(SalesRecord.product_name == product)
    if category:
        query = query.filter(SalesRecord.category == category)
    
    sales = query.order_by(SalesRecord.sale_date.desc()).all()
    
    # Aggregate by date
    daily_totals = defaultdict(lambda: {'quantity': 0, 'total': 0})
    for sale in sales:
        key = sale.sale_date.isoformat()
        daily_totals[key]['quantity'] += sale.quantity_sold
        daily_totals[key]['total'] += sale.total_amount
    
    return jsonify({
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'total_records': len(sales),
        'total_revenue': sum(s.total_amount for s in sales),
        'total_quantity': sum(s.quantity_sold for s in sales),
        'daily_summary': [
            {'date': date, **data}
            for date, data in sorted(daily_totals.items())
        ],
        'sales': [s.to_dict() for s in sales[:100]]  # Limit to 100 records
    }), 200


@sales_bp.route('/products', methods=['GET'])
@jwt_required()
def get_products_from_sales():
    """Get unique products from sales history"""
    user_id = int(get_jwt_identity())
    
    sales = SalesRecord.query.filter_by(user_id=user_id).all()
    
    products = {}
    for sale in sales:
        if sale.product_name not in products:
            products[sale.product_name] = {
                'name': sale.product_name,
                'category': sale.category,
                'total_sold': 0,
                'total_revenue': 0,
                'sale_count': 0
            }
        products[sale.product_name]['total_sold'] += sale.quantity_sold
        products[sale.product_name]['total_revenue'] += sale.total_amount
        products[sale.product_name]['sale_count'] += 1
    
    return jsonify({
        'products': sorted(products.values(), key=lambda x: -x['total_revenue'])
    }), 200
