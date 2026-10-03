import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
    Cpu,
    Play,
    Target,
    CheckCircle,
    Clock,
    AlertCircle,
    Sparkles,
    Wand2
} from 'lucide-react'
import { datasetsApi, trainingApi } from '../services/api'
import './Training.css'

export default function Training() {
    const [searchParams] = useSearchParams()
    const preselectedDataset = searchParams.get('dataset')
    const navigate = import.meta.env.VITE_NAVIGATE_HOOK ? import.meta.env.VITE_NAVIGATE_HOOK() : null

    const [selectedDataset, setSelectedDataset] = useState(preselectedDataset || '')
    const [targetColumn, setTargetColumn] = useState('')
    const [experimentName, setExperimentName] = useState('')
    const [goalDescription, setGoalDescription] = useState('')
    const [isTraining, setIsTraining] = useState(false)
    const [currentJob, setCurrentJob] = useState(null)
    const logsEndRef = useRef(null)

    // AI Prompt Analysis State
    const [aiPrompt, setAiPrompt] = useState('')
    const [aiAnalysis, setAiAnalysis] = useState(null)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisError, setAnalysisError] = useState(null)

    const { data: datasetsData, isLoading: datasetsLoading, isError: datasetsError } = useQuery({
        queryKey: ['datasets'],
        queryFn: () => datasetsApi.list()
    })

    const datasets = datasetsData?.data?.datasets || []
    const selectedDatasetInfo = datasets.find(d => d.id.toString() === selectedDataset)

    const { data: profileData, isLoading: profileLoading, isError: profileError } = useQuery({
        queryKey: ['dataset-profile', selectedDataset],
        queryFn: () => datasetsApi.getProfile(selectedDataset),
        enabled: !!selectedDataset
    })

    const columns = profileData?.data?.column_info
        ? Object.keys(profileData.data.column_info)
        : []

    const canStartTraining = !!selectedDataset && !!targetColumn && !isTraining

    // Polling for status
    const { data: statusData } = useQuery({
        queryKey: ['training-status', currentJob?.id],
        queryFn: () => trainingApi.getStatus(currentJob.id),
        enabled: !!currentJob,
        refetchInterval: isTraining ? 2000 : false
    })

    // Polling for logs
    const { data: logsData } = useQuery({
        queryKey: ['training-logs', currentJob?.id],
        queryFn: () => trainingApi.getLogs(currentJob.id),
        enabled: !!currentJob,
        refetchInterval: isTraining ? 2000 : false
    })

    const [trainingError, setTrainingError] = useState(null)

    const startTrainingMutation = useMutation({
        mutationFn: (data) => trainingApi.start(data),
        onSuccess: (response) => {
            setTrainingError(null)
            setCurrentJob(response.data.experiment)
            setIsTraining(true)
        },
        onError: (error) => {
            setTrainingError(error.response?.data?.error || 'Failed to start training')
        }
    })

    // Check for completion or failure
    if (isTraining && ['completed', 'failed'].includes(statusData?.data?.experiment?.status)) {
        setIsTraining(false)
        if (statusData?.data?.experiment?.status === 'failed') {
            setTrainingError(
                statusData?.data?.experiment?.error_message ||
                'Training failed. Upload a CSV on the Datasets page and try again.'
            )
        }
    }

    // AI Prompt Analysis Handler
    const handleAnalyzeWithAI = async () => {
        if (!selectedDataset || !aiPrompt.trim()) return

        setIsAnalyzing(true)
        setAnalysisError(null)
        setAiAnalysis(null)

        try {
            const response = await trainingApi.analyzePrompt(parseInt(selectedDataset), aiPrompt)
            if (response.data.success) {
                setAiAnalysis(response.data.analysis)
                // Auto-select the suggested target column
                if (response.data.analysis.suggested_target) {
                    setTargetColumn(response.data.analysis.suggested_target)
                }
                // Use the prompt as goal description
                setGoalDescription(aiPrompt)
            } else {
                setAnalysisError(response.data.error || 'Analysis failed')
            }
        } catch (error) {
            setAnalysisError(error.response?.data?.error || 'Failed to analyze with AI')
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleStartTraining = () => {
        if (!selectedDataset) {
            setTrainingError('Please select a dataset first.')
            return
        }
        if (!targetColumn) {
            setTrainingError('Please select a target column to predict.')
            return
        }

        setTrainingError(null)
        startTrainingMutation.mutate({
            dataset_id: parseInt(selectedDataset),
            name: experimentName || `Experiment ${new Date().toLocaleDateString()}`,
            target_column: targetColumn,
            goal_description: goalDescription
        })
    }

    // Combine all logs
    const allLogs = logsData?.data?.logs || []
    const combinedLogs = allLogs.map(job =>
        `--- ${job.model_name} ---\n${job.logs || ''}`
    ).join('\n')

    // Auto-scroll to bottom of logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [combinedLogs])


    return (
        <div className="training-page">
            <div className="page-header">
                <h1>Model Training</h1>
                <p>Train machine learning models with AutoML</p>
            </div>

            <div className="training-layout">
                {/* Configuration Panel */}
                <div className="config-panel card">
                    <h2>Training Configuration</h2>

                    <div className="form-group">
                        <label className="label">Dataset</label>
                        <select
                            className="input"
                            value={selectedDataset}
                            onChange={(e) => {
                                setSelectedDataset(e.target.value)
                                setTargetColumn('')
                                setTrainingError(null)
                            }}
                            disabled={isTraining}
                        >
                            <option value="">Select a dataset...</option>
                            {datasets.map((dataset) => (
                                <option key={dataset.id} value={dataset.id}>
                                    {dataset.name} ({dataset.num_rows?.toLocaleString()} rows)
                                </option>
                            ))}
                        </select>
                        {datasetsLoading && (
                            <p className="form-hint">Loading datasets...</p>
                        )}
                        {datasetsError && (
                            <p className="form-hint form-hint-error">Could not load datasets. Check that you are logged in.</p>
                        )}
                        {!datasetsLoading && !datasetsError && datasets.length === 0 && (
                            <p className="form-hint form-hint-error">
                                No datasets yet. Upload a CSV on the <a href="/datasets">Datasets</a> page first.
                            </p>
                        )}
                    </div>

                    {/* AI Goal Analysis Section */}
                    {selectedDataset && columns.length > 0 && (
                        <div className="ai-analysis-section">
                            <div className="form-group">
                                <label className="label">
                                    <Sparkles size={16} />
                                    Describe Your Goal (AI-Powered)
                                </label>
                                <div className="ai-input-row">
                                    <textarea
                                        className="input textarea"
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        placeholder="e.g., I want to predict which products need restocking based on sales patterns..."
                                        rows={2}
                                        disabled={isTraining || isAnalyzing}
                                    />
                                    <button
                                        className="btn btn-secondary ai-analyze-btn"
                                        onClick={handleAnalyzeWithAI}
                                        disabled={!aiPrompt.trim() || isAnalyzing || isTraining}
                                    >
                                        {isAnalyzing ? (
                                            <div className="spinner" style={{ width: 16, height: 16 }}></div>
                                        ) : (
                                            <Wand2 size={16} />
                                        )}
                                        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                                    </button>
                                </div>
                                <p className="form-hint">
                                    Let AI suggest the best target column based on your goal
                                </p>
                            </div>

                            {/* AI Analysis Results */}
                            {aiAnalysis && (
                                <div className="ai-analysis-result">
                                    <div className="ai-result-header">
                                        <Sparkles size={18} className="text-primary" />
                                        <span>AI Recommendation</span>
                                    </div>
                                    <div className="ai-result-content">
                                        <div className="ai-result-item">
                                            <strong>Suggested Target:</strong>
                                            <span className="ai-target-badge">{aiAnalysis.suggested_target}</span>
                                        </div>
                                        <div className="ai-result-item">
                                            <strong>Problem Type:</strong>
                                            <span className="ai-problem-badge">{aiAnalysis.problem_type}</span>
                                        </div>
                                        {aiAnalysis.confidence && (
                                            <div className="ai-result-item">
                                                <strong>Confidence:</strong>
                                                <span>{(aiAnalysis.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        )}
                                        <div className="ai-reasoning">
                                            <strong>Reasoning:</strong>
                                            <p>{aiAnalysis.reasoning}</p>
                                        </div>
                                        {aiAnalysis.preprocessing_suggestions?.length > 0 && (
                                            <div className="ai-suggestions">
                                                <strong>Preprocessing Tips:</strong>
                                                <ul>
                                                    {aiAnalysis.preprocessing_suggestions.map((tip, i) => (
                                                        <li key={i}>{tip}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {analysisError && (
                                <div className="ai-error">
                                    <AlertCircle size={16} />
                                    <span>{analysisError}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {selectedDataset && profileLoading && (
                        <p className="form-hint">Loading columns...</p>
                    )}

                    {selectedDataset && !profileLoading && profileError && (
                        <p className="form-hint form-hint-error">Could not load dataset columns.</p>
                    )}

                    {selectedDataset && !profileLoading && !profileError && columns.length === 0 && (
                        <p className="form-hint form-hint-error">
                            This dataset has no column profile yet. Re-upload it on the Datasets page or wait for profiling to finish.
                        </p>
                    )}

                    {selectedDataset && columns.length > 0 && (
                        <div className="form-group">
                            <label className="label">
                                <Target size={16} />
                                Target Column
                            </label>
                            <select
                                className="input"
                                value={targetColumn}
                                onChange={(e) => setTargetColumn(e.target.value)}
                                disabled={isTraining}
                            >
                                <option value="">Select target column...</option>
                                {columns.map((col) => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                            <p className="form-hint">
                                The column you want to predict
                            </p>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="label">Experiment Name (Optional)</label>
                        <input
                            type="text"
                            className="input"
                            value={experimentName}
                            onChange={(e) => setExperimentName(e.target.value)}
                            placeholder="My Experiment"
                            disabled={isTraining}
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Goal Description (Optional)</label>
                        <textarea
                            className="input textarea"
                            value={goalDescription}
                            onChange={(e) => setGoalDescription(e.target.value)}
                            placeholder="Describe what you want to predict..."
                            rows={3}
                            disabled={isTraining}
                        />
                    </div>

                    {(trainingError || startTrainingMutation.isError) && (
                        <div className="ai-error">
                            <AlertCircle size={16} />
                            <span>{trainingError || startTrainingMutation.error?.response?.data?.error}</span>
                        </div>
                    )}

                    {!canStartTraining && !isTraining && selectedDataset && !targetColumn && columns.length > 0 && (
                        <p className="form-hint">Select a target column above to enable training.</p>
                    )}

                    <button
                        className="btn btn-primary start-btn"
                        onClick={handleStartTraining}
                        disabled={!canStartTraining}
                        title={
                            !selectedDataset
                                ? 'Select a dataset'
                                : !targetColumn
                                    ? 'Select a target column'
                                    : 'Start training'
                        }
                    >
                        {isTraining ? (
                            <>
                                <div className="spinner" style={{ width: 18, height: 18 }}></div>
                                Training...
                            </>
                        ) : (
                            <>
                                <Play size={18} />
                                {statusData?.data?.experiment?.status === 'completed' ? 'Start New Training' : 'Start Training'}
                            </>
                        )}
                    </button>

                    {statusData?.data?.experiment?.status === 'completed' && (
                        <div className="success-message">
                            <CheckCircle size={24} className="text-success" />
                            <h3>Training Success!</h3>

                            {statusData.data.experiment.best_model_name && (
                                <div className="result-summary">
                                    <div className="result-item">
                                        <span className="result-label">🏆 Best Model</span>
                                        <span className="result-value">{statusData.data.experiment.best_model_name}</span>
                                    </div>
                                    <div className="result-item">
                                        <span className="result-label">📊 Score</span>
                                        <span className="result-value">
                                            {(statusData.data.experiment.best_score * 100).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            )}

                            <a href="/models" className="btn btn-sm btn-outline">View Models</a>
                        </div>
                    )}
                </div>

                {/* Training Progress / Info Panel */}
                <div className="info-panel">
                    {currentJob ? (
                        <div className="progress-card card">
                            <div className="progress-header">
                                <Cpu size={24} className="text-primary" />
                                <div>
                                    <h3>{currentJob.name}</h3>
                                    <p className={`status-badge ${statusData?.data?.experiment?.status}`}>
                                        Status: {statusData?.data?.experiment?.status || 'Starting...'}
                                    </p>
                                    {statusData?.data?.experiment?.status === 'failed' && (
                                        <p className="form-hint form-hint-error" style={{ marginTop: '0.5rem' }}>
                                            {statusData.data.experiment.error_message ||
                                                'Dataset file could not be loaded. Go to Datasets, upload your CSV, then train on that file.'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {statusData?.data?.experiment?.status !== 'failed' && (
                            <div className="progress-steps">
                                <div className={`step ${['training', 'completed'].includes(statusData?.data?.experiment?.status) ? 'completed' : ''}`}>
                                    <CheckCircle size={20} />
                                    <span>Preprocessing</span>
                                </div>
                                <div className={`step ${statusData?.data?.experiment?.status === 'training' ? 'active' : statusData?.data?.experiment?.status === 'completed' ? 'completed' : ''}`}>
                                    <Clock size={20} className={statusData?.data?.experiment?.status === 'training' ? 'animate-pulse' : ''} />
                                    <span>Training</span>
                                </div>
                                <div className={`step ${statusData?.data?.experiment?.status === 'completed' ? 'completed' : ''}`}>
                                    <div className="step-dot"></div>
                                    <span>Evaluation</span>
                                </div>
                            </div>
                            )}

                            {/* Live Logs Terminal */}
                            <div className="logs-terminal">
                                <div className="terminal-header">
                                    <span>Build Logs</span>
                                </div>
                                <pre className="terminal-content">
                                    {combinedLogs || 'Waiting for logs...'}
                                    <div ref={logsEndRef} />
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <div className="info-card card">
                            <h3>How it works</h3>
                            <div className="info-steps">
                                <div className="info-step">
                                    <div className="step-number">1</div>
                                    <div>
                                        <h4>Select Dataset</h4>
                                        <p>Choose the dataset you want to train on</p>
                                    </div>
                                </div>
                                <div className="info-step">
                                    <div className="step-number">2</div>
                                    <div>
                                        <h4>Choose Target</h4>
                                        <p>Select the column you want to predict</p>
                                    </div>
                                </div>
                                <div className="info-step">
                                    <div className="step-number">3</div>
                                    <div>
                                        <h4>AutoML Training</h4>
                                        <p>We automatically select and train the best model</p>
                                    </div>
                                </div>
                                <div className="info-step">
                                    <div className="step-number">4</div>
                                    <div>
                                        <h4>Get Results</h4>
                                        <p>Review metrics and start making predictions</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
