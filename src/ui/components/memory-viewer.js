class MemoryViewer extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // Component state
        this.agent = null;
        this.currentView = 'working';
        this.memoryData = {
            working: [],
            semantic: [],
            episodic: [],
            procedural: []
        };
        this.isVisible = false;
        
        this.render();
        this.setupEventListeners();
    }

    setAgent(agent) {
        this.agent = agent;
        if (agent) {
            agent.on('memoryUpdate', (data) => {
                this.updateMemory(data);
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
                    border-top: 1px solid #333;
                }
                
                .memory-header {
                    padding: 16px 20px;
                    background: #111;
                    border-bottom: 1px solid #333;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .memory-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #ccc;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .toggle-button {
                    background: transparent;
                    border: 1px solid #333;
                    color: #ccc;
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .toggle-button:hover {
                    background: #333;
                    border-color: #007acc;
                    color: #fff;
                }
                
                .memory-content {
                    max-height: 0;
                    overflow: hidden;
                    transition: max-height 0.3s ease;
                }
                
                .memory-content.expanded {
                    max-height: 500px;
                    overflow-y: auto;
                }
                
                .memory-tabs {
                    display: flex;
                    background: #0f0f0f;
                    border-bottom: 1px solid #333;
                }
                
                .memory-tab {
                    flex: 1;
                    padding: 12px 8px;
                    background: transparent;
                    border: none;
                    color: #666;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border-bottom: 2px solid transparent;
                }
                
                .memory-tab:hover {
                    color: #ccc;
                    background: #1a1a1a;
                }
                
                .memory-tab.active {
                    color: #007acc;
                    border-bottom-color: #007acc;
                    background: #1a1a1a;
                }
                
                .memory-panel {
                    display: none;
                    padding: 16px;
                    min-height: 200px;
                    max-height: 300px;
                    overflow-y: auto;
                }
                
                .memory-panel.active {
                    display: block;
                }
                
                .memory-item {
                    background: #0f0f0f;
                    border-radius: 6px;
                    border: 1px solid #333;
                    margin-bottom: 8px;
                    overflow: hidden;
                    transition: border-color 0.2s ease;
                }
                
                .memory-item:hover {
                    border-color: #555;
                }
                
                .memory-item-header {
                    padding: 10px 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #0a0a0a;
                }
                
                .memory-item-title {
                    font-size: 12px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    flex: 1;
                }
                
                .memory-item-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 10px;
                    color: #666;
                }
                
                .memory-tag {
                    background: #333;
                    color: #ccc;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 9px;
                    text-transform: uppercase;
                    letter-spacing: 0.2px;
                }
                
                .importance-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #666;
                }
                
                .importance-indicator.high {
                    background: #4CAF50;
                }
                
                .importance-indicator.medium {
                    background: #FF9800;
                }
                
                .importance-indicator.low {
                    background: #666;
                }
                
                .expand-icon {
                    width: 12px;
                    height: 12px;
                    color: #666;
                    transition: transform 0.2s ease;
                }
                
                .memory-item.expanded .expand-icon {
                    transform: rotate(180deg);
                }
                
                .memory-item-content {
                    max-height: 0;
                    overflow: hidden;
                    transition: max-height 0.3s ease;
                    background: #0f0f0f;
                }
                
                .memory-item.expanded .memory-item-content {
                    max-height: 200px;
                    overflow-y: auto;
                }
                
                .memory-item-body {
                    padding: 12px;
                    border-top: 1px solid #222;
                }
                
                .memory-data {
                    font-size: 11px;
                    color: #ccc;
                    line-height: 1.4;
                    word-wrap: break-word;
                    font-family: 'SF Mono', Monaco, monospace;
                    background: #0a0a0a;
                    padding: 8px;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    border: 1px solid #222;
                }
                
                .memory-stats {
                    display: flex;
                    gap: 12px;
                    font-size: 10px;
                    color: #666;
                }
                
                .memory-stat {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .no-memory {
                    text-align: center;
                    color: #666;
                    font-style: italic;
                    padding: 40px 20px;
                    font-size: 12px;
                }
                
                .memory-search {
                    padding: 12px;
                    border-bottom: 1px solid #333;
                    background: #0f0f0f;
                }
                
                .search-input {
                    width: 100%;
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 4px;
                    padding: 6px 8px;
                    color: #fff;
                    font-size: 11px;
                    font-family: inherit;
                }
                
                .search-input:focus {
                    outline: none;
                    border-color: #007acc;
                }
                
                .search-input::placeholder {
                    color: #666;
                }
                
                .memory-actions {
                    padding: 12px;
                    border-top: 1px solid #333;
                    background: #0f0f0f;
                    display: flex;
                    gap: 8px;
                }
                
                .action-button {
                    background: transparent;
                    border: 1px solid #333;
                    color: #ccc;
                    padding: 6px 10px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                
                .action-button:hover {
                    background: #333;
                    border-color: #007acc;
                    color: #fff;
                }
                
                .action-button.danger:hover {
                    background: #4a1a1a;
                    border-color: #f44336;
                    color: #ffcdd2;
                }
                
                /* Scrollbar styling */
                .memory-panel::-webkit-scrollbar {
                    width: 4px;
                }
                
                .memory-panel::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .memory-panel::-webkit-scrollbar-thumb {
                    background: #333;
                    border-radius: 2px;
                }
                
                .memory-panel::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
                
                .memory-item-content::-webkit-scrollbar {
                    width: 3px;
                }
                
                .memory-item-content::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .memory-item-content::-webkit-scrollbar-thumb {
                    background: #222;
                    border-radius: 2px;
                }
            </style>
            
            <div class="memory-header">
                <div class="memory-title">Memory Viewer</div>
                <button class="toggle-button">Show</button>
            </div>
            
            <div class="memory-content">
                <div class="memory-search">
                    <input type="text" class="search-input" placeholder="Search memory...">
                </div>
                
                <div class="memory-tabs">
                    <button class="memory-tab active" data-tab="working">Working</button>
                    <button class="memory-tab" data-tab="semantic">Semantic</button>
                    <button class="memory-tab" data-tab="episodic">Episodic</button>
                    <button class="memory-tab" data-tab="procedural">Procedural</button>
                </div>
                
                <div class="memory-panel active" data-panel="working">
                    <div class="no-memory">No working memory entries</div>
                </div>
                
                <div class="memory-panel" data-panel="semantic">
                    <div class="no-memory">No semantic memory entries</div>
                </div>
                
                <div class="memory-panel" data-panel="episodic">
                    <div class="no-memory">No episodic memory entries</div>
                </div>
                
                <div class="memory-panel" data-panel="procedural">
                    <div class="no-memory">No procedural memory entries</div>
                </div>
                
                <div class="memory-actions">
                    <button class="action-button">Refresh</button>
                    <button class="action-button">Export</button>
                    <button class="action-button danger">Clear</button>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Toggle visibility
        const toggleButton = this.shadowRoot.querySelector('.toggle-button');
        const memoryContent = this.shadowRoot.querySelector('.memory-content');
        
        toggleButton.addEventListener('click', () => {
            this.isVisible = !this.isVisible;
            
            if (this.isVisible) {
                memoryContent.classList.add('expanded');
                toggleButton.textContent = 'Hide';
                this.refreshMemory();
            } else {
                memoryContent.classList.remove('expanded');
                toggleButton.textContent = 'Show';
            }
        });
        
        // Tab switching
        const tabs = this.shadowRoot.querySelectorAll('.memory-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });
        
        // Search
        const searchInput = this.shadowRoot.querySelector('.search-input');
        searchInput.addEventListener('input', (e) => {
            this.filterMemory(e.target.value);
        });
        
        // Action buttons
        const refreshButton = this.shadowRoot.querySelector('.action-button:nth-child(1)');
        const exportButton = this.shadowRoot.querySelector('.action-button:nth-child(2)');
        const clearButton = this.shadowRoot.querySelector('.action-button:nth-child(3)');
        
        refreshButton.addEventListener('click', () => this.refreshMemory());
        exportButton.addEventListener('click', () => this.exportMemory());
        clearButton.addEventListener('click', () => this.clearMemory());
        
        // Memory item expansion
        this.shadowRoot.addEventListener('click', (e) => {
            if (e.target.closest('.memory-item-header')) {
                const memoryItem = e.target.closest('.memory-item');
                this.toggleMemoryItem(memoryItem);
            }
        });
    }

    switchTab(tabName) {
        // Update active tab
        const tabs = this.shadowRoot.querySelectorAll('.memory-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update active panel
        const panels = this.shadowRoot.querySelectorAll('.memory-panel');
        panels.forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });
        
        this.currentView = tabName;
    }

    toggleMemoryItem(memoryItem) {
        memoryItem.classList.toggle('expanded');
    }

    async refreshMemory() {
        if (!this.agent) return;
        
        try {
            const memoryStats = await this.agent.getMemoryData();
            if (memoryStats) {
                this.memoryData = memoryStats;
                this.renderMemoryData();
            }
        } catch (error) {
            console.error('Failed to refresh memory:', error);
        }
    }

    updateMemory(memoryUpdate) {
        const { type, operation, data } = memoryUpdate;
        
        if (operation === 'add' || operation === 'update') {
            // Update local memory data
            if (!this.memoryData[type]) {
                this.memoryData[type] = [];
            }
            
            const existingIndex = this.memoryData[type].findIndex(item => item.key === data.key);
            if (existingIndex >= 0) {
                this.memoryData[type][existingIndex] = data;
            } else {
                this.memoryData[type].push(data);
            }
        } else if (operation === 'remove') {
            if (this.memoryData[type]) {
                this.memoryData[type] = this.memoryData[type].filter(item => item.key !== data.key);
            }
        }
        
        // Re-render current view
        this.renderMemoryData();
    }

    renderMemoryData() {
        const panels = this.shadowRoot.querySelectorAll('.memory-panel');
        
        panels.forEach(panel => {
            const memoryType = panel.dataset.panel;
            const memories = this.memoryData[memoryType] || [];
            
            if (memories.length === 0) {
                panel.innerHTML = `<div class="no-memory">No ${memoryType} memory entries</div>`;
            } else {
                panel.innerHTML = memories.map(memory => this.renderMemoryItem(memory, memoryType)).join('');
            }
        });
    }

    renderMemoryItem(memory, type) {
        const importance = this.getImportanceLevel(memory.importance || 0.5);
        const tags = memory.tags || [];
        const timestamp = new Date(memory.timestamp || Date.now()).toLocaleString();
        
        return `
            <div class="memory-item" data-key="${memory.key}">
                <div class="memory-item-header">
                    <h4 class="memory-item-title">${this.truncateText(memory.key, 30)}</h4>
                    <div class="memory-item-meta">
                        ${tags.slice(0, 2).map(tag => `<span class="memory-tag">${tag}</span>`).join('')}
                        <div class="importance-indicator ${importance}"></div>
                        <span class="expand-icon">▼</span>
                    </div>
                </div>
                <div class="memory-item-content">
                    <div class="memory-item-body">
                        <div class="memory-data">${this.formatMemoryData(memory.data)}</div>
                        <div class="memory-stats">
                            <div class="memory-stat">
                                <span>Created:</span>
                                <span>${timestamp}</span>
                            </div>
                            <div class="memory-stat">
                                <span>Access Count:</span>
                                <span>${memory.accessCount || 0}</span>
                            </div>
                            <div class="memory-stat">
                                <span>Importance:</span>
                                <span>${Math.round((memory.importance || 0.5) * 100)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    formatMemoryData(data) {
        if (typeof data === 'object') {
            try {
                return JSON.stringify(data, null, 2);
            } catch {
                return '[Object]';
            }
        }
        
        return String(data);
    }

    getImportanceLevel(importance) {
        if (importance >= 0.7) return 'high';
        if (importance >= 0.4) return 'medium';
        return 'low';
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    filterMemory(searchTerm) {
        const memoryItems = this.shadowRoot.querySelectorAll('.memory-item');
        const lowercaseSearch = searchTerm.toLowerCase();
        
        memoryItems.forEach(item => {
            const title = item.querySelector('.memory-item-title').textContent.toLowerCase();
            const data = item.querySelector('.memory-data').textContent.toLowerCase();
            const tags = Array.from(item.querySelectorAll('.memory-tag')).map(tag => tag.textContent.toLowerCase());
            
            const matches = title.includes(lowercaseSearch) || 
                          data.includes(lowercaseSearch) || 
                          tags.some(tag => tag.includes(lowercaseSearch));
            
            item.style.display = matches ? 'block' : 'none';
        });
    }

    async exportMemory() {
        try {
            const exportData = {
                timestamp: new Date().toISOString(),
                memoryData: this.memoryData
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `agent-memory-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Failed to export memory:', error);
        }
    }

    async clearMemory() {
        if (!confirm('Are you sure you want to clear all memory? This action cannot be undone.')) {
            return;
        }
        
        try {
            if (this.agent && this.agent.clearMemory) {
                await this.agent.clearMemory(this.currentView);
                this.memoryData[this.currentView] = [];
                this.renderMemoryData();
            }
        } catch (error) {
            console.error('Failed to clear memory:', error);
        }
    }

    // Public methods
    showMemoryType(type) {
        this.switchTab(type);
        
        if (!this.isVisible) {
            const toggleButton = this.shadowRoot.querySelector('.toggle-button');
            toggleButton.click();
        }
    }

    highlightMemoryItem(key) {
        const item = this.shadowRoot.querySelector(`[data-key="${key}"]`);
        if (item) {
            item.style.borderColor = '#007acc';
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            setTimeout(() => {
                item.style.borderColor = '';
            }, 3000);
        }
    }

    getMemoryStats() {
        const stats = {};
        
        Object.keys(this.memoryData).forEach(type => {
            stats[type] = this.memoryData[type].length;
        });
        
        return stats;
    }

    // Lifecycle methods
    connectedCallback() {
        // Auto-refresh memory data periodically
        this.refreshInterval = setInterval(() => {
            if (this.isVisible && this.agent) {
                this.refreshMemory();
            }
        }, 60000); // Every minute
    }

    disconnectedCallback() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

// Register the custom element
customElements.define('memory-viewer', MemoryViewer);