import axios from 'axios'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Request interceptor
api.interceptors.request.use(
    (config) => {
        // Get token from localStorage (persisted by zustand)
        const authData = localStorage.getItem('inferx-auth')
        if (authData) {
            try {
                const parsed = JSON.parse(authData)
                const token = parsed?.state?.token
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`
                }
            } catch (e) {
                console.error('Failed to parse auth data:', e)
            }
        }
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

// Response interceptor
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle 401 - Unauthorized
        if (error.response?.status === 401) {
            // Clear auth and redirect to login
            localStorage.removeItem('inferx-auth')
            window.location.href = '/login'
        }
        return Promise.reject(error)
    }
)

export default api

// API Methods
export const datasetsApi = {
    list: () => api.get('/datasets'),
    get: (id) => api.get(`/datasets/${id}`),
    upload: (formData, onProgress) =>
        api.post('/datasets/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total))
        }),
    delete: (id) => api.delete(`/datasets/${id}`),
    getProfile: (id) => api.get(`/datasets/${id}/profile`)
}

export const trainingApi = {
    start: (data) => api.post('/training/start', data),
    getStatus: (jobId) => api.get(`/training/${jobId}/status`),
    getLogs: (jobId) => api.get(`/training/${jobId}/logs`),
    cancel: (jobId) => api.post(`/training/${jobId}/cancel`),
    analyzePrompt: (datasetId, prompt) => api.post('/training/analyze-prompt', { dataset_id: datasetId, prompt })
}

export const modelsApi = {
    list: () => api.get('/models'),
    get: (id) => api.get(`/models/${id}`),
    delete: (id) => api.delete(`/models/${id}`),
    download: (id) => api.get(`/models/${id}/download`, { responseType: 'blob' }),
    getSchema: (id) => api.get(`/models/${id}/schema`)
}

export const predictionsApi = {
    predict: (modelId, input) => api.post(`/predict/${modelId}`, { input }),
    batchPredict: (modelId, formData) =>
        api.post(`/predict/${modelId}/batch`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),
    explain: (modelId, input) => api.post(`/predict/${modelId}/explain`, { input })
}

export const ordersApi = {
    list: (status) => api.get('/orders', { params: { status } }),
    get: (id) => api.get(`/orders/${id}`),
    create: (data) => api.post('/orders', data),
    updateItems: (id, items) => api.put(`/orders/${id}/items`, { items }),
    approve: (id) => api.post(`/orders/${id}/approve`),
    reject: (id, reason) => api.post(`/orders/${id}/reject`, { reason }),
    getPending: () => api.get('/orders/pending')
}

// Inventory Management API (AI-powered multiagent system)
export const inventoryApi = {
    // Items CRUD
    getItems: () => api.get('/inventory/items'),
    createItem: (data) => api.post('/inventory/items', data),
    updateItem: (id, data) => api.put(`/inventory/items/${id}`, data),
    deleteItem: (id) => api.delete(`/inventory/items/${id}`),
    bulkUpdate: (updates) => api.post('/inventory/items/bulk-update', { updates }),

    // AI Agent Analysis
    analyzeStock: () => api.get('/inventory/analysis/stock'),
    analyzeExpiry: () => api.get('/inventory/analysis/expiry'),
    analyzeTrends: (location, days = 30) => api.get('/inventory/analysis/trends', { params: { location, days } }),

    // Purchase Orders
    suggestOrder: () => api.get('/inventory/orders/suggest'),
    getOrders: (status) => api.get('/inventory/orders', { params: { status } }),
    createOrder: (data) => api.post('/inventory/orders', data),
    updateOrder: (id, data) => api.put(`/inventory/orders/${id}`, data),
    submitForApproval: (id) => api.post(`/inventory/orders/${id}/submit`),
    approveOrder: (id) => api.post(`/inventory/orders/${id}/approve`),
    placeOrder: (id) => api.post(`/inventory/orders/${id}/place`),

    // Vendors
    getVendors: () => api.get('/inventory/vendors'),
    createVendor: (data) => api.post('/inventory/vendors', data),

    // Quotations
    getQuotations: (orderId) => api.get(`/inventory/orders/${orderId}/quotations`),
    requestQuotations: (orderId) => api.post(`/inventory/orders/${orderId}/quotations/request`),
    selectQuotation: (quoteId) => api.post(`/inventory/quotations/${quoteId}/select`),

    // Reports
    generateReport: (type) => api.post('/inventory/reports/generate', { type }),
    getReports: () => api.get('/inventory/reports')
}

// Sales API (for demand forecasting)
export const salesApi = {
    logSale: (data) => api.post('/sales', data),
    bulkImport: (sales) => api.post('/sales/bulk', { sales }),
    uploadCsv: (formData) => api.post('/sales/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getDaily: (date) => api.get('/sales/daily', { params: { date } }),
    getHistory: (params) => api.get('/sales/history', { params }),
    getProducts: () => api.get('/sales/products')
}

// Forecast API (ML-powered demand prediction)
export const forecastApi = {
    train: (modelType = 'random_forest', days = 90) =>
        api.post('/forecast/train', { model_type: modelType, days }),
    predict: (productName, days = 7) =>
        api.get(`/forecast/predict/${encodeURIComponent(productName)}`, { params: { days } }),
    getAll: (days = 7) => api.get('/forecast/all', { params: { days } }),
    getAccuracy: (days = 30) => api.get('/forecast/accuracy', { params: { days } }),
    getWeeklyOrder: () => api.get('/forecast/weekly-order')
}

// Daily Items API (perishables like milk, paneer)
export const dailyItemsApi = {
    getItems: () => api.get('/daily-items'),
    createItem: (data) => api.post('/daily-items', data),
    updateItem: (id, data) => api.put(`/daily-items/${id}`, data),
    deleteItem: (id) => api.delete(`/daily-items/${id}`),
    logReceipt: (data) => api.post('/daily-items/receive', data),
    bulkReceipt: (receipts) => api.post('/daily-items/receive/bulk', { receipts }),
    getSummary: () => api.get('/daily-items/summary'),
    generateDailyOrder: () => api.post('/daily-items/auto-order')
}
