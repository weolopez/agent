/**
 * Error Handler System
 * Comprehensive error handling with classification, recovery strategies,
 * and user-friendly error messaging.
 * 
 * Follows the ErrorHandler interface defined in API_CONTRACTS.md
 */

import { logger } from './logger.js';

export class ErrorHandler {
    constructor() {
        this.errorTypeHandlers = new Map();
        this.recoveryStrategies = new Map();
        this.errorStats = {
            totalErrors: 0,
            errorsByCategory: {},
            errorsBySeverity: {},
            recoverySuccessRate: 0,
            averageResolutionTime: 0
        };
        this.errorHistory = [];
        this.maxHistorySize = 1000;
        
        this.initializeDefaultHandlers();
        this.setupGlobalErrorHandling();
    }

    /**
     * Initialize default error type handlers
     */
    initializeDefaultHandlers() {
        // Network errors
        this.registerErrorType('NetworkError', async (error, context) => {
            return {
                handled: true,
                recoveryApplied: await this.executeRecovery(
                    this.getNetworkRecoveryStrategy(), context
                ),
                userMessage: 'Connection issue detected. Retrying...',
                suggestedAction: 'Check your internet connection',
                retryable: true
            };
        });

        // Validation errors
        this.registerErrorType('ValidationError', async (error, context) => {
            return {
                handled: true,
                recoveryApplied: false,
                userMessage: this.getUserFriendlyMessage(error),
                suggestedAction: 'Please correct the highlighted fields',
                retryable: false
            };
        });

        // Configuration errors
        this.registerErrorType('ConfigurationError', async (error, context) => {
            return {
                handled: true,
                recoveryApplied: await this.executeRecovery(
                    this.getConfigRecoveryStrategy(), context
                ),
                userMessage: 'Configuration issue detected',
                suggestedAction: 'System will attempt to use default settings',
                retryable: true
            };
        });

        // Memory errors
        this.registerErrorType('MemoryError', async (error, context) => {
            return {
                handled: true,
                recoveryApplied: await this.executeRecovery(
                    this.getMemoryRecoveryStrategy(), context
                ),
                userMessage: 'Memory limit reached. Cleaning up...',
                suggestedAction: 'Consider reducing the scope of your request',
                retryable: true
            };
        });

        // API errors
        this.registerErrorType('APIError', async (error, context) => {
            const isRateLimit = error.message.includes('rate limit') || 
                              error.message.includes('429');
            
            if (isRateLimit) {
                return {
                    handled: true,
                    recoveryApplied: await this.executeRecovery(
                        this.getRateLimitRecoveryStrategy(), context
                    ),
                    userMessage: 'Service temporarily busy. Retrying...',
                    suggestedAction: 'Please wait a moment',
                    retryable: true
                };
            }
            
            return {
                handled: true,
                recoveryApplied: false,
                userMessage: 'Service temporarily unavailable',
                suggestedAction: 'Please try again later',
                retryable: true
            };
        });
    }

    /**
     * Setup global error handling for unhandled errors
     */
    setupGlobalErrorHandling() {
        // Handle unhandled promise rejections
        if (typeof window !== 'undefined') {
            window.addEventListener('unhandledrejection', (event) => {
                this.handleError(event.reason, {
                    operation: 'unhandled_promise_rejection',
                    component: 'global'
                });
            });

            // Handle script errors
            window.addEventListener('error', (event) => {
                this.handleError(new Error(event.message), {
                    operation: 'script_error',
                    component: 'global',
                    metadata: {
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno
                    }
                });
            });
        }
    }

    /**
     * Handle an error with appropriate classification and recovery
     * @param {Error} error - Error to handle
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Error handle result
     */
    async handleError(error, context = {}) {
        const startTime = performance.now();
        
        try {
            // Classify the error
            const classification = this.classifyError(error);
            
            // Enhance context with classification
            const enhancedContext = {
                ...context,
                classification,
                timestamp: new Date().toISOString(),
                errorId: this.generateErrorId()
            };

            // Log the error
            await logger.error(
                `${classification.category} error in ${context.operation || 'unknown'}`,
                error,
                enhancedContext
            );

            // Update statistics
            this.updateErrorStats(classification, startTime);

            // Add to history
            this.addToHistory(error, enhancedContext);

            // Try to find a specific handler
            const handler = this.findErrorHandler(error, classification);
            
            let result;
            if (handler) {
                result = await handler(error, enhancedContext);
            } else {
                // Use default handling
                result = await this.defaultErrorHandler(error, enhancedContext);
            }

            // Update recovery success rate
            if (result.recoveryApplied) {
                this.updateRecoveryStats(true, performance.now() - startTime);
            }

            return result;

        } catch (handlingError) {
            // Error in error handling - this is critical
            console.error('Critical: Error in error handler:', handlingError);
            await logger.error('Error handler failure', handlingError, context);
            
            return {
                handled: false,
                recoveryApplied: false,
                userMessage: 'An unexpected error occurred',
                suggestedAction: 'Please refresh the page and try again',
                retryable: false
            };
        }
    }

    /**
     * Classify an error into category, severity, and recovery info
     * @param {Error} error - Error to classify
     * @returns {Object} Error classification
     */
    classifyError(error) {
        const message = error.message.toLowerCase();
        const name = error.name.toLowerCase();
        
        // Network-related errors
        if (name.includes('network') || 
            message.includes('fetch') || 
            message.includes('connection') ||
            message.includes('timeout')) {
            return {
                category: 'network',
                severity: 'medium',
                recoverable: true,
                userFacing: true
            };
        }
        
        // Validation errors
        if (name.includes('validation') || 
            message.includes('invalid') || 
            message.includes('required') ||
            message.includes('must be')) {
            return {
                category: 'validation',
                severity: 'low',
                recoverable: false,
                userFacing: true
            };
        }
        
        // System/Internal errors
        if (name.includes('reference') || 
            name.includes('type') || 
            message.includes('undefined') ||
            message.includes('null')) {
            return {
                category: 'system',
                severity: 'high',
                recoverable: false,
                userFacing: false
            };
        }
        
        // Memory errors
        if (message.includes('memory') || 
            message.includes('quota') || 
            message.includes('storage')) {
            return {
                category: 'system',
                severity: 'medium',
                recoverable: true,
                userFacing: true
            };
        }
        
        // External service errors
        if (message.includes('api') || 
            message.includes('service') || 
            message.includes('server') ||
            error.status) {
            return {
                category: 'external',
                severity: 'medium',
                recoverable: true,
                userFacing: true
            };
        }
        
        // Default classification
        return {
            category: 'user',
            severity: 'low',
            recoverable: false,
            userFacing: true
        };
    }

    /**
     * Find appropriate error handler for error type
     * @param {Error} error
     * @param {Object} classification
     * @returns {Function|null}
     */
    findErrorHandler(error, classification) {
        // Try exact error name match first
        if (this.errorTypeHandlers.has(error.name)) {
            return this.errorTypeHandlers.get(error.name);
        }
        
        // Try category-based handler
        const categoryHandler = `${classification.category}Error`;
        if (this.errorTypeHandlers.has(categoryHandler)) {
            return this.errorTypeHandlers.get(categoryHandler);
        }
        
        // Try pattern matching in error message
        for (const [pattern, handler] of this.errorTypeHandlers) {
            if (error.message.toLowerCase().includes(pattern.toLowerCase())) {
                return handler;
            }
        }
        
        return null;
    }

    /**
     * Default error handler for unhandled error types
     * @param {Error} error
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    async defaultErrorHandler(error, context) {
        const { classification } = context;
        
        return {
            handled: true,
            recoveryApplied: false,
            userMessage: this.getUserFriendlyMessage(error),
            suggestedAction: classification.recoverable ? 
                'Please try again' : 
                'Please contact support if this continues',
            retryable: classification.recoverable
        };
    }

    /**
     * Get recovery strategy for an error
     * @param {Error} error - Error object
     * @returns {Promise<Object|null>} Recovery strategy
     */
    async getRecoveryStrategy(error) {
        const classification = this.classifyError(error);
        
        if (!classification.recoverable) {
            return null;
        }
        
        switch (classification.category) {
            case 'network':
                return this.getNetworkRecoveryStrategy();
            case 'system':
                if (error.message.includes('memory')) {
                    return this.getMemoryRecoveryStrategy();
                }
                return this.getConfigRecoveryStrategy();
            case 'external':
                if (error.message.includes('rate limit')) {
                    return this.getRateLimitRecoveryStrategy();
                }
                return this.getRetryRecoveryStrategy();
            default:
                return this.getRetryRecoveryStrategy();
        }
    }

    /**
     * Execute a recovery strategy
     * @param {Object} strategy - Recovery strategy
     * @param {Object} context - Error context
     * @returns {Promise<boolean>} Success status
     */
    async executeRecovery(strategy, context) {
        if (!strategy) {
            return false;
        }
        
        const maxAttempts = strategy.maxAttempts || 3;
        let attempt = 0;
        
        while (attempt < maxAttempts) {
            try {
                for (const step of strategy.steps) {
                    // Check if step condition is met
                    if (step.condition && !step.condition(context)) {
                        continue;
                    }
                    
                    await step.action(context);
                }
                
                return true;
                
            } catch (recoveryError) {
                attempt++;
                await logger.warn(
                    `Recovery attempt ${attempt} failed`,
                    recoveryError,
                    { strategy: strategy.name, context }
                );
                
                if (attempt < maxAttempts) {
                    await this.delay(strategy.timeout || 1000);
                }
            }
        }
        
        return false;
    }

    /**
     * Register custom error type handler
     * @param {string} type - Error type name
     * @param {Function} handler - Error handler function
     */
    registerErrorType(type, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Error handler must be a function');
        }
        
        this.errorTypeHandlers.set(type, handler);
    }

    /**
     * Unregister error type handler
     * @param {string} type - Error type name
     */
    unregisterErrorType(type) {
        this.errorTypeHandlers.delete(type);
    }

    /**
     * Get user-friendly error message
     * @param {Error} error - Error object
     * @returns {string} User-friendly message
     */
    getUserFriendlyMessage(error) {
        const message = error.message.toLowerCase();
        
        // Network errors
        if (message.includes('fetch') || message.includes('network')) {
            return 'Unable to connect to service. Please check your connection.';
        }
        
        // Validation errors
        if (message.includes('required')) {
            return 'Please fill in all required fields.';
        }
        
        if (message.includes('invalid')) {
            return 'Please check your input and try again.';
        }
        
        // Memory errors
        if (message.includes('quota') || message.includes('storage')) {
            return 'Storage limit reached. Please clear some data.';
        }
        
        // Rate limiting
        if (message.includes('rate limit') || message.includes('429')) {
            return 'Service is busy. Please wait a moment and try again.';
        }
        
        // Generic user message
        if (error.message && error.message.length < 100) {
            return error.message;
        }
        
        return 'An error occurred. Please try again.';
    }

    /**
     * Check if error should be retried
     * @param {Error} error - Error object
     * @returns {boolean}
     */
    shouldRetry(error) {
        const classification = this.classifyError(error);
        
        // Don't retry validation errors
        if (classification.category === 'validation') {
            return false;
        }
        
        // Don't retry system errors
        if (classification.category === 'system' && 
            classification.severity === 'high') {
            return false;
        }
        
        return classification.recoverable;
    }

    /**
     * Get error statistics
     * @returns {Promise<Object>}
     */
    async getErrorStats() {
        return {
            ...this.errorStats,
            recentErrors: this.errorHistory.slice(-10).map(entry => ({
                timestamp: entry.timestamp,
                category: entry.classification.category,
                severity: entry.classification.severity,
                message: entry.error.message.substring(0, 100)
            }))
        };
    }

    /**
     * Get error trends over time
     * @returns {Promise<Array>}
     */
    async getErrorTrends() {
        const trends = [];
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        // Group errors by hour for the last 24 hours
        for (let i = 23; i >= 0; i--) {
            const startTime = now - (i + 1) * oneHour;
            const endTime = now - i * oneHour;
            
            const errorsInPeriod = this.errorHistory.filter(entry => {
                const errorTime = new Date(entry.timestamp).getTime();
                return errorTime >= startTime && errorTime < endTime;
            });
            
            const categoryBreakdown = {};
            errorsInPeriod.forEach(entry => {
                const category = entry.classification.category;
                categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
            });
            
            trends.push({
                timestamp: new Date(endTime).toISOString(),
                errorCount: errorsInPeriod.length,
                category: Object.keys(categoryBreakdown).reduce((a, b) => 
                    categoryBreakdown[a] > categoryBreakdown[b] ? a : b, 'none'
                ),
                pattern: this.identifyErrorPattern(errorsInPeriod)
            });
        }
        
        return trends;
    }

    // Recovery Strategy Definitions

    getNetworkRecoveryStrategy() {
        return {
            name: 'network_recovery',
            maxAttempts: 3,
            timeout: 2000,
            steps: [
                {
                    name: 'wait_and_retry',
                    action: async (context) => {
                        await this.delay(1000);
                    }
                },
                {
                    name: 'check_connection',
                    action: async (context) => {
                        if (navigator.onLine === false) {
                            throw new Error('Device is offline');
                        }
                    }
                }
            ]
        };
    }

    getMemoryRecoveryStrategy() {
        return {
            name: 'memory_recovery',
            maxAttempts: 2,
            timeout: 1000,
            steps: [
                {
                    name: 'clear_cache',
                    action: async (context) => {
                        // Trigger cache cleanup
                        if (window.cacheManager) {
                            await window.cacheManager.l1.clear();
                        }
                    }
                },
                {
                    name: 'garbage_collect',
                    action: async (context) => {
                        // Force garbage collection if available
                        if (window.gc) {
                            window.gc();
                        }
                    }
                }
            ]
        };
    }

    getConfigRecoveryStrategy() {
        return {
            name: 'config_recovery',
            maxAttempts: 1,
            timeout: 1000,
            steps: [
                {
                    name: 'reset_to_defaults',
                    action: async (context) => {
                        if (window.configManager) {
                            await window.configManager.reset();
                        }
                    }
                }
            ]
        };
    }

    getRateLimitRecoveryStrategy() {
        return {
            name: 'rate_limit_recovery',
            maxAttempts: 1,
            timeout: 5000,
            steps: [
                {
                    name: 'exponential_backoff',
                    action: async (context) => {
                        const attemptNumber = context.attemptNumber || 1;
                        const delay = Math.min(1000 * Math.pow(2, attemptNumber), 10000);
                        await this.delay(delay);
                    }
                }
            ]
        };
    }

    getRetryRecoveryStrategy() {
        return {
            name: 'basic_retry',
            maxAttempts: 3,
            timeout: 1000,
            steps: [
                {
                    name: 'simple_retry',
                    action: async (context) => {
                        await this.delay(500);
                    }
                }
            ]
        };
    }

    // Utility Methods

    /**
     * Generate unique error ID
     * @returns {string}
     */
    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update error statistics
     * @param {Object} classification
     * @param {number} startTime
     */
    updateErrorStats(classification, startTime) {
        this.errorStats.totalErrors++;
        
        const category = classification.category;
        this.errorStats.errorsByCategory[category] = 
            (this.errorStats.errorsByCategory[category] || 0) + 1;
        
        const severity = classification.severity;
        this.errorStats.errorsBySeverity[severity] = 
            (this.errorStats.errorsBySeverity[severity] || 0) + 1;
        
        // Update average resolution time
        const resolutionTime = performance.now() - startTime;
        const totalTime = this.errorStats.averageResolutionTime * (this.errorStats.totalErrors - 1);
        this.errorStats.averageResolutionTime = (totalTime + resolutionTime) / this.errorStats.totalErrors;
    }

    /**
     * Update recovery success statistics
     * @param {boolean} success
     * @param {number} resolutionTime
     */
    updateRecoveryStats(success, resolutionTime) {
        const totalRecoveries = this.errorHistory.filter(e => e.recoveryAttempted).length;
        const successfulRecoveries = this.errorHistory.filter(e => e.recoverySuccessful).length;
        
        this.errorStats.recoverySuccessRate = totalRecoveries > 0 ? 
            successfulRecoveries / totalRecoveries : 0;
    }

    /**
     * Add error to history
     * @param {Error} error
     * @param {Object} context
     */
    addToHistory(error, context) {
        this.errorHistory.push({
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            timestamp: context.timestamp,
            classification: context.classification
        });
        
        // Maintain history size limit
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Identify error patterns in a set of errors
     * @param {Array} errors
     * @returns {string|null}
     */
    identifyErrorPattern(errors) {
        if (errors.length < 3) {
            return null;
        }
        
        // Check for repeated error messages
        const messageFreq = {};
        errors.forEach(error => {
            const msg = error.error.message.substring(0, 50);
            messageFreq[msg] = (messageFreq[msg] || 0) + 1;
        });
        
        const mostCommon = Object.keys(messageFreq).reduce((a, b) => 
            messageFreq[a] > messageFreq[b] ? a : b
        );
        
        if (messageFreq[mostCommon] >= errors.length * 0.7) {
            return `repeated_error: ${mostCommon}`;
        }
        
        return null;
    }

    /**
     * Delay utility function
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Create and export singleton instance
export const errorHandler = new ErrorHandler();

// Export for ES6 modules
export default ErrorHandler;