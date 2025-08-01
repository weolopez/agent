export class OpenRouterClient {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        
        // OpenRouter specific configuration
        this.baseURL = 'https://openrouter.ai/api/v1';
        this.modelsEndpoint = '/models';
        this.chatEndpoint = '/chat/completions';
        
        // Available models with their capabilities
        this.modelCatalog = new Map();
        this.initializeModelCatalog();
        
        // Request tracking
        this.requestHistory = [];
        this.maxHistorySize = 100;
        
        // Error patterns and recovery
        this.errorPatterns = new Map();
        this.initializeErrorPatterns();
    }

    initializeModelCatalog() {
        // Anthropic Claude models
        this.modelCatalog.set('anthropic/claude-3-5-sonnet-20241022', {
            provider: 'Anthropic',
            name: 'Claude 3.5 Sonnet',
            contextLength: 200000,
            maxOutput: 4096,
            pricing: { prompt: 0.003, completion: 0.015 },
            capabilities: ['analysis', 'reasoning', 'coding', 'writing'],
            strengths: ['complex reasoning', 'long context', 'code generation']
        });
        
        this.modelCatalog.set('anthropic/claude-3-opus-20240229', {
            provider: 'Anthropic',
            name: 'Claude 3 Opus',
            contextLength: 200000,
            maxOutput: 4096,
            pricing: { prompt: 0.015, completion: 0.075 },
            capabilities: ['analysis', 'reasoning', 'creative writing', 'complex tasks'],
            strengths: ['highest capability', 'creative tasks', 'complex reasoning']
        });
        
        this.modelCatalog.set('anthropic/claude-3-haiku-20240307', {
            provider: 'Anthropic',
            name: 'Claude 3 Haiku',
            contextLength: 200000,
            maxOutput: 4096,
            pricing: { prompt: 0.00025, completion: 0.00125 },
            capabilities: ['fast responses', 'simple tasks', 'analysis'],
            strengths: ['speed', 'cost-effective', 'simple tasks']
        });
        
        // OpenAI models
        this.modelCatalog.set('openai/gpt-4-turbo-preview', {
            provider: 'OpenAI',
            name: 'GPT-4 Turbo',
            contextLength: 128000,
            maxOutput: 8192,
            pricing: { prompt: 0.01, completion: 0.03 },
            capabilities: ['reasoning', 'analysis', 'coding', 'multimodal'],
            strengths: ['reasoning', 'coding', 'multimodal']
        });
        
        this.modelCatalog.set('openai/gpt-3.5-turbo', {
            provider: 'OpenAI',
            name: 'GPT-3.5 Turbo',
            contextLength: 16385,
            maxOutput: 4096,
            pricing: { prompt: 0.0005, completion: 0.0015 },
            capabilities: ['general chat', 'analysis', 'coding'],
            strengths: ['speed', 'cost-effective', 'general purpose']
        });
        
        // Other providers
        this.modelCatalog.set('google/gemini-pro', {
            provider: 'Google',
            name: 'Gemini Pro',
            contextLength: 32768,
            maxOutput: 2048,
            pricing: { prompt: 0.00025, completion: 0.0005 },
            capabilities: ['reasoning', 'analysis', 'multimodal'],
            strengths: ['multimodal', 'reasoning', 'cost-effective']
        });
    }

    initializeErrorPatterns() {
        this.errorPatterns.set(/rate\s*limit/i, {
            type: 'RATE_LIMIT',
            retryable: true,
            backoffMs: 60000,
            maxRetries: 3
        });
        
        this.errorPatterns.set(/insufficient\s*credits/i, {
            type: 'INSUFFICIENT_CREDITS',
            retryable: false,
            fallbackModel: 'anthropic/claude-3-haiku-20240307'
        });
        
        this.errorPatterns.set(/model\s*not\s*found/i, {
            type: 'MODEL_NOT_FOUND',
            retryable: true,
            fallbackModel: 'anthropic/claude-3-5-sonnet-20241022'
        });
        
        this.errorPatterns.set(/context\s*length\s*exceeded/i, {
            type: 'CONTEXT_TOO_LONG',
            retryable: true,
            strategy: 'truncate_context'
        });
        
        this.errorPatterns.set(/network|timeout|connection/i, {
            type: 'NETWORK_ERROR',
            retryable: true,
            backoffMs: 5000,
            maxRetries: 3
        });
    }

    async sendRequest(systemPrompt, messages, options = {}) {
        const timer = this.logger.startTimer('openrouter_request');
        
        try {
            const llmConfig = this.config.getLLMConfig();
            
            if (!llmConfig.openRouterApiKey) {
                throw new Error('OpenRouter API key not configured');
            }
            
            // Select model
            const model = this.selectModel(options);
            
            // Prepare request
            const request = this.buildRequest(systemPrompt, messages, model, options);
            
            // Send request with retry logic
            const response = await this.sendWithRetry(request, options.retries || 3);
            
            // Track request
            this.trackRequest(request, response);
            
            // Process response
            const processedResponse = this.processResponse(response, model);
            
            const duration = timer.stop();
            this.logger.info('OpenRouterClient', `Request completed`, {
                model,
                duration,
                tokens: processedResponse.usage?.total_tokens || 0,
                cost: this.estimateCost(processedResponse, model)
            });
            
            return processedResponse;
            
        } catch (error) {
            const duration = timer.stop();
            this.logger.error('OpenRouterClient', 'OpenRouter request failed', { error: error.message, duration });
            throw error;
        }
    }

    selectModel(options) {
        const llmConfig = this.config.getLLMConfig();
        
        // Use specified model if provided and available
        if (options.model) {
            if (this.modelCatalog.has(options.model)) {
                return options.model;
            } else {
                this.logger.warn('OpenRouterClient', `Requested model ${options.model} not in catalog, using default`);
            }
        }
        
        // Use configured model
        if (llmConfig.model && this.modelCatalog.has(llmConfig.model)) {
            return llmConfig.model;
        }
        
        // Smart model selection based on task requirements
        const taskRequirements = {
            complexity: options.complexity || 'medium',
            speed: options.speed || 'normal',
            cost: options.cost || 'normal',
            contextLength: options.contextLength || 8000
        };
        
        return this.selectOptimalModel(taskRequirements);
    }

    selectOptimalModel(requirements) {
        const models = Array.from(this.modelCatalog.entries());
        
        // Score models based on requirements
        const scoredModels = models.map(([modelId, info]) => {
            let score = 0;
            
            // Context length requirement
            if (info.contextLength >= requirements.contextLength) {
                score += 30;
            }
            
            // Complexity requirement
            if (requirements.complexity === 'high' && info.name.includes('Opus')) {
                score += 40;
            } else if (requirements.complexity === 'medium' && info.name.includes('Sonnet')) {
                score += 35;
            } else if (requirements.complexity === 'low' && info.name.includes('Haiku')) {
                score += 30;
            }
            
            // Speed requirement
            if (requirements.speed === 'fast' && info.strengths.includes('speed')) {
                score += 20;
            }
            
            // Cost requirement
            if (requirements.cost === 'low' && info.strengths.includes('cost-effective')) {
                score += 25;
            }
            
            return { modelId, score, info };
        });
        
        // Sort by score and return best match
        scoredModels.sort((a, b) => b.score - a.score);
        return scoredModels[0].modelId;
    }

    buildRequest(systemPrompt, messages, model, options) {
        const modelInfo = this.modelCatalog.get(model);
        
        // Build messages array with system prompt
        const requestMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];
        
        // Calculate token estimate for context management
        const estimatedTokens = this.estimateTokens(requestMessages);
        if (estimatedTokens > modelInfo.contextLength * 0.9) {
            this.logger.warn('OpenRouterClient', `Request approaching context limit: ${estimatedTokens}/${modelInfo.contextLength}`);
        }
        
        return {
            model,
            messages: requestMessages,
            max_tokens: Math.min(options.maxTokens || 4000, modelInfo.maxOutput),
            temperature: options.temperature || 0.7,
            top_p: options.topP || 0.9,
            frequency_penalty: options.frequencyPenalty || 0,
            presence_penalty: options.presencePenalty || 0,
            stop: options.stop || null,
            stream: options.stream || false
        };
    }

    async sendWithRetry(request, maxRetries) {
        let lastError;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await this.makeHTTPRequest(request);
                return response;
                
            } catch (error) {
                lastError = error;
                
                // Check if error is retryable
                const errorInfo = this.classifyError(error);
                
                if (!errorInfo.retryable || attempt === maxRetries - 1) {
                    // Try fallback if available
                    if (errorInfo.fallbackModel && attempt === 0) {
                        this.logger.info('OpenRouterClient', `Trying fallback model: ${errorInfo.fallbackModel}`);
                        request.model = errorInfo.fallbackModel;
                        continue;
                    }
                    
                    throw error;
                }
                
                // Apply backoff delay
                const delay = errorInfo.backoffMs || (1000 * Math.pow(2, attempt));
                this.logger.warn('OpenRouterClient', `Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                await this.delay(delay);
                
                // Apply error-specific strategies
                if (errorInfo.strategy === 'truncate_context') {
                    request = this.truncateContext(request);
                }
            }
        }
        
        throw lastError;
    }

    async makeHTTPRequest(request) {
        const llmConfig = this.config.getLLMConfig();
        
        const response = await fetch(`${this.baseURL}${this.chatEndpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${llmConfig.openRouterApiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Agent System'
            },
            body: JSON.stringify(request)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }
        
        return await response.json();
    }

    classifyError(error) {
        const message = error.message.toLowerCase();
        
        for (const [pattern, info] of this.errorPatterns.entries()) {
            if (pattern.test(message)) {
                return info;
            }
        }
        
        // Default error classification
        return {
            type: 'UNKNOWN_ERROR',
            retryable: false
        };
    }

    truncateContext(request) {
        const messages = [...request.messages];
        const systemMessage = messages[0];
        const userMessages = messages.slice(1);
        
        // Keep system message and most recent user messages
        const maxMessages = Math.floor(userMessages.length * 0.7);
        const truncatedMessages = [
            systemMessage,
            ...userMessages.slice(-maxMessages)
        ];
        
        this.logger.warn('OpenRouterClient', `Truncated context from ${messages.length} to ${truncatedMessages.length} messages`);
        
        return {
            ...request,
            messages: truncatedMessages
        };
    }

    processResponse(response, model) {
        const modelInfo = this.modelCatalog.get(model);
        
        if (!response.choices || response.choices.length === 0) {
            throw new Error('No response choices returned from OpenRouter');
        }
        
        const choice = response.choices[0];
        
        return {
            content: choice.message.content,
            usage: response.usage,
            model: response.model || model,
            provider: 'openrouter',
            modelInfo,
            timestamp: Date.now(),
            finishReason: choice.finish_reason,
            cost: this.estimateCost(response, model)
        };
    }

    estimateCost(response, model) {
        const modelInfo = this.modelCatalog.get(model);
        if (!modelInfo || !response.usage) {
            return null;
        }
        
        const promptCost = (response.usage.prompt_tokens / 1000) * modelInfo.pricing.prompt;
        const completionCost = (response.usage.completion_tokens / 1000) * modelInfo.pricing.completion;
        
        return {
            prompt: promptCost,
            completion: completionCost,
            total: promptCost + completionCost,
            currency: 'USD'
        };
    }

    estimateTokens(messages) {
        // Rough token estimation (4 characters per token average)
        return messages.reduce((total, message) => {
            return total + Math.ceil(message.content.length / 4);
        }, 0);
    }

    trackRequest(request, response) {
        const entry = {
            timestamp: Date.now(),
            model: request.model,
            tokens: response.usage?.total_tokens || 0,
            cost: this.estimateCost(response, request.model),
            success: true
        };
        
        this.requestHistory.push(entry);
        
        // Maintain history size limit
        if (this.requestHistory.length > this.maxHistorySize) {
            this.requestHistory.shift();
        }
    }

    // Model management
    async fetchAvailableModels() {
        try {
            const llmConfig = this.config.getLLMConfig();
            
            const response = await fetch(`${this.baseURL}${this.modelsEndpoint}`, {
                headers: {
                    'Authorization': `Bearer ${llmConfig.openRouterApiKey}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Update model catalog with fresh data
            data.data.forEach(model => {
                if (!this.modelCatalog.has(model.id)) {
                    this.modelCatalog.set(model.id, {
                        provider: model.id.split('/')[0],
                        name: model.name || model.id,
                        contextLength: model.context_length || 4096,
                        maxOutput: model.max_output || 2048,
                        pricing: model.pricing || { prompt: 0, completion: 0 },
                        capabilities: [],
                        strengths: []
                    });
                }
            });
            
            this.logger.info('OpenRouterClient', `Updated model catalog with ${data.data.length} models`);
            return Array.from(this.modelCatalog.keys());
            
        } catch (error) {
            this.logger.error('OpenRouterClient', 'Failed to fetch available models', error);
            throw error;
        }
    }

    getModelInfo(modelId) {
        return this.modelCatalog.get(modelId);
    }

    getAvailableModels() {
        return Array.from(this.modelCatalog.entries()).map(([id, info]) => ({
            id,
            ...info
        }));
    }

    recommendModel(requirements) {
        const modelId = this.selectOptimalModel(requirements);
        const info = this.modelCatalog.get(modelId);
        
        return {
            modelId,
            info,
            reasoning: this.explainModelSelection(requirements, modelId)
        };
    }

    explainModelSelection(requirements, selectedModel) {
        const info = this.modelCatalog.get(selectedModel);
        const reasons = [];
        
        if (requirements.complexity === 'high' && info.name.includes('Opus')) {
            reasons.push('Opus selected for high complexity tasks');
        } else if (requirements.complexity === 'medium' && info.name.includes('Sonnet')) {
            reasons.push('Sonnet selected for balanced performance');
        } else if (info.name.includes('Haiku')) {
            reasons.push('Haiku selected for speed and cost efficiency');
        }
        
        if (info.contextLength >= requirements.contextLength) {
            reasons.push(`Context length sufficient (${info.contextLength} tokens)`);
        }
        
        if (info.strengths.includes('cost-effective') && requirements.cost === 'low') {
            reasons.push('Cost-effective option selected');
        }
        
        return reasons.join('; ');
    }

    // Statistics and monitoring
    getUsageStats() {
        const now = Date.now();
        const last24h = now - (24 * 60 * 60 * 1000);
        const recent = this.requestHistory.filter(req => req.timestamp > last24h);
        
        const totalRequests = recent.length;
        const totalTokens = recent.reduce((sum, req) => sum + req.tokens, 0);
        const totalCost = recent.reduce((sum, req) => sum + (req.cost?.total || 0), 0);
        
        const modelUsage = {};
        recent.forEach(req => {
            modelUsage[req.model] = (modelUsage[req.model] || 0) + 1;
        });
        
        return {
            period: '24h',
            requests: totalRequests,
            tokens: totalTokens,
            cost: totalCost,
            modelUsage,
            averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
            averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0
        };
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Configuration management
    updateApiKey(apiKey) {
        this.config.set('llm.openRouterApiKey', apiKey);
        this.logger.info('OpenRouterClient', 'OpenRouter API key updated');
    }

    testConnection() {
        return this.sendRequest(
            'You are a helpful assistant.',
            [{ role: 'user', content: 'Say "OpenRouter connection successful" to confirm the connection is working.' }],
            { maxTokens: 50 }
        );
    }
}