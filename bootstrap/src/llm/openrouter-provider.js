/**
 * OpenRouter Provider
 * OpenRouter API integration supporting multiple models with dynamic selection,
 * cost optimization, and performance monitoring.
 * 
 * Follows the LLMProvider interface defined in API_CONTRACTS.md
 */

import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';

export class OpenRouterProvider {
    constructor(apiKey = null) {
        this.name = 'openrouter';
        this.apiKey = apiKey;
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.modelsUrl = 'https://openrouter.ai/api/v1/models';
        this.defaultModel = 'anthropic/claude-3-sonnet';
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.timeout = 30000;
        
        this.availableModels = new Map();
        this.modelStats = new Map();
        this.costOptimization = {
            enabled: true,
            targetCostPerToken: 0.00001, // $0.01 per 1k tokens
            preferredProviders: ['anthropic', 'openai', 'google']
        };
        
        this.stats = {
            requests: 0,
            errors: 0,
            retries: 0,
            averageResponseTime: 0,
            totalTokens: 0,
            totalCost: 0,
            modelUsage: {},
            costSavings: 0
        };
        
        this.initialize();
    }

    /**
     * Initialize OpenRouter provider
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Load available models
            await this.loadAvailableModels();
            
            // Test connection if API key is available
            if (this.apiKey) {
                await this.testConnection();
            }
            
            await logger.info('OpenRouter Provider initialized', {
                modelsLoaded: this.availableModels.size,
                defaultModel: this.defaultModel,
                costOptimization: this.costOptimization.enabled,
                hasApiKey: !!this.apiKey
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'openrouter_provider_initialization',
                component: 'OpenRouterProvider'
            });
        }
    }

    /**
     * Generate completion using OpenRouter API
     * @param {Object} request - Completion request
     * @param {string} request.prompt - The prompt text
     * @param {string} request.model - Model to use (optional)
     * @param {number} request.maxTokens - Maximum tokens to generate
     * @param {number} request.temperature - Sampling temperature
     * @param {boolean} request.stream - Whether to stream response
     * @param {Object} request.modelPreferences - Model selection preferences
     * @returns {Promise<Object>} Completion response
     */
    async generateCompletion(request) {
        const startTime = performance.now();
        const requestId = this.generateRequestId();
        
        try {
            // Validate request
            this.validateRequest(request);
            
            // Select optimal model
            const selectedModel = await this.selectOptimalModel(request);
            
            // Prepare OpenRouter API request
            const openRouterRequest = this.prepareOpenRouterRequest(request, selectedModel);
            
            // Attempt request with retries
            let response;
            let attempt = 0;
            let lastError;
            
            while (attempt <= this.maxRetries) {
                try {
                    if (request.stream) {
                        response = await this.streamCompletion(openRouterRequest, requestId);
                    } else {
                        response = await this.standardCompletion(openRouterRequest, requestId);
                    }
                    break; // Success, exit retry loop
                    
                } catch (error) {
                    lastError = error;
                    attempt++;
                    
                    if (attempt <= this.maxRetries && this.isRetryableError(error)) {
                        this.stats.retries++;
                        const delay = this.calculateRetryDelay(attempt);
                        
                        await logger.warn(`OpenRouter API retry ${attempt}/${this.maxRetries}`, error, {
                            requestId,
                            model: selectedModel,
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
            const processedResponse = this.processResponse(response, request, selectedModel);
            
            // Update statistics
            const responseTime = performance.now() - startTime;
            this.updateStats(responseTime, processedResponse.usage, selectedModel);
            
            await logger.debug('OpenRouter completion generated', {
                requestId,
                model: selectedModel,
                responseTime,
                tokens: processedResponse.usage?.totalTokens || 0,
                cost: processedResponse.usage?.cost || 0,
                streamed: !!request.stream
            });
            
            return processedResponse;
            
        } catch (error) {
            this.stats.errors++;
            
            await errorHandler.handleError(error, {
                operation: 'generate_completion',
                component: 'OpenRouterProvider',
                metadata: { 
                    requestId, 
                    model: request.model,
                    responseTime: performance.now() - startTime
                }
            });
            
            throw error;
        }
    }

    /**
     * Select optimal model based on request and preferences
     * @param {Object} request - Completion request
     * @returns {Promise<string>} Selected model ID
     */
    async selectOptimalModel(request) {
        // Use explicitly requested model if available
        if (request.model && this.availableModels.has(request.model)) {
            return request.model;
        }
        
        // Use default model if no optimization
        if (!this.costOptimization.enabled) {
            return this.defaultModel;
        }
        
        // Filter models based on requirements
        let candidates = Array.from(this.availableModels.values()).filter(model => {
            // Check if model supports required features
            if (request.stream && !model.supports_streaming) {
                return false;
            }
            
            // Check token limits
            if (request.maxTokens && request.maxTokens > (model.context_length || 4096)) {
                return false;
            }
            
            return true;
        });
        
        // Apply model preferences
        if (request.modelPreferences) {
            candidates = this.applyModelPreferences(candidates, request.modelPreferences);
        }
        
        // Apply cost optimization
        if (this.costOptimization.enabled) {
            candidates = this.applyCostOptimization(candidates, request);
        }
        
        // Select best model
        if (candidates.length === 0) {
            await logger.warn('No suitable models found, using default', {
                requestModel: request.model,
                defaultModel: this.defaultModel
            });
            return this.defaultModel;
        }
        
        // Sort by performance and cost
        candidates.sort((a, b) => {
            const aScore = this.calculateModelScore(a, request);
            const bScore = this.calculateModelScore(b, request);
            return bScore - aScore;
        });
        
        const selected = candidates[0].id;
        
        await logger.debug('Model selected for request', {
            selected,
            candidates: candidates.length,
            requestModel: request.model,
            costOptimization: this.costOptimization.enabled
        });
        
        return selected;
    }

    /**
     * Apply model preferences to candidates
     * @param {Array} candidates - Candidate models
     * @param {Object} preferences - Model preferences
     * @returns {Array} Filtered candidates
     */
    applyModelPreferences(candidates, preferences) {
        let filtered = [...candidates];
        
        // Filter by provider preference
        if (preferences.provider) {
            filtered = filtered.filter(model => 
                model.id.includes(preferences.provider) ||
                model.created_by?.includes(preferences.provider)
            );
        }
        
        // Filter by capability requirements
        if (preferences.capabilities) {
            for (const capability of preferences.capabilities) {
                switch (capability) {
                    case 'coding':
                        filtered = filtered.filter(model => 
                            model.id.includes('code') || 
                            model.id.includes('claude') ||
                            model.id.includes('gpt-4')
                        );
                        break;
                        
                    case 'reasoning':
                        filtered = filtered.filter(model => 
                            model.id.includes('claude') ||
                            model.id.includes('gpt-4') ||
                            model.id.includes('reasoning')
                        );
                        break;
                        
                    case 'creative':
                        filtered = filtered.filter(model => 
                            !model.id.includes('instruct') &&
                            !model.id.includes('code')
                        );
                        break;
                }
            }
        }
        
        // Filter by cost preference
        if (preferences.maxCostPerToken) {
            filtered = filtered.filter(model => 
                this.getModelCost(model) <= preferences.maxCostPerToken
            );
        }
        
        return filtered.length > 0 ? filtered : candidates;
    }

    /**
     * Apply cost optimization to model selection
     * @param {Array} candidates - Candidate models
     * @param {Object} request - Completion request
     * @returns {Array} Cost-optimized candidates
     */
    applyCostOptimization(candidates, request) {
        const targetCost = this.costOptimization.targetCostPerToken;
        
        // Filter models within cost range
        const costEfficient = candidates.filter(model => {
            const cost = this.getModelCost(model);
            return cost <= targetCost * 2; // Allow up to 2x target cost
        });
        
        // If no cost-efficient models, return cheapest options
        if (costEfficient.length === 0) {
            candidates.sort((a, b) => this.getModelCost(a) - this.getModelCost(b));
            return candidates.slice(0, 3); // Top 3 cheapest
        }
        
        return costEfficient;
    }

    /**
     * Calculate model score for selection
     * @param {Object} model - Model information
     * @param {Object} request - Request details
     * @returns {number} Model score
     */
    calculateModelScore(model, request) {
        let score = 0;
        
        // Cost efficiency (lower cost = higher score)
        const cost = this.getModelCost(model);
        const maxCost = 0.0001; // $0.1 per 1k tokens as max
        score += (maxCost - Math.min(cost, maxCost)) / maxCost * 40;
        
        // Performance based on stats
        const modelStats = this.modelStats.get(model.id);
        if (modelStats) {
            // Favor models with good response times
            if (modelStats.averageResponseTime < 5000) score += 20;
            else if (modelStats.averageResponseTime < 10000) score += 10;
            
            // Favor models with low error rates
            const errorRate = modelStats.errors / Math.max(modelStats.requests, 1);
            score += (1 - errorRate) * 20;
        }
        
        // Provider preference
        for (const preferredProvider of this.costOptimization.preferredProviders) {
            if (model.id.includes(preferredProvider)) {
                score += 10;
                break;
            }
        }
        
        // Capability matching
        if (request.modelPreferences?.capabilities) {
            for (const capability of request.modelPreferences.capabilities) {
                if (this.modelSupportsCapability(model, capability)) {
                    score += 15;
                }
            }
        }
        
        return score;
    }

    /**
     * Check if model supports a capability
     * @param {Object} model - Model information
     * @param {string} capability - Capability to check
     * @returns {boolean} Whether model supports capability
     */
    modelSupportsCapability(model, capability) {
        const modelId = model.id.toLowerCase();
        
        switch (capability) {
            case 'coding':
                return modelId.includes('code') || 
                       modelId.includes('claude') || 
                       modelId.includes('gpt-4');
                       
            case 'reasoning':
                return modelId.includes('claude') || 
                       modelId.includes('gpt-4') || 
                       modelId.includes('reasoning');
                       
            case 'creative':
                return !modelId.includes('instruct') && 
                       !modelId.includes('code');
                       
            default:
                return true;
        }
    }

    /**
     * Get model cost per token
     * @param {Object} model - Model information
     * @returns {number} Cost per token
     */
    getModelCost(model) {
        if (model.pricing?.prompt) {
            return parseFloat(model.pricing.prompt) / 1000000; // Convert to per-token
        }
        
        // Fallback estimation based on model type
        const modelId = model.id.toLowerCase();
        if (modelId.includes('claude-3-opus')) return 0.000015;
        if (modelId.includes('claude-3-sonnet')) return 0.000003;
        if (modelId.includes('claude-3-haiku')) return 0.00000025;
        if (modelId.includes('gpt-4')) return 0.00003;
        if (modelId.includes('gpt-3.5')) return 0.0000015;
        
        return 0.00001; // Default estimate
    }

    /**
     * Load available models from OpenRouter
     * @returns {Promise<void>}
     */
    async loadAvailableModels() {
        try {
            const response = await fetch(this.modelsUrl, {
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(10000)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load models: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.data && Array.isArray(data.data)) {
                this.availableModels.clear();
                
                for (const model of data.data) {
                    this.availableModels.set(model.id, model);
                    
                    // Initialize model stats if not exists
                    if (!this.modelStats.has(model.id)) {
                        this.modelStats.set(model.id, {
                            requests: 0,
                            errors: 0,
                            averageResponseTime: 0,
                            totalTokens: 0,
                            totalCost: 0
                        });
                    }
                }
                
                await logger.info('OpenRouter models loaded', {
                    count: this.availableModels.size,
                    defaultModel: this.defaultModel
                });
            }
            
        } catch (error) {
            await logger.warn('Failed to load OpenRouter models', error);
            
            // Set minimal model set as fallback
            this.availableModels.set(this.defaultModel, {
                id: this.defaultModel,
                context_length: 8192,
                supports_streaming: true
            });
        }
    }

    /**
     * Standard (non-streaming) completion
     * @param {Object} openRouterRequest - Prepared OpenRouter request
     * @param {string} requestId - Request ID
     * @returns {Promise<Object>} API response
     */
    async standardCompletion(openRouterRequest, requestId) {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(openRouterRequest),
            signal: AbortSignal.timeout(this.timeout)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new OpenRouterAPIError(
                `OpenRouter API error: ${response.status} ${response.statusText}`,
                response.status,
                errorData,
                requestId
            );
        }
        
        return await response.json();
    }

    /**
     * Streaming completion
     * @param {Object} openRouterRequest - Prepared OpenRouter request
     * @param {string} requestId - Request ID
     * @returns {Promise<Object>} Streamed response
     */
    async streamCompletion(openRouterRequest, requestId) {
        const streamRequest = {
            ...openRouterRequest,
            stream: true
        };
        
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(streamRequest),
            signal: AbortSignal.timeout(this.timeout)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new OpenRouterAPIError(
                `OpenRouter API error: ${response.status} ${response.statusText}`,
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
                            
                            if (event.choices && event.choices[0]) {
                                const choice = event.choices[0];
                                
                                if (choice.delta?.content) {
                                    content += choice.delta.content;
                                }
                                
                                if (choice.finish_reason) {
                                    finishReason = choice.finish_reason;
                                }
                            }
                            
                            if (event.model) {
                                model = event.model;
                            }
                            
                            if (event.usage) {
                                usage = event.usage;
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
            choices: [
                {
                    message: { content },
                    finish_reason: finishReason || 'stop'
                }
            ],
            model: model || 'unknown',
            usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
    }

    /**
     * Prepare OpenRouter API request
     * @param {Object} request - Original request
     * @param {string} model - Selected model ID
     * @returns {Object} OpenRouter API request
     */
    prepareOpenRouterRequest(request, model) {
        const openRouterRequest = {
            model,
            messages: [
                {
                    role: 'user',
                    content: request.prompt
                }
            ],
            max_tokens: request.maxTokens || 1000
        };
        
        // Add system message if provided
        if (request.systemPrompt) {
            openRouterRequest.messages.unshift({
                role: 'system',
                content: request.systemPrompt
            });
        }
        
        // Add temperature if specified
        if (request.temperature !== undefined) {
            openRouterRequest.temperature = Math.max(0, Math.min(2, request.temperature));
        }
        
        // Add top_p if specified
        if (request.topP !== undefined) {
            openRouterRequest.top_p = Math.max(0, Math.min(1, request.topP));
        }
        
        // Add stop sequences if provided
        if (request.stopSequences && Array.isArray(request.stopSequences)) {
            openRouterRequest.stop = request.stopSequences;
        }
        
        // Add OpenRouter-specific headers
        if (request.transforms) {
            openRouterRequest.transforms = request.transforms;
        }
        
        return openRouterRequest;
    }

    /**
     * Process API response
     * @param {Object} response - Raw API response
     * @param {Object} originalRequest - Original request
     * @param {string} selectedModel - Selected model ID
     * @returns {Object} Processed response
     */
    processResponse(response, originalRequest, selectedModel) {
        // Extract content
        let content = '';
        let finishReason = 'stop';
        
        if (response.choices && response.choices[0]) {
            const choice = response.choices[0];
            content = choice.message?.content || '';
            finishReason = choice.finish_reason || 'stop';
        }
        
        // Calculate usage and cost
        const usage = this.calculateUsage(response.usage, selectedModel);
        
        return {
            content,
            model: response.model || selectedModel,
            finishReason,
            usage,
            metadata: {
                provider: this.name,
                requestId: originalRequest.requestId,
                timestamp: new Date().toISOString(),
                streamed: !!originalRequest.stream,
                selectedModel
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
        
        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;
        const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
        
        // Calculate cost
        const modelInfo = this.availableModels.get(model);
        let cost = 0;
        
        if (modelInfo?.pricing) {
            const promptCost = (promptTokens * parseFloat(modelInfo.pricing.prompt || 0)) / 1000000;
            const completionCost = (completionTokens * parseFloat(modelInfo.pricing.completion || modelInfo.pricing.prompt || 0)) / 1000000;
            cost = promptCost + completionCost;
        } else {
            // Fallback cost estimation
            const avgCost = this.getModelCost(modelInfo || { id: model });
            cost = totalTokens * avgCost;
        }
        
        return {
            promptTokens,
            completionTokens,
            totalTokens,
            cost: Math.round(cost * 10000) / 10000 // Round to 4 decimal places
        };
    }

    /**
     * Get request headers
     * @returns {Object} Request headers
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://multi-agent-system.local',
            'X-Title': 'Multi-Agent Programming System'
        };
        
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        return headers;
    }

    /**
     * Validate request parameters
     * @param {Object} request - Request to validate
     */
    validateRequest(request) {
        if (!request.prompt || typeof request.prompt !== 'string') {
            throw new Error('Prompt is required and must be a string');
        }
        
        if (request.maxTokens && (request.maxTokens <= 0 || request.maxTokens > 32768)) {
            throw new Error('maxTokens must be between 1 and 32768');
        }
        
        if (request.temperature !== undefined && 
            (request.temperature < 0 || request.temperature > 2)) {
            throw new Error('temperature must be between 0 and 2');
        }
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is retryable
     */
    isRetryableError(error) {
        if (error instanceof OpenRouterAPIError) {
            // Retry on server errors and rate limits
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
            await logger.warn('OpenRouter API connection test failed', error);
            return false;
        }
    }

    /**
     * Load configuration
     */
    async loadConfiguration() {
        try {
            const apiEndpoints = await configManager.getApiEndpoints();
            if (apiEndpoints.openrouter) {
                this.baseUrl = apiEndpoints.openrouter;
            }
            
            this.defaultModel = configManager.get('api.openrouter.model') || this.defaultModel;
            
            const performanceSettings = await configManager.getPerformanceSettings();
            this.timeout = performanceSettings.timeout || this.timeout;
            this.maxRetries = performanceSettings.retry?.attempts || this.maxRetries;
            this.retryDelay = performanceSettings.retry?.delay || this.retryDelay;
            
        } catch (error) {
            await logger.warn('Failed to load OpenRouter provider configuration', error);
        }
    }

    /**
     * Update statistics
     * @param {number} responseTime - Response time in ms
     * @param {Object} usage - Usage information
     * @param {string} model - Model used
     */
    updateStats(responseTime, usage, model) {
        this.stats.requests++;
        
        // Update overall stats
        const totalTime = this.stats.averageResponseTime * (this.stats.requests - 1);
        this.stats.averageResponseTime = (totalTime + responseTime) / this.stats.requests;
        
        if (usage) {
            this.stats.totalTokens += usage.totalTokens || 0;
            this.stats.totalCost += usage.cost || 0;
        }
        
        // Update model-specific stats
        if (!this.stats.modelUsage[model]) {
            this.stats.modelUsage[model] = { requests: 0, tokens: 0, cost: 0 };
        }
        this.stats.modelUsage[model].requests++;
        this.stats.modelUsage[model].tokens += usage?.totalTokens || 0;
        this.stats.modelUsage[model].cost += usage?.cost || 0;
        
        // Update detailed model stats
        const modelStats = this.modelStats.get(model);
        if (modelStats) {
            modelStats.requests++;
            const totalModelTime = modelStats.averageResponseTime * (modelStats.requests - 1);
            modelStats.averageResponseTime = (totalModelTime + responseTime) / modelStats.requests;
            modelStats.totalTokens += usage?.totalTokens || 0;
            modelStats.totalCost += usage?.cost || 0;
        }
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     */
    generateRequestId() {
        return `openrouter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        const modelStats = {};
        for (const [model, stats] of this.modelStats) {
            modelStats[model] = {
                ...stats,
                errorRate: stats.requests > 0 ? stats.errors / stats.requests : 0
            };
        }
        
        return {
            ...this.stats,
            modelStats,
            availableModels: this.availableModels.size,
            errorRate: this.stats.requests > 0 ? this.stats.errors / this.stats.requests : 0,
            averageCostPerRequest: this.stats.requests > 0 ? this.stats.totalCost / this.stats.requests : 0
        };
    }

    /**
     * Set API key
     * @param {string} apiKey - OpenRouter API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Update cost optimization settings
     * @param {Object} settings - New settings
     */
    updateCostOptimization(settings) {
        Object.assign(this.costOptimization, settings);
        
        logger.info('OpenRouter cost optimization updated', {
            settings: this.costOptimization
        });
    }

    /**
     * Get available models
     * @returns {Array} Available models
     */
    getAvailableModels() {
        return Array.from(this.availableModels.values());
    }

    /**
     * Refresh available models
     * @returns {Promise<void>}
     */
    async refreshModels() {
        await this.loadAvailableModels();
    }
}

/**
 * Custom error class for OpenRouter API errors
 */
class OpenRouterAPIError extends Error {
    constructor(message, status, data = {}, requestId = null) {
        super(message);
        this.name = 'OpenRouterAPIError';
        this.status = status;
        this.data = data;
        this.requestId = requestId;
    }
}

// Export classes
export { OpenRouterAPIError };

// Export for ES6 modules
export default OpenRouterProvider;