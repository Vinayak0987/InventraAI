import { useState, useEffect } from 'react'
import { dailyItemsApi } from '../services/api'
import './DailyItems.css'

// Hardcoded Demo Data
const DEMO_ITEMS = [
    { id: 1, name: 'Amul Milk 1L', category: 'Dairy', unit: 'packets', expected_daily_quantity: 50, cost_per_unit: 28, shelf_life_hours: 72, receipt_status: 'received', received_today: 48 },
    { id: 2, name: 'Mother Dairy Curd 400g', category: 'Dairy', unit: 'pcs', expected_daily_quantity: 35, cost_per_unit: 35, shelf_life_hours: 120, receipt_status: 'received', received_today: 35 },
    { id: 3, name: 'Amul Paneer 200g', category: 'Dairy', unit: 'pcs', expected_daily_quantity: 25, cost_per_unit: 80, shelf_life_hours: 168, receipt_status: 'pending', received_today: 0 },
    { id: 4, name: 'Britannia Brown Bread', category: 'Bakery', unit: 'pcs', expected_daily_quantity: 30, cost_per_unit: 35, shelf_life_hours: 72, receipt_status: 'received', received_today: 32 },
    { id: 5, name: 'Britannia White Bread', category: 'Bakery', unit: 'pcs', expected_daily_quantity: 25, cost_per_unit: 32, shelf_life_hours: 72, receipt_status: 'pending', received_today: 0 }
]

const DEMO_SUMMARY = {
    total_items: 5,
    received: 3,
    pending: 2,
    total_expected_cost: 4330
}

export default function DailyItems() {
    const [items, setItems] = useState([])
    const [summary, setSummary] = useState(null)
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [showReceiveModal, setShowReceiveModal] = useState(false)
    const [selectedItem, setSelectedItem] = useState(null)
    const [formData, setFormData] = useState({
        name: '',
        category: 'Dairy',
        unit: 'liters',
        expected_daily_quantity: 0,
        min_daily_quantity: 0,
        shelf_life_hours: 24,
        cost_per_unit: 0
    })
    const [receiveQty, setReceiveQty] = useState(0)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [itemsRes, summaryRes] = await Promise.all([
                dailyItemsApi.getItems(),
                dailyItemsApi.getSummary()
            ])
            // Use API data or fallback to demo data
            setItems(itemsRes.data.items?.length ? itemsRes.data.items : DEMO_ITEMS)
            setSummary(summaryRes.data?.total_items !== undefined ? summaryRes.data : DEMO_SUMMARY)
        } catch (error) {
            console.error('Failed to load data:', error)
            // Use demo data on error
            setItems(DEMO_ITEMS)
            setSummary(DEMO_SUMMARY)
        } finally {
            setLoading(false)
        }
    }

    const handleAddItem = async (e) => {
        e.preventDefault()
        try {
            await dailyItemsApi.createItem(formData)
            setShowAddModal(false)
            setFormData({
                name: '',
                category: 'Dairy',
                unit: 'liters',
                expected_daily_quantity: 0,
                min_daily_quantity: 0,
                shelf_life_hours: 24,
                cost_per_unit: 0
            })
            loadData()
        } catch (error) {
            console.error('Failed to add item:', error)
            alert('Failed to add item')
        }
    }

    const handleReceive = async (e) => {
        e.preventDefault()
        if (!selectedItem) return

        try {
            await dailyItemsApi.logReceipt({
                daily_item_id: selectedItem.id,
                quantity_received: receiveQty
            })
            setShowReceiveModal(false)
            setSelectedItem(null)
            setReceiveQty(0)
            loadData()
        } catch (error) {
            console.error('Failed to log receipt:', error)
            alert('Failed to log receipt')
        }
    }

    const openReceiveModal = (item) => {
        setSelectedItem(item)
        setReceiveQty(item.expected_daily_quantity)
        setShowReceiveModal(true)
    }

    if (loading) {
        return (
            <div className="daily-items-page">
                <div className="loading-state">
                    <div className="loading-spinner"></div>
                    <p>Loading daily items...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="daily-items-page">
            <div className="daily-items-header">
                <div>
                    <h1>🥛 Daily Items</h1>
                    <p>Manage perishables that need daily restocking (milk, paneer, buttermilk)</p>
                </div>
                <div className="header-actions">
                    <button className="add-btn" onClick={() => setShowAddModal(true)}>
                        ➕ Add Daily Item
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="summary-grid">
                    <div className="summary-card">
                        <div className="summary-value">{summary.total_items || 0}</div>
                        <div className="summary-label">Total Items</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-value success">{summary.received || 0}</div>
                        <div className="summary-label">Received Today</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-value warning">{summary.pending || 0}</div>
                        <div className="summary-label">Pending Receipt</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-value money">₹{(summary.total_expected_cost || 0).toFixed(2)}</div>
                        <div className="summary-label">Today's Expected Cost</div>
                    </div>
                </div>
            )}

            {/* Items Grid */}
            <div className="items-section">
                <div className="section-header">
                    <h2>📦 Today's Items ({new Date().toLocaleDateString()})</h2>
                </div>

                {items.length > 0 ? (
                    <div className="items-grid">
                        {items.map((item) => (
                            <div key={item.id} className={`item-card ${item.receipt_status}`}>
                                <div className="item-header">
                                    <div>
                                        <div className="item-name">{item.name}</div>
                                        <span className="item-category">{item.category}</span>
                                    </div>
                                    <span className={`item-status ${item.receipt_status}`}>
                                        {item.receipt_status === 'received' ? '✓ Received' : '⏳ Pending'}
                                    </span>
                                </div>

                                <div className="item-details">
                                    <div className="detail-item">
                                        <span className="detail-label">Expected</span>
                                        <span className="detail-value">{item.expected_daily_quantity} {item.unit}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Received</span>
                                        <span className="detail-value">{item.received_today || 0} {item.unit}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Cost/Unit</span>
                                        <span className="detail-value">₹{item.cost_per_unit}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Shelf Life</span>
                                        <span className="detail-value">{item.shelf_life_hours}h</span>
                                    </div>
                                </div>

                                <div className="item-actions">
                                    <button
                                        className="receive-btn"
                                        onClick={() => openReceiveModal(item)}
                                        disabled={item.receipt_status === 'received'}
                                    >
                                        {item.receipt_status === 'received' ? '✓ Logged' : '📥 Log Receipt'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="icon">🥛</div>
                        <h3>No daily items configured</h3>
                        <p>Add items like milk, paneer, buttermilk that need daily restocking</p>
                    </div>
                )}
            </div>

            {/* Add Item Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>➕ Add Daily Item</h2>
                        <form onSubmit={handleAddItem}>
                            <div className="form-group">
                                <label>Item Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Milk 1L"
                                    required
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    >
                                        <option value="Dairy">Dairy</option>
                                        <option value="Bakery">Bakery</option>
                                        <option value="Vegetables">Vegetables</option>
                                        <option value="Fruits">Fruits</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Unit</label>
                                    <select
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                    >
                                        <option value="liters">Liters</option>
                                        <option value="kg">Kg</option>
                                        <option value="units">Units</option>
                                        <option value="packets">Packets</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Daily Quantity</label>
                                    <input
                                        type="number"
                                        value={formData.expected_daily_quantity}
                                        onChange={e => setFormData({ ...formData, expected_daily_quantity: parseFloat(e.target.value) })}
                                        min="0"
                                        step="0.5"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Cost per Unit (₹)</label>
                                    <input
                                        type="number"
                                        value={formData.cost_per_unit}
                                        onChange={e => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) })}
                                        min="0"
                                        step="0.5"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Shelf Life (hours)</label>
                                <input
                                    type="number"
                                    value={formData.shelf_life_hours}
                                    onChange={e => setFormData({ ...formData, shelf_life_hours: parseInt(e.target.value) })}
                                    min="1"
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="cancel-btn" onClick={() => setShowAddModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="submit-btn">
                                    Add Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Receive Modal */}
            {showReceiveModal && selectedItem && (
                <div className="modal-overlay" onClick={() => setShowReceiveModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>📥 Log Receipt: {selectedItem.name}</h2>
                        <form onSubmit={handleReceive}>
                            <div className="form-group">
                                <label>Quantity Received ({selectedItem.unit})</label>
                                <input
                                    type="number"
                                    value={receiveQty}
                                    onChange={e => setReceiveQty(parseFloat(e.target.value))}
                                    min="0"
                                    step="0.5"
                                    required
                                />
                            </div>

                            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                                Expected: {selectedItem.expected_daily_quantity} {selectedItem.unit}
                            </p>

                            <div className="modal-actions">
                                <button type="button" className="cancel-btn" onClick={() => setShowReceiveModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="submit-btn">
                                    Log Receipt
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
