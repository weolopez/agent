/**
 * Logger System
 * Structured logging with multiple output targets, performance monitoring,
 * and context management capabilities.
 * 
 * Follows the Logger interface defined in API_CONTRACTS.md
 */

export class Logger {
    constructor(namespace = 'root', parentLogger = null) {
        this.namespace = namespace;
        this.parent = parentLogger;
        this.level = this.getDefaultLevel();
        this.targets = new Set();
        this.metrics = {
            totalEntries: 0,
            entriesByLevel: { debug: 0, info: 0, warn: 0, error: 0 },
            averageResponseTime: 0,
            errorRate: 0,
            storageUsage: 0
        };
        this.timers = new Map();
        
        // Add default console target if this is the root logger
        if (!parentLogger) {
            this.addTarget(new ConsoleLogTarget());
            
            // Add storage target if available
            if (typeof localStorage !== 'undefined') {
                this.addTarget(new StorageLogTarget());
            }
        }
    }

    /**
     * Get default log level based on environment
     * @returns {'debug' | 'info' | 'warn' | 'error'}
     */
    getDefaultLevel() {
        if (typeof window !== 'undefined') {
            // Browser environment
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'debug';
            }
            return 'info';
        }
        
        // Node.js environment
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
            return 'debug';
        }
        
        return 'info';
    }

    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async debug(message, context = {}) {
        return this.log('debug', message, context);
    }

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async info(message, context = {}) {
        return this.log('info', message, context);
    }

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async warn(message, context = {}) {
        return this.log('warn', message, context);
    }

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Error} error - Error object
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async error(message, error = null, context = {}) {
        const errorContext = { ...context };
        
        if (error) {
            errorContext.error = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        }
        
        return this.log('error', message, errorContext);
    }

    /**
     * Core logging method
     * @param {'debug' | 'info' | 'warn' | 'error'} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async log(level, message, context = {}) {
        // Check if this level should be logged
        if (!this.shouldLog(level)) {
            return;
        }

        const startTime = performance.now();

        // Create log entry
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            namespace: this.getFullNamespace(),
            context: this.sanitizeContext(context)
        };

        // Add error information if present
        if (context.error) {
            entry.error = context.error;
        }

        // Update metrics
        this.updateMetrics(level, startTime);

        // Write to all targets
        await this.writeToTargets(entry);
    }

    /**
     * Check if a log level should be logged
     * @param {'debug' | 'info' | 'warn' | 'error'} level
     * @returns {boolean}
     */
    shouldLog(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevelValue = levels[this.level] || 1;
        const messageLevelValue = levels[level] || 0;
        
        return messageLevelValue >= currentLevelValue;
    }

    /**
     * Get full namespace path
     * @returns {string}
     */
    getFullNamespace() {
        if (this.parent) {
            return `${this.parent.getFullNamespace()}.${this.namespace}`;
        }
        return this.namespace;
    }

    /**
     * Sanitize context object for logging
     * @param {Object} context
     * @returns {Object}
     */
    sanitizeContext(context) {
        const sanitized = {};
        
        for (const [key, value] of Object.entries(context)) {
            // Skip sensitive keys
            if (this.isSensitiveKey(key)) {
                sanitized[key] = '[REDACTED]';
                continue;
            }
            
            // Handle different value types
            if (value === null || value === undefined) {
                sanitized[key] = value;
            } else if (typeof value === 'function') {
                sanitized[key] = '[Function]';
            } else if (value instanceof Error) {
                sanitized[key] = {
                    name: value.name,
                    message: value.message,
                    stack: value.stack
                };
            } else if (typeof value === 'object') {
                // Prevent circular references and deep objects
                try {
                    sanitized[key] = JSON.parse(JSON.stringify(value));
                } catch (error) {
                    sanitized[key] = '[Object: Circular Reference]';
                }
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }

    /**
     * Check if a key contains sensitive information
     * @param {string} key
     * @returns {boolean}
     */
    isSensitiveKey(key) {
        const sensitiveKeys = [
            'password', 'passwd', 'pwd',
            'secret', 'token', 'key', 'api_key', 'apikey',
            'auth', 'authorization', 'cookie', 'session',
            'credit_card', 'ssn', 'social_security'
        ];
        
        return sensitiveKeys.some(sensitive => 
            key.toLowerCase().includes(sensitive)
        );
    }

    /**
     * Update logging metrics
     * @param {'debug' | 'info' | 'warn' | 'error'} level
     * @param {number} startTime
     */
    updateMetrics(level, startTime) {
        const duration = performance.now() - startTime;
        
        this.metrics.totalEntries++;
        this.metrics.entriesByLevel[level]++;
        
        // Update average response time
        const totalTime = this.metrics.averageResponseTime * (this.metrics.totalEntries - 1);
        this.metrics.averageResponseTime = (totalTime + duration) / this.metrics.totalEntries;
        
        // Update error rate
        if (level === 'error') {
            this.metrics.errorRate = this.metrics.entriesByLevel.error / this.metrics.totalEntries;
        }
    }

    /**
     * Write log entry to all targets
     * @param {Object} entry - Log entry
     * @returns {Promise<void>}
     */
    async writeToTargets(entry) {
        const writePromises = [];
        
        for (const target of this.targets) {
            writePromises.push(
                target.write(entry).catch(error => {
                    console.error(`Failed to write to log target ${target.name}:`, error);
                })
            );
        }
        
        await Promise.all(writePromises);
    }

    /**
     * Create child logger
     * @param {string} namespace - Child namespace
     * @returns {Logger}
     */
    createChild(namespace) {
        return new Logger(namespace, this);
    }

    /**
     * Set log level
     * @param {'debug' | 'info' | 'warn' | 'error'} level
     */
    setLevel(level) {
        const validLevels = ['debug', 'info', 'warn', 'error'];
        if (!validLevels.includes(level)) {
            throw new Error(`Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}`);
        }
        this.level = level;
    }

    /**
     * Get current log level
     * @returns {'debug' | 'info' | 'warn' | 'error'}
     */
    getLevel() {
        return this.level;
    }

    /**
     * Add log target
     * @param {LogTarget} target - Log target instance
     */
    addTarget(target) {
        if (!target || typeof target.write !== 'function') {
            throw new Error('Invalid log target: must have write method');
        }
        this.targets.add(target);
    }

    /**
     * Remove log target
     * @param {LogTarget} target - Log target instance
     */
    removeTarget(target) {
        this.targets.delete(target);
    }

    /**
     * Start performance timer
     * @param {string} name - Timer name
     * @returns {LogTimer}
     */
    startTimer(name) {
        const startTime = performance.now();
        
        const timer = {
            end: async (message = '', context = {}) => {
                const duration = performance.now() - startTime;
                const timerContext = {
                    ...context,
                    timer: name,
                    duration: `${duration.toFixed(2)}ms`
                };
                
                await this.info(message || `Timer '${name}' completed`, timerContext);
                this.timers.delete(name);
            }
        };
        
        this.timers.set(name, { startTime, timer });
        return timer;
    }

    /**
     * Get logging metrics
     * @returns {Promise<Object>}
     */
    async getMetrics() {
        // Update storage usage if we have storage targets
        let storageUsage = 0;
        for (const target of this.targets) {
            if (target.getStorageUsage) {
                storageUsage += await target.getStorageUsage();
            }
        }
        
        return {
            ...this.metrics,
            storageUsage,
            activeTimers: this.timers.size,
            targets: Array.from(this.targets).map(t => t.name)
        };
    }

    /**
     * Flush all log targets
     * @returns {Promise<void>}
     */
    async flush() {
        const flushPromises = [];
        
        for (const target of this.targets) {
            if (target.flush) {
                flushPromises.push(target.flush());
            }
        }
        
        await Promise.all(flushPromises);
    }

    /**
     * Close logger and all targets
     * @returns {Promise<void>}
     */
    async close() {
        await this.flush();
        
        const closePromises = [];
        for (const target of this.targets) {
            if (target.close) {
                closePromises.push(target.close());
            }
        }
        
        await Promise.all(closePromises);
        this.targets.clear();
    }
}

/**
 * Console Log Target
 * Outputs logs to browser console with appropriate styling
 */
export class ConsoleLogTarget {
    constructor() {
        this.name = 'console';
    }

    /**
     * Write log entry to console
     * @param {Object} entry - Log entry
     * @returns {Promise<void>}
     */
    async write(entry) {
        const { timestamp, level, message, namespace, context, error } = entry;
        
        // Format timestamp
        const time = new Date(timestamp).toLocaleTimeString();
        
        // Create console message with styling
        const styles = this.getStyles(level);
        const prefix = `%c[${time}] ${level.toUpperCase()} ${namespace}:`;
        
        if (error) {
            console.group(`${prefix} ${message}`, styles);
            console.error('Error:', error);
            if (Object.keys(context).length > 1) {
                console.log('Context:', context);
            }
            console.groupEnd();
        } else if (Object.keys(context).length > 0) {
            console.group(`${prefix} ${message}`, styles);
            console.log('Context:', context);
            console.groupEnd();
        } else {
            console.log(`${prefix} ${message}`, styles);
        }
    }

    /**
     * Get console styles for log level
     * @param {'debug' | 'info' | 'warn' | 'error'} level
     * @returns {string}
     */
    getStyles(level) {
        const styles = {
            debug: 'color: #888; font-weight: normal;',
            info: 'color: #0066cc; font-weight: normal;',
            warn: 'color: #ff8800; font-weight: bold;',
            error: 'color: #cc0000; font-weight: bold;'
        };
        
        return styles[level] || styles.info;
    }
}

/**
 * Storage Log Target
 * Stores logs in localStorage with size management
 */
export class StorageLogTarget {
    constructor(maxEntries = 10000) {
        this.name = 'storage';
        this.maxEntries = maxEntries;
        this.storageKey = 'multi-agent-logs';
        this.entries = this.loadFromStorage();
    }

    /**
     * Write log entry to storage
     * @param {Object} entry - Log entry
     * @returns {Promise<void>}
     */
    async write(entry) {
        this.entries.push(entry);
        
        // Maintain max entries limit
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(-this.maxEntries);
        }
        
        await this.saveToStorage();
    }

    /**
     * Load entries from localStorage
     * @returns {Array}
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('Failed to load logs from storage:', error);
            return [];
        }
    }

    /**
     * Save entries to localStorage
     * @returns {Promise<void>}
     */
    async saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
        } catch (error) {
            console.warn('Failed to save logs to storage:', error);
            
            // If storage is full, remove older entries and try again
            if (error.name === 'QuotaExceededError') {
                this.entries = this.entries.slice(-Math.floor(this.maxEntries / 2));
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
                } catch (retryError) {
                    console.error('Failed to save logs even after cleanup:', retryError);
                }
            }
        }
    }

    /**
     * Get storage usage in bytes
     * @returns {Promise<number>}
     */
    async getStorageUsage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? stored.length * 2 : 0; // Unicode chars are 2 bytes
        } catch (error) {
            return 0;
        }
    }

    /**
     * Flush logs (save to storage)
     * @returns {Promise<void>}
     */
    async flush() {
        await this.saveToStorage();
    }

    /**
     * Clear all stored logs
     * @returns {Promise<void>}
     */
    async clear() {
        this.entries = [];
        localStorage.removeItem(this.storageKey);
    }

    /**
     * Get all stored log entries
     * @param {Object} filter - Filter options
     * @returns {Array}
     */
    getEntries(filter = {}) {
        let entries = [...this.entries];
        
        // Apply filters
        if (filter.level) {
            entries = entries.filter(entry => entry.level === filter.level);
        }
        
        if (filter.namespace) {
            entries = entries.filter(entry => 
                entry.namespace.includes(filter.namespace)
            );
        }
        
        if (filter.timeRange) {
            const start = new Date(filter.timeRange.start);
            const end = new Date(filter.timeRange.end);
            entries = entries.filter(entry => {
                const entryTime = new Date(entry.timestamp);
                return entryTime >= start && entryTime <= end;
            });
        }
        
        if (filter.limit) {
            entries = entries.slice(-filter.limit);
        }
        
        return entries;
    }
}

// Create and export singleton logger instance
export const logger = new Logger('multi-agent');

// Export for ES6 modules
export default Logger;