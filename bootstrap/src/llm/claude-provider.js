/**
 * Claude Provider
 * Claude API integration with streaming support, error handling,
 * retries, and usage optimization.
 * 
 * Follows the LLMProvider interface defined in API_CONTRACTS.md
 */

import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';

export class ClaudeProvider {
    constructor(apiKey = null) {
        this.name = 'claude';
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.anthropic.com/v1/messages';
        this.defaultModel = 'claude-sonnet-4-20250514';
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.timeout = 30000;
        
        this.stats = {
            requests: 0,
            streamingRequests: 0,
            errors: 0,
            retries: 0,
            averageResponseTime: 0,
            totalTokens: 0,
            totalCost: 0
        };
        
        this.rateLimits = {
            requests: { used: 0, limit: 1000, resetTime: 0 },
            tokens: { used: 0, limit: 100000, resetTime: 0 }
        };
        
        this.initialize();
    }

    /**
     * Initialize Claude provider
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Test connection if API key is available
            if (this.apiKey) {
                await this.testConnection();
            }
            
            await logger.info('Claude Provider initialized', {
                model: this.defaultModel,
                hasApiKey: !!this.apiKey,
                timeout: this.timeout,
                maxRetries: this.maxRetries
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'claude_provider_initialization',
                component: 'ClaudeProvider'
            });
        }
    }

    /**
     * Generate completion using Claude API
     * @param {Object} request - Completion request
     * @param {string} request.prompt - The prompt text
     * @param {string} request.model - Model to use (optional)
     * @param {number} request.maxTokens - Maximum tokens to generate
     * @param {number} request.temperature - Sampling temperature
     * @param {boolean} request.stream - Whether to stream response
     * @param {Object} request.systemPrompt - System prompt (optional)
     * @returns {Promise<Object>} Completion response
     */
    async generateCompletion(request) {
        const startTime = performance.now();
        const requestId = this.generateRequestId();
        
        try {
            // Validate request
            this.validateRequest(request);
            
            // Check rate limits
            await this.checkRateLimits(request);
            
            // Prepare Claude API request
            const claudeRequest = this.prepareClaudeRequest(request);
            
            // Attempt request with retries
            let response;
            let attempt = 0;
            let lastError;
            
            while (attempt <= this.maxRetries) {
                try {
                    if (request.stream) {
                        response = await this.streamCompletion(claudeRequest, requestId);
                        this.stats.streamingRequests++;
                    } else {
                        response = await this.standardCompletion(claudeRequest, requestId);
                    }
                    break; // Success, exit retry loop
                    
                } catch (error) {
                    lastError = error;
                    attempt++;
                    
                    if (attempt <= this.maxRetries && this.isRetryableError(error)) {
                        this.stats.retries++;
                        const delay = this.calculateRetryDelay(attempt);
                        
                        await logger.warn(`Claude API retry ${attempt}/${this.maxRetries}`, error, {
                            requestId,
                            delay,
                            attempt
                        });
                        
                        await this.delay(delay);
                    } else {
                        throw error;
                    }
                }
            }
            
            if (!response) {
                throw lastError || new Error('Max retries exceeded');
            }
            
            // Process and validate response
            const processedResponse = this.processResponse(response, request);
            
            // Update statistics
            const responseTime = performance.now() - startTime;
            this.updateStats(responseTime, processedResponse.usage);
            
            await logger.debug('Claude completion generated', {
                requestId,
                model: request.model || this.defaultModel,
                responseTime,
                tokens: processedResponse.usage?.totalTokens || 0,
                streamed: !!request.stream
            });
            
            return processedResponse;
            
        } catch (error) {
            this.stats.errors++;
            
            await errorHandler.handleError(error, {
                operation: 'generate_completion',
                component: 'ClaudeProvider',
                metadata: { 
                    requestId, 
                    model: request.model || this.defaultModel,
                    responseTime: performance.now() - startTime
                }
            });
            
            throw error;
        }
    }

    /**
     * Standard (non-streaming) completion
     * @param {Object} claudeRequest - Prepared Claude request
     * @param {string} requestId - Request ID
     * @returns {Promise<Object>} API response
     */
    async standardCompletion(claudeRequest, requestId) {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(claudeRequest),
            signal: AbortSignal.timeout(this.timeout)
        });
        
        // Update rate limit headers
        this.updateRateLimits(response.headers);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new ClaudeAPIError(
                `Claude API error: ${response.status} ${response.statusText}`,
                response.status,
                errorData,
                requestId
            );
        }
        
        return await response.json();
    }

    /**
     * Streaming completion
     * @param {Object} claudeRequest - Prepared Claude request
     * @param {string} requestId - Request ID
     * @returns {Promise<Object>} Streamed response
     */
    async streamCompletion(claudeRequest, requestId) {
        const streamRequest = {
            ...claudeRequest,
            stream: true
        };
        
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(streamRequest),
            signal: AbortSignal.timeout(this.timeout)
        });
        
        // Update rate limit headers
        this.updateRateLimits(response.headers);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new ClaudeAPIError(
                `Claude API error: ${response.status} ${response.statusText}`,
                response.status,
                errorData,
                requestId
            );
        }
        
        return await this.processStreamResponse(response, requestId);
    }

    /**
     * Process streaming response
     * @param {Response} response - Fetch response
     * @param {string} requestId - Request ID
     * @returns {Promise<Object>} Assembled response
     */
    async processStreamResponse(response, requestId) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let content = '';
        let usage = null;
        let model = null;
        let finishReason = null;
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        
                        if (data === '[DONE]') {
                            break;
                        }
                        
                        try {
                            const event = JSON.parse(data);
                            
                            switch (event.type) {
                                case 'content_block_delta':
                                    if (event.delta?.text) {
                                        content += event.delta.text;
                                    }
                                    break;
                                    
                                case 'message_start':
                                    model = event.message?.model;
                                    usage = event.message?.usage;
                                    break;
                                    
                                case 'message_delta':
                                    finishReason = event.delta?.stop_reason;
                                    if (event.usage) {
                                        usage = { ...usage, ...event.usage };
                                    }
                                    break;
                            }
                            
                        } catch (parseError) {
                            await logger.warn('Failed to parse stream event', parseError, {
                                requestId,
                                data
                            });
                        }
                    }
                }
            }
            
        } finally {
            reader.releaseLock();
        }
        
        return {
            content: [{ text: content }],
            model: model || this.defaultModel,
            usage: usage || { input_tokens: 0, output_tokens: 0 },
            stop_reason: finishReason || 'end_turn'
        };
    }

    /**
     * Prepare Claude API request
     * @param {Object} request - Original request
     * @returns {Object} Claude API request
     */
    prepareClaudeRequest(request) {
        const claudeRequest = {
            model: request.model || this.defaultModel,
            max_tokens: Math.min(request.maxTokens || 4000, 8192), // Claude's limit
            messages: [
                {
                    role: 'user',
                    content: request.prompt
                }
            ]
        };
        
        // Add system prompt if provided
        if (request.systemPrompt) {
            claudeRequest.system = request.systemPrompt;
        }
        
        // Add temperature if specified
        if (request.temperature !== undefined) {
            claudeRequest.temperature = Math.max(0, Math.min(1, request.temperature));
        }
        
        // Add top_p if specified
        if (request.topP !== undefined) {
            claudeRequest.top_p = Math.max(0, Math.min(1, request.topP));
        }
        
        // Add stop sequences if provided
        if (request.stopSequences && Array.isArray(request.stopSequences)) {
            claudeRequest.stop_sequences = request.stopSequences.slice(0, 4); // Claude allows max 4
        }
        
        return claudeRequest;
    }

    /**
     * Process API response
     * @param {Object} response - Raw API response
     * @param {Object} originalRequest - Original request
     * @returns {Object} Processed response
     */
    processResponse(response, originalRequest) {
        // Extract content
        let content = '';
        if (response.content && Array.isArray(response.content)) {
            content = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('');
        }
        
        // Calculate usage and cost
        const usage = this.calculateUsage(response.usage, response.model);
        
        return {
            content,
            model: response.model || this.defaultModel,
            finishReason: response.stop_reason || 'end_turn',
            usage,
            metadata: {
                provider: this.name,
                requestId: originalRequest.requestId,
                timestamp: new Date().toISOString(),
                streamed: !!originalRequest.stream
            }
        };
    }

    /**
     * Calculate usage statistics and cost
     * @param {Object} usage - Usage from API response
     * @param {string} model - Model used
     * @returns {Object} Calculated usage
     */
    calculateUsage(usage, model) {
        if (!usage) {
            return {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                cost: 0
            };
        }
        
        const promptTokens = usage.input_tokens || 0;
        const completionTokens = usage.output_tokens || 0;
        const totalTokens = promptTokens + completionTokens;
        
        // Calculate cost based on model pricing (estimated)
        const pricing = this.getModelPricing(model);
        const cost = (promptTokens * pricing.input / 1000) + (completionTokens * pricing.output / 1000);
        
        return {
            promptTokens,
            completionTokens,
            totalTokens,
            cost: Math.round(cost * 10000) / 10000 // Round to 4 decimal places
        };
    }

    /**
     * Get model pricing (per 1K tokens)
     * @param {string} model - Model name
     * @returns {Object} Pricing information
     */
    getModelPricing(model) {
        const pricing = {
            'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
            'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
            'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
            'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
            'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 } // Default pricing
        };
        
        return pricing[model] || pricing['claude-sonnet-4-20250514'];
    }

    /**
     * Get request headers
     * @returns {Object} Request headers
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
        };
        
        if (this.apiKey) {
            headers['x-api-key'] = this.apiKey;
        }
        
        return headers;
    }

    /**
     * Update rate limit information from response headers
     * @param {Headers} headers - Response headers
     */
    updateRateLimits(headers) {
        // Update request rate limits
        const requestsRemaining = headers.get('anthropic-ratelimit-requests-remaining');
        const requestsLimit = headers.get('anthropic-ratelimit-requests-limit');
        const requestsReset = headers.get('anthropic-ratelimit-requests-reset');
        
        if (requestsRemaining && requestsLimit) {
            this.rateLimits.requests.used = requestsLimit - requestsRemaining;
            this.rateLimits.requests.limit = parseInt(requestsLimit);
            this.rateLimits.requests.resetTime = requestsReset ? 
                new Date(requestsReset).getTime() : 0;
        }
        
        // Update token rate limits
        const tokensRemaining = headers.get('anthropic-ratelimit-tokens-remaining');
        const tokensLimit = headers.get('anthropic-ratelimit-tokens-limit');
        const tokensReset = headers.get('anthropic-ratelimit-tokens-reset');
        
        if (tokensRemaining && tokensLimit) {
            this.rateLimits.tokens.used = tokensLimit - tokensRemaining;
            this.rateLimits.tokens.limit = parseInt(tokensLimit);
            this.rateLimits.tokens.resetTime = tokensReset ? 
                new Date(tokensReset).getTime() : 0;
        }
    }

    /**
     * Check rate limits before making request
     * @param {Object} request - Request to check
     * @returns {Promise<void>}
     */
    async checkRateLimits(request) {
        const now = Date.now();
        
        // Check request rate limit
        if (this.rateLimits.requests.used >= this.rateLimits.requests.limit &&
            now < this.rateLimits.requests.resetTime) {
            const waitTime = this.rateLimits.requests.resetTime - now;
            throw new ClaudeAPIError(
                `Request rate limit exceeded. Reset in ${Math.ceil(waitTime / 1000)}s`,
                429,
                { type: 'rate_limit', resetTime: this.rateLimits.requests.resetTime }
            );
        }
        
        // Check token rate limit (estimate)
        const estimatedTokens = this.estimateTokens(request.prompt);
        if (this.rateLimits.tokens.used + estimatedTokens >= this.rateLimits.tokens.limit &&
            now < this.rateLimits.tokens.resetTime) {
            const waitTime = this.rateLimits.tokens.resetTime - now;
            throw new ClaudeAPIError(
                `Token rate limit exceeded. Reset in ${Math.ceil(waitTime / 1000)}s`,
                429,
                { type: 'rate_limit', resetTime: this.rateLimits.tokens.resetTime }
            );
        }
    }

    /**
     * Estimate token count for text (rough approximation)
     * @param {string} text - Text to estimate
     * @returns {number} Estimated token count
     */
    estimateTokens(text) {
        // Rough approximation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    /**
     * Validate request parameters
     * @param {Object} request - Request to validate
     */
    validateRequest(request) {
        if (!request.prompt || typeof request.prompt !== 'string') {
            throw new Error('Prompt is required and must be a string');
        }
        
        if (request.prompt.length > 200000) { // Claude's approximate limit
            throw new Error('Prompt is too long for Claude API');
        }
        
        if (request.maxTokens && (request.maxTokens <= 0 || request.maxTokens > 8192)) {
            throw new Error('maxTokens must be between 1 and 8192 for Claude');
        }
        
        if (request.temperature !== undefined && 
            (request.temperature < 0 || request.temperature > 1)) {
            throw new Error('temperature must be between 0 and 1 for Claude');
        }
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is retryable
     */
    isRetryableError(error) {
        if (error instanceof ClaudeAPIError) {
            // Retry on server errors and rate limits (but not auth errors)
            return error.status >= 500 || error.status === 429;
        }
        
        // Retry on network errors
        return error.name === 'TypeError' || error.name === 'AbortError';
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt - Attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt) {
        return this.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
    }

    /**
     * Test API connection
     * @returns {Promise<boolean>} Whether connection is successful
     */
    async testConnection() {
        try {
            const testRequest = {
                prompt: 'Hello',
                maxTokens: 10,
                temperature: 0
            };
            
            await this.generateCompletion(testRequest);
            return true;
            
        } catch (error) {
            await logger.warn('Claude API connection test failed', error);
            return false;
        }
    }

    /**
     * Load configuration
     */
    async loadConfiguration() {
        try {
            const apiEndpoints = await configManager.getApiEndpoints();
            if (apiEndpoints.claude) {
                this.baseUrl = apiEndpoints.claude;
            }
            
            this.defaultModel = configManager.get('api.claude.model') || this.defaultModel;
            
            const performanceSettings = await configManager.getPerformanceSettings();
            this.timeout = performanceSettings.timeout || this.timeout;
            this.maxRetries = performanceSettings.retry?.attempts || this.maxRetries;
            this.retryDelay = performanceSettings.retry?.delay || this.retryDelay;
            
        } catch (error) {
            await logger.warn('Failed to load Claude provider configuration', error);
        }
    }

    /**
     * Update statistics
     * @param {number} responseTime - Response time in ms
     * @param {Object} usage - Usage information
     */
    updateStats(responseTime, usage) {
        this.stats.requests++;
        
        // Update average response time
        const totalTime = this.stats.averageResponseTime * (this.stats.requests - 1);
        this.stats.averageResponseTime = (totalTime + responseTime) / this.stats.requests;
        
        // Update token and cost statistics
        if (usage) {
            this.stats.totalTokens += usage.totalTokens || 0;
            this.stats.totalCost += usage.cost || 0;
        }
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     */
    generateRequestId() {
        return `claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Delay execution
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get provider statistics
     * @returns {Object} Provider statistics
     */
    getStats() {
        return {
            ...this.stats,
            rateLimits: this.rateLimits,
            errorRate: this.stats.requests > 0 ? this.stats.errors / this.stats.requests : 0,
            averageCostPerRequest: this.stats.requests > 0 ? this.stats.totalCost / this.stats.requests : 0
        };
    }

    /**
     * Set API key
     * @param {string} apiKey - Claude API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }
}

/**
 * Custom error class for Claude API errors
 */
class ClaudeAPIError extends Error {
    constructor(message, status, data = {}, requestId = null) {
        super(message);
        this.name = 'ClaudeAPIError';
        this.status = status;
        this.data = data;
        this.requestId = requestId;
    }
}

// Export classes
export { ClaudeAPIError };

// Export for ES6 modules
export default ClaudeProvider;