export class LLMInterface {
    constructor(config, logger, errorHandler) {
        this.config = config;
        this.logger = logger;
        this.errorHandler = errorHandler;
        
        // Rate limiting
        this.rateLimiter = {
            requests: [],
            maxRequestsPerMinute: 60,
            maxRequestsPerHour: 1000
        };
        
        // Response parsing utilities
        this.parsers = new Map();
        this.registerDefaultParsers();
        
        this.initialized = false;
    }

    async init() {
        try {
            // Test connection based on current provider
            const llmConfig = this.config.getLLMConfig();
            
            if (llmConfig.provider === 'openrouter' && !llmConfig.openRouterApiKey) {
                this.logger.warn('LLMInterface', 'OpenRouter API key not configured - falling back to Claude Pro');
                this.config.setLLMProvider('claude-pro');
            }
            
            this.initialized = true;
            this.logger.info('LLMInterface', `LLM interface initialized with provider: ${llmConfig.provider}`);
            
        } catch (error) {
            throw new Error(`Failed to initialize LLM interface: ${error.message}`);
        }
    }

    registerDefaultParsers() {
        // JSON response parser
        this.parsers.set('json', (response) => {
            try {
                return JSON.parse(response);
            } catch (error) {
                // Try to extract JSON from markdown code blocks
                const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[1]);
                }
                throw new Error('Invalid JSON response');
            }
        });

        // List response parser
        this.parsers.set('list', (response) => {
            const lines = response.split('\n')
                .map(line => line.trim())
                .filter(line => line && (line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line)))
                .map(line => line.replace(/^[-•]\s*|\d+\.\s*/, ''));
            return lines;
        });

        // Decision response parser
        this.parsers.set('decision', (response) => {
            const decision = response.toLowerCase().includes('yes') || 
                           response.toLowerCase().includes('true') ||
                           response.toLowerCase().includes('proceed');
            const confidence = this.extractConfidence(response);
            const reasoning = this.extractReasoning(response);
            
            return { decision, confidence, reasoning };
        });

        // Analysis response parser
        this.parsers.set('analysis', (response) => {
            const sections = {
                summary: this.extractSection(response, ['summary', 'overview']),
                findings: this.extractSection(response, ['findings', 'results', 'analysis']),
                recommendations: this.extractSection(response, ['recommendations', 'suggestions']),
                confidence: this.extractConfidence(response)
            };
            return sections;
        });
    }

    async sendRequest(systemPrompt, messages, options = {}) {
        const timer = this.logger.startTimer('llm_request');
        
        try {
            // Check rate limits
            await this.checkRateLimit();
            
            // Get current LLM configuration
            const llmConfig = this.config.getLLMConfig();
            
            // Prepare request based on provider
            let response;
            if (llmConfig.provider === 'claude-pro') {
                response = await this.sendToClaudePro(systemPrompt, messages, options);
            } else if (llmConfig.provider === 'openrouter') {
                response = await this.sendToOpenRouter(systemPrompt, messages, options);
            } else {
                throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
            }
            
            // Parse response if parser specified
            if (options.parser && this.parsers.has(options.parser)) {
                const parser = this.parsers.get(options.parser);
                response.parsed = parser(response.content);
            }
            
            // Log the interaction
            const duration = timer.stop();
            this.logger.logLLMCall(
                systemPrompt, 
                response.content, 
                response.usage?.total_tokens || 0, 
                duration, 
                llmConfig.provider
            );
            
            return response;
            
        } catch (error) {
            const duration = timer.stop();
            this.logger.error('LLMInterface', 'LLM request failed', { error, duration });
            
            // Try error recovery
            const recovery = await this.errorHandler.handleLLMError(error, {
                systemPrompt,
                messages,
                options,
                llmConfig: this.config.getLLMConfig()
            });
            
            if (recovery.success) {
                return recovery.result;
            } else {
                throw error;
            }
        }
    }

    async sendToClaudePro(systemPrompt, messages, options = {}) {
        // For Claude Pro integration, we would typically use the current session
        // This is a placeholder for the actual implementation
        this.logger.info('LLMInterface', 'Sending request to Claude Pro (current session)');
        
        // Simulate Claude Pro API call
        // In a real implementation, this would integrate with the current Claude session
        throw new Error('Claude Pro integration not yet implemented - use OpenRouter instead');
    }

    async sendToOpenRouter(systemPrompt, messages, options = {}) {
        const llmConfig = this.config.getLLMConfig();
        
        if (!llmConfig.openRouterApiKey) {
            throw new Error('OpenRouter API key not configured');
        }
        
        const requestBody = {
            model: options.model || llmConfig.model || 'anthropic/claude-3-5-sonnet-20241022',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            max_tokens: options.maxTokens || 4000,
            temperature: options.temperature || 0.7,
            top_p: options.topP || 0.9
        };
        
        const response = await fetch(llmConfig.openRouterEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${llmConfig.openRouterApiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Agentic AI System'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenRouter API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
            content: data.choices[0].message.content,
            usage: data.usage,
            model: data.model,
            provider: 'openrouter',
            timestamp: Date.now()
        };
    }

    async checkRateLimit() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneHourAgo = now - 3600000;
        
        // Clean old requests
        this.rateLimiter.requests = this.rateLimiter.requests.filter(time => time > oneHourAgo);
        
        // Check limits
        const requestsLastMinute = this.rateLimiter.requests.filter(time => time > oneMinuteAgo).length;
        const requestsLastHour = this.rateLimiter.requests.length;
        
        if (requestsLastMinute >= this.rateLimiter.maxRequestsPerMinute) {
            const waitTime = 60000 - (now - Math.max(...this.rateLimiter.requests.filter(time => time > oneMinuteAgo)));
            this.logger.warn('LLMInterface', `Rate limit reached, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        if (requestsLastHour >= this.rateLimiter.maxRequestsPerHour) {
            throw new Error('Hourly rate limit exceeded');
        }
        
        // Record this request
        this.rateLimiter.requests.push(now);
    }

    // Specialized request methods
    async askQuestion(question, context = {}, options = {}) {
        const systemPrompt = this.buildQuestionSystemPrompt(context);
        const messages = [{ role: 'user', content: question }];
        
        return await this.sendRequest(systemPrompt, messages, options);
    }

    async performAnalysis(data, analysisType, context = {}, options = {}) {
        const systemPrompt = this.buildAnalysisSystemPrompt(analysisType, context);
        const messages = [{
            role: 'user',
            content: `Please analyze the following data:\n\n${JSON.stringify(data, null, 2)}`
        }];
        
        return await this.sendRequest(systemPrompt, messages, {
            ...options,
            parser: 'analysis'
        });
    }

    async generatePlan(goal, constraints = [], context = {}, options = {}) {
        const systemPrompt = this.buildPlanningSystemPrompt(context);
        const messages = [{
            role: 'user',
            content: `Goal: ${goal}\n\nConstraints:\n${constraints.map(c => `- ${c}`).join('\n')}\n\nPlease create a detailed plan.`
        }];
        
        return await this.sendRequest(systemPrompt, messages, {
            ...options,
            parser: 'json'
        });
    }

    async makeDecision(options, criteria = [], context = {}, requestOptions = {}) {
        const systemPrompt = this.buildDecisionSystemPrompt(context);
        const messages = [{
            role: 'user',
            content: `Options:\n${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}\n\nCriteria:\n${criteria.map(c => `- ${c}`).join('\n')}\n\nPlease make a decision and explain your reasoning.`
        }];
        
        return await this.sendRequest(systemPrompt, messages, {
            ...requestOptions,
            parser: 'decision'
        });
    }

    async extractInformation(text, extractionRules, context = {}, options = {}) {
        const systemPrompt = this.buildExtractionSystemPrompt(extractionRules, context);
        const messages = [{
            role: 'user',
            content: `Please extract information from the following text:\n\n${text}`
        }];
        
        return await this.sendRequest(systemPrompt, messages, {
            ...options,
            parser: 'json'
        });
    }

    // System prompt builders
    buildQuestionSystemPrompt(context) {
        const agentConfig = this.config.getAgentConfig();
        
        return `You are an AI assistant with the following characteristics:
${agentConfig.personality}

Your capabilities include:
${agentConfig.capabilities.map(cap => `- ${cap}`).join('\n')}

Context: ${context.domain || 'general'}
Task: ${context.taskType || 'question answering'}

Please provide helpful, accurate, and concise responses. If you're uncertain about something, acknowledge the uncertainty.`;
    }

    buildAnalysisSystemPrompt(analysisType, context) {
        return `You are a specialized analyst performing ${analysisType} analysis.

Please structure your response with the following sections:
- Summary: Brief overview of key findings
- Findings: Detailed analysis results
- Recommendations: Actionable next steps
- Confidence: Your confidence level in the analysis (0-100%)

Focus on being thorough, objective, and actionable in your analysis.

Domain context: ${context.domain || 'general'}`;
    }

    buildPlanningSystemPrompt(context) {
        return `You are an expert project planner. Create detailed, executable plans.

Please provide your response as JSON with this structure:
{
    "goal": "clear goal statement",
    "steps": [
        {
            "id": 1,
            "title": "step title",
            "description": "detailed description",
            "dependencies": [previous step ids],
            "estimatedTime": "time estimate",
            "resources": ["required resources"]
        }
    ],
    "risks": ["potential risks"],
    "success_criteria": ["how to measure success"]
}

Domain context: ${context.domain || 'general'}
Priority: ${context.priority || 'normal'}`;
    }

    buildDecisionSystemPrompt(context) {
        return `You are a decision-making expert. Analyze options carefully and make reasoned recommendations.

Structure your response to clearly indicate:
1. Your recommended decision (yes/no or option number)
2. Confidence level (0-100%)
3. Detailed reasoning

Consider factors like feasibility, impact, resources, and alignment with goals.

Domain context: ${context.domain || 'general'}`;
    }

    buildExtractionSystemPrompt(extractionRules, context) {
        const rulesText = extractionRules.map(rule => 
            `- ${rule.field}: ${rule.description} (${rule.type})`
        ).join('\n');
        
        return `You are an information extraction specialist. Extract specific information according to the given rules.

Extraction rules:
${rulesText}

Provide your response as JSON with the extracted fields. If a field cannot be found, use null as the value.

Domain context: ${context.domain || 'general'}`;
    }

    // Response parsing utilities
    extractSection(text, sectionNames) {
        for (const name of sectionNames) {
            const regex = new RegExp(`^\\s*\\*\\*?${name}:?\\*\\*?\\s*(.+?)(?=^\\s*\\*\\*?\\w+:|$)`, 'ims');
            const match = text.match(regex);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }

    extractConfidence(text) {
        const confidenceMatch = text.match(/confidence[:\s]*(\d+)%?/i);
        if (confidenceMatch) {
            return parseInt(confidenceMatch[1]) / 100;
        }
        
        // Look for confidence keywords
        if (text.toLowerCase().includes('very confident') || text.toLowerCase().includes('certain')) {
            return 0.9;
        } else if (text.toLowerCase().includes('confident')) {
            return 0.8;
        } else if (text.toLowerCase().includes('uncertain') || text.toLowerCase().includes('unsure')) {
            return 0.3;
        } else if (text.toLowerCase().includes('possible') || text.toLowerCase().includes('might')) {
            return 0.5;
        }
        
        return 0.7; // Default confidence
    }

    extractReasoning(text) {
        // Look for reasoning indicators
        const reasoningPatterns = [
            /because\s+(.+?)(?:\.|$)/i,
            /reason[:\s]+(.+?)(?:\.|$)/i,
            /since\s+(.+?)(?:\.|$)/i,
            /given\s+that\s+(.+?)(?:\.|$)/i
        ];
        
        for (const pattern of reasoningPatterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        // Fallback: return first sentence that might contain reasoning
        const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s);
        for (const sentence of sentences.slice(1, 3)) { // Skip first, check next 2
            if (sentence.length > 20) {
                return sentence;
            }
        }
        
        return 'No explicit reasoning provided';
    }

    // Configuration and management
    switchProvider(provider, options = {}) {
        this.config.setLLMProvider(provider, options);
        this.logger.info('LLMInterface', `Switched to LLM provider: ${provider}`);
    }

    getRateLimitStatus() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneHourAgo = now - 3600000;
        
        const requestsLastMinute = this.rateLimiter.requests.filter(time => time > oneMinuteAgo).length;
        const requestsLastHour = this.rateLimiter.requests.filter(time => time > oneHourAgo).length;
        
        return {
            requestsLastMinute,
            requestsLastHour,
            maxRequestsPerMinute: this.rateLimiter.maxRequestsPerMinute,
            maxRequestsPerHour: this.rateLimiter.maxRequestsPerHour,
            remainingMinute: this.rateLimiter.maxRequestsPerMinute - requestsLastMinute,
            remainingHour: this.rateLimiter.maxRequestsPerHour - requestsLastHour
        };
    }

    registerParser(name, parserFunction) {
        this.parsers.set(name, parserFunction);
        this.logger.debug('LLMInterface', `Registered custom parser: ${name}`);
    }

    // Testing and debugging
    async testConnection() {
        try {
            const response = await this.askQuestion('Hello, please respond with "Connection successful" to test the LLM interface.');
            return {
                success: true,
                provider: this.config.getLLMConfig().provider,
                response: response.content,
                latency: response.timestamp ? Date.now() - response.timestamp : null
            };
        } catch (error) {
            return {
                success: false,
                provider: this.config.getLLMConfig().provider,
                error: error.message
            };
        }
    }
}