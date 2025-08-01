import { ErrorHandler } from '../core/errors.js';
import { CacheManager } from '../core/cache.js';
import { MemoryStore } from '../memory/store.js';
import { MemoryOperations } from '../memory/operations.js';
import { ContextManager } from '../memory/context.js';
import { LLMInterface } from '../llm/interface.js';
import { PromptEngine } from '../llm/prompts.js';
import { OpenRouterClient } from '../llm/openrouter.js';

export class AgentEngine {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        
        // Core components
        this.errorHandler = null;
        this.cache = null;
        this.memoryStore = null;
        this.memoryOps = null;
        this.contextManager = null;
        this.llmInterface = null;
        this.promptEngine = null;
        this.openRouterClient = null;
        
        // Agent state
        this.state = 'idle';
        this.currentTask = null;
        this.operationQueue = [];
        this.stats = {
            tasksCompleted: 0,
            totalResponseTime: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        // Event system
        this.listeners = new Map();
        
        this.initialized = false;
    }

    async init() {
        try {
            this.logger.info('AgentEngine', 'Initializing agent engine...');
            
            // Initialize core systems
            this.errorHandler = new ErrorHandler(this.logger, this.config);
            this.cache = new CacheManager(this.config, this.logger);
            
            // Initialize memory system
            this.memoryStore = new MemoryStore(this.config, this.logger, this.cache);
            await this.memoryStore.init();
            
            this.memoryOps = new MemoryOperations(this.memoryStore, this.logger);
            this.contextManager = new ContextManager(this.memoryOps, this.logger);
            
            // Initialize LLM system
            this.openRouterClient = new OpenRouterClient(this.config, this.logger);
            this.llmInterface = new LLMInterface(this.config, this.logger, this.errorHandler);
            await this.llmInterface.init();
            
            this.promptEngine = new PromptEngine(this.config, this.logger, this.cache);
            
            // Set up agent configuration
            const agentConfig = this.config.getAgentConfig();
            if (agentConfig.capabilities && agentConfig.capabilities.length > 0) {
                this.emit('capabilitiesLoaded', agentConfig.capabilities);
            }
            
            if (agentConfig.tools && agentConfig.tools.length > 0) {
                this.emit('toolsLoaded', agentConfig.tools);
            }
            
            this.initialized = true;
            this.setState('idle');
            
            this.logger.info('AgentEngine', 'Agent engine initialized successfully');
            
        } catch (error) {
            this.logger.error('AgentEngine', 'Failed to initialize agent engine', error);
            throw error;
        }
    }

    async processUserMessage(message) {
        if (!this.initialized) {
            throw new Error('Agent engine not initialized');
        }
        
        const timer = this.logger.startTimer('process_user_message');
        
        try {
            // Emit operation start for flow tracking
            this.emit('operationStart', {
                type: 'process_user_message',
                description: 'Processing user message and generating response',
                context: { messageLength: message.length }
            });
            this.setState('thinking');
            this.emit('processing', true);
            
            // Create task
            const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.currentTask = {
                id: taskId,
                message,
                startTime: Date.now(),
                state: 'analyzing'
            };
            
            // Build context for this request
            this.emit('operationStart', {
                type: 'context_building',
                description: 'Building context from memory systems',
                context: { taskId, domain: 'business_analysis' }
            });
            
            const context = await this.contextManager.buildContext(
                'agent_1', 
                taskId, 
                'business_requirements', 
                {
                    query: message,
                    domain: 'business_analysis',
                    urgency: 'normal'
                }
            );
            
            this.emit('operationComplete', {
                success: true,
                data: { contextItems: Object.keys(context.memory).length },
                duration: 0 // Will be calculated by timer
            });
            
            // Generate system prompt
            this.emit('operationStart', {
                type: 'prompt_generation',
                description: 'Generating system and user prompts',
                context: { operation: 'business_requirements' }
            });
            
            const agentConfig = this.config.getAgentConfig();
            const systemPrompt = await this.promptEngine.generateSystemPrompt(
                agentConfig,
                context,
                'business_requirements',
                context.memory
            );
            
            // Generate user prompt
            const userPrompt = await this.promptEngine.generateUserPrompt(
                'business_requirements',
                context,
                { requirements: message },
                context.memory
            );
            
            this.emit('operationComplete', {
                success: true,
                data: { 
                    systemPromptLength: systemPrompt.length,
                    userPromptLength: userPrompt.length 
                },
                duration: 0
            });
            
            // Get LLM response
            this.setState('processing');
            
            this.emit('operationStart', {
                type: 'llm_request',
                description: 'Sending request to LLM for analysis',
                context: { 
                    model: this.config.get('llm.model'),
                    provider: this.config.get('llm.provider')
                }
            });
            
            const response = await this.llmInterface.sendRequest(
                systemPrompt,
                [{ role: 'user', content: userPrompt }],
                { parser: 'analysis' }
            );
            
            // Emit LLM call event for flow tracking
            this.emit('llmCall', {
                model: response.model || this.config.get('llm.model'),
                provider: response.provider || this.config.get('llm.provider'),
                tokens: response.usage?.total_tokens || 0,
                duration: response.duration || 0,
                promptLength: systemPrompt.length + userPrompt.length
            });
            
            this.emit('operationComplete', {
                success: true,
                data: { 
                    responseLength: response.content?.length || 0,
                    tokens: response.usage?.total_tokens || 0
                },
                duration: response.duration || 0
            });
            
            // Store interaction in episodic memory
            this.emit('operationStart', {
                type: 'memory_update',
                description: 'Storing interaction in episodic memory',
                context: { memoryType: 'episodic', key: `interaction_${taskId}` }
            });
            
            await this.memoryOps.memoryUpdateOp({
                userMessage: message,
                agentResponse: response.content,
                context: context.synthesis,
                timestamp: Date.now(),
                success: true
            }, 'episodic', {
                key: `interaction_${taskId}`,
                tags: ['user_interaction', 'business_requirements'],
                importance: 0.6
            });
            
            // Emit memory access for flow tracking
            this.emit('memoryAccess', {
                type: 'episodic',
                operation: 'store',
                key: `interaction_${taskId}`,
                hitMiss: 'store'
            });
            
            // Update working memory
            await this.memoryOps.workingMemoryOp({
                taskId,
                operation: 'complete',
                data: {
                    state: 'completed',
                    result: response.content,
                    success: true
                }
            });
            
            this.emit('memoryAccess', {
                type: 'working',
                operation: 'update',
                key: taskId,
                hitMiss: 'update'
            });
            
            this.emit('operationComplete', {
                success: true,
                data: { memoryUpdated: true },
                duration: 0
            });
            
            // Update stats
            const duration = timer.stop();
            this.stats.tasksCompleted++;
            this.stats.totalResponseTime += duration;
            
            this.setState('idle');
            this.currentTask = null;
            
            // Emit response
            this.emit('response', {
                content: response.content,
                parsed: response.parsed,
                metadata: {
                    taskId,
                    duration,
                    model: response.model,
                    tokens: response.usage?.total_tokens
                }
            });
            
            this.logger.info('AgentEngine', `Processed user message in ${duration}ms`);
            
        } catch (error) {
            const duration = timer.stop();
            this.stats.errors++;
            
            this.setState('error');
            this.currentTask = null;
            
            this.logger.error('AgentEngine', 'Failed to process user message', error);
            
            // Emit error
            this.emit('response', {
                error: error.message,
                metadata: {
                    duration,
                    success: false
                }
            });
            
            // Return to idle after error
            setTimeout(() => {
                if (this.state === 'error') {
                    this.setState('idle');
                }
            }, 3000);
            
        } finally {
            this.emit('processing', false);
        }
    }

    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        
        this.logger.debug('AgentEngine', `State changed: ${oldState} -> ${newState}`);
        
        this.emit('stateChange', {
            name: newState,
            previous: oldState,
            timestamp: Date.now()
        });
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this.logger.error('AgentEngine', `Error in event listener for ${event}`, error);
                }
            });
        }
    }

    // Statistics and monitoring
    async getStats() {
        const avgResponseTime = this.stats.tasksCompleted > 0 
            ? this.stats.totalResponseTime / this.stats.tasksCompleted 
            : 0;
        
        const memoryStats = this.memoryStore ? this.memoryStore.getMemoryStats() : {};
        const cacheStats = this.cache ? this.cache.getStats() : {};
        
        return {
            tasksCompleted: this.stats.tasksCompleted,
            avgResponseTime: Math.round(avgResponseTime),
            errors: this.stats.errors,
            uptime: Date.now() - this.stats.startTime,
            currentState: this.state,
            memoryUsage: memoryStats.total || 0,
            cacheHitRate: cacheStats.hitRate || 0,
            ...memoryStats
        };
    }

    async getMemoryStats() {
        if (!this.memoryStore) return {};
        return this.memoryStore.getMemoryStats();
    }

    async getMemoryData() {
        if (!this.memoryStore) return {};
        
        // Get sample data from each memory type
        const memoryData = {};
        const memoryTypes = ['working', 'semantic', 'episodic', 'procedural'];
        
        for (const type of memoryTypes) {
            try {
                const results = await this.memoryOps.store.search(type, '', { limit: 20 });
                memoryData[type] = results.map(result => ({
                    key: result.key,
                    data: result.value,
                    importance: result.metadata?.importance || 0.5,
                    timestamp: result.metadata?.timestamp || Date.now(),
                    tags: result.metadata?.tags || [],
                    accessCount: result.metadata?.accessCount || 0
                }));
            } catch (error) {
                this.logger.warn('AgentEngine', `Failed to get ${type} memory data`, error);
                memoryData[type] = [];
            }
        }
        
        return memoryData;
    }

    async getToolStats() {
        // Mock tool stats for now
        return {
            application_catalog: { status: 'available' },
            project_history: { status: 'available' },
            roadmap_data: { status: 'available' },
            estimation_engine: { status: 'available' }
        };
    }

    async clearMemory(memoryType = 'all') {
        if (!this.memoryStore) return;
        
        if (memoryType === 'all') {
            await this.memoryStore.clearAll();
        } else {
            this.memoryStore.clearMemoryType(memoryType);
        }
        
        this.emit('memoryUpdate', {
            type: memoryType,
            operation: 'clear',
            data: null
        });
        
        this.logger.info('AgentEngine', `Cleared ${memoryType} memory`);
    }

    // Configuration updates
    updateConfiguration(newConfig) {
        this.config.mergeConfig(newConfig);
        this.logger.info('AgentEngine', 'Configuration updated');
    }

    // LLM provider switching
    async switchLLMProvider(provider, options = {}) {
        if (this.llmInterface) {
            this.llmInterface.switchProvider(provider, options);
            this.logger.info('AgentEngine', `Switched LLM provider to ${provider}`);
        }
    }

    // Test methods
    async testConnection() {
        if (!this.llmInterface) {
            return { success: false, error: 'LLM interface not initialized' };
        }
        
        return await this.llmInterface.testConnection();
    }

    async testMemory() {
        if (!this.memoryStore) {
            return { success: false, error: 'Memory store not initialized' };
        }
        
        try {
            // Test basic memory operations
            const testKey = 'test_' + Date.now();
            const testData = { test: true, timestamp: Date.now() };
            
            await this.memoryStore.store('working', testKey, testData);
            const retrieved = await this.memoryStore.retrieve('working', testKey);
            
            const success = retrieved && retrieved.test === true;
            
            // Clean up
            this.memoryStore.getMemoryMap('working').delete(testKey);
            
            return { success, message: success ? 'Memory test passed' : 'Memory test failed' };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Utility methods
    getState() {
        return this.state;
    }

    getCurrentTask() {
        return this.currentTask;
    }

    isInitialized() {
        return this.initialized;
    }

    // Shutdown
    async shutdown() {
        this.logger.info('AgentEngine', 'Shutting down agent engine...');
        
        this.setState('shutdown');
        this.listeners.clear();
        
        // Clean up resources
        if (this.memoryStore) {
            // Persist any pending memory operations
            this.logger.info('AgentEngine', 'Persisting memory before shutdown...');
        }
        
        this.initialized = false;
        this.logger.info('AgentEngine', 'Agent engine shutdown complete');
    }
}