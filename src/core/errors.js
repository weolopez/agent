export class ErrorHandler {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        this.errorCounts = new Map();
        this.recoveryStrategies = new Map();
        this.lastKnownGoodStates = new Map();
        
        this.setupGlobalErrorHandling();
        this.registerDefaultRecoveryStrategies();
    }

    setupGlobalErrorHandling() {
        // Handle uncaught JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleGlobalError('UncaughtError', event.error, {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError('UnhandledPromiseRejection', event.reason, {
                type: 'promise'
            });
        });
    }

    registerDefaultRecoveryStrategies() {
        // LLM-related error recovery
        this.registerRecoveryStrategy('LLMError', {
            maxRetries: 3,
            backoffMs: 1000,
            strategy: async (error, context, attempt) => {
                if (error.message?.includes('rate limit')) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                    await this.delay(delay);
                    return { retry: true, context };
                }
                
                if (error.message?.includes('network')) {
                    // Try fallback provider if available
                    if (context.llmConfig?.provider === 'claude-pro') {
                        return { 
                            retry: true, 
                            context: { 
                                ...context, 
                                llmConfig: { ...context.llmConfig, provider: 'openrouter' } 
                            } 
                        };
                    }
                }
                
                return { retry: false, fallback: 'degraded_mode' };
            }
        });

        // Memory-related error recovery
        this.registerRecoveryStrategy('MemoryError', {
            maxRetries: 2,
            backoffMs: 500,
            strategy: async (error, context) => {
                if (error.message?.includes('storage quota')) {
                    // Clear L3 cache and retry
                    await this.clearMemoryLevel('L3');
                    return { retry: true, context };
                }
                
                if (error.message?.includes('corrupted')) {
                    // Reset memory and start fresh
                    await this.resetMemoryStore(context.memoryType);
                    return { retry: true, context };
                }
                
                return { retry: false, fallback: 'memory_disabled' };
            }
        });

        // Tool operation error recovery
        this.registerRecoveryStrategy('ToolError', {
            maxRetries: 2,
            backoffMs: 1000,
            strategy: async (error, context) => {
                if (error.message?.includes('timeout')) {
                    // Increase timeout and retry
                    return { 
                        retry: true, 
                        context: { 
                            ...context, 
                            timeout: (context.timeout || 5000) * 2 
                        } 
                    };
                }
                
                if (error.message?.includes('not found')) {
                    // Try alternative tool if available
                    const alternatives = this.getAlternativeTools(context.toolName);
                    if (alternatives.length > 0) {
                        return { 
                            retry: true, 
                            context: { 
                                ...context, 
                                toolName: alternatives[0] 
                            } 
                        };
                    }
                }
                
                return { retry: false, fallback: 'manual_intervention' };
            }
        });

        // UI-related error recovery
        this.registerRecoveryStrategy('UIError', {
            maxRetries: 1,
            backoffMs: 500,
            strategy: async (error, context) => {
                // Refresh UI component
                if (context.componentName) {
                    try {
                        await this.refreshUIComponent(context.componentName);
                        return { retry: true, context };
                    } catch (refreshError) {
                        this.logger.error('ErrorHandler', 'Failed to refresh UI component', refreshError);
                    }
                }
                
                return { retry: false, fallback: 'ui_fallback_mode' };
            }
        });
    }

    async handleError(errorType, error, context = {}) {
        const errorId = this.generateErrorId();
        const errorInfo = {
            id: errorId,
            type: errorType,
            error,
            context,
            timestamp: new Date().toISOString(),
            attempts: 0
        };

        this.logger.logError(error, context);
        this.incrementErrorCount(errorType);

        // Try recovery if strategy exists
        const recoveryStrategy = this.recoveryStrategies.get(errorType);
        if (recoveryStrategy) {
            return await this.attemptRecovery(errorInfo, recoveryStrategy);
        } else {
            // No recovery strategy, return error
            return { success: false, error, fallback: 'unknown_error' };
        }
    }

    async attemptRecovery(errorInfo, strategy) {
        const { maxRetries, backoffMs, strategy: recoveryFn } = strategy;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            errorInfo.attempts = attempt + 1;
            
            try {
                this.logger.info('ErrorHandler', `Recovery attempt ${attempt + 1}/${maxRetries}`, {
                    errorId: errorInfo.id,
                    errorType: errorInfo.type
                });

                // Apply backoff delay
                if (attempt > 0 && backoffMs > 0) {
                    await this.delay(backoffMs * attempt);
                }

                // Execute recovery strategy
                const result = await recoveryFn(errorInfo.error, errorInfo.context, attempt);
                
                if (result.retry) {
                    // Update context for retry
                    errorInfo.context = result.context || errorInfo.context;
                    continue;
                } else {
                    // Recovery strategy says don't retry
                    this.logger.info('ErrorHandler', 'Recovery strategy recommends no retry', {
                        errorId: errorInfo.id,
                        fallback: result.fallback
                    });
                    return { success: false, error: errorInfo.error, fallback: result.fallback };
                }
                
            } catch (recoveryError) {
                this.logger.error('ErrorHandler', 'Recovery attempt failed', {
                    errorId: errorInfo.id,
                    attempt: attempt + 1,
                    recoveryError
                });
                
                // If last attempt, fall through to final failure
                if (attempt === maxRetries - 1) {
                    break;
                }
            }
        }

        // All recovery attempts failed
        this.logger.error('ErrorHandler', 'All recovery attempts exhausted', {
            errorId: errorInfo.id,
            attempts: errorInfo.attempts
        });
        
        return { success: false, error: errorInfo.error, fallback: 'recovery_failed' };
    }

    registerRecoveryStrategy(errorType, strategy) {
        this.recoveryStrategies.set(errorType, strategy);
        this.logger.debug('ErrorHandler', `Registered recovery strategy for ${errorType}`);
    }

    // Specialized error handlers
    async handleLLMError(error, context) {
        return await this.handleError('LLMError', error, context);
    }

    async handleToolError(error, context) {
        return await this.handleError('ToolError', error, context);
    }

    async handleMemoryError(error, context) {
        return await this.handleError('MemoryError', error, context);
    }

    async handleUIError(error, context) {
        return await this.handleError('UIError', error, context);
    }

    async handleGlobalError(type, error, context) {
        this.logger.error('Global', `${type}: ${error?.message || error}`, {
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            context
        });

        // Emit global error event
        window.dispatchEvent(new CustomEvent('agentGlobalError', {
            detail: { type, error, context }
        }));
    }

    // State management for recovery
    saveLastKnownGoodState(component, state) {
        this.lastKnownGoodStates.set(component, {
            state: JSON.parse(JSON.stringify(state)),
            timestamp: new Date().toISOString()
        });
        this.logger.debug('ErrorHandler', `Saved good state for ${component}`);
    }

    getLastKnownGoodState(component) {
        return this.lastKnownGoodStates.get(component);
    }

    async recoverFromFailure(component, fallbackState = null) {
        const savedState = this.getLastKnownGoodState(component);
        
        if (savedState) {
            this.logger.info('ErrorHandler', `Recovering ${component} from saved state`, {
                stateAge: Date.now() - new Date(savedState.timestamp).getTime()
            });
            return savedState.state;
        } else if (fallbackState) {
            this.logger.info('ErrorHandler', `Using fallback state for ${component}`);
            return fallbackState;
        } else {
            this.logger.warn('ErrorHandler', `No recovery state available for ${component}`);
            return null;
        }
    }

    // Error statistics and monitoring
    incrementErrorCount(errorType) {
        const current = this.errorCounts.get(errorType) || 0;
        this.errorCounts.set(errorType, current + 1);
        
        // Check if error rate is concerning
        if (current + 1 >= 5) {
            this.logger.warn('ErrorHandler', `High error rate detected for ${errorType}`, {
                count: current + 1
            });
            
            // Emit high error rate event
            window.dispatchEvent(new CustomEvent('agentHighErrorRate', {
                detail: { errorType, count: current + 1 }
            }));
        }
    }

    getErrorStats() {
        return {
            errorCounts: Object.fromEntries(this.errorCounts),
            recoveryStrategies: Array.from(this.recoveryStrategies.keys()),
            savedStates: Array.from(this.lastKnownGoodStates.keys()),
            totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0)
        };
    }

    // Utility methods
    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async clearMemoryLevel(level) {
        // This would interact with the memory system
        this.logger.info('ErrorHandler', `Clearing memory level ${level}`);
        window.dispatchEvent(new CustomEvent('agentClearMemory', {
            detail: { level }
        }));
    }

    async resetMemoryStore(memoryType) {
        this.logger.info('ErrorHandler', `Resetting memory store ${memoryType}`);
        window.dispatchEvent(new CustomEvent('agentResetMemory', {
            detail: { memoryType }
        }));
    }

    getAlternativeTools(toolName) {
        // This would query the tool registry for alternatives
        const alternatives = {
            'application_catalog': ['legacy_app_catalog', 'manual_app_lookup'],
            'project_history': ['archive_search', 'manual_history'],
            'estimation_engine': ['simple_estimator', 'manual_estimation']
        };
        
        return alternatives[toolName] || [];
    }

    async refreshUIComponent(componentName) {
        this.logger.info('ErrorHandler', `Refreshing UI component ${componentName}`);
        
        const component = document.querySelector(componentName);
        if (component && component.refresh) {
            await component.refresh();
        } else {
            throw new Error(`Component ${componentName} not found or not refreshable`);
        }
    }

    // Error classification
    classifyError(error) {
        const message = error.message?.toLowerCase() || '';
        const stack = error.stack?.toLowerCase() || '';
        
        if (message.includes('network') || message.includes('fetch')) {
            return 'NetworkError';
        }
        
        if (message.includes('timeout')) {
            return 'TimeoutError';
        }
        
        if (message.includes('storage') || message.includes('quota')) {
            return 'StorageError';
        }
        
        if (message.includes('permission') || message.includes('unauthorized')) {
            return 'PermissionError';
        }
        
        if (stack.includes('llm') || stack.includes('openrouter')) {
            return 'LLMError';
        }
        
        if (stack.includes('memory') || stack.includes('cache')) {
            return 'MemoryError';
        }
        
        return 'UnknownError';
    }

    // Circuit breaker pattern
    createCircuitBreaker(name, options = {}) {
        const {
            failureThreshold = 5,
            recoveryTimeout = 60000,
            monitoringPeriod = 60000
        } = options;

        return {
            name,
            failures: 0,
            lastFailure: null,
            state: 'closed', // closed, open, half-open
            
            async call(fn, ...args) {
                if (this.state === 'open') {
                    if (Date.now() - this.lastFailure < recoveryTimeout) {
                        throw new Error(`Circuit breaker ${name} is open`);
                    } else {
                        this.state = 'half-open';
                    }
                }
                
                try {
                    const result = await fn(...args);
                    
                    if (this.state === 'half-open') {
                        this.state = 'closed';
                        this.failures = 0;
                    }
                    
                    return result;
                } catch (error) {
                    this.failures++;
                    this.lastFailure = Date.now();
                    
                    if (this.failures >= failureThreshold) {
                        this.state = 'open';
                    }
                    
                    throw error;
                }
            }
        };
    }
}