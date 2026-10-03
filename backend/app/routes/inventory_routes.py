"""
Inventory Management Routes
API endpoints for inventory management and AI agents
"""
import os
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import uuid

from app import db
from app.models.inventory_models import (
    InventoryItem, Vendor, PurchaseOrder, 
    VendorQuotation, LocalEvent, InventoryReport
)
from app.services.inventory_agent_service import get_inventory_agent_service

inventory_bp = Blueprint('inventory', __name__)


# ========================================
# INVENTORY ITEMS CRUD
# ========================================

@inventory_bp.route('/items', methods=['GET'])
@jwt_required()
def get_inventory_items():
    """Get all inventory items for current user"""
    user_id = int(get_jwt_identity())
    
    items = InventoryItem.query.filter_by(user_id=user_id).all()
    
    return jsonify({
        'items': [item.to_dict() for item in items],
        'total': len(items)
    }), 200


# ========================================
# INTERNAL endpoints (for Streamlit)
# ========================================
@inventory_bp.route('/items/internal', methods=['GET'])
def internal_get_inventory_items():
    """
    Internal endpoint used by the Streamlit Stock Predictor page.
    It avoids JWT by allowing calls only when the internal secret is provided
    or the caller is local/cluster-internal (dev convenience).
    """
    internal_secret = os.environ.get('INTERNAL_API_SECRET', 'inferx-internal-2024')
    provided_secret = request.headers.get('X-Internal-Secret', '')
    remote_addr = request.remote_addr or ''

    is_internal = (
        remote_addr.startswith('172.') or
        remote_addr == '127.0.0.1' or
        remote_addr == 'localhost' or
        provided_secret == internal_secret
    )

    if not is_internal:
        return jsonify({'error': 'Unauthorized'}), 403

    # Streamlit doesn't send user_id; default to demo user.
    user_id = request.args.get('user_id', default=1, type=int)
    items = InventoryItem.query.filter_by(user_id=user_id).all()

    return jsonify({
        'items': [item.to_dict() for item in items],
        'total': len(items),
    }), 200


@inventory_bp.route('/items', methods=['POST'])
@jwt_required()
def create_inventory_item():
    """Create a new inventory item"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    
    # Generate SKU if not provided
    sku = data.get('sku') or f"SKU-{uuid.uuid4().hex[:8].upper()}"
    
    item = InventoryItem(
        user_id=user_id,
        name=data['name'],
        sku=sku,
        category=data.get('category'),
        description=data.get('description'),
        quantity=data.get('quantity', 0),
        unit=data.get('unit', 'units'),
        min_stock_level=data.get('min_stock_level', 10),
        max_stock_level=data.get('max_stock_level', 100),
        cost_price=data.get('cost_price', 0),
        selling_price=data.get('selling_price', 0),
        expiry_date=datetime.fromisoformat(data['expiry_date']) if data.get('expiry_date') else None,
        batch_number=data.get('batch_number'),
        warehouse_location=data.get('warehouse_location')
    )
    
    db.session.add(item)
    db.session.commit()
    
    return jsonify({
        'message': 'Item created successfully',
        'item': item.to_dict()
    }), 201


@inventory_bp.route('/items/<int:item_id>', methods=['PUT'])
@jwt_required()
def update_inventory_item(item_id):
    """Update an inventory item"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    item = InventoryItem.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    # Update fields
    for field in ['name', 'category', 'description', 'quantity', 'unit', 
                  'min_stock_level', 'max_stock_level', 'cost_price', 
                  'selling_price', 'batch_number', 'warehouse_location']:
        if field in data:
            setattr(item, field, data[field])
    
    if 'expiry_date' in data:
        item.expiry_date = datetime.fromisoformat(data['expiry_date']) if data['expiry_date'] else None
    
    if 'quantity' in data:
        item.last_restocked_at = datetime.utcnow()
    
    db.session.commit()
    
    return jsonify({
        'message': 'Item updated successfully',
        'item': item.to_dict()
    }), 200


@inventory_bp.route('/items/<int:item_id>', methods=['DELETE'])
@jwt_required()
def delete_inventory_item(item_id):
    """Delete an inventory item"""
    user_id = int(get_jwt_identity())
    
    item = InventoryItem.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    db.session.delete(item)
    db.session.commit()
    
    return jsonify({'message': 'Item deleted successfully'}), 200


@inventory_bp.route('/items/bulk-update', methods=['POST'])
@jwt_required()
def bulk_update_inventory():
    """Bulk update inventory quantities"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    updates = data.get('updates', [])
    if not updates:
        return jsonify({'error': 'No updates provided'}), 400
    
    updated_count = 0
    for update in updates:
        item_id = update.get('item_id')
        new_quantity = update.get('quantity')
        
        if item_id is not None and new_quantity is not None:
            item = InventoryItem.query.filter_by(id=item_id, user_id=user_id).first()
            if item:
                item.quantity = new_quantity
                item.last_restocked_at = datetime.utcnow()
                updated_count += 1
    
    db.session.commit()
    
    return jsonify({
        'message': f'Updated {updated_count} items',
        'updated_count': updated_count
    }), 200


# ========================================
# AI AGENT ENDPOINTS
# ========================================

@inventory_bp.route('/analysis/stock', methods=['GET'])
@jwt_required()
def analyze_stock():
    """Get AI stock analysis"""
    user_id = int(get_jwt_identity())
    
    items = InventoryItem.query.filter_by(user_id=user_id).all()
    items_data = [item.to_dict() for item in items]
    
    agent = get_inventory_agent_service()
    analysis = agent.analyze_stock(items_data)
    
    return jsonify(analysis), 200


@inventory_bp.route('/analysis/expiry', methods=['GET'])
@jwt_required()
def analyze_expiry():
    """Get expiry analysis with selling tips"""
    user_id = int(get_jwt_identity())
    
    items = InventoryItem.query.filter_by(user_id=user_id).all()
    items_data = [item.to_dict() for item in items]
    
    agent = get_inventory_agent_service()
    analysis = agent.analyze_expiry(items_data)
    
    return jsonify(analysis), 200


@inventory_bp.route('/analysis/trends', methods=['GET'])
@jwt_required()
def analyze_trends():
    """Get local trends analysis"""
    location = request.args.get('location', 'Default Location')
    days = int(request.args.get('days', 30))
    
    agent = get_inventory_agent_service()
    analysis = agent.analyze_local_trends(location, days)
    
    return jsonify(analysis), 200


# ========================================
# PURCHASE ORDERS
# ========================================

@inventory_bp.route('/orders/suggest', methods=['GET'])
@jwt_required()
def suggest_order():
    """Get AI-suggested purchase order"""
    user_id = int(get_jwt_identity())
    
    items = InventoryItem.query.filter_by(user_id=user_id).all()
    items_data = [item.to_dict() for item in items]
    
    vendors = Vendor.query.filter_by(user_id=user_id, is_active=True).all()
    vendors_data = [v.to_dict() for v in vendors]
    
    agent = get_inventory_agent_service()
    suggestion = agent.generate_order_suggestions(items_data, vendors_data)
    
    return jsonify(suggestion), 200


@inventory_bp.route('/orders', methods=['GET'])
@jwt_required()
def get_orders():
    """Get all purchase orders"""
    user_id = int(get_jwt_identity())
    status = request.args.get('status')
    
    query = PurchaseOrder.query.filter_by(user_id=user_id)
    if status:
        query = query.filter_by(status=status)
    
    orders = query.order_by(PurchaseOrder.created_at.desc()).all()
    
    return jsonify({
        'orders': [order.to_dict() for order in orders],
        'total': len(orders)
    }), 200


@inventory_bp.route('/orders', methods=['POST'])
@jwt_required()
def create_order():
    """Create a purchase order (from suggestions or manual)"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    order_number = f"PO-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    order = PurchaseOrder(
        user_id=user_id,
        vendor_id=data.get('vendor_id'),
        order_number=order_number,
        status='draft',
        items=data.get('items', []),
        subtotal=data.get('subtotal', 0),
        tax=data.get('tax', 0),
        total=data.get('total', 0),
        notes=data.get('notes'),
        ai_reasoning=data.get('ai_reasoning'),
        urgency_level=data.get('urgency_level', 'normal')
    )
    
    db.session.add(order)
    db.session.commit()
    
    return jsonify({
        'message': 'Order created successfully',
        'order': order.to_dict()
    }), 201


@inventory_bp.route('/orders/<int:order_id>', methods=['PUT'])
@jwt_required()
def update_order(order_id):
    """Update/edit a purchase order (manager review)"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    order = PurchaseOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    if order.status not in ['draft', 'pending_approval']:
        return jsonify({'error': 'Cannot edit order in current status'}), 400
    
    # Update fields
    for field in ['vendor_id', 'items', 'subtotal', 'tax', 'total', 'notes', 'manager_notes']:
        if field in data:
            setattr(order, field, data[field])
    
    db.session.commit()
    
    return jsonify({
        'message': 'Order updated successfully',
        'order': order.to_dict()
    }), 200


@inventory_bp.route('/orders/<int:order_id>/submit', methods=['POST'])
@jwt_required()
def submit_order_for_approval(order_id):
    """Submit order to store manager for approval"""
    user_id = int(get_jwt_identity())
    
    order = PurchaseOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    order.status = 'pending_approval'
    db.session.commit()
    
    return jsonify({
        'message': 'Order submitted for approval',
        'order': order.to_dict()
    }), 200


@inventory_bp.route('/orders/<int:order_id>/approve', methods=['POST'])
@jwt_required()
def approve_order(order_id):
    """Approve a purchase order (manager action)"""
    user_id = int(get_jwt_identity())
    
    order = PurchaseOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    if order.status != 'pending_approval':
        return jsonify({'error': 'Order is not pending approval'}), 400
    
    order.status = 'approved'
    order.approved_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Order approved',
        'order': order.to_dict()
    }), 200


@inventory_bp.route('/orders/<int:order_id>/place', methods=['POST'])
@jwt_required()
def place_order(order_id):
    """Place an approved order with vendor"""
    user_id = int(get_jwt_identity())
    
    order = PurchaseOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    if order.status != 'approved':
        return jsonify({'error': 'Order must be approved first'}), 400
    
    order.status = 'ordered'
    order.ordered_at = datetime.utcnow()
    
    # Set expected delivery based on vendor
    if order.vendor:
        order.expected_delivery = datetime.utcnow() + timedelta(days=order.vendor.delivery_days)
    else:
        order.expected_delivery = datetime.utcnow() + timedelta(days=3)
    
    db.session.commit()
    
    return jsonify({
        'message': 'Order placed successfully',
        'order': order.to_dict()
    }), 200


# ========================================
# VENDORS & QUOTATIONS
# ========================================

@inventory_bp.route('/vendors', methods=['GET'])
@jwt_required()
def get_vendors():
    """Get all vendors"""
    user_id = int(get_jwt_identity())
    
    vendors = Vendor.query.filter_by(user_id=user_id).all()
    
    return jsonify({
        'vendors': [v.to_dict() for v in vendors],
        'total': len(vendors)
    }), 200


@inventory_bp.route('/vendors', methods=['POST'])
@jwt_required()
def create_vendor():
    """Create a new vendor"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data or not data.get('name'):
        return jsonify({'error': 'Vendor name is required'}), 400
    
    vendor = Vendor(
        user_id=user_id,
        name=data['name'],
        email=data.get('email'),
        phone=data.get('phone'),
        address=data.get('address'),
        contact_person=data.get('contact_person'),
        payment_terms=data.get('payment_terms'),
        delivery_days=data.get('delivery_days', 3),
        categories=data.get('categories', [])
    )
    
    db.session.add(vendor)
    db.session.commit()
    
    return jsonify({
        'message': 'Vendor created successfully',
        'vendor': vendor.to_dict()
    }), 201


@inventory_bp.route('/orders/<int:order_id>/quotations', methods=['GET'])
@jwt_required()
def get_quotations(order_id):
    """Get vendor quotations for an order"""
    user_id = int(get_jwt_identity())
    
    order = PurchaseOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    quotations = VendorQuotation.query.filter_by(purchase_order_id=order_id).all()
    
    # Get AI evaluation
    agent = get_inventory_agent_service()
    quotes_data = [q.to_dict() for q in quotations]
    evaluation = agent.evaluate_quotations(quotes_data, order.items)
    
    return jsonify({
        'quotations': quotes_data,
        'evaluation': evaluation
    }), 200


@inventory_bp.route('/orders/<int:order_id>/quotations/request', methods=['POST'])
@jwt_required()
def request_quotations(order_id):
    """Request quotations from all active vendors - creates pending quotation requests"""
    user_id = int(get_jwt_identity())
    
    order = PurchaseOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    vendors = Vendor.query.filter_by(user_id=user_id, is_active=True).all()
    
    if not vendors:
        return jsonify({'error': 'No active vendors found. Please add vendors first.'}), 400
    
    # Create pending quotation requests for each vendor
    # In production, this would send emails/notifications to vendors
    created_quotations = []
    for vendor in vendors:
        # Check if quotation already exists for this vendor
        existing = VendorQuotation.query.filter_by(
            purchase_order_id=order_id,
            vendor_id=vendor.id
        ).first()
        
        if existing:
            continue  # Skip if already requested
        
        quotation = VendorQuotation(
            purchase_order_id=order_id,
            vendor_id=vendor.id,
            quoted_items=[],  # Vendor fills this
            total_price=0,    # Vendor fills this
            delivery_days=vendor.delivery_days,
            valid_until=datetime.utcnow() + timedelta(days=7),
            status='pending'
        )
        
        db.session.add(quotation)
        created_quotations.append(quotation)
    
    db.session.commit()
    
    return jsonify({
        'message': f'Quotation requests sent to {len(created_quotations)} vendors',
        'quotations': [q.to_dict() for q in created_quotations],
        'note': 'Vendors will submit their quotes via the API'
    }), 201


@inventory_bp.route('/quotations/<int:quote_id>/select', methods=['POST'])
@jwt_required()
def select_quotation(quote_id):
    """Select a quotation for an order"""
    user_id = int(get_jwt_identity())
    
    quotation = VendorQuotation.query.get(quote_id)
    if not quotation:
        return jsonify({'error': 'Quotation not found'}), 404
    
    order = quotation.purchase_order
    if order.user_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Reject other quotations
    VendorQuotation.query.filter(
        VendorQuotation.purchase_order_id == order.id,
        VendorQuotation.id != quote_id
    ).update({'status': 'rejected'})
    
    # Select this quotation
    quotation.status = 'selected'
    
    # Update order with selected vendor
    order.vendor_id = quotation.vendor_id
    order.total = quotation.total_price
    
    db.session.commit()
    
    return jsonify({
        'message': 'Quotation selected',
        'quotation': quotation.to_dict(),
        'order': order.to_dict()
    }), 200


# ========================================
# REPORTS
# ========================================

@inventory_bp.route('/reports/generate', methods=['POST'])
@jwt_required()
def generate_report():
    """Generate an AI-powered inventory report"""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    report_type = data.get('type', 'stock_analysis')
    
    items = InventoryItem.query.filter_by(user_id=user_id).all()
    items_data = [item.to_dict() for item in items]
    
    agent = get_inventory_agent_service()
    
    # Generate report based on type
    if report_type == 'stock_analysis':
        analysis = agent.analyze_stock(items_data)
        content = analysis.get('ai_insights', 'Stock analysis complete')
        report_data = analysis
    elif report_type == 'expiry_alert':
        analysis = agent.analyze_expiry(items_data)
        content = f"Found {analysis['expired']['count']} expired and {analysis['expiring_soon']['count']} expiring soon"
        report_data = analysis
    elif report_type == 'selling_tips':
        analysis = agent.analyze_expiry(items_data)
        content = "Selling tips for expiring products"
        report_data = {'tips': analysis.get('selling_tips', [])}
    else:
        return jsonify({'error': 'Invalid report type'}), 400
    
    # Save report
    report = InventoryReport(
        user_id=user_id,
        report_type=report_type,
        title=f"{report_type.replace('_', ' ').title()} - {datetime.utcnow().strftime('%Y-%m-%d')}",
        content=content,
        data=report_data
    )
    
    db.session.add(report)
    db.session.commit()
    
    return jsonify({
        'message': 'Report generated',
        'report': report.to_dict()
    }), 201


@inventory_bp.route('/reports', methods=['GET'])
@jwt_required()
def get_reports():
    """Get all generated reports"""
    user_id = int(get_jwt_identity())
    
    reports = InventoryReport.query.filter_by(user_id=user_id).order_by(InventoryReport.created_at.desc()).limit(20).all()
    
    return jsonify({
        'reports': [r.to_dict() for r in reports]
    }), 200
