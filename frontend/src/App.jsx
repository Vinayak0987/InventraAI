import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Datasets from './pages/Datasets'
import Training from './pages/Training'
import Models from './pages/Models'
import Predictions from './pages/Predictions'
import Reasoning from './pages/Reasoning'
import Inventory from './pages/Inventory'
import DemandForecast from './pages/DemandForecast'
import DailyItems from './pages/DailyItems'
import SalesInput from './pages/SalesInput'
import Login from './pages/Login'
import AnimatedGridBackground from './components/AnimatedGridBackground'
import { useAuthStore } from './store/authStore'

function App() {
    const { isAuthenticated, checkAuth } = useAuthStore()
    const [loading, setLoading] = useState(true)


    useEffect(() => {
        checkAuth()
        setLoading(false)
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '100vh' }}>
                <div className="spinner"></div>
            </div>
        )
    }

    return (
        <>
            <AnimatedGridBackground />
            <div style={{ position: 'relative', zIndex: 10 }}>
                <Routes>
                    {/* Public Landing Page */}
                    <Route path="/" element={<Landing />} />

                    {/* Auth Routes */}
                    <Route path="/login" element={!isAuthenticated ? <Login mode="login" /> : <Navigate to="/dashboard" />} />
                    <Route path="/signup" element={!isAuthenticated ? <Login mode="signup" /> : <Navigate to="/dashboard" />} />

                    {/* Protected Routes */}
                    <Route
                        path="/*"
                        element={
                            isAuthenticated ? (
                                <Layout>
                                    <Routes>
                                        <Route path="/dashboard" element={<Dashboard />} />
                                        <Route path="/datasets" element={<Datasets />} />
                                        <Route path="/training" element={<Training />} />
                                        <Route path="/models" element={<Models />} />
                                        <Route path="/predictions/:modelId?" element={<Predictions />} />
                                        <Route path="/reasoning" element={<Reasoning />} />
                                        <Route path="/inventory" element={<Inventory />} />
                                        <Route path="/forecast" element={<DemandForecast />} />
                                        <Route path="/daily-items" element={<DailyItems />} />
                                        <Route path="/sales" element={<SalesInput />} />
                                    </Routes>
                                </Layout>
                            ) : (
                                <Navigate to="/login" />
                            )
                        }
                    />
                </Routes>
            </div>
        </>
    )
}

export default App
