export class SystemConfig {
    constructor() {
        this.config = {
            llm: {
                provider: 'openrouter',//claude-pro',
                model: 'qwen/qwen3-coder',
                apiKey: null,
                endpoint: null,
                openRouterApiKey: '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',
                openRouterEndpoint: 'https://openrouter.ai/api/v1/chat/completions'
            },
            memory: {
                cacheLevels: [100, 500, 1000], // L1, L2, L3 sizes
                persistentStorage: true,
                memoryTypes: ['working', 'semantic', 'episodic', 'procedural'],
                ttl: {
                    L1: 5 * 60 * 1000,    // 5 minutes
                    L2: 30 * 60 * 1000,   // 30 minutes  
                    L3: 2 * 60 * 60 * 1000 // 2 hours
                }
            },
            agent: {
                personality: 'Professional business analyst with deep technical knowledge',
                capabilities: [
                    'business_requirements_analysis',
                    'application_impact_assessment', 
                    'project_estimation',
                    'historical_pattern_matching'
                ],
                tools: [
                    'application_catalog',
                    'project_history',
                    'roadmap_data',
                    'estimation_engine'
                ],
                maxOperationsPerLoop: 10,
                operationTimeout: 30000 // 30 seconds
            },
            ui: {
                theme: 'dark',
                animationsEnabled: true,
                debugMode: false,
                memoryViewerEnabled: true
            },
            logging: {
                level: 'info', // debug, info, warn, error
                consoleEnabled: true,
                persistLogs: true,
                maxLogSize: 1000
            }
        };
        
        this.listeners = new Map();
        this.initialized = false;
    }

    async init() {
        try {
            // Load saved configuration from localStorage if available
            await this.loadSavedConfig();
            
            // Validate configuration
            this.validateConfig();
            
            // Setup configuration change detection
            this.setupChangeDetection();
            
            this.initialized = true;
            this.emit('initialized', this.config);
            
        } catch (error) {
            throw new Error(`Failed to initialize configuration: ${error.message}`);
        }
    }

    async loadSavedConfig() {
        try {
            const saved = localStorage.getItem('agentSystemConfig');
            if (saved) {
                const savedConfig = JSON.parse(saved);
                this.mergeConfig(savedConfig);
            }
        } catch (error) {
            console.warn('Failed to load saved configuration, using defaults:', error);
        }
    }

    mergeConfig(newConfig) {
        // Deep merge new configuration with existing
        this.config = this.deepMerge(this.config, newConfig);
        this.emit('configChanged', this.config);
    }

    deepMerge(target, source) {
        const result = { ...target };
        
        Object.keys(source).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        });
        
        return result;
    }

    validateConfig() {
        // Validate LLM configuration
        if (!this.config.llm.provider) {
            throw new Error('LLM provider is required');
        }

        if (this.config.llm.provider === 'openrouter' && !this.config.llm.openRouterApiKey) {
            console.warn('OpenRouter API key not configured - some features may be limited');
        }

        // Validate memory configuration
        if (!Array.isArray(this.config.memory.cacheLevels) || this.config.memory.cacheLevels.length !== 3) {
            throw new Error('Memory cache levels must be array of 3 numbers [L1, L2, L3]');
        }

        // Validate agent configuration
        if (!Array.isArray(this.config.agent.capabilities) || this.config.agent.capabilities.length === 0) {
            throw new Error('Agent must have at least one capability');
        }
    }

    setupChangeDetection() {
        // Watch for configuration changes and auto-save
        const handler = {
            set: (target, property, value) => {
                target[property] = value;
                this.saveConfig();
                this.emit('configChanged', this.config);
                return true;
            }
        };

        // Make config objects reactive (shallow)
        Object.keys(this.config).forEach(key => {
            if (typeof this.config[key] === 'object') {
                this.config[key] = new Proxy(this.config[key], handler);
            }
        });
    }

    saveConfig() {
        try {
            localStorage.setItem('agentSystemConfig', JSON.stringify(this.config));
        } catch (error) {
            console.error('Failed to save configuration:', error);
        }
    }

    // Configuration getters
    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.config);
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (!obj[key]) obj[key] = {};
            return obj[key];
        }, this.config);
        
        target[lastKey] = value;
        this.saveConfig();
        this.emit('configChanged', this.config);
    }

    // LLM configuration helpers
    getLLMConfig() {
        return { ...this.config.llm };
    }

    setLLMProvider(provider, options = {}) {
        this.config.llm.provider = provider;
        
        if (provider === 'openrouter' && options.apiKey) {
            this.config.llm.openRouterApiKey = options.apiKey;
        }
        
        if (options.model) {
            this.config.llm.model = options.model;
        }
        
        this.saveConfig();
        this.emit('llmConfigChanged', this.config.llm);
    }

    // Memory configuration helpers
    getMemoryConfig() {
        return { ...this.config.memory };
    }

    updateMemoryConfig(updates) {
        Object.assign(this.config.memory, updates);
        this.saveConfig();
        this.emit('memoryConfigChanged', this.config.memory);
    }

    // Agent configuration helpers
    getAgentConfig() {
        return { ...this.config.agent };
    }

    updateAgentConfig(updates) {
        Object.assign(this.config.agent, updates);
        this.saveConfig();
        this.emit('agentConfigChanged', this.config.agent);
    }

    // UI configuration helpers
    getUIConfig() {
        return { ...this.config.ui };
    }

    toggleDebugMode() {
        this.config.ui.debugMode = !this.config.ui.debugMode;
        this.saveConfig();
        this.emit('debugModeChanged', this.config.ui.debugMode);
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in config event listener for ${event}:`, error);
                }
            });
        }
    }

    // Export/Import configuration
    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    importConfig(configJSON) {
        try {
            const importedConfig = JSON.parse(configJSON);
            this.mergeConfig(importedConfig);
            this.validateConfig();
            return true;
        } catch (error) {
            throw new Error(`Invalid configuration format: ${error.message}`);
        }
    }

    // Reset to defaults
    reset() {
        localStorage.removeItem('agentSystemConfig');
        location.reload(); // Simple way to reset everything
    }

    // Debug helpers
    getDebugInfo() {
        return {
            config: this.config,
            initialized: this.initialized,
            listenerCounts: Object.fromEntries(
                Array.from(this.listeners.entries()).map(([event, listeners]) => [event, listeners.size])
            )
        };
    }
}