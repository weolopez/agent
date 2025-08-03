/**
 * Procedural Memory
 * Stores workflow templates, prompt optimization data, best practices repositories,
 * and tool configurations. Implements "how-to" knowledge patterns.
 * 
 * Follows the ProceduralMemory interface defined in API_CONTRACTS.md
 */

import MemoryStore from './memory-store.js';
import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';

export class ProceduralMemory extends MemoryStore {
    constructor() {
        super('procedural', {
            maxItems: 25000,
            maxSize: 75 * 1024 * 1024, // 75MB as per config
            enableCache: true,
            enableCompression: true,
            autoCleanup: true,
            cleanupInterval: 600000 // 10 minutes
        });
        
        this.workflowTemplates = new Map(); // Cached workflow templates
        this.promptTemplates = new Map(); // Cached prompt templates
        this.bestPractices = new Map(); // Cached best practices
        this.toolConfigurations = new Map(); // Cached tool configs
        this.optimizations = new Map(); // Cached optimizations
        
        this.initialize();
    }

    /**
     * Initialize procedural memory with base templates and practices
     */
    async initialize() {
        await super.initialize();
        
        try {
            await this.loadBaseWorkflowTemplates();
            await this.loadBasePromptTemplates();
            await this.loadBaseBestPractices();
            await this.loadExistingTemplates();
            
            await logger.info('Procedural Memory initialized with templates and practices', {
                memoryType: this.memoryType,
                workflowTemplates: this.workflowTemplates.size,
                promptTemplates: this.promptTemplates.size,
                bestPractices: this.bestPractices.size
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'procedural_memory_initialization',
                component: 'ProceduralMemory'
            });
        }
    }

    /**
     * Store workflow template
     * @param {Object} template - Workflow template object
     * @returns {Promise<void>}
     */
    async storeWorkflowTemplate(template) {
        try {
            this.validateWorkflowTemplate(template);

            const templateKey = `workflow:${template.id}`;
            
            await this.store(templateKey, template, {
                type: 'procedural',
                category: 'workflow',
                tags: ['workflow', 'template', template.type],
                priority: this.calculateTemplatePriority(template),
                version: template.version || '1.0.0'
            });

            // Update template cache
            this.workflowTemplates.set(template.id, template);

            await logger.info('Workflow template stored', {
                templateId: template.id,
                name: template.name,
                type: template.type,
                version: template.version,
                steps: template.steps?.length || 0
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_workflow_template',
                component: 'ProceduralMemory',
                metadata: { template }
            });
            throw error;
        }
    }

    /**
     * Retrieve workflow template
     * @param {string} templateId - Template identifier
     * @returns {Promise<Object|null>} Workflow template
     */
    async getWorkflowTemplate(templateId) {
        try {
            // Check cache first
            if (this.workflowTemplates.has(templateId)) {
                return this.workflowTemplates.get(templateId);
            }

            // Retrieve from storage
            const templateKey = `workflow:${templateId}`;
            const item = await this.retrieve(templateKey);
            
            if (item) {
                // Update cache
                this.workflowTemplates.set(templateId, item.data);
                return item.data;
            }

            return null;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_workflow_template',
                component: 'ProceduralMemory',
                metadata: { templateId }
            });
            return null;
        }
    }

    /**
     * Find workflow templates by criteria
     * @param {Object} criteria - Search criteria
     * @returns {Promise<Array>} Matching workflow templates
     */
    async findWorkflowTemplates(criteria) {
        try {
            const {
                type,
                complexity,
                domain,
                minSuccessRate = 0,
                tags = [],
                limit = 50
            } = criteria;

            let results = await this.query({
                type: 'procedural',
                category: 'workflow',
                limit: limit * 2 // Get more to filter
            });

            // Filter by criteria
            results = results.filter(item => {
                const template = item.data;
                
                if (type && template.type !== type) {
                    return false;
                }
                
                if (complexity && template.complexity !== complexity) {
                    return false;
                }
                
                if (domain && template.domain !== domain) {
                    return false;
                }
                
                if (template.metrics?.successRate < minSuccessRate) {
                    return false;
                }
                
                if (tags.length > 0) {
                    const templateTags = item.metadata.tags || [];
                    const hasMatchingTag = tags.some(tag => templateTags.includes(tag));
                    if (!hasMatchingTag) {
                        return false;
                    }
                }
                
                return true;
            });

            // Sort by success rate and usage frequency
            results.sort((a, b) => {
                const scoreA = (a.data.metrics?.successRate || 0) * 0.6 + 
                              (a.data.metrics?.usageCount || 0) * 0.4;
                const scoreB = (b.data.metrics?.successRate || 0) * 0.6 + 
                              (b.data.metrics?.usageCount || 0) * 0.4;
                return scoreB - scoreA;
            });

            return results.slice(0, limit).map(r => r.data);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'find_workflow_templates',
                component: 'ProceduralMemory',
                metadata: { criteria }
            });
            return [];
        }
    }

    /**
     * Store prompt template
     * @param {Object} template - Prompt template object
     * @returns {Promise<void>}
     */
    async storePromptTemplate(template) {
        try {
            this.validatePromptTemplate(template);

            const templateKey = `prompt:${template.id}`;
            
            await this.store(templateKey, template, {
                type: 'procedural',
                category: 'prompt',
                tags: ['prompt', 'template', template.agentType],
                priority: this.calculatePromptPriority(template),
                agentType: template.agentType,
                version: template.version || '1.0.0'
            });

            // Update template cache
            this.promptTemplates.set(template.id, template);

            await logger.info('Prompt template stored', {
                templateId: template.id,
                agentType: template.agentType,
                version: template.version,
                optimizationScore: template.metrics?.optimizationScore || 0
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_prompt_template',
                component: 'ProceduralMemory',
                metadata: { template }
            });
            throw error;
        }
    }

    /**
     * Get prompt template for agent type
     * @param {string} agentType - Agent type
     * @param {Object} context - Context for template selection
     * @returns {Promise<Object|null>} Best prompt template
     */
    async getPromptTemplate(agentType, context = {}) {
        try {
            // Find templates for this agent type
            const templates = await this.query({
                type: 'procedural',
                category: 'prompt',
                agentType,
                limit: 100
            });

            if (templates.length === 0) {
                return null;
            }

            // Score templates based on context match and performance
            let bestTemplate = null;
            let bestScore = -1;

            for (const item of templates) {
                const template = item.data;
                const score = this.scorePromptTemplate(template, context);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestTemplate = template;
                }
            }

            // Update template cache
            if (bestTemplate) {
                this.promptTemplates.set(bestTemplate.id, bestTemplate);
            }

            return bestTemplate;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_prompt_template',
                component: 'ProceduralMemory',
                metadata: { agentType, context }
            });
            return null;
        }
    }

    /**
     * Optimize prompt template based on feedback
     * @param {string} templateId - Template ID
     * @param {Object} feedback - Performance feedback
     * @returns {Promise<Object>} Optimization result
     */
    async optimizePromptTemplate(templateId, feedback) {
        try {
            const template = await this.getPromptTemplate(templateId);
            if (!template) {
                throw new Error(`Template ${templateId} not found`);
            }

            // Generate optimization suggestions
            const optimization = await this.generatePromptOptimization(template, feedback);
            
            // Store optimization
            const optimizationKey = `optimization:${templateId}:${Date.now()}`;
            await this.store(optimizationKey, optimization, {
                type: 'procedural',
                category: 'optimization',
                templateId,
                tags: ['optimization', 'prompt'],
                priority: 8
            });

            // Update optimization cache
            this.optimizations.set(optimizationKey, optimization);

            // Apply optimization if it passes validation
            if (optimization.confidence > 0.7) {
                const optimizedTemplate = await this.applyOptimization(template, optimization);
                await this.storePromptTemplate(optimizedTemplate);
            }

            await logger.info('Prompt template optimization completed', {
                templateId,
                optimizationType: optimization.type,
                confidence: optimization.confidence,
                applied: optimization.confidence > 0.7
            });

            return optimization;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'optimize_prompt_template',
                component: 'ProceduralMemory',
                metadata: { templateId, feedback }
            });
            throw error;
        }
    }

    /**
     * Store best practice
     * @param {Object} practice - Best practice object
     * @returns {Promise<void>}
     */
    async storeBestPractice(practice) {
        try {
            this.validateBestPractice(practice);

            const practiceKey = `practice:${practice.id}`;
            
            await this.store(practiceKey, practice, {
                type: 'procedural',
                category: 'practice',
                tags: ['practice', practice.category, practice.domain],
                priority: this.calculatePracticePriority(practice),
                domain: practice.domain,
                category: practice.category
            });

            // Update practice cache
            this.bestPractices.set(practice.id, practice);

            await logger.info('Best practice stored', {
                practiceId: practice.id,
                title: practice.title,
                category: practice.category,
                domain: practice.domain,
                confidence: practice.confidence
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_best_practice',
                component: 'ProceduralMemory',
                metadata: { practice }
            });
            throw error;
        }
    }

    /**
     * Get best practices for domain and category
     * @param {Object} criteria - Search criteria
     * @returns {Promise<Array>} Relevant best practices
     */
    async getBestPractices(criteria) {
        try {
            const {
                domain,
                category,
                task,
                minConfidence = 0.5,
                limit = 20
            } = criteria;

            let results = await this.query({
                type: 'procedural',
                category: 'practice',
                domain,
                limit: limit * 2
            });

            // Filter by criteria
            results = results.filter(item => {
                const practice = item.data;
                
                if (category && practice.category !== category) {
                    return false;
                }
                
                if (practice.confidence < minConfidence) {
                    return false;
                }
                
                if (task && practice.applicableTasks && 
                    !practice.applicableTasks.some(t => t.toLowerCase().includes(task.toLowerCase()))) {
                    return false;
                }
                
                return true;
            });

            // Calculate relevance scores
            for (const result of results) {
                result.relevanceScore = this.calculatePracticeRelevance(result.data, criteria);
            }

            // Sort by relevance and confidence
            results.sort((a, b) => {
                const scoreA = (a.relevanceScore * 0.6) + (a.data.confidence * 0.4);
                const scoreB = (b.relevanceScore * 0.6) + (b.data.confidence * 0.4);
                return scoreB - scoreA;
            });

            return results.slice(0, limit).map(r => r.data);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_best_practices',
                component: 'ProceduralMemory',
                metadata: { criteria }
            });
            return [];
        }
    }

    /**
     * Store tool configuration
     * @param {Object} config - Tool configuration object
     * @returns {Promise<void>}
     */
    async storeToolConfiguration(config) {
        try {
            this.validateToolConfiguration(config);

            const configKey = `tool:${config.toolName}:${config.id}`;
            
            await this.store(configKey, config, {
                type: 'procedural',
                category: 'tool',
                toolName: config.toolName,
                tags: ['tool', 'configuration', config.toolName],
                priority: this.calculateConfigPriority(config)
            });

            // Update configuration cache
            if (!this.toolConfigurations.has(config.toolName)) {
                this.toolConfigurations.set(config.toolName, new Map());
            }
            this.toolConfigurations.get(config.toolName).set(config.id, config);

            await logger.info('Tool configuration stored', {
                toolName: config.toolName,
                configId: config.id,
                environment: config.environment,
                performance: config.metrics?.performance || 0
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_tool_configuration',
                component: 'ProceduralMemory',
                metadata: { config }
            });
            throw error;
        }
    }

    /**
     * Get optimal tool configuration
     * @param {string} toolName - Tool name
     * @param {Object} context - Usage context
     * @returns {Promise<Object|null>} Optimal configuration
     */
    async getOptimalToolConfiguration(toolName, context = {}) {
        try {
            // Get all configurations for this tool
            const configs = await this.query({
                type: 'procedural',
                category: 'tool',
                toolName,
                limit: 100
            });

            if (configs.length === 0) {
                return null;
            }

            // Score configurations based on context and performance
            let bestConfig = null;
            let bestScore = -1;

            for (const item of configs) {
                const config = item.data;
                const score = this.scoreToolConfiguration(config, context);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestConfig = config;
                }
            }

            return bestConfig;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_optimal_tool_configuration',
                component: 'ProceduralMemory',
                metadata: { toolName, context }
            });
            return null;
        }
    }

    /**
     * Update workflow template metrics
     * @param {string} templateId - Template ID
     * @param {Object} metrics - Updated metrics
     * @returns {Promise<void>}
     */
    async updateWorkflowMetrics(templateId, metrics) {
        try {
            const template = await this.getWorkflowTemplate(templateId);
            if (!template) {
                throw new Error(`Workflow template ${templateId} not found`);
            }

            const updatedTemplate = {
                ...template,
                metrics: {
                    ...template.metrics,
                    ...metrics,
                    lastUpdate: new Date().toISOString()
                }
            };

            await this.storeWorkflowTemplate(updatedTemplate);

            await logger.debug('Workflow template metrics updated', {
                templateId,
                updatedMetrics: Object.keys(metrics)
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'update_workflow_metrics',
                component: 'ProceduralMemory',
                metadata: { templateId, metrics }
            });
            throw error;
        }
    }

    /**
     * Learn from workflow execution
     * @param {Object} execution - Workflow execution data
     * @returns {Promise<void>}
     */
    async learnFromExecution(execution) {
        try {
            this.validateExecutionData(execution);

            // Update template metrics
            if (execution.templateId) {
                const metrics = {
                    usageCount: 1,
                    successRate: execution.success ? 1 : 0,
                    averageDuration: execution.duration || 0,
                    lastUsed: execution.timestamp
                };
                
                await this.updateWorkflowMetrics(execution.templateId, metrics);
            }

            // Extract learnings and create new practices if patterns emerge
            await this.extractLearningsFromExecution(execution);

            // Store execution for future analysis
            const executionKey = `execution:${execution.id || Date.now()}`;
            await this.store(executionKey, execution, {
                type: 'procedural',
                category: 'execution',
                tags: ['execution', 'learning'],
                priority: 5
            });

            await logger.info('Learned from workflow execution', {
                executionId: execution.id,
                templateId: execution.templateId,
                success: execution.success,
                duration: execution.duration
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'learn_from_execution',
                component: 'ProceduralMemory',
                metadata: { execution }
            });
            throw error;
        }
    }

    /**
     * Get workflow recommendations
     * @param {Object} task - Task description
     * @returns {Promise<Array>} Recommended workflows
     */
    async getWorkflowRecommendations(task) {
        try {
            const {
                type,
                complexity,
                domain,
                requirements = [],
                constraints = []
            } = task;

            // Find matching workflow templates
            const templates = await this.findWorkflowTemplates({
                type,
                complexity,
                domain,
                minSuccessRate: 0.3,
                limit: 10
            });

            // Score templates for this specific task
            const recommendations = templates.map(template => ({
                template,
                score: this.scoreWorkflowForTask(template, task),
                confidence: this.calculateRecommendationConfidence(template, task),
                estimatedDuration: template.metrics?.averageDuration || 0,
                successProbability: template.metrics?.successRate || 0.5
            }));

            // Sort by score
            recommendations.sort((a, b) => b.score - a.score);

            return recommendations.slice(0, 5); // Top 5 recommendations

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_workflow_recommendations',
                component: 'ProceduralMemory',
                metadata: { task }
            });
            return [];
        }
    }

    // Utility Methods

    /**
     * Validate workflow template structure
     * @param {Object} template - Template to validate
     */
    validateWorkflowTemplate(template) {
        const required = ['id', 'name', 'type', 'steps', 'version'];
        
        for (const field of required) {
            if (!template[field]) {
                throw new Error(`Workflow template missing required field: ${field}`);
            }
        }

        if (!Array.isArray(template.steps) || template.steps.length === 0) {
            throw new Error('Workflow template must have at least one step');
        }

        const validTypes = ['development', 'analysis', 'testing', 'deployment', 'optimization'];
        if (!validTypes.includes(template.type)) {
            throw new Error(`Invalid workflow type: ${template.type}`);
        }

        // Validate steps
        for (const step of template.steps) {
            if (!step.id || !step.name || !step.type) {
                throw new Error('Each workflow step must have id, name, and type');
            }
        }
    }

    /**
     * Validate prompt template structure
     * @param {Object} template - Template to validate
     */
    validatePromptTemplate(template) {
        const required = ['id', 'agentType', 'template', 'version'];
        
        for (const field of required) {
            if (!template[field]) {
                throw new Error(`Prompt template missing required field: ${field}`);
            }
        }

        const validAgentTypes = ['analyst', 'planner', 'developer', 'tester'];
        if (!validAgentTypes.includes(template.agentType)) {
            throw new Error(`Invalid agent type: ${template.agentType}`);
        }

        if (typeof template.template !== 'string' || template.template.length === 0) {
            throw new Error('Template must be a non-empty string');
        }
    }

    /**
     * Validate best practice structure
     * @param {Object} practice - Practice to validate
     */
    validateBestPractice(practice) {
        const required = ['id', 'title', 'description', 'category', 'domain', 'confidence'];
        
        for (const field of required) {
            if (!practice[field]) {
                throw new Error(`Best practice missing required field: ${field}`);
            }
        }

        if (typeof practice.confidence !== 'number' || 
            practice.confidence < 0 || practice.confidence > 1) {
            throw new Error('Confidence must be a number between 0 and 1');
        }

        const validCategories = ['code_quality', 'performance', 'security', 'testing', 'architecture'];
        if (!validCategories.includes(practice.category)) {
            throw new Error(`Invalid practice category: ${practice.category}`);
        }
    }

    /**
     * Validate tool configuration structure
     * @param {Object} config - Configuration to validate
     */
    validateToolConfiguration(config) {
        const required = ['id', 'toolName', 'settings', 'environment'];
        
        for (const field of required) {
            if (!config[field]) {
                throw new Error(`Tool configuration missing required field: ${field}`);
            }
        }

        if (typeof config.settings !== 'object' || config.settings === null) {
            throw new Error('Configuration settings must be an object');
        }

        const validEnvironments = ['development', 'testing', 'production'];
        if (!validEnvironments.includes(config.environment)) {
            throw new Error(`Invalid environment: ${config.environment}`);
        }
    }

    /**
     * Validate execution data structure
     * @param {Object} execution - Execution data to validate
     */
    validateExecutionData(execution) {
        const required = ['timestamp', 'success'];
        
        for (const field of required) {
            if (execution[field] === undefined || execution[field] === null) {
                throw new Error(`Execution data missing required field: ${field}`);
            }
        }

        if (typeof execution.success !== 'boolean') {
            throw new Error('Success field must be a boolean');
        }

        if (execution.duration !== undefined && 
            (typeof execution.duration !== 'number' || execution.duration < 0)) {
            throw new Error('Duration must be a positive number');
        }
    }

    /**
     * Calculate template priority
     * @param {Object} template - Template object
     * @returns {number} Priority score (1-10)
     */
    calculateTemplatePriority(template) {
        let priority = 5; // Base priority
        
        // Higher success rate = higher priority
        if (template.metrics?.successRate) {
            priority += template.metrics.successRate * 3;
        }
        
        // More recent usage = higher priority
        if (template.metrics?.lastUsed) {
            const daysSinceUsed = (Date.now() - new Date(template.metrics.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUsed < 7) {
                priority += 2;
            } else if (daysSinceUsed < 30) {
                priority += 1;
            }
        }
        
        // More usage = higher priority
        if (template.metrics?.usageCount > 10) {
            priority += 1;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Calculate prompt priority
     * @param {Object} template - Prompt template
     * @returns {number} Priority score (1-10)
     */
    calculatePromptPriority(template) {
        let priority = 5;
        
        // Higher optimization score = higher priority
        if (template.metrics?.optimizationScore) {
            priority += template.metrics.optimizationScore * 3;
        }
        
        // Better performance = higher priority
        if (template.metrics?.averageResponseTime < 30) {
            priority += 2;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Calculate practice priority
     * @param {Object} practice - Best practice
     * @returns {number} Priority score (1-10)
     */
    calculatePracticePriority(practice) {
        let priority = 5;
        
        // Higher confidence = higher priority
        priority += practice.confidence * 3;
        
        // Critical practices get higher priority
        if (practice.category === 'security' || practice.category === 'performance') {
            priority += 2;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Calculate config priority
     * @param {Object} config - Tool configuration
     * @returns {number} Priority score (1-10)
     */
    calculateConfigPriority(config) {
        let priority = 5;
        
        // Better performance = higher priority
        if (config.metrics?.performance > 0.8) {
            priority += 2;
        }
        
        // Production configs get higher priority
        if (config.environment === 'production') {
            priority += 1;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Score prompt template for context
     * @param {Object} template - Prompt template
     * @param {Object} context - Usage context
     * @returns {number} Score (0-1)
     */
    scorePromptTemplate(template, context) {
        let score = 0.5; // Base score
        
        // Performance metrics
        if (template.metrics?.optimizationScore) {
            score += template.metrics.optimizationScore * 0.3;
        }
        
        // Context match
        if (template.context && context) {
            const contextMatch = this.calculateContextMatch(template.context, context);
            score += contextMatch * 0.4;
        }
        
        // Recent optimization
        if (template.metrics?.lastOptimized) {
            const daysSinceOptimized = (Date.now() - new Date(template.metrics.lastOptimized).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceOptimized < 7) {
                score += 0.2;
            }
        }
        
        return Math.min(1, score);
    }

    /**
     * Score tool configuration for context
     * @param {Object} config - Tool configuration
     * @param {Object} context - Usage context
     * @returns {number} Score (0-1)
     */
    scoreToolConfiguration(config, context) {
        let score = 0.5;
        
        // Performance metrics
        if (config.metrics?.performance) {
            score += config.metrics.performance * 0.4;
        }
        
        // Environment match
        if (context.environment && config.environment === context.environment) {
            score += 0.3;
        }
        
        // Resource constraints match
        if (context.resourceConstraints && config.resourceRequirements) {
            const resourceMatch = this.calculateResourceMatch(config.resourceRequirements, context.resourceConstraints);
            score += resourceMatch * 0.3;
        }
        
        return Math.min(1, score);
    }

    /**
     * Calculate practice relevance
     * @param {Object} practice - Best practice
     * @param {Object} criteria - Search criteria
     * @returns {number} Relevance score (0-1)
     */
    calculatePracticeRelevance(practice, criteria) {
        let relevance = 0.5;
        
        // Domain and category exact match
        if (practice.domain === criteria.domain) {
            relevance += 0.3;
        }
        if (practice.category === criteria.category) {
            relevance += 0.2;
        }
        
        // Task applicability
        if (criteria.task && practice.applicableTasks) {
            const taskMatch = practice.applicableTasks.some(t => 
                t.toLowerCase().includes(criteria.task.toLowerCase()) ||
                criteria.task.toLowerCase().includes(t.toLowerCase())
            );
            if (taskMatch) {
                relevance += 0.3;
            }
        }
        
        return Math.min(1, relevance);
    }

    /**
     * Score workflow for specific task
     * @param {Object} template - Workflow template
     * @param {Object} task - Task description
     * @returns {number} Score (0-1)
     */
    scoreWorkflowForTask(template, task) {
        let score = 0.5;
        
        // Type match
        if (template.type === task.type) {
            score += 0.2;
        }
        
        // Complexity match
        if (template.complexity === task.complexity) {
            score += 0.2;
        }
        
        // Domain match
        if (template.domain === task.domain) {
            score += 0.2;
        }
        
        // Requirements coverage
        if (task.requirements && template.capabilities) {
            const coverage = this.calculateRequirementsCoverage(task.requirements, template.capabilities);
            score += coverage * 0.3;
        }
        
        // Historical success rate
        if (template.metrics?.successRate) {
            score += template.metrics.successRate * 0.1;
        }
        
        return Math.min(1, score);
    }

    /**
     * Calculate recommendation confidence
     * @param {Object} template - Workflow template
     * @param {Object} task - Task description
     * @returns {number} Confidence (0-1)
     */
    calculateRecommendationConfidence(template, task) {
        let confidence = 0.5;
        
        // Data availability
        if (template.metrics?.usageCount > 5) {
            confidence += 0.2;
        }
        
        // Success rate
        if (template.metrics?.successRate) {
            confidence += template.metrics.successRate * 0.3;
        }
        
        // Similarity to previous successful tasks
        // This would require more sophisticated similarity matching
        confidence += 0.2; // Simplified
        
        return Math.min(1, confidence);
    }

    /**
     * Calculate context match between template and usage context
     * @param {Object} templateContext - Template context
     * @param {Object} usageContext - Usage context
     * @returns {number} Match score (0-1)
     */
    calculateContextMatch(templateContext, usageContext) {
        const templateKeys = Object.keys(templateContext);
        const usageKeys = Object.keys(usageContext);
        
        if (templateKeys.length === 0 && usageKeys.length === 0) {
            return 1;
        }
        
        let matches = 0;
        let total = Math.max(templateKeys.length, usageKeys.length);
        
        for (const key of templateKeys) {
            if (usageContext[key] === templateContext[key]) {
                matches++;
            }
        }
        
        return total > 0 ? matches / total : 0;
    }

    /**
     * Calculate resource requirements match
     * @param {Object} requirements - Resource requirements
     * @param {Object} constraints - Resource constraints
     * @returns {number} Match score (0-1)
     */
    calculateResourceMatch(requirements, constraints) {
        // Simplified resource matching
        let score = 1;
        
        if (requirements.memory && constraints.maxMemory) {
            if (requirements.memory > constraints.maxMemory) {
                score -= 0.5;
            }
        }
        
        if (requirements.cpu && constraints.maxCpu) {
            if (requirements.cpu > constraints.maxCpu) {
                score -= 0.5;
            }
        }
        
        return Math.max(0, score);
    }

    /**
     * Calculate requirements coverage
     * @param {Array} requirements - Task requirements
     * @param {Array} capabilities - Template capabilities
     * @returns {number} Coverage ratio (0-1)
     */
    calculateRequirementsCoverage(requirements, capabilities) {
        if (!requirements || requirements.length === 0) {
            return 1;
        }
        
        if (!capabilities || capabilities.length === 0) {
            return 0;
        }
        
        let covered = 0;
        for (const requirement of requirements) {
            if (capabilities.some(cap => cap.toLowerCase().includes(requirement.toLowerCase()))) {
                covered++;
            }
        }
        
        return covered / requirements.length;
    }

    /**
     * Load base workflow templates
     * @returns {Promise<void>}
     */
    async loadBaseWorkflowTemplates() {
        const baseTemplates = [
            {
                id: 'web_app_development',
                name: 'Web Application Development',
                type: 'development',
                domain: 'web',
                complexity: 'medium',
                version: '1.0.0',
                steps: [
                    { id: 'analysis', name: 'Requirements Analysis', type: 'analysis', agent: 'analyst' },
                    { id: 'planning', name: 'Architecture Planning', type: 'planning', agent: 'planner' },
                    { id: 'development', name: 'Code Development', type: 'development', agent: 'developer' },
                    { id: 'testing', name: 'Quality Testing', type: 'testing', agent: 'tester' }
                ],
                capabilities: ['html', 'css', 'javascript', 'responsive design', 'accessibility'],
                metrics: {
                    successRate: 0.85,
                    averageDuration: 7200000, // 2 hours
                    usageCount: 50,
                    lastUsed: new Date().toISOString()
                }
            }
        ];
        
        for (const template of baseTemplates) {
            await this.storeWorkflowTemplate(template);
        }
    }

    /**
     * Load base prompt templates
     * @returns {Promise<void>}
     */
    async loadBasePromptTemplates() {
        const basePrompts = [
            {
                id: 'analyst_default',
                agentType: 'analyst',
                template: `You are a software analyst. Analyze the following requirements:

{{requirements}}

Provide:
1. Detailed requirements breakdown
2. Technical feasibility assessment
3. Risk analysis
4. Success criteria

Context: {{context}}`,
                version: '1.0.0',
                metrics: {
                    optimizationScore: 0.8,
                    averageResponseTime: 25,
                    lastOptimized: new Date().toISOString()
                }
            }
        ];
        
        for (const template of basePrompts) {
            await this.storePromptTemplate(template);
        }
    }

    /**
     * Load base best practices
     * @returns {Promise<void>}
     */
    async loadBaseBestPractices() {
        const basePractices = [
            {
                id: 'web_accessibility',
                title: 'Web Accessibility Standards',
                description: 'Ensure web applications are accessible to users with disabilities',
                category: 'accessibility',
                domain: 'web',
                confidence: 0.95,
                guidelines: [
                    'Use semantic HTML elements',
                    'Provide alt text for images',
                    'Ensure keyboard navigation',
                    'Maintain proper color contrast'
                ],
                applicableTasks: ['web development', 'ui design', 'frontend development']
            }
        ];
        
        for (const practice of basePractices) {
            await this.storeBestPractice(practice);
        }
    }

    /**
     * Load existing templates into cache
     * @returns {Promise<void>}
     */
    async loadExistingTemplates() {
        try {
            // Load workflow templates
            const workflows = await this.query({
                type: 'procedural',
                category: 'workflow',
                limit: 1000
            });
            
            for (const item of workflows) {
                this.workflowTemplates.set(item.data.id, item.data);
            }

            // Load prompt templates
            const prompts = await this.query({
                type: 'procedural',
                category: 'prompt',
                limit: 1000
            });
            
            for (const item of prompts) {
                this.promptTemplates.set(item.data.id, item.data);
            }

            // Load best practices
            const practices = await this.query({
                type: 'procedural',
                category: 'practice',
                limit: 1000
            });
            
            for (const item of practices) {
                this.bestPractices.set(item.data.id, item.data);
            }

        } catch (error) {
            await logger.warn('Failed to load existing templates', error);
        }
    }

    /**
     * Generate prompt optimization
     * @param {Object} template - Current template
     * @param {Object} feedback - Performance feedback
     * @returns {Promise<Object>} Optimization suggestions
     */
    async generatePromptOptimization(template, feedback) {
        // Simplified optimization generation
        // In a real implementation, this would use more sophisticated analysis
        
        const optimization = {
            type: 'performance',
            confidence: 0.7,
            suggestions: [],
            estimatedImprovement: 0.1,
            timestamp: new Date().toISOString()
        };

        if (feedback.responseTime > 30) {
            optimization.suggestions.push({
                type: 'reduce_length',
                description: 'Reduce prompt length to improve response time',
                impact: 0.2
            });
        }

        if (feedback.accuracy < 0.8) {
            optimization.suggestions.push({
                type: 'add_examples',
                description: 'Add more specific examples to improve accuracy',
                impact: 0.3
            });
        }

        return optimization;
    }

    /**
     * Apply optimization to template
     * @param {Object} template - Original template
     * @param {Object} optimization - Optimization to apply
     * @returns {Promise<Object>} Optimized template
     */
    async applyOptimization(template, optimization) {
        const optimizedTemplate = {
            ...template,
            version: this.incrementVersion(template.version),
            optimizationHistory: [
                ...(template.optimizationHistory || []),
                {
                    type: optimization.type,
                    applied: new Date().toISOString(),
                    confidence: optimization.confidence
                }
            ]
        };

        // Apply specific optimizations
        for (const suggestion of optimization.suggestions) {
            if (suggestion.type === 'reduce_length') {
                // Simplified length reduction
                optimizedTemplate.template = template.template.replace(/\n\n+/g, '\n');
            } else if (suggestion.type === 'add_examples') {
                // Simplified example addition
                optimizedTemplate.template += '\n\nExample: {{example}}';
            }
        }

        return optimizedTemplate;
    }

    /**
     * Extract learnings from execution
     * @param {Object} execution - Execution data
     * @returns {Promise<void>}
     */
    async extractLearningsFromExecution(execution) {
        // Simplified learning extraction
        if (execution.success && execution.innovations) {
            // Create new best practice from successful innovation
            for (const innovation of execution.innovations) {
                const practice = {
                    id: `practice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: innovation.title,
                    description: innovation.description,
                    category: innovation.category || 'general',
                    domain: execution.domain || 'general',
                    confidence: 0.6, // Start with medium confidence
                    extractedFrom: execution.id,
                    timestamp: new Date().toISOString()
                };
                
                await this.storeBestPractice(practice);
            }
        }
    }

    /**
     * Increment version number
     * @param {string} version - Current version
     * @returns {string} Next version
     */
    incrementVersion(version) {
        const parts = version.split('.');
        const patch = parseInt(parts[2] || '0') + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
    }
}

// Create and export singleton instance
export const proceduralMemory = new ProceduralMemory();

// Export for ES6 modules
export default ProceduralMemory;