/**
 * Agent Engine
 * Central orchestration system for managing agent workflows, lifecycle,
 * state transitions, and error recovery using a composition-based model.
 * 
 * Follows the AgentEngine interface defined in API_CONTRACTS.md
 */

import { contextManager } from '../memory/context-manager.js';
import { llmInterface } from '../llm/llm-interface.js';
import { workingMemory } from '../memory/working-memory.js';
import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';

export class AgentEngine {
    constructor() {
        this.activeAgents = new Map();
        this.workflows = new Map();
        this.executionQueue = [];
        this.isProcessing = false;
        this.maxConcurrentAgents = 3;
        this.defaultTimeout = 30000;
        
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0,
            agentUsage: {},
            workflowStats: {}
        };
        
        this.eventListeners = new Map();
        
        this.initialize();
    }

    /**
     * Initialize the agent engine
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Start processing queue
            this.startQueueProcessor();
            
            await logger.info('Agent Engine initialized', {
                maxConcurrentAgents: this.maxConcurrentAgents,
                defaultTimeout: this.defaultTimeout
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'agent_engine_initialization',
                component: 'AgentEngine'
            });
        }
    }

    /**
     * Execute an agent with the given request
     * @param {Object} agentDefinition - Agent definition object
     * @param {Object} request - Execution request
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Execution result
     */
    async executeAgent(agentDefinition, request, options = {}) {
        const executionId = this.generateExecutionId();
        const startTime = performance.now();
        
        try {
            // Validate inputs
            this.validateAgentDefinition(agentDefinition);
            this.validateExecutionRequest(request);
            
            // Create execution context
            const executionContext = await this.createExecutionContext(
                agentDefinition, 
                request, 
                options, 
                executionId
            );
            
            // Register active agent
            this.activeAgents.set(executionId, executionContext);
            
            // Emit start event
            await this.emitEvent('agent_start', {
                executionId,
                agentType: agentDefinition.type,
                request
            });
            
            // Execute agent workflow
            const result = await this.runAgentWorkflow(executionContext);
            
            // Clean up and update stats
            this.activeAgents.delete(executionId);
            const executionTime = performance.now() - startTime;
            this.updateExecutionStats(agentDefinition.type, executionTime, true);
            
            // Emit completion event
            await this.emitEvent('agent_complete', {
                executionId,
                agentType: agentDefinition.type,
                result,
                executionTime
            });
            
            await logger.info('Agent execution completed', {
                executionId,
                agentType: agentDefinition.type,
                executionTime,
                success: true
            });
            
            return {
                success: true,
                result,
                executionId,
                executionTime,
                metadata: {
                    agentType: agentDefinition.type,
                    timestamp: new Date().toISOString()
                }
            };
            
        } catch (error) {
            // Clean up on error
            this.activeAgents.delete(executionId);
            const executionTime = performance.now() - startTime;
            this.updateExecutionStats(agentDefinition.type, executionTime, false);
            
            // Emit error event
            await this.emitEvent('agent_error', {
                executionId,
                agentType: agentDefinition.type,
                error: error.message,
                executionTime
            });
            
            await errorHandler.handleError(error, {
                operation: 'execute_agent',
                component: 'AgentEngine',
                metadata: { 
                    executionId, 
                    agentType: agentDefinition.type,
                    request: this.sanitizeRequest(request)
                }
            });
            
            return {
                success: false,
                error: error.message,
                executionId,
                executionTime,
                metadata: {
                    agentType: agentDefinition.type,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    /**
     * Execute a multi-agent workflow
     * @param {Array<Object>} workflow - Array of agent steps
     * @param {Object} initialRequest - Initial request object
     * @param {Object} options - Workflow options
     * @returns {Promise<Object>} Workflow result
     */
    async executeWorkflow(workflow, initialRequest, options = {}) {
        const workflowId = this.generateWorkflowId();
        const startTime = performance.now();
        
        try {
            // Validate workflow
            this.validateWorkflow(workflow);
            
            // Register workflow
            const workflowContext = {
                id: workflowId,
                steps: workflow,
                currentStep: 0,
                results: [],
                state: 'running',
                startTime,
                options
            };
            
            this.workflows.set(workflowId, workflowContext);
            
            await logger.info('Workflow execution started', {
                workflowId,
                stepCount: workflow.length,
                options
            });
            
            // Execute workflow steps
            let currentRequest = initialRequest;
            
            for (let i = 0; i < workflow.length; i++) {
                const step = workflow[i];
                workflowContext.currentStep = i;
                
                // Update agent state
                await workingMemory.setAgentState(step.agentDefinition.type, {
                    type: step.agentDefinition.type,
                    status: 'working',
                    currentOperation: step.operation || 'execute',
                    workflowId,
                    stepIndex: i,
                    lastUpdate: new Date().toISOString()
                });
                
                try {
                    // Execute agent step
                    const stepResult = await this.executeAgent(
                        step.agentDefinition,
                        {
                            ...currentRequest,
                            previousResults: workflowContext.results,
                            workflowContext: {
                                id: workflowId,
                                step: i,
                                total: workflow.length
                            }
                        },
                        {
                            ...options,
                            timeout: step.timeout || options.timeout
                        }
                    );
                    
                    workflowContext.results.push(stepResult);
                    
                    // Update agent state
                    await workingMemory.setAgentState(step.agentDefinition.type, {
                        type: step.agentDefinition.type,
                        status: 'idle',
                        currentOperation: null,
                        lastResult: stepResult.success ? 'success' : 'error',
                        lastUpdate: new Date().toISOString()
                    });
                    
                    // Handle step failure
                    if (!stepResult.success) {
                        if (step.continueOnError) {
                            await logger.warn('Workflow step failed but continuing', {
                                workflowId,
                                step: i,
                                error: stepResult.error
                            });
                        } else {
                            throw new Error(`Workflow step ${i} failed: ${stepResult.error}`);
                        }
                    }
                    
                    // Prepare input for next step
                    if (step.outputMapping) {
                        currentRequest = this.applyOutputMapping(stepResult.result, step.outputMapping);
                    } else {
                        currentRequest = stepResult.result;
                    }
                    
                } catch (stepError) {
                    // Update agent state on error
                    await workingMemory.setAgentState(step.agentDefinition.type, {
                        type: step.agentDefinition.type,
                        status: 'error',
                        currentOperation: null,
                        lastError: stepError.message,
                        lastUpdate: new Date().toISOString()
                    });
                    
                    throw stepError;
                }
            }
            
            // Complete workflow
            workflowContext.state = 'completed';
            const executionTime = performance.now() - startTime;
            
            this.updateWorkflowStats(workflowId, executionTime, true);
            
            await logger.info('Workflow execution completed', {
                workflowId,
                executionTime,
                stepsCompleted: workflowContext.results.length
            });
            
            return {
                success: true,
                workflowId,
                results: workflowContext.results,
                executionTime,
                metadata: {
                    stepCount: workflow.length,
                    timestamp: new Date().toISOString()
                }
            };
            
        } catch (error) {
            // Mark workflow as failed
            const workflowContext = this.workflows.get(workflowId);
            if (workflowContext) {
                workflowContext.state = 'failed';
                workflowContext.error = error.message;
            }
            
            const executionTime = performance.now() - startTime;
            this.updateWorkflowStats(workflowId, executionTime, false);
            
            await errorHandler.handleError(error, {
                operation: 'execute_workflow',
                component: 'AgentEngine',
                metadata: { workflowId, currentStep: workflowContext?.currentStep }
            });
            
            return {
                success: false,
                workflowId,
                error: error.message,
                results: workflowContext?.results || [],
                executionTime,
                metadata: {
                    stepCount: workflow.length,
                    failedStep: workflowContext?.currentStep,
                    timestamp: new Date().toISOString()
                }
            };
        } finally {
            // Clean up workflow
            this.workflows.delete(workflowId);
        }
    }

    /**
     * Create execution context for an agent
     * @param {Object} agentDefinition - Agent definition
     * @param {Object} request - Execution request
     * @param {Object} options - Execution options
     * @param {string} executionId - Execution ID
     * @returns {Promise<Object>} Execution context
     */
    async createExecutionContext(agentDefinition, request, options, executionId) {
        // Assemble context from memory systems
        const contextRequest = {
            type: 'agent',
            target: agentDefinition.type,
            keywords: this.extractKeywords(request),
            filters: agentDefinition.contextFilters || {},
            maxSize: options.maxContextSize || 50000
        };
        
        const assembledContext = await contextManager.assembleContext(contextRequest);
        
        // Create execution context
        const executionContext = {
            id: executionId,
            agentDefinition,
            request,
            options,
            context: assembledContext,
            state: 'initialized',
            startTime: performance.now(),
            timeout: options.timeout || this.defaultTimeout,
            retryCount: 0,
            maxRetries: options.maxRetries || 2
        };
        
        return executionContext;
    }

    /**
     * Run the agent workflow
     * @param {Object} executionContext - Execution context
     * @returns {Promise<Object>} Execution result
     */
    async runAgentWorkflow(executionContext) {
        const { agentDefinition, request, context, options } = executionContext;
        
        try {
            // Update state
            executionContext.state = 'preparing';
            
            // Prepare prompt from agent definition and context
            const prompt = await this.assemblePrompt(agentDefinition, request, context);
            
            // Update state
            executionContext.state = 'executing';
            
            // Execute LLM request
            const llmRequest = {
                prompt: prompt.content,
                systemPrompt: prompt.system,
                model: agentDefinition.preferredModel || options.model,
                maxTokens: agentDefinition.maxTokens || options.maxTokens || 4000,
                temperature: agentDefinition.temperature || options.temperature || 0.7,
                useCache: options.useCache !== false
            };
            
            const llmResponse = await llmInterface.generateCompletion(llmRequest);
            
            // Update state
            executionContext.state = 'processing';
            
            // Process and validate response
            const processedResult = await this.processAgentResponse(
                llmResponse, 
                agentDefinition, 
                request
            );
            
            // Store result in memory if needed
            if (agentDefinition.storeResults !== false) {
                await this.storeAgentResult(executionContext, processedResult);
            }
            
            // Update state
            executionContext.state = 'completed';
            
            return processedResult;
            
        } catch (error) {
            executionContext.state = 'error';
            executionContext.error = error;
            
            // Attempt retry if configured
            if (executionContext.retryCount < executionContext.maxRetries && 
                this.isRetryableError(error)) {
                
                executionContext.retryCount++;
                
                await logger.warn('Agent execution failed, retrying', error, {
                    executionId: executionContext.id,
                    agentType: agentDefinition.type,
                    retryCount: executionContext.retryCount,
                    maxRetries: executionContext.maxRetries
                });
                
                // Add exponential backoff delay
                const delay = Math.pow(2, executionContext.retryCount) * 1000;
                await this.delay(delay);
                
                return this.runAgentWorkflow(executionContext);
            }
            
            throw error;
        }
    }

    /**
     * Assemble prompt from agent definition and context
     * @param {Object} agentDefinition - Agent definition
     * @param {Object} request - Request object
     * @param {Object} context - Assembled context
     * @returns {Promise<Object>} Assembled prompt
     */
    async assemblePrompt(agentDefinition, request, context) {
        let promptContent = agentDefinition.promptTemplate || agentDefinition.systemPrompt;
        
        // Replace template variables
        const variables = {
            ...request,
            context: this.formatContextForPrompt(context),
            timestamp: new Date().toISOString(),
            agentType: agentDefinition.type
        };
        
        // Replace variables in prompt
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            promptContent = promptContent.replace(regex, 
                typeof value === 'string' ? value : JSON.stringify(value)
            );
        }
        
        return {
            content: promptContent,
            system: agentDefinition.systemPrompt || 
                   'You are a helpful AI assistant specialized in software development tasks.'
        };
    }

    /**
     * Format context for inclusion in prompt
     * @param {Object} context - Assembled context
     * @returns {string} Formatted context
     */
    formatContextForPrompt(context) {
        if (!context.items || context.items.length === 0) {
            return 'No relevant context available.';
        }
        
        let formatted = `# Relevant Context\n\n`;
        formatted += `Found ${context.items.length} relevant items from memory:\n\n`;
        
        // Group items by source type
        const groupedItems = {};
        for (const item of context.items.slice(0, 10)) { // Limit to top 10 items
            const sourceType = item.sourceType || 'unknown';
            if (!groupedItems[sourceType]) {
                groupedItems[sourceType] = [];
            }
            groupedItems[sourceType].push(item);
        }
        
        // Format each group
        for (const [sourceType, items] of Object.entries(groupedItems)) {
            formatted += `## ${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} Memory\n\n`;
            
            for (const item of items) {
                formatted += `- **${item.key}**: `;
                if (typeof item.data === 'string') {
                    formatted += item.data.length > 200 ? 
                        item.data.substring(0, 200) + '...' : item.data;
                } else {
                    formatted += JSON.stringify(item.data).substring(0, 200);
                }
                formatted += `\n`;
            }
            formatted += `\n`;
        }
        
        return formatted;
    }

    /**
     * Process agent response according to definition
     * @param {Object} llmResponse - LLM response
     * @param {Object} agentDefinition - Agent definition
     * @param {Object} request - Original request
     * @returns {Promise<Object>} Processed result
     */
    async processAgentResponse(llmResponse, agentDefinition, request) {
        let result = {
            content: llmResponse.content,
            rawResponse: llmResponse,
            metadata: {
                agentType: agentDefinition.type,
                model: llmResponse.model,
                usage: llmResponse.usage,
                timestamp: new Date().toISOString()
            }
        };
        
        // Apply response processing if defined
        if (agentDefinition.responseProcessor) {
            try {
                result = await agentDefinition.responseProcessor(result, request);
            } catch (processingError) {
                await logger.warn('Response processing failed', processingError, {
                    agentType: agentDefinition.type
                });
            }
        }
        
        // Validate response format if schema provided
        if (agentDefinition.responseSchema) {
            const validation = await this.validateResponseSchema(result, agentDefinition.responseSchema);
            if (!validation.valid) {
                throw new Error(`Response validation failed: ${validation.errors.join(', ')}`);
            }
        }
        
        return result;
    }

    /**
     * Store agent result in appropriate memory systems
     * @param {Object} executionContext - Execution context
     * @param {Object} result - Agent result
     * @returns {Promise<void>}
     */
    async storeAgentResult(executionContext, result) {
        try {
            const { agentDefinition, request } = executionContext;
            
            // Store in working memory for immediate access
            await workingMemory.setContext(`last_${agentDefinition.type}_result`, result);
            
            // Store execution history in episodic memory if available
            if (typeof episodicMemory !== 'undefined') {
                await episodicMemory.store(`execution:${executionContext.id}`, {
                    agentType: agentDefinition.type,
                    request: this.sanitizeRequest(request),
                    result: result,
                    executionTime: performance.now() - executionContext.startTime,
                    success: true
                }, {
                    type: 'execution',
                    category: 'agent_result',
                    agentType: agentDefinition.type,
                    tags: ['execution', 'result', agentDefinition.type],
                    priority: 5
                });
            }
            
        } catch (error) {
            await logger.warn('Failed to store agent result', error, {
                executionId: executionContext.id,
                agentType: executionContext.agentDefinition.type
            });
        }
    }

    /**
     * Validate agent definition
     * @param {Object} agentDefinition - Agent definition to validate
     */
    validateAgentDefinition(agentDefinition) {
        if (!agentDefinition || typeof agentDefinition !== 'object') {
            throw new Error('Agent definition must be an object');
        }
        
        const required = ['type', 'promptTemplate'];
        for (const field of required) {
            if (!agentDefinition[field]) {
                throw new Error(`Agent definition missing required field: ${field}`);
            }
        }
        
        if (typeof agentDefinition.type !== 'string') {
            throw new Error('Agent type must be a string');
        }
        
        if (typeof agentDefinition.promptTemplate !== 'string') {
            throw new Error('Agent prompt template must be a string');
        }
    }

    /**
     * Validate execution request
     * @param {Object} request - Request to validate
     */
    validateExecutionRequest(request) {
        if (!request || typeof request !== 'object') {
            throw new Error('Execution request must be an object');
        }
        
        // Additional validation can be added here based on specific requirements
    }

    /**
     * Validate workflow definition
     * @param {Array} workflow - Workflow to validate
     */
    validateWorkflow(workflow) {
        if (!Array.isArray(workflow)) {
            throw new Error('Workflow must be an array');
        }
        
        if (workflow.length === 0) {
            throw new Error('Workflow must contain at least one step');
        }
        
        for (let i = 0; i < workflow.length; i++) {
            const step = workflow[i];
            if (!step.agentDefinition) {
                throw new Error(`Workflow step ${i} missing agent definition`);
            }
            this.validateAgentDefinition(step.agentDefinition);
        }
    }

    /**
     * Validate response against schema
     * @param {Object} response - Response to validate
     * @param {Object} schema - Schema to validate against
     * @returns {Promise<Object>} Validation result
     */
    async validateResponseSchema(response, schema) {
        // Simple schema validation - can be enhanced with a proper JSON schema library
        const errors = [];
        
        if (schema.required && Array.isArray(schema.required)) {
            for (const field of schema.required) {
                if (response[field] === undefined) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Extract keywords from request for context assembly
     * @param {Object} request - Request object
     * @returns {Array<string>} Extracted keywords
     */
    extractKeywords(request) {
        const keywords = [];
        
        if (request.description) {
            // Simple keyword extraction from description
            const words = request.description.toLowerCase().match(/\b\w{3,}\b/g) || [];
            keywords.push(...words.slice(0, 10)); // Limit to 10 keywords
        }
        
        if (request.type) {
            keywords.push(request.type);
        }
        
        if (request.tags && Array.isArray(request.tags)) {
            keywords.push(...request.tags);
        }
        
        return [...new Set(keywords)]; // Remove duplicates
    }

    /**
     * Apply output mapping to transform step results
     * @param {Object} result - Step result
     * @param {Object} mapping - Output mapping configuration
     * @returns {Object} Mapped result
     */
    applyOutputMapping(result, mapping) {
        const mapped = {};
        
        for (const [key, path] of Object.entries(mapping)) {
            // Simple path mapping (e.g., "content" -> result.content)
            const value = this.getValueAtPath(result, path);
            if (value !== undefined) {
                mapped[key] = value;
            }
        }
        
        return mapped;
    }

    /**
     * Get value at object path
     * @param {Object} obj - Object to query
     * @param {string} path - Dot-separated path
     * @returns {any} Value at path
     */
    getValueAtPath(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is retryable
     */
    isRetryableError(error) {
        // Network errors and timeouts are generally retryable
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            return true;
        }
        
        // Rate limit errors are retryable
        if (error.message && error.message.includes('rate limit')) {
            return true;
        }
        
        // Server errors (5xx) are retryable
        if (error.status && error.status >= 500) {
            return true;
        }
        
        return false;
    }

    /**
     * Start the execution queue processor
     */
    startQueueProcessor() {
        setInterval(async () => {
            if (!this.isProcessing && this.executionQueue.length > 0) {
                await this.processExecutionQueue();
            }
        }, 1000);
    }

    /**
     * Process the execution queue
     * @returns {Promise<void>}
     */
    async processExecutionQueue() {
        if (this.isProcessing || this.executionQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            while (this.executionQueue.length > 0 && 
                   this.activeAgents.size < this.maxConcurrentAgents) {
                
                const queuedExecution = this.executionQueue.shift();
                
                // Execute asynchronously
                this.executeAgent(
                    queuedExecution.agentDefinition,
                    queuedExecution.request,
                    queuedExecution.options
                ).then(queuedExecution.resolve)
                 .catch(queuedExecution.reject);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Queue agent execution
     * @param {Object} agentDefinition - Agent definition
     * @param {Object} request - Execution request
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Execution result
     */
    queueExecution(agentDefinition, request, options = {}) {
        return new Promise((resolve, reject) => {
            this.executionQueue.push({
                agentDefinition,
                request,
                options,
                resolve,
                reject,
                queuedAt: Date.now()
            });
        });
    }

    /**
     * Update execution statistics
     * @param {string} agentType - Type of agent
     * @param {number} executionTime - Execution time in ms
     * @param {boolean} success - Whether execution was successful
     */
    updateExecutionStats(agentType, executionTime, success) {
        this.stats.totalExecutions++;
        
        if (success) {
            this.stats.successfulExecutions++;
        } else {
            this.stats.failedExecutions++;
        }
        
        // Update average execution time
        const totalTime = this.stats.averageExecutionTime * (this.stats.totalExecutions - 1);
        this.stats.averageExecutionTime = (totalTime + executionTime) / this.stats.totalExecutions;
        
        // Update agent-specific stats
        if (!this.stats.agentUsage[agentType]) {
            this.stats.agentUsage[agentType] = {
                executions: 0,
                successes: 0,
                failures: 0,
                averageTime: 0
            };
        }
        
        const agentStats = this.stats.agentUsage[agentType];
        agentStats.executions++;
        
        if (success) {
            agentStats.successes++;
        } else {
            agentStats.failures++;
        }
        
        const agentTotalTime = agentStats.averageTime * (agentStats.executions - 1);
        agentStats.averageTime = (agentTotalTime + executionTime) / agentStats.executions;
    }

    /**
     * Update workflow statistics
     * @param {string} workflowId - Workflow ID
     * @param {number} executionTime - Execution time in ms
     * @param {boolean} success - Whether workflow was successful
     */
    updateWorkflowStats(workflowId, executionTime, success) {
        if (!this.stats.workflowStats.total) {
            this.stats.workflowStats = {
                total: 0,
                successes: 0,
                failures: 0,
                averageTime: 0
            };
        }
        
        const stats = this.stats.workflowStats;
        stats.total++;
        
        if (success) {
            stats.successes++;
        } else {
            stats.failures++;
        }
        
        const totalTime = stats.averageTime * (stats.total - 1);
        stats.averageTime = (totalTime + executionTime) / stats.total;
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener function
     */
    addEventListener(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(listener);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener function
     */
    removeEventListener(event, listener) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(listener);
        }
    }

    /**
     * Emit event to listeners
     * @param {string} event - Event name
     * @param {Object} data - Event data
     * @returns {Promise<void>}
     */
    async emitEvent(event, data) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const promises = [];
            
            for (const listener of listeners) {
                try {
                    promises.push(Promise.resolve(listener(data)));
                } catch (error) {
                    await logger.warn('Event listener error', error, { event, data });
                }
            }
            
            await Promise.allSettled(promises);
        }
    }

    /**
     * Load configuration
     */
    async loadConfiguration() {
        try {
            const performanceSettings = await configManager.getPerformanceSettings();
            this.maxConcurrentAgents = performanceSettings.concurrency?.maxOperations || this.maxConcurrentAgents;
            this.defaultTimeout = performanceSettings.timeout || this.defaultTimeout;
            
        } catch (error) {
            await logger.warn('Failed to load agent engine configuration', error);
        }
    }

    /**
     * Sanitize request for logging
     * @param {Object} request - Request to sanitize
     * @returns {Object} Sanitized request
     */
    sanitizeRequest(request) {
        const sanitized = { ...request };
        
        // Remove sensitive or large data
        if (sanitized.data && typeof sanitized.data === 'object') {
            sanitized.data = '[Object]';
        }
        
        if (sanitized.context && typeof sanitized.context === 'object') {
            sanitized.context = '[Context]';
        }
        
        return sanitized;
    }

    /**
     * Generate unique execution ID
     * @returns {string} Execution ID
     */
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique workflow ID
     * @returns {string} Workflow ID
     */
    generateWorkflowId() {
        return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
     * Get engine statistics
     * @returns {Object} Engine statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeAgents: this.activeAgents.size,
            queueLength: this.executionQueue.length,
            maxConcurrentAgents: this.maxConcurrentAgents,
            successRate: this.stats.totalExecutions > 0 ? 
                this.stats.successfulExecutions / this.stats.totalExecutions : 0
        };
    }

    /**
     * Get active agents information
     * @returns {Array} Active agents info
     */
    getActiveAgents() {
        return Array.from(this.activeAgents.values()).map(context => ({
            id: context.id,
            agentType: context.agentDefinition.type,
            state: context.state,
            startTime: context.startTime,
            timeout: context.timeout
        }));
    }

    /**
     * Cancel agent execution
     * @param {string} executionId - Execution ID to cancel
     * @returns {Promise<boolean>} Whether cancellation was successful
     */
    async cancelExecution(executionId) {
        const context = this.activeAgents.get(executionId);
        if (!context) {
            return false;
        }
        
        context.state = 'cancelled';
        this.activeAgents.delete(executionId);
        
        await this.emitEvent('agent_cancelled', {
            executionId,
            agentType: context.agentDefinition.type
        });
        
        return true;
    }
}

// Create and export singleton instance
export const agentEngine = new AgentEngine();

// Export for ES6 modules
export default AgentEngine;