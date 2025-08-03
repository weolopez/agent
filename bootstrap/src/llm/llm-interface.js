/**
 * LLM Interface
 * Abstract interface for Large Language Model providers with provider abstraction,
 * response validation, usage tracking, and fallback management.
 * 
 * Follows the LLMInterface defined in API_CONTRACTS.md
 */

import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';
import { cacheSystem } from '../core/cache.js';

export class LLMInterface {
    constructor() {
        this.providers = new Map();
        this.currentProvider = null;
        this.fallbackProviders = [];
        this.usageStats = {
            totalRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            providerStats: {},
            errorRate: 0,
            averageResponseTime: 0
        };
        this.rateLimiter = new RateLimiter();
        this.responseValidator = new ResponseValidator();
        
        this.initialize();
    }

    /**
     * Initialize LLM interface
     */
    async initialize() {
        try {
            await logger.info('LLM Interface initializing');
            
            // Load configuration
            await this.loadConfiguration();
            
            // Initialize rate limiter
            await this.rateLimiter.initialize();
            
            await logger.info('LLM Interface initialized', {
                providers: Array.from(this.providers.keys()),
                currentProvider: this.currentProvider?.name,
                fallbackProviders: this.fallbackProviders.map(p => p.name)
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'llm_interface_initialization',
                component: 'LLMInterface'
            });
        }
    }

    /**
     * Register an LLM provider
     * @param {LLMProvider} provider - Provider instance
     * @param {Object} config - Provider configuration
     * @returns {Promise<void>}
     */
    async registerProvider(provider, config = {}) {
        try {
            if (!provider || typeof provider.generateCompletion !== 'function') {
                throw new Error('Provider must implement generateCompletion method');
            }

            // Validate provider configuration
            this.validateProviderConfig(provider, config);

            // Register the provider
            this.providers.set(provider.name, {
                instance: provider,
                config,
                stats: {
                    requests: 0,
                    tokens: 0,
                    cost: 0,
                    errors: 0,
                    averageResponseTime: 0,
                    isAvailable: true,
                    lastError: null,
                    lastSuccessful: null
                }
            });

            // Set as current provider if it's the first or designated as primary
            if (!this.currentProvider || config.primary) {
                this.currentProvider = this.providers.get(provider.name);
            }

            // Add to fallback list if configured
            if (config.fallback) {
                this.fallbackProviders.push(this.providers.get(provider.name));
                // Sort fallback providers by priority
                this.fallbackProviders.sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0));
            }

            await logger.info('LLM provider registered', {
                providerName: provider.name,
                isPrimary: config.primary || false,
                isFallback: config.fallback || false,
                priority: config.priority || 0
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'register_provider',
                component: 'LLMInterface',
                metadata: { providerName: provider.name }
            });
            throw error;
        }
    }

    /**
     * Generate completion using current provider with fallback support
     * @param {Object} request - Completion request
     * @param {string} request.prompt - The prompt text
     * @param {Object} request.options - Generation options
     * @param {boolean} request.useCache - Whether to use response cache
     * @returns {Promise<Object>} Completion response
     */
    async generateCompletion(request) {
        const startTime = performance.now();
        const requestId = this.generateRequestId();
        
        try {
            // Validate request
            this.validateCompletionRequest(request);
            
            // Check cache if enabled
            if (request.useCache !== false) {
                const cached = await this.getCachedResponse(request);
                if (cached) {
                    await this.updateUsageStats(startTime, true, cached.tokens || 0, 0);
                    return cached;
                }
            }
            
            // Rate limiting check
            await this.rateLimiter.checkLimit(request);
            
            // Attempt generation with current provider
            let response = await this.attemptGeneration(this.currentProvider, request, requestId);
            
            // If primary provider failed, try fallback providers
            if (!response.success && this.fallbackProviders.length > 0) {
                for (const fallbackProvider of this.fallbackProviders) {
                    if (fallbackProvider.stats.isAvailable) {
                        response = await this.attemptGeneration(fallbackProvider, request, requestId);
                        if (response.success) break;
                    }
                }
            }
            
            // If all providers failed, throw error
            if (!response.success) {
                throw new Error(`All LLM providers failed: ${response.error}`);
            }
            
            // Validate response
            const validatedResponse = await this.responseValidator.validate(response.data, request);
            
            // Cache successful response
            if (request.useCache !== false && validatedResponse.valid) {
                await this.cacheResponse(request, validatedResponse.response);
            }
            
            // Update usage statistics
            await this.updateUsageStats(
                startTime, 
                false, 
                validatedResponse.response.usage?.totalTokens || 0,
                validatedResponse.response.usage?.cost || 0
            );
            
            await logger.debug('LLM completion generated', {
                requestId,
                provider: response.provider,
                responseTime: performance.now() - startTime,
                tokens: validatedResponse.response.usage?.totalTokens || 0,
                cached: false
            });
            
            return validatedResponse.response;
            
        } catch (error) {
            await this.updateUsageStats(startTime, false, 0, 0, true);
            
            await errorHandler.handleError(error, {
                operation: 'generate_completion',
                component: 'LLMInterface',
                metadata: { requestId, request: this.sanitizeRequest(request) }
            });
            
            throw error;
        }
    }

    /**
     * Attempt generation with a specific provider
     * @param {Object} providerData - Provider data object
     * @param {Object} request - Completion request
     * @param {string} requestId - Request ID for tracking
     * @returns {Promise<Object>} Generation result
     */
    async attemptGeneration(providerData, request, requestId) {
        if (!providerData || !providerData.stats.isAvailable) {
            return {
                success: false,
                error: 'Provider not available',
                provider: providerData?.instance?.name || 'unknown'
            };
        }
        
        const provider = providerData.instance;
        const startTime = performance.now();
        
        try {
            // Prepare provider-specific request
            const providerRequest = this.prepareProviderRequest(request, providerData.config);
            
            // Generate completion
            const response = await provider.generateCompletion(providerRequest);
            
            // Update provider stats on success
            const responseTime = performance.now() - startTime;
            this.updateProviderStats(providerData, responseTime, response.usage?.totalTokens || 0, false);
            
            await logger.debug('Provider generation successful', {
                provider: provider.name,
                requestId,
                responseTime,
                tokens: response.usage?.totalTokens || 0
            });
            
            return {
                success: true,
                data: response,
                provider: provider.name,
                responseTime
            };
            
        } catch (error) {
            // Update provider stats on error
            const responseTime = performance.now() - startTime;
            this.updateProviderStats(providerData, responseTime, 0, true);
            
            await logger.warn('Provider generation failed', error, {
                provider: provider.name,
                requestId,
                responseTime
            });
            
            return {
                success: false,
                error: error.message,
                provider: provider.name,
                responseTime
            };
        }
    }

    /**
     * Prepare provider-specific request
     * @param {Object} request - Original request
     * @param {Object} config - Provider configuration
     * @returns {Object} Provider-specific request
     */
    prepareProviderRequest(request, config) {
        const providerRequest = {
            ...request,
            ...config.defaultOptions
        };
        
        // Apply provider-specific transformations
        if (config.promptTemplate) {
            providerRequest.prompt = config.promptTemplate
                .replace('{prompt}', request.prompt)
                .replace('{context}', request.context || '');
        }
        
        // Apply model override if specified
        if (config.model) {
            providerRequest.model = config.model;
        }
        
        // Apply provider-specific limits
        if (config.maxTokens) {
            providerRequest.maxTokens = Math.min(
                request.maxTokens || config.maxTokens,
                config.maxTokens
            );
        }
        
        return providerRequest;
    }

    /**
     * Get cached response if available
     * @param {Object} request - Completion request
     * @returns {Promise<Object|null>} Cached response
     */
    async getCachedResponse(request) {
        try {
            const cacheKey = this.generateCacheKey(request);
            const result = await cacheSystem.get(cacheKey);
            
            if (result.hit) {
                await logger.debug('Cache hit for LLM request', { cacheKey });
                return {
                    ...result.value,
                    cached: true,
                    cacheKey
                };
            }
        } catch (error) {
            await logger.debug('Cache lookup failed', error);
        }
        
        return null;
    }

    /**
     * Cache response
     * @param {Object} request - Original request
     * @param {Object} response - Response to cache
     * @returns {Promise<void>}
     */
    async cacheResponse(request, response) {
        try {
            const cacheKey = this.generateCacheKey(request);
            const ttl = this.calculateCacheTtl(request, response);
            
            await cacheSystem.set(cacheKey, response, ttl);
            
            await logger.debug('Response cached', { 
                cacheKey, 
                ttl,
                tokens: response.usage?.totalTokens || 0 
            });
            
        } catch (error) {
            await logger.debug('Failed to cache response', error);
        }
    }

    /**
     * Generate cache key for request
     * @param {Object} request - Completion request
     * @returns {string} Cache key
     */
    generateCacheKey(request) {
        const keyComponents = [
            'llm',
            this.hashString(request.prompt),
            request.model || 'default',
            request.maxTokens || 'default',
            request.temperature || 'default'
        ];
        
        return keyComponents.join(':');
    }

    /**
     * Calculate cache TTL based on request characteristics
     * @param {Object} request - Completion request
     * @param {Object} response - Generated response
     * @returns {number} TTL in seconds
     */
    calculateCacheTtl(request, response) {
        let baseTtl = 3600; // 1 hour default
        
        // Longer TTL for deterministic requests (low temperature)
        if (request.temperature !== undefined && request.temperature < 0.3) {
            baseTtl *= 24; // 24 hours for deterministic responses
        }
        
        // Shorter TTL for creative requests (high temperature)
        if (request.temperature !== undefined && request.temperature > 0.8) {
            baseTtl = 300; // 5 minutes for creative responses
        }
        
        // Longer TTL for expensive responses (many tokens)
        if (response.usage?.totalTokens > 1000) {
            baseTtl *= 2;
        }
        
        return baseTtl;
    }

    /**
     * Update provider statistics
     * @param {Object} providerData - Provider data
     * @param {number} responseTime - Response time in ms
     * @param {number} tokens - Tokens used
     * @param {boolean} isError - Whether this was an error
     */
    updateProviderStats(providerData, responseTime, tokens, isError) {
        const stats = providerData.stats;
        
        stats.requests++;
        stats.tokens += tokens;
        
        // Update average response time
        const totalTime = stats.averageResponseTime * (stats.requests - 1);
        stats.averageResponseTime = (totalTime + responseTime) / stats.requests;
        
        if (isError) {
            stats.errors++;
            stats.lastError = new Date().toISOString();
            
            // Mark as unavailable if error rate is too high
            const errorRate = stats.errors / stats.requests;
            if (errorRate > 0.5 && stats.requests > 5) {
                stats.isAvailable = false;
                setTimeout(() => {
                    stats.isAvailable = true; // Re-enable after cooldown
                }, 300000); // 5 minute cooldown
            }
        } else {
            stats.lastSuccessful = new Date().toISOString();
            stats.isAvailable = true;
        }
    }

    /**
     * Update overall usage statistics
     * @param {number} startTime - Request start time
     * @param {boolean} cached - Whether response was cached
     * @param {number} tokens - Tokens used
     * @param {number} cost - Cost of request
     * @param {boolean} isError - Whether this was an error
     */
    async updateUsageStats(startTime, cached, tokens, cost, isError = false) {
        const responseTime = performance.now() - startTime;
        
        this.usageStats.totalRequests++;
        
        if (!cached) {
            this.usageStats.totalTokens += tokens;
            this.usageStats.totalCost += cost;
        }
        
        // Update average response time
        const totalTime = this.usageStats.averageResponseTime * (this.usageStats.totalRequests - 1);
        this.usageStats.averageResponseTime = (totalTime + responseTime) / this.usageStats.totalRequests;
        
        // Update error rate
        if (isError) {
            const errorCount = this.usageStats.errorRate * (this.usageStats.totalRequests - 1) * this.usageStats.totalRequests;
            this.usageStats.errorRate = (errorCount + 1) / this.usageStats.totalRequests;
        }
    }

    /**
     * Validate completion request
     * @param {Object} request - Request to validate
     */
    validateCompletionRequest(request) {
        if (!request || typeof request !== 'object') {
            throw new Error('Request must be an object');
        }
        
        if (!request.prompt || typeof request.prompt !== 'string') {
            throw new Error('Request must include a valid prompt string');
        }
        
        if (request.maxTokens && (typeof request.maxTokens !== 'number' || request.maxTokens <= 0)) {
            throw new Error('maxTokens must be a positive number');
        }
        
        if (request.temperature !== undefined && 
            (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 2)) {
            throw new Error('temperature must be a number between 0 and 2');
        }
    }

    /**
     * Validate provider configuration
     * @param {Object} provider - Provider instance
     * @param {Object} config - Provider configuration
     */
    validateProviderConfig(provider, config) {
        if (!provider.name || typeof provider.name !== 'string') {
            throw new Error('Provider must have a valid name');
        }
        
        if (config.priority !== undefined && 
            (typeof config.priority !== 'number' || config.priority < 0)) {
            throw new Error('Provider priority must be a non-negative number');
        }
        
        if (config.maxTokens !== undefined && 
            (typeof config.maxTokens !== 'number' || config.maxTokens <= 0)) {
            throw new Error('Provider maxTokens must be a positive number');
        }
    }

    /**
     * Load configuration from config manager
     */
    async loadConfiguration() {
        try {
            const performanceSettings = await configManager.getPerformanceSettings();
            
            // Configure rate limiter
            this.rateLimiter.setLimits({
                maxRequestsPerMinute: performanceSettings.concurrency?.maxOperations || 10,
                maxConcurrentRequests: 5
            });
            
        } catch (error) {
            await logger.warn('Failed to load LLM configuration', error);
        }
    }

    /**
     * Sanitize request for logging (remove sensitive data)
     * @param {Object} request - Request to sanitize
     * @returns {Object} Sanitized request
     */
    sanitizeRequest(request) {
        const sanitized = { ...request };
        
        // Truncate long prompts for logging
        if (sanitized.prompt && sanitized.prompt.length > 500) {
            sanitized.prompt = sanitized.prompt.substring(0, 500) + '...';
        }
        
        return sanitized;
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Hash string for cache key generation
     * @param {string} str - String to hash
     * @returns {string} Hash
     */
    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash).toString(36);
    }

    /**
     * Get usage statistics
     * @returns {Object} Usage statistics
     */
    getUsageStats() {
        const providerStats = {};
        
        for (const [name, data] of this.providers) {
            providerStats[name] = {
                ...data.stats,
                errorRate: data.stats.requests > 0 ? data.stats.errors / data.stats.requests : 0
            };
        }
        
        return {
            ...this.usageStats,
            providers: providerStats,
            rateLimiter: this.rateLimiter.getStats()
        };
    }

    /**
     * Switch to a different primary provider
     * @param {string} providerName - Name of provider to switch to
     * @returns {Promise<void>}
     */
    async switchProvider(providerName) {
        if (!this.providers.has(providerName)) {
            throw new Error(`Provider ${providerName} not found`);
        }
        
        const newProvider = this.providers.get(providerName);
        if (!newProvider.stats.isAvailable) {
            throw new Error(`Provider ${providerName} is currently unavailable`);
        }
        
        const oldProvider = this.currentProvider?.instance?.name || 'none';
        this.currentProvider = newProvider;
        
        await logger.info('LLM provider switched', {
            from: oldProvider,
            to: providerName
        });
    }

    /**
     * Reset provider availability (force re-enable)
     * @param {string} providerName - Name of provider to reset
     * @returns {Promise<void>}
     */
    async resetProvider(providerName) {
        if (!this.providers.has(providerName)) {
            throw new Error(`Provider ${providerName} not found`);
        }
        
        const provider = this.providers.get(providerName);
        provider.stats.isAvailable = true;
        provider.stats.errors = 0;
        provider.stats.lastError = null;
        
        await logger.info('LLM provider reset', { providerName });
    }
}

/**
 * Rate Limiter for LLM requests
 */
class RateLimiter {
    constructor() {
        this.limits = {
            maxRequestsPerMinute: 60,
            maxConcurrentRequests: 10
        };
        this.requestHistory = [];
        this.activeRequests = 0;
    }

    async initialize() {
        // Clean up old request history every minute
        setInterval(() => {
            this.cleanupHistory();
        }, 60000);
    }

    setLimits(limits) {
        Object.assign(this.limits, limits);
    }

    async checkLimit(request) {
        // Check concurrent request limit
        if (this.activeRequests >= this.limits.maxConcurrentRequests) {
            throw new Error('Too many concurrent LLM requests');
        }
        
        // Check rate limit
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentRequests = this.requestHistory.filter(time => time > oneMinuteAgo);
        
        if (recentRequests.length >= this.limits.maxRequestsPerMinute) {
            throw new Error('LLM request rate limit exceeded');
        }
        
        // Record this request
        this.requestHistory.push(now);
        this.activeRequests++;
        
        // Schedule cleanup of active request count
        setTimeout(() => {
            this.activeRequests = Math.max(0, this.activeRequests - 1);
        }, 30000); // Assume max 30 second request duration
    }

    cleanupHistory() {
        const oneMinuteAgo = Date.now() - 60000;
        this.requestHistory = this.requestHistory.filter(time => time > oneMinuteAgo);
    }

    getStats() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentRequests = this.requestHistory.filter(time => time > oneMinuteAgo);
        
        return {
            requestsLastMinute: recentRequests.length,
            maxRequestsPerMinute: this.limits.maxRequestsPerMinute,
            activeRequests: this.activeRequests,
            maxConcurrentRequests: this.limits.maxConcurrentRequests
        };
    }
}

/**
 * Response Validator for LLM responses
 */
class ResponseValidator {
    constructor() {
        this.validationRules = new Map();
        this.setupDefaultRules();
    }

    setupDefaultRules() {
        // Basic structure validation
        this.addRule('structure', (response) => {
            if (!response || typeof response !== 'object') {
                return { valid: false, error: 'Response must be an object' };
            }
            
            if (!response.content) {
                return { valid: false, error: 'Response must include content' };
            }
            
            return { valid: true };
        });
        
        // Content quality validation
        this.addRule('content', (response) => {
            if (typeof response.content !== 'string') {
                return { valid: false, error: 'Content must be a string' };
            }
            
            if (response.content.trim().length === 0) {
                return { valid: false, error: 'Content cannot be empty' };
            }
            
            return { valid: true };
        });
        
        // Usage information validation
        this.addRule('usage', (response) => {
            if (response.usage) {
                if (typeof response.usage !== 'object') {
                    return { valid: false, error: 'Usage must be an object' };
                }
                
                if (response.usage.totalTokens && typeof response.usage.totalTokens !== 'number') {
                    return { valid: false, error: 'totalTokens must be a number' };
                }
            }
            
            return { valid: true };
        });
    }

    addRule(name, validator) {
        this.validationRules.set(name, validator);
    }

    async validate(response, request) {
        const errors = [];
        
        for (const [ruleName, validator] of this.validationRules) {
            try {
                const result = validator(response, request);
                if (!result.valid) {
                    errors.push(`${ruleName}: ${result.error}`);
                }
            } catch (error) {
                errors.push(`${ruleName}: Validation error - ${error.message}`);
            }
        }
        
        if (errors.length > 0) {
            return {
                valid: false,
                errors,
                response
            };
        }
        
        return {
            valid: true,
            response
        };
    }
}

// Create and export singleton instance
export const llmInterface = new LLMInterface();

// Export classes for extension
export { RateLimiter, ResponseValidator };

// Export for ES6 modules
export default LLMInterface;