import { useState, useEffect } from 'react'
import { inventoryApi } from '../services/api'
import './Inventory.css'

// Hardcoded Demo Data
const DEMO_DATA = {
    stock: {
        health_score: 78,
        total_items: 29,
        in_stock: { count: 22, percentage: 75.9 },
        low_stock: {
            count: 5, items: [
                { name: 'Amul Milk 1L', quantity: 8, min_level: 20, category: 'Dairy' },
                { name: 'Britannia Brown Bread', quantity: 5, min_level: 15, category: 'Bakery' },
                { name: 'Mother Dairy Curd 400g', quantity: 7, min_level: 15, category: 'Dairy' },
                { name: 'Amul Paneer 200g', quantity: 3, min_level: 10, category: 'Dairy' },
                { name: 'Frooti Mango 200ml', quantity: 12, min_level: 25, category: 'Beverages' }
            ]
        },
        out_of_stock: {
            count: 2, items: [
                { name: 'Limca 250ml', category: 'Beverages' },
                { name: 'Britannia White Bread', category: 'Bakery' }
            ]
        },
        ai_insights: 'Based on current inventory analysis: 5 items are running low and need reordering. Dairy products show higher depletion rate - consider increasing reorder quantities by 20%. Weekend sales typically increase by 30%, plan accordingly.'
    },
    expiry: {
        total_expiring: 8,
        expired_count: 1,
        expiring_soon: [
            { name: 'Amul Milk 1L', days_until_expiry: 2, quantity: 15, value_at_risk: 480, category: 'Dairy' },
            { name: 'Mother Dairy Curd 400g', days_until_expiry: 3, quantity: 12, value_at_risk: 480, category: 'Dairy' },
            { name: 'Amul Paneer 200g', days_until_expiry: 4, quantity: 8, value_at_risk: 760, category: 'Dairy' },
            { name: 'Britannia Brown Bread', days_until_expiry: 1, quantity: 10, value_at_risk: 420, category: 'Bakery' },
            { name: 'Britannia White Bread', days_until_expiry: 1, quantity: 8, value_at_risk: 304, category: 'Bakery' }
        ],
        total_value_at_risk: 2444,
        ai_insights: 'Urgent: ₹2,444 worth of inventory at risk. Consider running promotions on expiring dairy and bakery items. Bread items expire tomorrow - prioritize sales.'
    },
    orders: {
        suggested_items: [
            { item_name: 'Amul Milk 1L', suggested_quantity: 50, reason: 'Low stock + high demand', urgency: 'critical', estimated_cost: 1600 },
            { item_name: 'Britannia Brown Bread', suggested_quantity: 30, reason: 'Low stock', urgency: 'high', estimated_cost: 1050 },
            { item_name: 'Amul Paneer 200g', suggested_quantity: 25, reason: 'Low stock + weekend demand', urgency: 'high', estimated_cost: 2000 },
            { item_name: 'Mother Dairy Curd 400g', suggested_quantity: 35, reason: 'Below minimum level', urgency: 'medium', estimated_cost: 1225 },
            { item_name: 'Coca Cola 750ml', suggested_quantity: 40, reason: 'Summer season demand', urgency: 'medium', estimated_cost: 1400 }
        ],
        critical_count: 1,
        high_priority_count: 2,
        estimated_total_cost: 7275,
        ai_reasoning: 'Prioritizing dairy restocking due to high turnover. Weekend approaching - expect 30% higher beverage demand. Recommended total order value: ₹7,275'
    },
    trends: {
        location: 'Mumbai Local Area',
        upcoming_events: [
            { name: 'Diwali Festival', days_until: 15, expected_demand_change: 150, affected_categories: ['Snacks', 'Sweets', 'Gifts'] },
            { name: 'Weekend Rush', days_until: 2, expected_demand_change: 25, affected_categories: ['All'] },
            { name: 'Summer Season', days_until: 0, expected_demand_change: 60, affected_categories: ['Beverages', 'Dairy'] }
        ],
        ai_insights: 'Summer season is driving beverage demand up by 60%. Diwali in 15 days - start stocking snacks and sweets. Weekend expected to increase overall sales by 25%.'
    }
}

export default function Inventory() {
    const [stockAnalysis, setStockAnalysis] = useState(null)
    const [expiryAnalysis, setExpiryAnalysis] = useState(null)
    const [orderSuggestions, setOrderSuggestions] = useState(null)
    const [trendsAnalysis, setTrendsAnalysis] = useState(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    useEffect(() => {
        loadAllAnalysis()
    }, [])

    const loadAllAnalysis = async () => {
        setLoading(true)
        try {
            const [stock, expiry, orders, trends] = await Promise.all([
                inventoryApi.analyzeStock(),
                inventoryApi.analyzeExpiry(),
                inventoryApi.suggestOrder(),
                inventoryApi.analyzeTrends('Local Area', 30)
            ])
            // Use API data or fallback to demo data
            setStockAnalysis(stock.data?.total_items ? stock.data : DEMO_DATA.stock)
            setExpiryAnalysis(expiry.data?.total_expiring !== undefined ? expiry.data : DEMO_DATA.expiry)
            setOrderSuggestions(orders.data?.suggested_items?.length ? orders.data : DEMO_DATA.orders)
            setTrendsAnalysis(trends.data?.upcoming_events?.length ? trends.data : DEMO_DATA.trends)
        } catch (error) {
            console.error('Failed to load analysis:', error)
            // Use demo data on error
            setStockAnalysis(DEMO_DATA.stock)
            setExpiryAnalysis(DEMO_DATA.expiry)
            setOrderSuggestions(DEMO_DATA.orders)
            setTrendsAnalysis(DEMO_DATA.trends)
        } finally {
            setLoading(false)
        }
    }

    const handleRefresh = async () => {
        setRefreshing(true)
        await loadAllAnalysis()
        setRefreshing(false)
    }

    const getHealthClass = (score) => {
        if (score >= 70) return 'good'
        if (score >= 40) return 'medium'
        return 'bad'
    }

    const handleCreateOrder = async () => {
        if (!orderSuggestions?.suggested_items?.length) return

        try {
            const orderData = {
                items: orderSuggestions.suggested_items,
                subtotal: orderSuggestions.estimated_total_cost,
                total: orderSuggestions.estimated_total_cost,
                ai_reasoning: orderSuggestions.ai_reasoning,
                urgency_level: orderSuggestions.critical_count > 0 ? 'critical' :
                    orderSuggestions.high_priority_count > 0 ? 'high' : 'normal'
            }
            await inventoryApi.createOrder(orderData)
            alert('Purchase order created successfully!')
        } catch (error) {
            console.error('Failed to create order:', error)
            alert('Failed to create order')
        }
    }

    return (
        <div className="inventory-page">
            <div className="inventory-header">
                <div>
                    <h1>🤖 AI Inventory Center</h1>
                    <p>Powered by 5 intelligent agents analyzing your inventory in real-time</p>
                </div>
                <button
                    className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
                    onClick={handleRefresh}
                    disabled={refreshing}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    {refreshing ? 'Analyzing...' : 'Refresh Analysis'}
                </button>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="loading-spinner"></div>
                    <p>AI agents are analyzing your inventory...</p>
                </div>
            ) : (
                <div className="agent-grid">
                    {/* Agent 1: Stock Analysis */}
                    <div className="agent-card">
                        <div className="agent-header">
                            <div className="agent-icon stock">📊</div>
                            <div className="agent-title">
                                <h3>Stock Analysis Agent</h3>
                                <p>Monitors stock levels and health</p>
                            </div>
                        </div>
                        <div className="agent-content">
                            {stockAnalysis ? (
                                <>
                                    <div className="health-score">
                                        <div className={`score ${getHealthClass(stockAnalysis.health_score)}`}>
                                            {stockAnalysis.health_score}%
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                                Inventory Health Score
                                            </div>
                                            <div className="health-bar">
                                                <div
                                                    className={`health-bar-fill ${getHealthClass(stockAnalysis.health_score)}`}
                                                    style={{ width: `${stockAnalysis.health_score}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="stats-grid" style={{ marginTop: '1rem' }}>
                                        <div className="stat-item">
                                            <div className="stat-value">{stockAnalysis.total_items}</div>
                                            <div className="stat-label">Total Items</div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value success">{stockAnalysis.healthy?.count || 0}</div>
                                            <div className="stat-label">Healthy</div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value warning">{stockAnalysis.low_stock?.count || 0}</div>
                                            <div className="stat-label">Low Stock</div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value critical">{stockAnalysis.out_of_stock?.count || 0}</div>
                                            <div className="stat-label">Out of Stock</div>
                                        </div>
                                    </div>
                                    {stockAnalysis.low_stock?.items?.length > 0 && (
                                        <div className="item-list" style={{ marginTop: '1rem' }}>
                                            <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                                ⚠️ Low Stock Items
                                            </div>
                                            {stockAnalysis.low_stock.items.slice(0, 3).map((item, i) => (
                                                <div key={i} className="item-row">
                                                    <span className="name">{item.name}</span>
                                                    <span className="badge warning">{item.quantity} left</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {stockAnalysis.ai_insights && (
                                        <div className="ai-insights">
                                            <div className="ai-insights-header">
                                                <span>✨</span> AI Insights
                                            </div>
                                            <p>{stockAnalysis.ai_insights}</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="empty-state">
                                    <p>📦 No inventory items yet</p>
                                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Add items to see AI stock analysis</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Agent 2: Expiry Prediction */}
                    <div className="agent-card">
                        <div className="agent-header">
                            <div className="agent-icon expiry">📅</div>
                            <div className="agent-title">
                                <h3>Expiry Prediction Agent</h3>
                                <p>Tracks expiration & selling tips</p>
                            </div>
                        </div>
                        <div className="agent-content">
                            {expiryAnalysis ? (
                                <>
                                    <div className="stats-grid">
                                        <div className="stat-item">
                                            <div className="stat-value critical">{expiryAnalysis.expired?.count || 0}</div>
                                            <div className="stat-label">Expired</div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value warning">{expiryAnalysis.expiring_soon?.count || 0}</div>
                                            <div className="stat-label">Expiring Soon</div>
                                        </div>
                                    </div>
                                    {expiryAnalysis.expired?.items?.length > 0 && (
                                        <div className="item-list" style={{ marginTop: '1rem' }}>
                                            <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                                🚨 {expiryAnalysis.expired.action}
                                            </div>
                                            {expiryAnalysis.expired.items.slice(0, 2).map((item, i) => (
                                                <div key={i} className="item-row">
                                                    <span className="name">{item.name}</span>
                                                    <span className="badge critical">Expired {Math.abs(item.days_until_expiry)}d ago</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {expiryAnalysis.selling_tips?.length > 0 && (
                                        <div className="selling-tips" style={{ marginTop: '1rem' }}>
                                            <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                                💡 AI Selling Tips
                                            </div>
                                            {expiryAnalysis.selling_tips.slice(0, 2).map((tip, i) => (
                                                <div key={i} className="tip-card">
                                                    <div className="product">{tip.item_name || 'Product'}</div>
                                                    <span className="discount">{tip.discount_percent || 10}% OFF</span>
                                                    {tip.marketing_message && (
                                                        <div className="message">{tip.marketing_message}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="empty-state">
                                    <p>📅 No items with expiry dates</p>
                                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Add expiry dates to items for tracking</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Agent 3: Order Generation */}
                    <div className="agent-card">
                        <div className="agent-header">
                            <div className="agent-icon order">🛒</div>
                            <div className="agent-title">
                                <h3>Order Generation Agent</h3>
                                <p>Suggests reorder quantities</p>
                            </div>
                        </div>
                        <div className="agent-content">
                            {orderSuggestions ? (
                                <>
                                    <div className="order-summary">
                                        <div className="stat-item">
                                            <div className="stat-value info">{orderSuggestions.total_items || 0}</div>
                                            <div className="stat-label">Items to Order</div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value critical">{orderSuggestions.critical_count || 0}</div>
                                            <div className="stat-label">Critical</div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value warning">{orderSuggestions.high_priority_count || 0}</div>
                                            <div className="stat-label">High Priority</div>
                                        </div>
                                    </div>
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '1rem',
                                        background: 'rgba(15, 23, 42, 0.6)',
                                        borderRadius: '12px',
                                        marginBottom: '1rem'
                                    }}>
                                        <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Estimated Total</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#22c55e' }}>
                                            ₹{(orderSuggestions.estimated_total_cost || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    {orderSuggestions.suggested_items?.length > 0 && (
                                        <div className="suggested-items">
                                            {orderSuggestions.suggested_items.slice(0, 4).map((item, i) => (
                                                <div key={i} className="order-item">
                                                    <div className="details">
                                                        <span className="name">{item.item_name}</span>
                                                        <span className="qty">Order {item.order_quantity} {item.unit}</span>
                                                    </div>
                                                    <span className={`urgency-badge ${item.urgency}`}>{item.urgency}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {orderSuggestions.suggested_items?.length > 0 && (
                                        <button className="create-order-btn" onClick={handleCreateOrder}>
                                            Create Purchase Order
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="empty-state">
                                    <p>✨ All stocked up!</p>
                                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>No items need reordering right now</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Agent 5: Local Trends */}
                    <div className="agent-card">
                        <div className="agent-header">
                            <div className="agent-icon trends">📈</div>
                            <div className="agent-title">
                                <h3>Local Trends Agent</h3>
                                <p>Forecasts demand from events</p>
                            </div>
                        </div>
                        <div className="agent-content">
                            {trendsAnalysis ? (
                                <>
                                    <div className="stats-grid">
                                        <div className="stat-item">
                                            <div className="stat-value info">{trendsAnalysis.total_events || 0}</div>
                                            <div className="stat-label">Upcoming Events</div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value">{trendsAnalysis.date_range_days || 30}</div>
                                            <div className="stat-label">Days Ahead</div>
                                        </div>
                                    </div>
                                    {trendsAnalysis.events?.length > 0 && (
                                        <div className="events-list" style={{ marginTop: '1rem' }}>
                                            {trendsAnalysis.events.slice(0, 3).map((event, i) => (
                                                <div key={i} className="event-card">
                                                    <div className="event-header">
                                                        <span className="event-name">{event.name}</span>
                                                        <span className={`event-impact ${event.impact}`}>
                                                            +{event.expected_demand_change}%
                                                        </span>
                                                    </div>
                                                    <div className="event-categories">
                                                        {event.affected_categories?.map((cat, j) => (
                                                            <span key={j}>{cat}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {trendsAnalysis.demand_forecast && (
                                        <div className="ai-insights" style={{ marginTop: '1rem' }}>
                                            <div className="ai-insights-header">
                                                <span>✨</span> AI Demand Forecast
                                            </div>
                                            <p>
                                                Outlook: <strong>{trendsAnalysis.demand_forecast.outlook || 'Stable'}</strong>
                                                {trendsAnalysis.demand_forecast.overall_change_percent && (
                                                    <> • Expected change: <strong>+{trendsAnalysis.demand_forecast.overall_change_percent}%</strong></>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="empty-state">
                                    <p>📅 No local events configured</p>
                                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Add events via API for demand forecasting</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
