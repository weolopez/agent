class AgentStatus extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // Component state
        this.agent = null;
        this.currentState = 'idle';
        this.currentOperation = null;
        this.progress = 0;
        this.stats = {
            tasksCompleted: 0,
            avgResponseTime: 0,
            memoryUsage: 0,
            cacheHitRate: 0
        };
        
        this.render();
        this.startUpdateTimer();
    }

    setAgent(agent) {
        this.agent = agent;
        if (agent) {
            agent.on('stateChange', (state) => {
                this.updateState(state);
            });
            
            agent.on('operationStart', (operation) => {
                this.currentOperation = operation;
                this.updateOperationDisplay();
            });
            
            agent.on('operationProgress', (progress) => {
                this.progress = progress;
                this.updateProgressBar();
            });
            
            agent.on('operationComplete', (result) => {
                this.currentOperation = null;
                this.progress = 0;
                this.stats.tasksCompleted++;
                this.updateStats();
                this.updateOperationDisplay();
            });
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: #1a1a1a;
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    padding: 20px;
                    overflow-y: auto;
                }
                
                .status-section {
                    margin-bottom: 24px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid #333;
                }
                
                .status-section:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                }
                
                .section-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #ccc;
                    margin-bottom: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .agent-state {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: #0f0f0f;
                    border-radius: 8px;
                    border: 1px solid #333;
                }
                
                .state-indicator {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: #666;
                    transition: all 0.3s ease;
                    position: relative;
                }
                
                .state-indicator.idle {
                    background: #4CAF50;
                }
                
                .state-indicator.thinking {
                    background: #FF9800;
                    animation: pulse 2s infinite;
                }
                
                .state-indicator.processing {
                    background: #2196F3;
                    animation: pulse 1s infinite;
                }
                
                .state-indicator.error {
                    background: #f44336;
                }
                
                @keyframes pulse {
                    0%, 100% { 
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% { 
                        transform: scale(1.2);
                        opacity: 0.7;
                    }
                }
                
                .state-info {
                    flex: 1;
                }
                
                .state-name {
                    font-size: 16px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 2px;
                    text-transform: capitalize;
                }
                
                .state-description {
                    font-size: 12px;
                    color: #999;
                    line-height: 1.3;
                }
                
                .current-operation {
                    background: #0f0f0f;
                    border-radius: 8px;
                    padding: 12px;
                    border: 1px solid #333;
                    margin-bottom: 12px;
                }
                
                .operation-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 8px;
                }
                
                .operation-description {
                    font-size: 12px;
                    color: #ccc;
                    margin-bottom: 8px;
                    line-height: 1.4;
                }
                
                .progress-container {
                    margin-bottom: 8px;
                }
                
                .progress-bar {
                    width: 100%;
                    height: 4px;
                    background: #333;
                    border-radius: 2px;
                    overflow: hidden;
                }
                
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #007acc, #0056b3);
                    border-radius: 2px;
                    transition: width 0.3s ease;
                    width: 0%;
                }
                
                .progress-text {
                    font-size: 11px;
                    color: #999;
                    text-align: right;
                    margin-top: 4px;
                }
                
                .no-operation {
                    font-size: 12px;
                    color: #666;
                    font-style: italic;
                    text-align: center;
                    padding: 20px;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }
                
                .stat-item {
                    background: #0f0f0f;
                    border-radius: 6px;
                    padding: 12px;
                    border: 1px solid #333;
                    text-align: center;
                }
                
                .stat-value {
                    font-size: 18px;
                    font-weight: 700;
                    color: #007acc;
                    margin-bottom: 4px;
                }
                
                .stat-label {
                    font-size: 11px;
                    color: #999;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                
                .capabilities-list {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                
                .capability {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    color: #ccc;
                    padding: 6px 8px;
                    background: #0f0f0f;
                    border-radius: 4px;
                    border: 1px solid #333;
                }
                
                .capability-icon {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: #007acc;
                    flex-shrink: 0;
                }
                
                .capability-name {
                    flex: 1;
                    text-transform: capitalize;
                }
                
                .tools-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .tool {
                    background: #0f0f0f;
                    border-radius: 6px;
                    padding: 8px;
                    border: 1px solid #333;
                }
                
                .tool-name {
                    font-size: 12px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 4px;
                }
                
                .tool-status {
                    font-size: 10px;
                    color: #999;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .tool-status-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #666;
                }
                
                .tool-status-dot.available {
                    background: #4CAF50;
                }
                
                .tool-status-dot.busy {
                    background: #FF9800;
                }
                
                .tool-status-dot.error {
                    background: #f44336;
                }
                
                .memory-info {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .memory-type {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 8px;
                    background: #0f0f0f;
                    border-radius: 4px;
                    border: 1px solid #333;
                }
                
                .memory-label {
                    font-size: 11px;
                    color: #ccc;
                    text-transform: capitalize;
                }
                
                .memory-count {
                    font-size: 11px;
                    color: #007acc;
                    font-weight: 600;
                }
                
                .refresh-button {
                    background: transparent;
                    border: 1px solid #333;
                    color: #ccc;
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin-top: 12px;
                    width: 100%;
                }
                
                .refresh-button:hover {
                    background: #333;
                    border-color: #007acc;
                    color: #fff;
                }
                
                .error-state {
                    color: #f44336;
                    font-size: 12px;
                    text-align: center;
                    padding: 12px;
                    background: #2a1a1a;
                    border-radius: 6px;
                    border: 1px solid #f44336;
                }
            </style>
            
            <div class="status-section">
                <div class="section-title">Agent Status</div>
                <div class="agent-state">
                    <div class="state-indicator idle"></div>
                    <div class="state-info">
                        <div class="state-name">Idle</div>
                        <div class="state-description">Ready to assist</div>
                    </div>
                </div>
            </div>
            
            <div class="status-section">
                <div class="section-title">Current Operation</div>
                <div class="no-operation">No active operation</div>
            </div>
            
            <div class="status-section">
                <div class="section-title">Statistics</div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">0</div>
                        <div class="stat-label">Tasks</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">0ms</div>
                        <div class="stat-label">Avg Time</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">0%</div>
                        <div class="stat-label">Cache Hit</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">0MB</div>
                        <div class="stat-label">Memory</div>
                    </div>
                </div>
            </div>
            
            <div class="status-section">
                <div class="section-title">Capabilities</div>
                <div class="capabilities-list">
                    <div class="capability">
                        <div class="capability-icon"></div>
                        <div class="capability-name">Requirements Analysis</div>
                    </div>
                    <div class="capability">
                        <div class="capability-icon"></div>
                        <div class="capability-name">Impact Assessment</div>
                    </div>
                    <div class="capability">
                        <div class="capability-icon"></div>
                        <div class="capability-name">Project Estimation</div>
                    </div>
                </div>
            </div>
            
            <div class="status-section">
                <div class="section-title">Tools</div>
                <div class="tools-list">
                    <div class="tool">
                        <div class="tool-name">Application Catalog</div>
                        <div class="tool-status">
                            <div class="tool-status-dot available"></div>
                            <span>Available</span>
                        </div>
                    </div>
                    <div class="tool">
                        <div class="tool-name">Project History</div>
                        <div class="tool-status">
                            <div class="tool-status-dot available"></div>
                            <span>Available</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="status-section">
                <div class="section-title">Memory</div>
                <div class="memory-info">
                    <div class="memory-type">
                        <span class="memory-label">Working</span>
                        <span class="memory-count">0</span>
                    </div>
                    <div class="memory-type">
                        <span class="memory-label">Semantic</span>
                        <span class="memory-count">0</span>
                    </div>
                    <div class="memory-type">
                        <span class="memory-label">Episodic</span>
                        <span class="memory-count">0</span>
                    </div>
                    <div class="memory-type">
                        <span class="memory-label">Procedural</span>
                        <span class="memory-count">0</span>
                    </div>
                </div>
            </div>
            
            <button class="refresh-button">Refresh Status</button>
        `;
        
        // Setup refresh button
        this.shadowRoot.querySelector('.refresh-button').addEventListener('click', () => {
            this.refreshStatus();
        });
    }

    updateState(state) {
        this.currentState = state.name || state;
        
        const stateIndicator = this.shadowRoot.querySelector('.state-indicator');
        const stateName = this.shadowRoot.querySelector('.state-name');
        const stateDescription = this.shadowRoot.querySelector('.state-description');
        
        // Update indicator class
        stateIndicator.className = `state-indicator ${this.currentState}`;
        
        // Update text content
        stateName.textContent = this.formatStateName(this.currentState);
        stateDescription.textContent = this.getStateDescription(this.currentState);
    }

    formatStateName(state) {
        return state.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    getStateDescription(state) {
        const descriptions = {
            idle: 'Ready to assist with your requests',
            thinking: 'Analyzing your request and gathering context',
            processing: 'Executing operations and generating response',
            analyzing: 'Performing detailed analysis of requirements',
            planning: 'Creating step-by-step implementation plan',
            executing: 'Running tools and gathering information',
            responding: 'Preparing response based on findings',
            error: 'Encountered an error, attempting recovery'
        };
        
        return descriptions[state] || 'Working on your request';
    }

    updateOperationDisplay() {
        const operationContainer = this.shadowRoot.querySelector('.status-section:nth-child(2)');
        
        if (this.currentOperation) {
            operationContainer.innerHTML = `
                <div class="section-title">Current Operation</div>
                <div class="current-operation">
                    <div class="operation-name">${this.formatOperationName(this.currentOperation.type)}</div>
                    <div class="operation-description">${this.currentOperation.description || 'Processing...'}</div>
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${this.progress}%"></div>
                        </div>
                        <div class="progress-text">${Math.round(this.progress)}%</div>
                    </div>
                </div>
            `;
        } else {
            operationContainer.innerHTML = `
                <div class="section-title">Current Operation</div>
                <div class="no-operation">No active operation</div>
            `;
        }
    }

    formatOperationName(type) {
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    updateProgressBar() {
        const progressFill = this.shadowRoot.querySelector('.progress-fill');
        const progressText = this.shadowRoot.querySelector('.progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${this.progress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(this.progress)}%`;
        }
    }

    updateStats() {
        const statItems = this.shadowRoot.querySelectorAll('.stat-value');
        
        if (statItems.length >= 4) {
            statItems[0].textContent = this.stats.tasksCompleted.toString();
            statItems[1].textContent = `${Math.round(this.stats.avgResponseTime)}ms`;
            statItems[2].textContent = `${Math.round(this.stats.cacheHitRate * 100)}%`;
            statItems[3].textContent = `${(this.stats.memoryUsage / 1024 / 1024).toFixed(1)}MB`;
        }
    }

    async refreshStatus() {
        if (!this.agent) return;
        
        try {
            // Get fresh stats from agent
            const agentStats = await this.agent.getStats();
            
            if (agentStats) {
                this.stats = {
                    tasksCompleted: agentStats.tasksCompleted || 0,
                    avgResponseTime: agentStats.avgResponseTime || 0,
                    memoryUsage: agentStats.memoryUsage || 0,
                    cacheHitRate: agentStats.cacheHitRate || 0
                };
                
                this.updateStats();
            }
            
            // Update memory counts
            const memoryStats = await this.agent.getMemoryStats();
            if (memoryStats) {
                this.updateMemoryStats(memoryStats);
            }
            
            // Update tool statuses
            const toolStats = await this.agent.getToolStats();
            if (toolStats) {
                this.updateToolStats(toolStats);
            }
            
        } catch (error) {
            console.error('Failed to refresh status:', error);
            this.showError('Failed to refresh status');
        }
    }

    updateMemoryStats(memoryStats) {
        const memoryCounts = this.shadowRoot.querySelectorAll('.memory-count');
        
        if (memoryCounts.length >= 4) {
            memoryCounts[0].textContent = memoryStats.working || 0;
            memoryCounts[1].textContent = memoryStats.semantic || 0;
            memoryCounts[2].textContent = memoryStats.episodic || 0;
            memoryCounts[3].textContent = memoryStats.procedural || 0;
        }
    }

    updateToolStats(toolStats) {
        const tools = this.shadowRoot.querySelectorAll('.tool');
        
        tools.forEach((tool, index) => {
            const toolName = tool.querySelector('.tool-name').textContent.toLowerCase().replace(/\s+/g, '_');
            const statusDot = tool.querySelector('.tool-status-dot');
            const statusText = tool.querySelector('.tool-status span');
            
            const toolStat = toolStats[toolName];
            if (toolStat) {
                statusDot.className = `tool-status-dot ${toolStat.status}`;
                statusText.textContent = this.formatToolStatus(toolStat.status);
            }
        });
    }

    formatToolStatus(status) {
        const statusMap = {
            available: 'Available',
            busy: 'In Use',
            error: 'Error',
            offline: 'Offline'
        };
        
        return statusMap[status] || 'Unknown';
    }

    showError(message) {
        const statusSection = this.shadowRoot.querySelector('.status-section:first-child');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-state';
        errorDiv.textContent = message;
        
        statusSection.appendChild(errorDiv);
        
        // Remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    startUpdateTimer() {
        // Update stats every 30 seconds
        setInterval(() => {
            if (this.agent && this.isConnected) {
                this.refreshStatus();
            }
        }, 30000);
    }

    // Public methods
    setCapabilities(capabilities) {
        const capabilitiesList = this.shadowRoot.querySelector('.capabilities-list');
        
        capabilitiesList.innerHTML = capabilities.map(capability => `
            <div class="capability">
                <div class="capability-icon"></div>
                <div class="capability-name">${capability.replace(/_/g, ' ')}</div>
            </div>
        `).join('');
    }

    setTools(tools) {
        const toolsList = this.shadowRoot.querySelector('.tools-list');
        
        toolsList.innerHTML = tools.map(tool => `
            <div class="tool">
                <div class="tool-name">${tool.name || tool}</div>
                <div class="tool-status">
                    <div class="tool-status-dot available"></div>
                    <span>Available</span>
                </div>
            </div>
        `).join('');
    }

    showConnectionError() {
        const stateIndicator = this.shadowRoot.querySelector('.state-indicator');
        const stateName = this.shadowRoot.querySelector('.state-name');
        const stateDescription = this.shadowRoot.querySelector('.state-description');
        
        stateIndicator.className = 'state-indicator error';
        stateName.textContent = 'Disconnected';
        stateDescription.textContent = 'Unable to connect to agent';
    }

    // Lifecycle methods
    connectedCallback() {
        this.isConnected = true;
        this.refreshStatus();
    }

    disconnectedCallback() {
        this.isConnected = false;
    }
}

// Register the custom element
customElements.define('agent-status', AgentStatus);