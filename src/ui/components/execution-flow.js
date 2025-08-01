class ExecutionFlow extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // Flow state
        this.executionHistory = [];
        this.currentExecution = null;
        this.isRecording = false;
        this.agent = null;
        
        // Visualization settings
        this.viewMode = 'timeline'; // timeline, graph, tree
        this.showDetails = true;
        this.autoScroll = true;
        
        this.render();
        this.setupEventListeners();
    }

    setAgent(agent) {
        this.agent = agent;
        if (agent) {
            // Listen to agent events for flow tracking
            agent.on('operationStart', (operation) => this.recordOperationStart(operation));
            agent.on('operationComplete', (result) => this.recordOperationComplete(result));
            agent.on('memoryAccess', (access) => this.recordMemoryAccess(access));
            agent.on('llmCall', (call) => this.recordLLMCall(call));
            agent.on('stateChange', (state) => this.recordStateChange(state));
            agent.on('decision', (decision) => this.recordDecision(decision));
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: #0a0a0a;
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    height: 100%;
                    overflow: hidden;
                }
                
                .flow-header {
                    padding: 16px 20px;
                    background: #111;
                    border-bottom: 1px solid #333;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .flow-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: #fff;
                }
                
                .flow-controls {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                
                .control-button {
                    background: transparent;
                    border: 1px solid #333;
                    color: #ccc;
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .control-button:hover {
                    background: #333;
                    border-color: #007acc;
                    color: #fff;
                }
                
                .control-button.active {
                    background: #007acc;
                    border-color: #007acc;
                    color: white;
                }
                
                .recording-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #666;
                    margin-left: 8px;
                }
                
                .recording-indicator.active {
                    background: #f44336;
                    animation: pulse 1.5s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                
                .flow-content {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                
                .execution-timeline {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                }
                
                .execution-item {
                    display: flex;
                    margin-bottom: 16px;
                    position: relative;
                }
                
                .execution-item::before {
                    content: '';
                    position: absolute;
                    left: 20px;
                    top: 32px;
                    bottom: -16px;
                    width: 2px;
                    background: #333;
                }
                
                .execution-item:last-child::before {
                    display: none;
                }
                
                .execution-timestamp {
                    width: 80px;
                    font-size: 10px;
                    color: #666;
                    text-align: right;
                    padding-top: 8px;
                    flex-shrink: 0;
                }
                
                .execution-marker {
                    width: 40px;
                    display: flex;
                    justify-content: center;
                    padding-top: 8px;
                    flex-shrink: 0;
                }
                
                .marker-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: #666;
                    border: 2px solid #0a0a0a;
                    position: relative;
                    z-index: 1;
                }
                
                .marker-dot.state-change {
                    background: #4CAF50;
                }
                
                .marker-dot.operation {
                    background: #2196F3;
                }
                
                .marker-dot.memory-access {
                    background: #FF9800;
                }
                
                .marker-dot.llm-call {
                    background: #9C27B0;
                }
                
                .marker-dot.decision {
                    background: #F44336;
                }
                
                .execution-content {
                    flex: 1;
                    background: #1a1a1a;
                    border-radius: 8px;
                    border: 1px solid #333;
                    padding: 12px;
                    margin-left: 8px;
                }
                
                .execution-type {
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 4px;
                }
                
                .execution-type.state-change {
                    color: #4CAF50;
                }
                
                .execution-type.operation {
                    color: #2196F3;
                }
                
                .execution-type.memory-access {
                    color: #FF9800;
                }
                
                .execution-type.llm-call {
                    color: #9C27B0;
                }
                
                .execution-type.decision {
                    color: #F44336;
                }
                
                .execution-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 6px;
                }
                
                .execution-details {
                    font-size: 12px;
                    color: #ccc;
                    line-height: 1.4;
                }
                
                .execution-metadata {
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid #333;
                    font-size: 10px;
                    color: #666;
                    display: flex;
                    gap: 12px;
                }
                
                .metadata-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .flow-graph {
                    display: none;
                    flex: 1;
                    overflow: auto;
                    padding: 20px;
                }
                
                .flow-graph.active {
                    display: block;
                }
                
                .graph-svg {
                    width: 100%;
                    height: 600px;
                    background: #0f0f0f;
                    border-radius: 8px;
                    border: 1px solid #333;
                }
                
                .flow-stats {
                    background: #111;
                    border-top: 1px solid #333;
                    padding: 12px 20px;
                    display: flex;
                    gap: 20px;
                    font-size: 11px;
                    color: #ccc;
                }
                
                .stat-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .stat-value {
                    color: #007acc;
                    font-weight: 600;
                }
                
                .no-executions {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    color: #666;
                    text-align: center;
                    gap: 12px;
                }
                
                .no-executions-icon {
                    font-size: 48px;
                    opacity: 0.3;
                }
                
                /* Scrollbar styling */
                .execution-timeline::-webkit-scrollbar {
                    width: 6px;
                }
                
                .execution-timeline::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .execution-timeline::-webkit-scrollbar-thumb {
                    background: #333;
                    border-radius: 3px;
                }
                
                .execution-timeline::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            </style>
            
            <div class="flow-header">
                <div class="flow-title">Execution Flow</div>
                <div class="flow-controls">
                    <button class="control-button active" data-view="timeline">Timeline</button>
                    <button class="control-button" data-view="graph">Graph</button>
                    <button class="control-button" id="toggle-recording">Start Recording</button>
                    <button class="control-button" id="clear-flow">Clear</button>
                    <button class="control-button" id="export-flow">Export</button>
                    <div class="recording-indicator"></div>
                </div>
            </div>
            
            <div class="flow-content">
                <div class="execution-timeline active">
                    <div class="no-executions">
                        <div class="no-executions-icon">🔄</div>
                        <div>No execution flow recorded</div>
                        <div style="font-size: 10px; opacity: 0.7;">Start recording to see the agent's cognitive journey</div>
                    </div>
                </div>
                
                <div class="flow-graph">
                    <svg class="graph-svg" id="flow-graph-svg">
                        <!-- Graph visualization will be rendered here -->
                    </svg>
                </div>
            </div>
            
            <div class="flow-stats">
                <div class="stat-item">
                    <span>Total Steps:</span>
                    <span class="stat-value" id="total-steps">0</span>
                </div>
                <div class="stat-item">
                    <span>Duration:</span>
                    <span class="stat-value" id="total-duration">0ms</span>
                </div>
                <div class="stat-item">
                    <span>Memory Accesses:</span>
                    <span class="stat-value" id="memory-accesses">0</span>
                </div>
                <div class="stat-item">
                    <span>LLM Calls:</span>
                    <span class="stat-value" id="llm-calls">0</span>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // View mode switching
        this.shadowRoot.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.target.dataset.view);
            });
        });

        // Recording toggle
        this.shadowRoot.getElementById('toggle-recording').addEventListener('click', () => {
            this.toggleRecording();
        });

        // Clear flow
        this.shadowRoot.getElementById('clear-flow').addEventListener('click', () => {
            this.clearFlow();
        });

        // Export flow
        this.shadowRoot.getElementById('export-flow').addEventListener('click', () => {
            this.exportFlow();
        });
    }

    // Recording methods
    startNewExecution(taskId) {
        this.currentExecution = {
            taskId,
            startTime: Date.now(),
            steps: [],
            stats: {
                operations: 0,
                memoryAccesses: 0,
                llmCalls: 0,
                decisions: 0
            }
        };
        
        if (this.isRecording) {
            this.recordEvent('execution-start', 'Execution Started', { taskId });
        }
    }

    recordOperationStart(operation) {
        if (!this.isRecording) return;
        
        this.recordEvent('operation', `Operation: ${operation.type}`, {
            type: operation.type,
            description: operation.description,
            context: operation.context
        });
        
        if (this.currentExecution) {
            this.currentExecution.stats.operations++;
        }
    }

    recordOperationComplete(result) {
        if (!this.isRecording) return;
        
        this.recordEvent('operation', `Operation Complete`, {
            success: result.success,
            duration: result.duration,
            result: result.data
        });
    }

    recordMemoryAccess(access) {
        if (!this.isRecording) return;
        
        this.recordEvent('memory-access', `Memory: ${access.type} ${access.operation}`, {
            memoryType: access.type,
            operation: access.operation,
            key: access.key,
            hitMiss: access.hitMiss
        });
        
        if (this.currentExecution) {
            this.currentExecution.stats.memoryAccesses++;
        }
    }

    recordLLMCall(call) {
        if (!this.isRecording) return;
        
        this.recordEvent('llm-call', `LLM Call: ${call.model}`, {
            model: call.model,
            provider: call.provider,
            tokens: call.tokens,
            duration: call.duration,
            promptLength: call.promptLength
        });
        
        if (this.currentExecution) {
            this.currentExecution.stats.llmCalls++;
        }
    }

    recordStateChange(state) {
        if (!this.isRecording) return;
        
        this.recordEvent('state-change', `State: ${state.name}`, {
            newState: state.name,
            previousState: state.previous,
            timestamp: state.timestamp
        });
    }

    recordDecision(decision) {
        if (!this.isRecording) return;
        
        this.recordEvent('decision', `Decision: ${decision.type}`, {
            type: decision.type,
            options: decision.options,
            selected: decision.selected,
            reasoning: decision.reasoning,
            confidence: decision.confidence
        });
        
        if (this.currentExecution) {
            this.currentExecution.stats.decisions++;
        }
    }

    recordEvent(type, title, data) {
        const event = {
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            title,
            data,
            timestamp: Date.now(),
            executionId: this.currentExecution?.taskId
        };

        this.executionHistory.push(event);
        
        if (this.currentExecution) {
            this.currentExecution.steps.push(event);
        }

        this.renderTimeline();
        this.updateStats();
        
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    // Rendering methods
    renderTimeline() {
        const timeline = this.shadowRoot.querySelector('.execution-timeline');
        const noExecutions = timeline.querySelector('.no-executions');
        
        if (this.executionHistory.length === 0) {
            if (!noExecutions) {
                timeline.innerHTML = `
                    <div class="no-executions">
                        <div class="no-executions-icon">🔄</div>
                        <div>No execution flow recorded</div>
                        <div style="font-size: 10px; opacity: 0.7;">Start recording to see the agent's cognitive journey</div>
                    </div>
                `;
            }
            return;
        }

        if (noExecutions) {
            timeline.innerHTML = '';
        }

        // Group events by execution
        const executionGroups = this.groupEventsByExecution();
        
        timeline.innerHTML = executionGroups.map(group => 
            this.renderExecutionGroup(group)
        ).join('');
    }

    groupEventsByExecution() {
        const groups = new Map();
        
        this.executionHistory.forEach(event => {
            const execId = event.executionId || 'standalone';
            if (!groups.has(execId)) {
                groups.set(execId, []);
            }
            groups.get(execId).push(event);
        });
        
        return Array.from(groups.entries()).map(([execId, events]) => ({
            executionId: execId,
            events
        }));
    }

    renderExecutionGroup(group) {
        return group.events.map(event => `
            <div class="execution-item">
                <div class="execution-timestamp">
                    ${new Date(event.timestamp).toLocaleTimeString()}
                </div>
                <div class="execution-marker">
                    <div class="marker-dot ${event.type}"></div>
                </div>
                <div class="execution-content">
                    <div class="execution-type ${event.type}">${event.type.replace('-', ' ')}</div>
                    <div class="execution-title">${event.title}</div>
                    <div class="execution-details">
                        ${this.formatEventData(event.data)}
                    </div>
                    <div class="execution-metadata">
                        <div class="metadata-item">
                            <span>ID:</span>
                            <span>${event.id.split('_')[1]}</span>
                        </div>
                        ${event.data.duration ? `
                            <div class="metadata-item">
                                <span>Duration:</span>
                                <span>${event.data.duration}ms</span>
                            </div>
                        ` : ''}
                        ${event.data.tokens ? `
                            <div class="metadata-item">
                                <span>Tokens:</span>
                                <span>${event.data.tokens}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    formatEventData(data) {
        if (!data) return '';
        
        const formatted = [];
        
        Object.entries(data).forEach(([key, value]) => {
            if (key === 'duration' || key === 'tokens') return; // Shown in metadata
            
            let displayValue = value;
            if (typeof value === 'object') {
                displayValue = JSON.stringify(value, null, 2);
            } else if (typeof value === 'string' && value.length > 100) {
                displayValue = value.substring(0, 100) + '...';
            }
            
            formatted.push(`<strong>${key}:</strong> ${displayValue}`);
        });
        
        return formatted.join('<br>');
    }

    // Control methods
    toggleRecording() {
        this.isRecording = !this.isRecording;
        
        const button = this.shadowRoot.getElementById('toggle-recording');
        const indicator = this.shadowRoot.querySelector('.recording-indicator');
        
        if (this.isRecording) {
            button.textContent = 'Stop Recording';
            button.classList.add('active');
            indicator.classList.add('active');
        } else {
            button.textContent = 'Start Recording';
            button.classList.remove('active');
            indicator.classList.remove('active');
        }
    }

    switchView(viewMode) {
        this.viewMode = viewMode;
        
        // Update buttons
        this.shadowRoot.querySelectorAll('[data-view]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewMode);
        });
        
        // Update content
        this.shadowRoot.querySelector('.execution-timeline').classList.toggle('active', viewMode === 'timeline');
        this.shadowRoot.querySelector('.flow-graph').classList.toggle('active', viewMode === 'graph');
        
        if (viewMode === 'graph') {
            this.renderGraph();
        }
    }

    renderGraph() {
        // TODO: Implement D3.js or similar graph visualization
        const svg = this.shadowRoot.getElementById('flow-graph-svg');
        svg.innerHTML = `
            <text x="50%" y="50%" text-anchor="middle" fill="#666" font-size="16">
                Graph visualization coming soon...
            </text>
        `;
    }

    clearFlow() {
        this.executionHistory = [];
        this.currentExecution = null;
        this.renderTimeline();
        this.updateStats();
    }

    exportFlow() {
        const data = {
            timestamp: new Date().toISOString(),
            executionHistory: this.executionHistory,
            stats: this.calculateDetailedStats()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `execution-flow-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    updateStats() {
        const stats = this.calculateDetailedStats();
        
        this.shadowRoot.getElementById('total-steps').textContent = stats.totalSteps;
        this.shadowRoot.getElementById('total-duration').textContent = `${stats.totalDuration}ms`;
        this.shadowRoot.getElementById('memory-accesses').textContent = stats.memoryAccesses;
        this.shadowRoot.getElementById('llm-calls').textContent = stats.llmCalls;
    }

    calculateDetailedStats() {
        let totalDuration = 0;
        let memoryAccesses = 0;
        let llmCalls = 0;
        
        this.executionHistory.forEach(event => {
            if (event.data.duration) {
                totalDuration += event.data.duration;
            }
            if (event.type === 'memory-access') {
                memoryAccesses++;
            }
            if (event.type === 'llm-call') {
                llmCalls++;
            }
        });
        
        return {
            totalSteps: this.executionHistory.length,
            totalDuration,
            memoryAccesses,
            llmCalls
        };
    }

    scrollToBottom() {
        const timeline = this.shadowRoot.querySelector('.execution-timeline');
        timeline.scrollTop = timeline.scrollHeight;
    }

    // Public methods
    getExecutionHistory() {
        return [...this.executionHistory];
    }

    getCurrentExecution() {
        return this.currentExecution ? { ...this.currentExecution } : null;
    }
}

// Register the custom element
customElements.define('execution-flow', ExecutionFlow);