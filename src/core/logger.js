export class Logger {
    constructor(config) {
        this.config = config;
        this.logs = [];
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.currentLevel = this.logLevels[config?.get('logging.level') || 'info'];
        this.maxLogSize = config?.get('logging.maxLogSize') || 1000;
        this.persistLogs = config?.get('logging.persistLogs') || false;
        this.consoleEnabled = config?.get('logging.consoleEnabled') !== false;
        
        this.initializePersistence();
        this.setupConfigListeners();
    }

    initializePersistence() {
        if (this.persistLogs) {
            try {
                const savedLogs = localStorage.getItem('agentSystemLogs');
                if (savedLogs) {
                    this.logs = JSON.parse(savedLogs);
                    // Clean old logs if exceeding max size
                    if (this.logs.length > this.maxLogSize) {
                        this.logs = this.logs.slice(-this.maxLogSize);
                    }
                }
            } catch (error) {
                console.warn('Failed to load persisted logs:', error);
                this.logs = [];
            }
        }
    }

    setupConfigListeners() {
        if (this.config) {
            this.config.on('configChanged', (newConfig) => {
                this.currentLevel = this.logLevels[newConfig.logging?.level || 'info'];
                this.maxLogSize = newConfig.logging?.maxLogSize || 1000;
                this.persistLogs = newConfig.logging?.persistLogs || false;
                this.consoleEnabled = newConfig.logging?.consoleEnabled !== false;
            });
        }
    }

    log(level, component, message, data = null, metadata = {}) {
        const levelNum = this.logLevels[level];
        if (levelNum < this.currentLevel) {
            return; // Skip logs below current level
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            component,
            message,
            data: data ? this.sanitizeData(data) : null,
            metadata: {
                ...metadata,
                userAgent: navigator.userAgent,
                url: window.location.href,
                sessionId: this.getSessionId()
            }
        };

        // Add to internal log store
        this.logs.push(logEntry);
        
        // Maintain log size limit
        if (this.logs.length > this.maxLogSize) {
            this.logs.shift();
        }

        // Persist logs if enabled
        if (this.persistLogs) {
            this.persistLog();
        }

        // Output to console if enabled
        if (this.consoleEnabled) {
            this.outputToConsole(logEntry);
        }

        // Emit log event for external listeners
        this.emitLogEvent(logEntry);
    }

    debug(component, message, data, metadata) {
        this.log('debug', component, message, data, metadata);
    }

    info(component, message, data, metadata) {
        this.log('info', component, message, data, metadata);
    }

    warn(component, message, data, metadata) {
        this.log('warn', component, message, data, metadata);
    }

    error(component, message, data, metadata) {
        this.log('error', component, message, data, metadata);
    }

    // Specialized logging methods for different operations
    logOperation(type, operation, context, result, metrics = {}) {
        this.info('Operation', `${type}: ${operation}`, {
            context: this.sanitizeData(context),
            result: this.sanitizeData(result),
            metrics
        }, {
            operationType: type,
            operationName: operation,
            duration: metrics.duration,
            success: result?.success !== false
        });
    }

    logError(error, context, recovery = null) {
        this.error('Error', error.message || 'Unknown error', {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context: this.sanitizeData(context),
            recovery
        }, {
            errorType: error.name,
            hasRecovery: !!recovery
        });
    }

    logMemoryAccess(memoryType, operation, result, hitMiss = null) {
        this.debug('Memory', `${memoryType}: ${operation}`, {
            result: this.sanitizeData(result),
            hitMiss
        }, {
            memoryType,
            operation,
            cacheResult: hitMiss
        });
    }

    logLLMCall(prompt, response, tokens, duration, provider) {
        this.info('LLM', `${provider} call completed`, {
            prompt: this.truncateString(prompt, 200),
            response: this.truncateString(response, 500),
            tokens,
            duration
        }, {
            provider,
            tokens,
            duration,
            promptLength: prompt?.length || 0,
            responseLength: response?.length || 0
        });
    }

    logUserInteraction(type, input, output, context) {
        this.info('UI', `User ${type}`, {
            input: this.sanitizeData(input),
            output: this.sanitizeData(output),
            context: this.sanitizeData(context)
        }, {
            interactionType: type
        });
    }

    // Performance logging
    startTimer(name) {
        const timerId = `${name}_${Date.now()}_${Math.random()}`;
        const startTime = performance.now();
        
        return {
            stop: () => {
                const duration = performance.now() - startTime;
                this.debug('Performance', `Timer: ${name}`, { duration }, {
                    timerName: name,
                    duration
                });
                return duration;
            }
        };
    }

    // Utility methods
    sanitizeData(data) {
        if (!data) return data;
        
        try {
            // Remove sensitive information
            const sanitized = JSON.parse(JSON.stringify(data));
            return this.removeSensitiveFields(sanitized);
        } catch (error) {
            return '[Unable to serialize data]';
        }
    }

    removeSensitiveFields(obj) {
        const sensitiveKeys = ['password', 'apiKey', 'token', 'secret', 'key', 'auth'];
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.removeSensitiveFields(item));
        } else if (obj && typeof obj === 'object') {
            const cleaned = {};
            Object.keys(obj).forEach(key => {
                const lowerKey = key.toLowerCase();
                if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
                    cleaned[key] = '[REDACTED]';
                } else {
                    cleaned[key] = this.removeSensitiveFields(obj[key]);
                }
            });
            return cleaned;
        }
        
        return obj;
    }

    truncateString(str, maxLength) {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    getSessionId() {
        if (!this.sessionId) {
            this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        return this.sessionId;
    }

    outputToConsole(logEntry) {
        const { level, component, message, data } = logEntry;
        const prefix = `[${new Date(logEntry.timestamp).toLocaleTimeString()}] ${component}:`;
        
        switch (level) {
            case 'debug':
                console.debug(prefix, message, data);
                break;
            case 'info':
                console.info(prefix, message, data);
                break;
            case 'warn':
                console.warn(prefix, message, data);
                break;
            case 'error':
                console.error(prefix, message, data);
                break;
        }
    }

    persistLog() {
        try {
            localStorage.setItem('agentSystemLogs', JSON.stringify(this.logs));
        } catch (error) {
            console.warn('Failed to persist logs:', error);
        }
    }

    emitLogEvent(logEntry) {
        // Dispatch custom event for external log listeners
        window.dispatchEvent(new CustomEvent('agentLog', {
            detail: logEntry
        }));
    }

    // Query and export methods
    getLogs(filters = {}) {
        let filteredLogs = [...this.logs];

        if (filters.level) {
            const minLevel = this.logLevels[filters.level];
            filteredLogs = filteredLogs.filter(log => 
                this.logLevels[log.level] >= minLevel
            );
        }

        if (filters.component) {
            filteredLogs = filteredLogs.filter(log => 
                log.component.toLowerCase().includes(filters.component.toLowerCase())
            );
        }

        if (filters.since) {
            const sinceTime = new Date(filters.since);
            filteredLogs = filteredLogs.filter(log => 
                new Date(log.timestamp) >= sinceTime
            );
        }

        if (filters.limit) {
            filteredLogs = filteredLogs.slice(-filters.limit);
        }

        return filteredLogs;
    }

    exportLogs(format = 'json') {
        const logs = this.getLogs();
        
        switch (format) {
            case 'json':
                return JSON.stringify(logs, null, 2);
            case 'csv':
                return this.logsToCSV(logs);
            case 'text':
                return logs.map(log => 
                    `${log.timestamp} [${log.level.toUpperCase()}] ${log.component}: ${log.message}`
                ).join('\n');
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    logsToCSV(logs) {
        if (logs.length === 0) return '';
        
        const headers = ['timestamp', 'level', 'component', 'message', 'data'];
        const rows = logs.map(log => [
            log.timestamp,
            log.level,
            log.component,
            log.message,
            JSON.stringify(log.data || '')
        ]);
        
        return [headers, ...rows]
            .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
            .join('\n');
    }

    clearLogs() {
        this.logs = [];
        if (this.persistLogs) {
            localStorage.removeItem('agentSystemLogs');
        }
        this.info('Logger', 'Logs cleared');
    }

    // Statistics and analysis
    getLogStats() {
        const stats = {
            total: this.logs.length,
            byLevel: {},
            byComponent: {},
            recentErrors: [],
            timeRange: null
        };

        this.logs.forEach(log => {
            // Count by level
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
            
            // Count by component
            stats.byComponent[log.component] = (stats.byComponent[log.component] || 0) + 1;
            
            // Collect recent errors
            if (log.level === 'error') {
                stats.recentErrors.push({
                    timestamp: log.timestamp,
                    component: log.component,
                    message: log.message
                });
            }
        });

        // Keep only last 10 errors
        stats.recentErrors = stats.recentErrors.slice(-10);

        // Calculate time range
        if (this.logs.length > 0) {
            stats.timeRange = {
                start: this.logs[0].timestamp,
                end: this.logs[this.logs.length - 1].timestamp
            };
        }

        return stats;
    }
}