import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

export default function Reasoning() {
    const { token } = useAuthStore()
    const [models, setModels] = useState([])
    const [datasets, setDatasets] = useState([])
    const [selectedModel, setSelectedModel] = useState(null)
    const [selectedDataset, setSelectedDataset] = useState(null)
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState('overview')

    // Agent reports
    const [stockAnalysis, setStockAnalysis] = useState(null)
    const [expiryAnalysis, setExpiryAnalysis] = useState(null)
    const [orderSuggestions, setOrderSuggestions] = useState(null)
    const [trendsAnalysis, setTrendsAnalysis] = useState(null)
    const [fullReport, setFullReport] = useState(null)

    useEffect(() => {
        fetchModels()
        fetchDatasets()
    }, [])

    const fetchModels = async () => {
        try {
            const response = await fetch('/api/models', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (response.ok) {
                const data = await response.json()
                setModels(data.models || [])
            }
        } catch (error) {
            console.error('Failed to fetch models:', error)
        }
    }

    const fetchDatasets = async () => {
        try {
            const response = await fetch('/api/datasets', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (response.ok) {
                const data = await response.json()
                setDatasets(data.datasets || [])
            }
        } catch (error) {
            console.error('Failed to fetch datasets:', error)
        }
    }

    const runFullAnalysis = async () => {
        if (!selectedModel) {
            alert('Please select a model first')
            return
        }

        setLoading(true)
        setFullReport(null)

        try {
            // Run all agent analyses
            const [stockRes, expiryRes, orderRes, trendRes] = await Promise.all([
                fetch('/api/inventory/analysis/stock', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/inventory/analysis/expiry', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/inventory/orders/suggest', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/inventory/analysis/trends?location=Store%20Location&days=30', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ])

            const [stock, expiry, orders, trends] = await Promise.all([
                stockRes.json(),
                expiryRes.json(),
                orderRes.json(),
                trendRes.json()
            ])

            setStockAnalysis(stock)
            setExpiryAnalysis(expiry)
            setOrderSuggestions(orders)
            setTrendsAnalysis(trends)

            // Generate comprehensive AI report
            const reportRes = await fetch('/api/models/generate-inventory-report', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model_id: selectedModel.id,
                    dataset_id: selectedDataset?.id,
                    stock_analysis: stock,
                    expiry_analysis: expiry,
                    order_suggestions: orders,
                    trends_analysis: trends
                })
            })

            if (reportRes.ok) {
                const reportData = await reportRes.json()
                setFullReport(reportData)
            }

        } catch (error) {
            console.error('Analysis failed:', error)
        }

        setLoading(false)
    }

    return (
        <div className="reasoning-page">
            <div className="page-header">
                <h1>🧠 AI Reasoning & Inventory Intelligence</h1>
                <p>Get smart recommendations based on your trained models and inventory data</p>
            </div>

            {/* Model & Dataset Selection */}
            <div className="selection-section">
                <div className="card">
                    <h2>📊 Select Model & Dataset</h2>
                    <div className="selection-grid">
                        <div className="selection-group">
                            <label>Trained Model</label>
                            <select
                                value={selectedModel?.id || ''}
                                onChange={(e) => {
                                    const model = models.find(m => m.id === parseInt(e.target.value))
                                    setSelectedModel(model)
                                }}
                            >
                                <option value="">-- Select a Model --</option>
                                {models.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.name} ({model.best_model_name} - {(model.best_score * 100).toFixed(1)}%)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="selection-group">
                            <label>Dataset (Optional)</label>
                            <select
                                value={selectedDataset?.id || ''}
                                onChange={(e) => {
                                    const dataset = datasets.find(d => d.id === parseInt(e.target.value))
                                    setSelectedDataset(dataset)
                                }}
                            >
                                <option value="">-- Select a Dataset --</option>
                                {datasets.map(ds => (
                                    <option key={ds.id} value={ds.id}>{ds.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button
                        className="btn btn-primary analyze-btn"
                        onClick={runFullAnalysis}
                        disabled={loading || !selectedModel}
                    >
                        {loading ? '🔄 Analyzing...' : '🚀 Run AI Analysis with All Agents'}
                    </button>
                </div>
            </div>

            {/* Agent Tabs */}
            <div className="tabs-container">
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >📋 Overview</button>
                    <button
                        className={`tab ${activeTab === 'stock' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stock')}
                    >🔍 Stock Analysis</button>
                    <button
                        className={`tab ${activeTab === 'expiry' ? 'active' : ''}`}
                        onClick={() => setActiveTab('expiry')}
                    >📅 Expiry & Tips</button>
                    <button
                        className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
                        onClick={() => setActiveTab('orders')}
                    >🛒 Purchase Orders</button>
                    <button
                        className={`tab ${activeTab === 'trends' ? 'active' : ''}`}
                        onClick={() => setActiveTab('trends')}
                    >📈 Local Trends</button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="overview-section">
                        {!stockAnalysis ? (
                            <div className="empty-state">
                                <h3>🤖 AI Agents Ready</h3>
                                <p>Select a model and click "Run AI Analysis" to get comprehensive inventory insights</p>
                                <div className="agents-preview">
                                    <div className="agent-item">🔍 <strong>Stock Analysis Agent</strong> - Identifies low/out-of-stock items</div>
                                    <div className="agent-item">📅 <strong>Expiry Prediction Agent</strong> - Tracks expiring products + selling tips</div>
                                    <div className="agent-item">🛒 <strong>Order Generation Agent</strong> - Auto-creates smart purchase orders</div>
                                    <div className="agent-item">🏪 <strong>Vendor Quotation Agent</strong> - Compares vendor quotes with AI ranking</div>
                                    <div className="agent-item">📈 <strong>Local Trends Agent</strong> - Analyzes local events for demand forecasting</div>
                                </div>
                            </div>
                        ) : (
                            <div className="dashboard-grid">
                                <div className="metric-card health">
                                    <h3>📊 Stock Health</h3>
                                    <div className="metric-value">{stockAnalysis.health_score?.toFixed(0) || 0}%</div>
                                    <p>{stockAnalysis.total_items || 0} items tracked</p>
                                </div>
                                <div className="metric-card warning">
                                    <h3>⚠️ Low Stock</h3>
                                    <div className="metric-value">{stockAnalysis.low_stock?.count || 0}</div>
                                    <p>Items need restocking</p>
                                </div>
                                <div className="metric-card danger">
                                    <h3>🚫 Out of Stock</h3>
                                    <div className="metric-value">{stockAnalysis.out_of_stock?.count || 0}</div>
                                    <p>Critical - Order now!</p>
                                </div>
                                <div className="metric-card expiry">
                                    <h3>📅 Expiring Soon</h3>
                                    <div className="metric-value">{expiryAnalysis?.expiring_soon?.count || 0}</div>
                                    <p>Within 7 days</p>
                                </div>
                            </div>
                        )}

                        {/* AI Report Summary */}
                        {fullReport && (
                            <div className="card ai-report">
                                <h2>🤖 AI Generated Report</h2>
                                <div className="report-content">
                                    {fullReport.summary && <p>{fullReport.summary}</p>}
                                    {fullReport.recommendations && (
                                        <div className="recommendations">
                                            <h4>Key Recommendations:</h4>
                                            <ul>
                                                {fullReport.recommendations.map((rec, idx) => (
                                                    <li key={idx}>{rec}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Stock Analysis Tab */}
                {activeTab === 'stock' && stockAnalysis && (
                    <div className="stock-section">
                        <div className="card">
                            <h2>🔍 Stock Analysis Agent Report</h2>

                            {stockAnalysis.ai_insights && (
                                <div className="ai-insight-box">
                                    <h4>🤖 AI Insights</h4>
                                    <p>{stockAnalysis.ai_insights}</p>
                                </div>
                            )}

                            {stockAnalysis.out_of_stock?.items?.length > 0 && (
                                <div className="alert-section critical">
                                    <h3>🚫 Out of Stock - Immediate Action Required</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>Category</th>
                                                <th>Min Level</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stockAnalysis.out_of_stock.items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td><strong>{item.name}</strong></td>
                                                    <td>{item.category}</td>
                                                    <td>{item.min_stock_level}</td>
                                                    <td><span className="badge danger">Order Now</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {stockAnalysis.low_stock?.items?.length > 0 && (
                                <div className="alert-section warning">
                                    <h3>⚠️ Low Stock Items</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>Current Qty</th>
                                                <th>Min Level</th>
                                                <th>Shortage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stockAnalysis.low_stock.items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td>{item.name}</td>
                                                    <td>{item.quantity}</td>
                                                    <td>{item.min_stock_level}</td>
                                                    <td className="shortage">-{item.min_stock_level - item.quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Expiry Tab */}
                {activeTab === 'expiry' && expiryAnalysis && (
                    <div className="expiry-section">
                        <div className="card">
                            <h2>📅 Expiry Prediction Agent Report</h2>

                            {expiryAnalysis.expired?.items?.length > 0 && (
                                <div className="alert-section critical">
                                    <h3>🚨 EXPIRED - Remove Immediately</h3>
                                    {expiryAnalysis.expired.items.map((item, idx) => (
                                        <div key={idx} className="expiry-item expired">
                                            <strong>{item.name}</strong>
                                            <span>Expired {Math.abs(item.days_until_expiry)} days ago</span>
                                            <span className="badge danger">Remove</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {expiryAnalysis.expiring_soon?.items?.length > 0 && (
                                <div className="alert-section warning">
                                    <h3>⏰ Expiring Soon (7 days)</h3>
                                    {expiryAnalysis.expiring_soon.items.map((item, idx) => (
                                        <div key={idx} className="expiry-item soon">
                                            <strong>{item.name}</strong>
                                            <span>{item.days_until_expiry} days left</span>
                                            <span>Qty: {item.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {expiryAnalysis.selling_tips?.length > 0 && (
                                <div className="selling-tips">
                                    <h3>💡 AI Selling Tips</h3>
                                    <div className="tips-grid">
                                        {expiryAnalysis.selling_tips.map((tip, idx) => (
                                            <div key={idx} className="tip-card">
                                                <h4>📦 {tip.item_name}</h4>
                                                <p>💰 <strong>Discount:</strong> {tip.discount_percent}% off</p>
                                                <p>🎁 <strong>Bundle:</strong> {tip.bundle_suggestion}</p>
                                                <p>📢 <strong>Message:</strong> {tip.marketing_message}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Orders Tab */}
                {activeTab === 'orders' && orderSuggestions && (
                    <div className="orders-section">
                        <div className="card">
                            <div className="flex justify-between items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2>🛒 Order Generation Agent Report</h2>
                                <button
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        if (!window.confirm('Are you sure you want to book these orders?')) return;
                                        try {
                                            const token = localStorage.getItem('token');
                                            // Create order for all suggested items
                                            const response = await fetch('http://localhost:5000/api/inventory/orders', {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${token}`
                                                },
                                                body: JSON.stringify({
                                                    items: orderSuggestions.suggested_items,
                                                    total: orderSuggestions.estimated_total_cost,
                                                    notes: "Auto-generated by AI Order Agent",
                                                    ai_reasoning: orderSuggestions.ai_reasoning,
                                                    urgency_level: "high"
                                                })
                                            });
                                            if (response.ok) {
                                                alert('✅ Order booked successfully! Sent to vendor.');
                                            } else {
                                                alert('❌ Failed to book order');
                                            }
                                        } catch (e) {
                                            console.error(e);
                                            alert('❌ Error booking order');
                                        }
                                    }}
                                    style={{ background: '#10b981' }} // Green color for action
                                >
                                    ✅ Approve & Book All Orders
                                </button>
                            </div>

                            <div className="order-summary">
                                <div className="summary-item">
                                    <span>Items to Order</span>
                                    <strong>{orderSuggestions.total_items || 0}</strong>
                                </div>
                                <div className="summary-item critical">
                                    <span>Critical</span>
                                    <strong>{orderSuggestions.critical_count || 0}</strong>
                                </div>
                                <div className="summary-item warning">
                                    <span>High Priority</span>
                                    <strong>{orderSuggestions.high_priority_count || 0}</strong>
                                </div>
                                <div className="summary-item">
                                    <span>Est. Cost</span>
                                    <strong>₹{orderSuggestions.estimated_total_cost?.toFixed(0) || 0}</strong>
                                </div>
                            </div>

                            {orderSuggestions.ai_reasoning && (
                                <div className="ai-insight-box">
                                    <h4>🤖 AI Order Reasoning</h4>
                                    <p>{orderSuggestions.ai_reasoning}</p>
                                </div>
                            )}

                            {orderSuggestions.suggested_items?.length > 0 && (
                                <div className="order-table">
                                    <h3>📋 Suggested Purchase Order</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Priority</th>
                                                <th>Product</th>
                                                <th>Current</th>
                                                <th>Order Qty</th>
                                                <th>Vendor</th>
                                                <th>Est. Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderSuggestions.suggested_items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td>
                                                        <span className={`badge ${item.urgency}`}>
                                                            {item.urgency === 'critical' ? '🔴' : item.urgency === 'high' ? '🟠' : '🟢'}
                                                            {item.urgency}
                                                        </span>
                                                    </td>
                                                    <td>{item.item_name}</td>
                                                    <td>{item.current_quantity}</td>
                                                    <td><strong>{item.order_quantity}</strong> {item.unit}</td>
                                                    <td>{item.best_vendor || 'Best Market Price'}</td>
                                                    <td>₹{item.estimated_cost?.toFixed(0)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Trends Tab */}
                {activeTab === 'trends' && trendsAnalysis && (
                    <div className="trends-section">
                        <div className="card">
                            <h2>📈 Local Trends Agent Report</h2>
                            <p>Location: {trendsAnalysis.location} | Looking ahead: {trendsAnalysis.date_range_days} days</p>

                            <div className="events-grid">
                                {trendsAnalysis.events?.map((event, idx) => (
                                    <div key={idx} className={`event-card ${event.impact}`}>
                                        <h4>{event.name}</h4>
                                        <p><strong>Type:</strong> {event.type}</p>
                                        <p className="demand-change">
                                            <strong>Expected Demand:</strong>
                                            <span className="positive">+{event.expected_demand_change}%</span>
                                        </p>
                                        <p><strong>Categories:</strong> {event.affected_categories?.join(', ')}</p>
                                    </div>
                                ))}
                            </div>

                            {trendsAnalysis.demand_forecast && (
                                <div className="forecast-section">
                                    <h3>🔮 Demand Forecast</h3>
                                    <div className="forecast-content">
                                        {trendsAnalysis.demand_forecast.top_categories && (
                                            <p><strong>Stock up on:</strong> {trendsAnalysis.demand_forecast.top_categories.join(', ')}</p>
                                        )}
                                        {trendsAnalysis.demand_forecast.recommendations?.map((rec, idx) => (
                                            <p key={idx}>• {rec}</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .reasoning-page { padding: 1.5rem; max-width: 1400px; margin: 0 auto; background: #0f0f23; min-height: 100vh; }
                .page-header h1 { font-size: 1.75rem; color: #ffffff; margin-bottom: 0.5rem; }
                .page-header p { color: #9ca3af; }
                
                .card { background: #1a1a2e; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.3); margin-bottom: 1rem; border: 1px solid #2d2d44; }
                .card h2 { font-size: 1.25rem; margin-bottom: 1rem; color: #ffffff; }
                .card h3 { color: #e5e7eb; }
                .card p { color: #d1d5db; }
                
                .selection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
                .selection-group label { display: block; font-weight: 500; margin-bottom: 0.5rem; color: #9ca3af; }
                .selection-group select { width: 100%; padding: 0.75rem; border: 1px solid #3d3d5c; border-radius: 8px; background: #0f0f23; color: #ffffff; }
                .selection-group select option { background: #1a1a2e; color: #ffffff; }
                
                .btn { padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
                .btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
                .btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .analyze-btn { width: 100%; font-size: 1rem; }
                
                .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
                .tab { padding: 0.75rem 1rem; border: none; background: #1a1a2e; color: #9ca3af; border-radius: 8px; cursor: pointer; font-weight: 500; border: 1px solid #2d2d44; }
                .tab:hover { background: #2d2d44; color: #ffffff; }
                .tab.active { background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; }
                
                .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
                .metric-card { padding: 1.5rem; border-radius: 12px; text-align: center; }
                .metric-card h3 { color: #1a1a2e; margin-bottom: 0.5rem; font-size: 0.9rem; }
                .metric-card p { color: #374151; font-size: 0.85rem; }
                .metric-card.health { background: linear-gradient(135deg, #10b981, #059669); }
                .metric-card.health h3, .metric-card.health p { color: #ffffff; }
                .metric-card.warning { background: linear-gradient(135deg, #f59e0b, #d97706); }
                .metric-card.warning h3, .metric-card.warning p { color: #1a1a2e; }
                .metric-card.danger { background: linear-gradient(135deg, #ef4444, #dc2626); }
                .metric-card.danger h3, .metric-card.danger p { color: #ffffff; }
                .metric-card.expiry { background: linear-gradient(135deg, #3b82f6, #2563eb); }
                .metric-card.expiry h3, .metric-card.expiry p { color: #ffffff; }
                .metric-value { font-size: 2.5rem; font-weight: 700; color: #ffffff; }
                
                .agents-preview { margin-top: 1.5rem; }
                .agent-item { padding: 0.75rem; background: #2d2d44; border-radius: 8px; margin-bottom: 0.5rem; color: #d1d5db; border-left: 3px solid #667eea; }
                .agent-item strong { color: #ffffff; }
                
                .empty-state { text-align: center; padding: 3rem; color: #9ca3af; }
                .empty-state h3 { color: #ffffff; margin-bottom: 0.5rem; }
                
                .alert-section { padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
                .alert-section h3 { margin-bottom: 0.75rem; }
                .alert-section.critical { background: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444; }
                .alert-section.critical h3 { color: #fca5a5; }
                .alert-section.warning { background: rgba(245, 158, 11, 0.15); border-left: 4px solid #f59e0b; }
                .alert-section.warning h3 { color: #fcd34d; }
                
                .data-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
                .data-table th, .data-table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #2d2d44; color: #d1d5db; }
                .data-table th { background: #0f0f23; font-weight: 600; color: #9ca3af; }
                .data-table td strong { color: #ffffff; }
                
                .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
                .badge.danger { background: #ef4444; color: white; }
                .badge.critical { background: #dc2626; color: white; }
                .badge.high { background: #f59e0b; color: #1a1a2e; }
                .badge.normal { background: #22c55e; color: white; }
                
                .shortage { color: #fca5a5; font-weight: 600; }
                
                .ai-insight-box { background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2)); padding: 1rem; border-radius: 8px; margin: 1rem 0; border: 1px solid #667eea; }
                .ai-insight-box h4 { margin-bottom: 0.5rem; color: #a5b4fc; }
                .ai-insight-box p { color: #d1d5db; }
                
                .expiry-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #2d2d44; border-radius: 8px; margin-bottom: 0.5rem; }
                .expiry-item strong { color: #ffffff; }
                .expiry-item span { color: #9ca3af; }
                
                .selling-tips h3 { color: #fcd34d; margin-bottom: 1rem; }
                .tips-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
                .tip-card { background: rgba(34, 197, 94, 0.1); padding: 1rem; border-radius: 8px; border-left: 4px solid #22c55e; }
                .tip-card h4 { margin-bottom: 0.5rem; color: #86efac; }
                .tip-card p { color: #d1d5db; margin-bottom: 0.25rem; }
                .tip-card strong { color: #ffffff; }
                
                .order-summary { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
                .summary-item { background: #2d2d44; padding: 1rem; border-radius: 8px; text-align: center; flex: 1; min-width: 120px; }
                .summary-item span { color: #9ca3af; font-size: 0.85rem; }
                .summary-item strong { display: block; font-size: 1.5rem; margin-top: 0.5rem; color: #ffffff; }
                .summary-item.critical { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; }
                .summary-item.warning { background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; }
                
                .order-table h3 { color: #e5e7eb; margin-bottom: 0.5rem; }
                
                .events-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
                .event-card { background: #2d2d44; padding: 1rem; border-radius: 8px; border-left: 4px solid #3b82f6; }
                .event-card h4 { color: #ffffff; margin-bottom: 0.5rem; }
                .event-card p { color: #d1d5db; margin-bottom: 0.25rem; }
                .event-card strong { color: #9ca3af; }
                .event-card.very_high, .event-card.high { border-left-color: #ef4444; }
                .event-card.medium { border-left-color: #f59e0b; }
                .demand-change .positive { color: #22c55e; font-weight: 600; }
                
                .forecast-section { margin-top: 1.5rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px; border: 1px solid #3b82f6; }
                .forecast-section h3 { color: #93c5fd; margin-bottom: 0.5rem; }
                .forecast-content p { color: #d1d5db; }
                .forecast-content strong { color: #ffffff; }
                
                .ai-report { background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15)); border: 1px solid #667eea; }
                .ai-report h2 { color: #a5b4fc; }
                .report-content p { color: #d1d5db; }
                .recommendations h4 { color: #fcd34d; margin-top: 1rem; }
                .recommendations ul { margin-top: 0.5rem; padding-left: 1.25rem; }
                .recommendations li { margin-bottom: 0.5rem; color: #d1d5db; }
            `}</style>
        </div>
    )
}
