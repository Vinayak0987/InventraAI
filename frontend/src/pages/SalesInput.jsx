import { useState, useEffect, useRef } from 'react'
import { salesApi } from '../services/api'
import './SalesInput.css'

// Hardcoded Demo Data
const DEMO_DATA = {
    total_sales: 15750.50,
    total_items: 342,
    transaction_count: 87,
    sales: [
        { product_name: 'Amul Milk 1L', category: 'Dairy', quantity_sold: 25, unit_price: 32, total_amount: 800 },
        { product_name: 'Britannia Brown Bread', category: 'Bakery', quantity_sold: 18, unit_price: 42, total_amount: 756 },
        { product_name: 'Coca Cola 750ml', category: 'Beverages', quantity_sold: 22, unit_price: 40, total_amount: 880 },
        { product_name: 'Lays Classic 52g', category: 'Snacks', quantity_sold: 35, unit_price: 20, total_amount: 700 },
        { product_name: 'Aashirvaad Atta 5kg', category: 'Groceries', quantity_sold: 8, unit_price: 285, total_amount: 2280 },
        { product_name: 'Amul Paneer 200g', category: 'Dairy', quantity_sold: 12, unit_price: 95, total_amount: 1140 },
        { product_name: 'Mother Dairy Curd 400g', category: 'Dairy', quantity_sold: 20, unit_price: 40, total_amount: 800 },
        { product_name: 'Red Label Tea 250g', category: 'Beverages', quantity_sold: 10, unit_price: 135, total_amount: 1350 },
        { product_name: 'Surf Excel 1kg', category: 'Household', quantity_sold: 6, unit_price: 195, total_amount: 1170 },
        { product_name: 'Parle-G 250g', category: 'Snacks', quantity_sold: 45, unit_price: 28, total_amount: 1260 }
    ],
    by_product: [
        { product: 'Aashirvaad Atta 5kg', total: 2280, quantity: 8 },
        { product: 'Red Label Tea 250g', total: 1350, quantity: 10 },
        { product: 'Parle-G 250g', total: 1260, quantity: 45 },
        { product: 'Surf Excel 1kg', total: 1170, quantity: 6 },
        { product: 'Amul Paneer 200g', total: 1140, quantity: 12 }
    ]
}

export default function SalesInput() {
    const [dailySales, setDailySales] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [formData, setFormData] = useState({
        product_name: '',
        category: '',
        quantity_sold: 1,
        unit_price: 0
    })
    const fileInputRef = useRef(null)

    useEffect(() => {
        loadDailySales()
    }, [])

    const loadDailySales = async () => {
        setLoading(true)
        try {
            const response = await salesApi.getDaily()
            // Use API data or fallback to demo data
            setDailySales(response.data?.sales?.length ? response.data : DEMO_DATA)
        } catch (error) {
            console.error('Failed to load sales:', error)
            // Use demo data on error
            setDailySales(DEMO_DATA)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.product_name || formData.quantity_sold <= 0) {
            alert('Please fill in product name and quantity')
            return
        }

        setSubmitting(true)
        try {
            await salesApi.logSale(formData)
            setFormData({
                product_name: '',
                category: '',
                quantity_sold: 1,
                unit_price: 0
            })
            loadDailySales()
        } catch (error) {
            console.error('Failed to log sale:', error)
            alert('Failed to log sale')
        } finally {
            setSubmitting(false)
        }
    }

    const handleUploadCSV = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append('file', file)

        try {
            const result = await salesApi.uploadCsv(formData)
            alert(`Imported ${result.data.imported} sales records!`)
            loadDailySales()
        } catch (error) {
            console.error('Upload failed:', error)
            alert('Upload failed: ' + (error.response?.data?.error || error.message))
        }
    }

    const maxProductSale = dailySales?.by_product?.length > 0
        ? Math.max(...dailySales.by_product.map(p => p.total))
        : 0

    if (loading) {
        return (
            <div className="sales-page">
                <div className="loading-state">
                    <div className="loading-spinner"></div>
                    <p>Loading sales data...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="sales-page">
            <div className="sales-header">
                <div>
                    <h1>💰 Sales Input</h1>
                    <p>Log daily sales to improve demand forecasting accuracy</p>
                </div>
            </div>

            {/* Today's Summary */}
            {dailySales && (
                <div className="sales-summary">
                    <div className="summary-card">
                        <div className="summary-value money">₹{(dailySales.total_sales || 0).toFixed(2)}</div>
                        <div className="summary-label">Today's Revenue</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-value info">{dailySales.total_items || 0}</div>
                        <div className="summary-label">Items Sold</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-value">{dailySales.transaction_count || 0}</div>
                        <div className="summary-label">Transactions</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-value">{dailySales.by_product?.length || 0}</div>
                        <div className="summary-label">Unique Products</div>
                    </div>
                </div>
            )}

            <div className="sales-content">
                {/* Quick Sale Input */}
                <div className="input-section">
                    <h2>➕ Quick Sale Entry</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Product Name</label>
                            <input
                                type="text"
                                value={formData.product_name}
                                onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                                placeholder="e.g., Milk 1L"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Category (optional)</label>
                            <select
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                            >
                                <option value="">Select category</option>
                                <option value="Dairy">Dairy</option>
                                <option value="Groceries">Groceries</option>
                                <option value="Beverages">Beverages</option>
                                <option value="Snacks">Snacks</option>
                                <option value="Personal Care">Personal Care</option>
                                <option value="Household">Household</option>
                            </select>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Quantity</label>
                                <input
                                    type="number"
                                    value={formData.quantity_sold}
                                    onChange={e => setFormData({ ...formData, quantity_sold: parseFloat(e.target.value) })}
                                    min="0.1"
                                    step="0.1"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Unit Price (₹)</label>
                                <input
                                    type="number"
                                    value={formData.unit_price}
                                    onChange={e => setFormData({ ...formData, unit_price: parseFloat(e.target.value) })}
                                    min="0"
                                    step="0.5"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="submit-sale-btn"
                            disabled={submitting}
                        >
                            {submitting ? 'Logging...' : '✓ Log Sale'}
                        </button>
                    </form>
                </div>

                {/* Today's Sales List */}
                <div className="sales-list-section">
                    <div className="section-header">
                        <h2>📋 Today's Sales</h2>
                        <div>
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleUploadCSV}
                            />
                            <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                                📁 Import CSV
                            </button>
                        </div>
                    </div>

                    {dailySales?.sales?.length > 0 ? (
                        <>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="sales-table">
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Category</th>
                                            <th>Qty</th>
                                            <th>Price</th>
                                            <th>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dailySales.sales.slice(0, 10).map((sale, i) => (
                                            <tr key={i}>
                                                <td>{sale.product_name}</td>
                                                <td>{sale.category || '-'}</td>
                                                <td>{sale.quantity_sold}</td>
                                                <td>₹{sale.unit_price?.toFixed(2)}</td>
                                                <td className="amount">₹{sale.total_amount?.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Product Summary */}
                            {dailySales.by_product?.length > 0 && (
                                <div className="product-summary">
                                    <h3>📊 Sales by Product</h3>
                                    {dailySales.by_product.slice(0, 5).map((product, i) => (
                                        <div key={i} className="product-bar">
                                            <span className="product-name" title={product.product}>
                                                {product.product}
                                            </span>
                                            <div className="product-bar-fill">
                                                <div
                                                    className="product-bar-value"
                                                    style={{ width: `${(product.total / maxProductSale) * 100}%` }}
                                                >
                                                    ₹{product.total.toFixed(0)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="empty-state">
                            <div className="icon">📝</div>
                            <h3>No sales recorded today</h3>
                            <p>Use the form to log sales or import a CSV file</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
