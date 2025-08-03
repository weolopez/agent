/**
 * Configuration Manager
 * Centralized configuration system with environment detection,
 * event listeners, and persistent storage capabilities.
 * 
 * Follows the ConfigManager interface defined in API_CONTRACTS.md
 */

export class ConfigManager {
    constructor() {
        this.config = new Map();
        this.listeners = new Map();
        this.environment = this.detectEnvironment();
        this.storageKey = 'multi-agent-config';
        
        this.initialize();
    }

    /**
     * Detect the current environment
     * @returns {'development' | 'production' | 'testing'}
     */
    detectEnvironment() {
        // Check for explicit environment setting
        if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
            return process.env.NODE_ENV;
        }
        
        // Check URL patterns for browser environment
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            
            // Local development indicators
            if (hostname === 'localhost' || 
                hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') ||
                protocol === 'file:') {
                return 'development';
            }
            
            // Testing indicators
            if (hostname.includes('test') || 
                hostname.includes('staging') ||
                window.location.search.includes('test=true')) {
                return 'testing';
            }
            
            // Production by default for web
            return 'production';
        }
        
        // Default to development
        return 'development';
    }

    /**
     * Initialize configuration with defaults
     */
    initialize() {
        this.loadFromStorage();
        this.setDefaults();
    }

    /**
     * Set default configuration values
     */
    setDefaults() {
        const defaults = {
            // API Endpoints
            'api.claude.endpoint': 'https://api.anthropic.com/v1/messages',
            'api.claude.model': 'claude-sonnet-4-20250514',
            'api.openrouter.endpoint': 'https://openrouter.ai/api/v1',
            'api.openrouter.model': 'anthropic/claude-3-sonnet',
            
            // Memory Limits (in bytes)
            'memory.working.limit': 50 * 1024 * 1024,     // 50MB
            'memory.semantic.limit': 100 * 1024 * 1024,   // 100MB
            'memory.episodic.limit': 200 * 1024 * 1024,   // 200MB
            'memory.procedural.limit': 150 * 1024 * 1024, // 150MB
            
            // Cache Limits
            'cache.l1.limit': 100 * 1024 * 1024,          // 100MB (Memory)
            'cache.l2.limit': 500 * 1024 * 1024,          // 500MB (IndexedDB)
            'cache.l3.limit': 2 * 1024 * 1024 * 1024,     // 2GB (Compressed IndexedDB)
            
            // Performance Settings
            'performance.timeout': 30000,                  // 30 seconds
            'performance.retry.attempts': 3,
            'performance.retry.delay': 1000,               // 1 second
            'performance.retry.backoff': 2,                // Exponential backoff multiplier
            'performance.concurrency.maxOperations': 10,
            'performance.concurrency.queueSize': 100,
            
            // UI Settings
            'ui.theme': 'default',
            'ui.animations.enabled': true,
            'ui.animations.duration': 300,
            'ui.feedback.autoSave': true,
            
            // Logging
            'logging.level': this.environment === 'development' ? 'debug' : 'info',
            'logging.maxEntries': 10000,
            'logging.persistence': true,
            
            // Feature Flags
            'features.promptOptimization': true,
            'features.memoryCompression': true,
            'features.advancedAnalytics': this.environment === 'production',
            'features.experimentalFeatures': this.environment === 'development'
        };

        // Set defaults only if not already configured
        for (const [key, value] of Object.entries(defaults)) {
            if (!this.config.has(key)) {
                this.config.set(key, value);
            }
        }
    }

    /**
     * Get configuration value
     * @param {string} key - Configuration key
     * @returns {any} Configuration value or undefined
     */
    get(key) {
        return this.config.get(key);
    }

    /**
     * Set configuration value
     * @param {string} key - Configuration key
     * @param {any} value - Configuration value
     * @returns {Promise<void>}
     */
    async set(key, value) {
        const oldValue = this.config.get(key);
        this.config.set(key, value);
        
        // Notify listeners
        this.notifyListeners(key, value, oldValue);
        
        // Persist to storage
        await this.saveToStorage();
    }

    /**
     * Check if configuration key exists
     * @param {string} key - Configuration key
     * @returns {boolean}
     */
    has(key) {
        return this.config.has(key);
    }

    /**
     * Delete configuration value
     * @param {string} key - Configuration key
     * @returns {Promise<boolean>} True if key existed and was deleted
     */
    async delete(key) {
        const existed = this.config.has(key);
        if (existed) {
            const oldValue = this.config.get(key);
            this.config.delete(key);
            this.notifyListeners(key, undefined, oldValue);
            await this.saveToStorage();
        }
        return existed;
    }

    /**
     * Get current environment
     * @returns {'development' | 'production' | 'testing'}
     */
    getEnvironment() {
        return this.environment;
    }

    /**
     * Set environment (affects default configurations)
     * @param {'development' | 'production' | 'testing'} env
     * @returns {Promise<void>}
     */
    async setEnvironment(env) {
        const validEnvironments = ['development', 'production', 'testing'];
        if (!validEnvironments.includes(env)) {
            throw new Error(`Invalid environment: ${env}. Valid options: ${validEnvironments.join(', ')}`);
        }
        
        this.environment = env;
        
        // Update environment-specific settings
        if (env === 'development') {
            await this.set('logging.level', 'debug');
            await this.set('features.experimentalFeatures', true);
        } else if (env === 'production') {
            await this.set('logging.level', 'info');
            await this.set('features.experimentalFeatures', false);
            await this.set('features.advancedAnalytics', true);
        } else if (env === 'testing') {
            await this.set('logging.level', 'warn');
            await this.set('features.experimentalFeatures', false);
        }
    }

    /**
     * Get API endpoints configuration
     * @returns {Promise<Object>} API endpoints object
     */
    async getApiEndpoints() {
        const endpoints = {};
        
        for (const [key, value] of this.config) {
            if (key.startsWith('api.') && key.endsWith('.endpoint')) {
                const serviceName = key.split('.')[1];
                endpoints[serviceName] = value;
            }
        }
        
        return endpoints;
    }

    /**
     * Get memory limits configuration
     * @returns {Promise<Object>} Memory limits object
     */
    async getMemoryLimits() {
        const limits = {
            working: this.get('memory.working.limit'),
            semantic: this.get('memory.semantic.limit'),
            episodic: this.get('memory.episodic.limit'),
            procedural: this.get('memory.procedural.limit'),
            cache: {
                l1: this.get('cache.l1.limit'),
                l2: this.get('cache.l2.limit'),
                l3: this.get('cache.l3.limit')
            }
        };
        
        return limits;
    }

    /**
     * Get performance settings
     * @returns {Promise<Object>} Performance settings object
     */
    async getPerformanceSettings() {
        const settings = {
            timeout: this.get('performance.timeout'),
            retry: {
                attempts: this.get('performance.retry.attempts'),
                delay: this.get('performance.retry.delay'),
                backoff: this.get('performance.retry.backoff')
            },
            concurrency: {
                maxOperations: this.get('performance.concurrency.maxOperations'),
                queueSize: this.get('performance.concurrency.queueSize')
            }
        };
        
        return settings;
    }

    /**
     * Add configuration change listener
     * @param {string} key - Configuration key to listen for
     * @param {Function} callback - Callback function (newValue, oldValue, key) => void
     */
    addListener(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
    }

    /**
     * Remove configuration change listener
     * @param {string} key - Configuration key
     * @param {Function} callback - Callback function to remove
     */
    removeListener(key, callback) {
        if (this.listeners.has(key)) {
            this.listeners.get(key).delete(callback);
            
            // Clean up empty listener sets
            if (this.listeners.get(key).size === 0) {
                this.listeners.delete(key);
            }
        }
    }

    /**
     * Notify listeners of configuration changes
     * @param {string} key - Changed configuration key
     * @param {any} newValue - New value
     * @param {any} oldValue - Previous value
     */
    notifyListeners(key, newValue, oldValue) {
        // Notify specific key listeners
        if (this.listeners.has(key)) {
            for (const callback of this.listeners.get(key)) {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error(`Error in config listener for ${key}:`, error);
                }
            }
        }
        
        // Notify wildcard listeners (*)
        if (this.listeners.has('*')) {
            for (const callback of this.listeners.get('*')) {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error(`Error in wildcard config listener:`, error);
                }
            }
        }
    }

    /**
     * Validate current configuration
     * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
     */
    async validateConfig() {
        const errors = [];
        const warnings = [];

        // Validate API endpoints
        const endpoints = await this.getApiEndpoints();
        for (const [service, endpoint] of Object.entries(endpoints)) {
            if (!endpoint || typeof endpoint !== 'string') {
                errors.push(`Missing or invalid API endpoint for ${service}`);
            } else if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
                errors.push(`Invalid API endpoint URL format for ${service}: ${endpoint}`);
            }
        }

        // Validate memory limits
        const limits = await this.getMemoryLimits();
        const memoryKeys = ['working', 'semantic', 'episodic', 'procedural'];
        for (const key of memoryKeys) {
            const limit = limits[key];
            if (typeof limit !== 'number' || limit <= 0) {
                errors.push(`Invalid memory limit for ${key}: ${limit}`);
            } else if (limit < 10 * 1024 * 1024) { // Less than 10MB
                warnings.push(`Memory limit for ${key} is very low: ${Math.round(limit / (1024 * 1024))}MB`);
            }
        }

        // Validate cache limits
        const cacheKeys = ['l1', 'l2', 'l3'];
        for (const key of cacheKeys) {
            const limit = limits.cache[key];
            if (typeof limit !== 'number' || limit <= 0) {
                errors.push(`Invalid cache limit for ${key}: ${limit}`);
            }
        }

        // Validate performance settings
        const performance = await this.getPerformanceSettings();
        if (performance.timeout <= 0) {
            errors.push(`Invalid timeout value: ${performance.timeout}`);
        }
        if (performance.retry.attempts < 0) {
            errors.push(`Invalid retry attempts: ${performance.retry.attempts}`);
        }

        // Environment-specific validations
        if (this.environment === 'production') {
            if (this.get('logging.level') === 'debug') {
                warnings.push('Debug logging enabled in production environment');
            }
            if (this.get('features.experimentalFeatures')) {
                warnings.push('Experimental features enabled in production environment');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Export configuration
     * @returns {Promise<Object>} Configuration export object
     */
    async exportConfig() {
        return {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            environment: this.environment,
            data: Object.fromEntries(this.config)
        };
    }

    /**
     * Import configuration
     * @param {Object} configExport - Configuration export object
     * @returns {Promise<void>}
     */
    async importConfig(configExport) {
        if (!configExport || typeof configExport !== 'object') {
            throw new Error('Invalid configuration export data');
        }

        if (!configExport.data || typeof configExport.data !== 'object') {
            throw new Error('Invalid configuration data in export');
        }

        // Clear current configuration
        this.config.clear();

        // Import new configuration
        for (const [key, value] of Object.entries(configExport.data)) {
            this.config.set(key, value);
        }

        // Update environment if provided
        if (configExport.environment) {
            this.environment = configExport.environment;
        }

        // Validate imported configuration
        const validation = await this.validateConfig();
        if (!validation.valid) {
            console.warn('Imported configuration has validation errors:', validation.errors);
        }

        // Save to storage
        await this.saveToStorage();

        // Notify listeners of bulk change
        this.notifyListeners('*', configExport.data, {});
    }

    /**
     * Reset configuration to defaults
     * @returns {Promise<void>}
     */
    async reset() {
        this.config.clear();
        this.listeners.clear();
        this.environment = this.detectEnvironment();
        this.setDefaults();
        await this.saveToStorage();
    }

    /**
     * Load configuration from persistent storage
     */
    loadFromStorage() {
        try {
            if (typeof localStorage !== 'undefined') {
                const stored = localStorage.getItem(this.storageKey);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed.data) {
                        for (const [key, value] of Object.entries(parsed.data)) {
                            this.config.set(key, value);
                        }
                    }
                    if (parsed.environment) {
                        this.environment = parsed.environment;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load configuration from storage:', error);
        }
    }

    /**
     * Save configuration to persistent storage
     * @returns {Promise<void>}
     */
    async saveToStorage() {
        try {
            if (typeof localStorage !== 'undefined') {
                const exportData = await this.exportConfig();
                localStorage.setItem(this.storageKey, JSON.stringify(exportData));
            }
        } catch (error) {
            console.warn('Failed to save configuration to storage:', error);
        }
    }

    /**
     * Get configuration statistics
     * @returns {Object} Configuration statistics
     */
    getStats() {
        return {
            totalKeys: this.config.size,
            environment: this.environment,
            listeners: this.listeners.size,
            categories: this.getCategoryBreakdown(),
            memoryUsage: this.getMemoryUsage()
        };
    }

    /**
     * Get breakdown of configuration by category
     * @returns {Object} Category breakdown
     */
    getCategoryBreakdown() {
        const categories = {};
        
        for (const key of this.config.keys()) {
            const category = key.split('.')[0];
            categories[category] = (categories[category] || 0) + 1;
        }
        
        return categories;
    }

    /**
     * Estimate memory usage of configuration
     * @returns {number} Estimated memory usage in bytes
     */
    getMemoryUsage() {
        let usage = 0;
        
        for (const [key, value] of this.config) {
            usage += key.length * 2; // Unicode characters are 2 bytes
            usage += JSON.stringify(value).length * 2;
        }
        
        return usage;
    }
}

// Create and export singleton instance
export const configManager = new ConfigManager();

// Export for ES6 modules
export default ConfigManager;