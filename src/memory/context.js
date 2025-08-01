export class ContextManager {
    constructor(memoryOperations, logger) {
        this.memoryOps = memoryOperations;
        this.logger = logger;
        
        // Context cache for frequently accessed contexts
        this.contextCache = new Map();
        this.maxCacheSize = 50;
        
        // Context building strategies
        this.strategies = new Map();
        this.registerDefaultStrategies();
    }

    registerDefaultStrategies() {
        // Analysis context strategy
        this.strategies.set('analysis', {
            memoryTypes: ['semantic', 'episodic'],
            weights: { semantic: 0.7, episodic: 0.3 },
            filters: {
                semantic: { concepts: ['analysis', 'data', 'patterns'] },
                episodic: { experienceType: 'analysis', timeRange: 30 * 24 * 60 * 60 * 1000 } // 30 days
            }
        });

        // Planning context strategy
        this.strategies.set('planning', {
            memoryTypes: ['procedural', 'episodic', 'semantic'],
            weights: { procedural: 0.5, episodic: 0.3, semantic: 0.2 },
            filters: {
                procedural: { skillType: 'planning' },
                episodic: { experienceType: 'planning' },
                semantic: { concepts: ['strategy', 'planning', 'goals'] }
            }
        });

        // Execution context strategy
        this.strategies.set('execution', {
            memoryTypes: ['working', 'procedural', 'semantic'],
            weights: { working: 0.6, procedural: 0.3, semantic: 0.1 },
            filters: {
                procedural: { skillType: 'execution' },
                semantic: { concepts: ['tools', 'methods', 'implementation'] }
            }
        });

        // Problem-solving context strategy
        this.strategies.set('problem_solving', {
            memoryTypes: ['episodic', 'procedural', 'semantic'],
            weights: { episodic: 0.4, procedural: 0.4, semantic: 0.2 },
            filters: {
                episodic: { experienceType: 'problem_solving' },
                procedural: { skillType: 'troubleshooting' },
                semantic: { concepts: ['problems', 'solutions', 'debugging'] }
            }
        });

        // Business requirements context strategy
        this.strategies.set('business_requirements', {
            memoryTypes: ['semantic', 'episodic', 'procedural'],
            weights: { semantic: 0.5, episodic: 0.3, procedural: 0.2 },
            filters: {
                semantic: { concepts: ['business', 'requirements', 'applications'] },
                episodic: { experienceType: 'requirements_analysis' },
                procedural: { skillType: 'business_analysis' }
            }
        });
    }

    async buildContext(agentId, taskId, operationType, options = {}) {
        const timer = this.logger.startTimer('build_context');
        
        try {
            const cacheKey = `${agentId}_${taskId}_${operationType}`;
            
            // Check cache first
            if (this.contextCache.has(cacheKey) && !options.forceRefresh) {
                const cached = this.contextCache.get(cacheKey);
                if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
                    this.logger.debug('ContextManager', 'Using cached context');
                    return cached.context;
                }
            }
            
            // Get strategy for operation type
            const strategy = this.strategies.get(operationType) || this.getDefaultStrategy();
            
            // Build base context
            const context = {
                agentId,
                taskId,
                operationType,
                timestamp: Date.now(),
                query: options.query || '',
                domain: options.domain || 'general',
                urgency: options.urgency || 'normal',
                memory: {},
                synthesis: null,
                recommendations: []
            };
            
            // Gather memory according to strategy
            context.memory = await this.gatherMemoryByStrategy(strategy, context, options);
            
            // Apply relevance filtering
            context.memory = this.filterRelevantMemory(context.memory, context);
            
            // Generate context synthesis first
            context.synthesis = this.synthesizeContext(context);
            
            // Assemble working memory if task exists (after synthesis is available)
            if (taskId) {
                context.workingMemory = await this.assembleWorkingMemory(taskId, context);
            }
            
            // Cache the context
            this.cacheContext(cacheKey, context);
            
            const duration = timer.stop();
            this.logger.logOperation('context', 'build_context', { agentId, taskId, operationType }, context, { duration });
            
            return context;
            
        } catch (error) {
            this.logger.error('ContextManager', 'Failed to build context', error);
            throw error;
        }
    }

    async gatherMemoryByStrategy(strategy, context, options) {
        const memory = {};
        const gatherPromises = [];
        
        // Gather from each memory type according to strategy
        for (const memoryType of strategy.memoryTypes) {
            const filters = {
                ...strategy.filters[memoryType],
                ...options.filters?.[memoryType],
                limit: options.limits?.[memoryType] || 10
            };
            
            let gatherPromise;
            
            switch (memoryType) {
                case 'working':
                    gatherPromise = this.memoryOps.workingMemoryOp({ taskId: context.taskId });
                    break;
                case 'semantic':
                    gatherPromise = this.memoryOps.semanticMemoryOp(context.query, filters);
                    break;
                case 'episodic':
                    gatherPromise = this.memoryOps.episodicMemoryOp(context.query, filters);
                    break;
                case 'procedural':
                    gatherPromise = this.memoryOps.proceduralMemoryOp(context.query, filters);
                    break;
                default:
                    continue;
            }
            
            gatherPromises.push(
                gatherPromise.then(result => ({ type: memoryType, data: result }))
                .catch(error => {
                    this.logger.warn('ContextManager', `Failed to gather ${memoryType} memory`, error);
                    return { type: memoryType, data: null };
                })
            );
        }
        
        // Wait for all memory gathering to complete
        const results = await Promise.all(gatherPromises);
        
        // Organize results by memory type
        results.forEach(result => {
            if (result.data) {
                memory[result.type] = result.data;
            }
        });
        
        return memory;
    }

    filterRelevantMemory(memory, context) {
        const filtered = {};
        const strategy = this.strategies.get(context.operationType);
        
        if (!strategy) return memory;
        
        // Apply strategy weights and relevance thresholds
        Object.keys(memory).forEach(memoryType => {
            const weight = strategy.weights[memoryType] || 0.5;
            const threshold = 0.3 * weight; // Adjust threshold based on importance
            
            if (Array.isArray(memory[memoryType])) {
                // Filter array-based memories (semantic, episodic, procedural)
                filtered[memoryType] = memory[memoryType]
                    .filter(item => (item.relevance || item.relevanceScore || 0.5) >= threshold)
                    .slice(0, Math.ceil(10 * weight)); // Limit based on weight
            } else {
                // Keep single-item memories (working)
                filtered[memoryType] = memory[memoryType];
            }
        });
        
        return filtered;
    }

    async assembleWorkingMemory(taskId, context) {
        try {
            // Get current working memory
            const workingContext = await this.memoryOps.workingMemoryOp({ taskId });
            
            if (!workingContext) {
                return {
                    taskId,
                    status: 'new',
                    variables: {},
                    goals: [],
                    progress: {},
                    history: []
                };
            }
            
            // Enhance with relevant context
            const enhanced = {
                ...workingContext,
                relevantMemories: this.findRelevantMemories(workingContext, context.memory),
                contextualVariables: this.extractContextualVariables(context),
                recommendations: this.generateWorkingMemoryRecommendations(workingContext, context)
            };
            
            return enhanced;
            
        } catch (error) {
            this.logger.warn('ContextManager', 'Failed to assemble working memory', error);
            return { taskId, status: 'error', variables: {}, goals: [], progress: {} };
        }
    }

    findRelevantMemories(workingContext, memories) {
        const relevant = {
            facts: [],
            experiences: [],
            procedures: []
        };
        
        // Extract task-relevant keywords from working context
        const keywords = this.extractKeywords(workingContext);
        
        // Find relevant semantic memories (facts)
        if (memories.semantic) {
            relevant.facts = memories.semantic
                .filter(item => this.hasKeywordOverlap(item.data, keywords))
                .slice(0, 5);
        }
        
        // Find relevant episodic memories (experiences)
        if (memories.episodic) {
            relevant.experiences = memories.episodic
                .filter(exp => this.hasKeywordOverlap(exp.experience, keywords))
                .slice(0, 3);
        }
        
        // Find relevant procedural memories (procedures)
        if (memories.procedural) {
            relevant.procedures = memories.procedural
                .filter(proc => this.hasKeywordOverlap(proc.procedure, keywords))
                .slice(0, 3);
        }
        
        return relevant;
    }

    extractContextualVariables(context) {
        const variables = {
            domain: context.domain,
            operationType: context.operationType,
            urgency: context.urgency,
            timestamp: context.timestamp
        };
        
        // Extract variables from memory synthesis
        if (context.synthesis) {
            variables.relevantConcepts = context.synthesis.concepts || [];
            variables.confidenceLevel = context.synthesis.confidence || 0.5;
            variables.memoryStrength = context.synthesis.memoryStrength || 0.5;
        } else {
            variables.relevantConcepts = [];
            variables.confidenceLevel = 0.5;
            variables.memoryStrength = 0.5;
        }
        
        // Extract domain-specific variables
        if (context.domain === 'business_requirements') {
            variables.applicationsInScope = this.extractApplications(context.memory);
            variables.requirementComplexity = this.assessComplexity(context.memory);
        }
        
        return variables;
    }

    generateWorkingMemoryRecommendations(workingContext, context) {
        const recommendations = [];
        
        // Recommend based on current progress
        if (workingContext.progress) {
            const completionRate = Object.keys(workingContext.progress).length / 
                                 (workingContext.goals?.length || 1);
            
            if (completionRate < 0.5) {
                recommendations.push({
                    type: 'progress',
                    message: 'Consider breaking down remaining goals into smaller steps',
                    priority: 'medium'
                });
            }
        }
        
        // Recommend based on past experiences
        if (context.memory.episodic) {
            const similarExperiences = context.memory.episodic
                .filter(exp => exp.relevance > 0.7);
            
            if (similarExperiences.length > 0) {
                recommendations.push({
                    type: 'experience',
                    message: 'Similar tasks have been successful with these approaches',
                    priority: 'high',
                    experiences: similarExperiences.slice(0, 2)
                });
            }
        }
        
        // Recommend based on available procedures
        if (context.memory.procedural) {
            const applicableProcedures = context.memory.procedural
                .filter(proc => proc.success_rate > 0.8);
            
            if (applicableProcedures.length > 0) {
                recommendations.push({
                    type: 'procedure',
                    message: 'High-success procedures are available for this task type',
                    priority: 'high',
                    procedures: applicableProcedures.slice(0, 2)
                });
            }
        }
        
        return recommendations;
    }

    synthesizeContext(context) {
        const synthesis = {
            summary: '',
            concepts: [],
            confidence: 0.5,
            memoryStrength: 0.5,
            recommendations: [],
            keyInsights: []
        };
        
        // Generate summary
        const memoryTypes = Object.keys(context.memory);
        const totalItems = memoryTypes.reduce((sum, type) => {
            return sum + (Array.isArray(context.memory[type]) ? context.memory[type].length : 1);
        }, 0);
        
        synthesis.summary = `Context for ${context.operationType} with ${totalItems} memory items across ${memoryTypes.length} types`;
        
        // Extract concepts from all memories
        synthesis.concepts = this.extractAllConcepts(context.memory);
        
        // Calculate confidence based on memory availability and relevance
        synthesis.confidence = this.calculateContextConfidence(context.memory);
        
        // Calculate memory strength based on memory freshness and importance
        synthesis.memoryStrength = this.calculateMemoryStrength(context.memory);
        
        // Generate key insights
        synthesis.keyInsights = this.generateKeyInsights(context.memory, context);
        
        // Generate context-level recommendations
        synthesis.recommendations = this.generateContextRecommendations(context);
        
        return synthesis;
    }

    extractAllConcepts(memory) {
        const concepts = new Set();
        
        Object.values(memory).forEach(memoryData => {
            if (Array.isArray(memoryData)) {
                memoryData.forEach(item => {
                    if (item.concepts) {
                        item.concepts.forEach(concept => concepts.add(concept));
                    }
                    if (item.context) {
                        item.context.forEach(concept => concepts.add(concept));
                    }
                    if (item.metadata?.tags) {
                        item.metadata.tags.forEach(tag => concepts.add(tag));
                    }
                });
            }
        });
        
        return Array.from(concepts).slice(0, 20); // Limit to top 20 concepts
    }

    calculateContextConfidence(memory) {
        let totalRelevance = 0;
        let itemCount = 0;
        
        Object.values(memory).forEach(memoryData => {
            if (Array.isArray(memoryData)) {
                memoryData.forEach(item => {
                    totalRelevance += item.relevance || item.relevanceScore || 0.5;
                    itemCount++;
                });
            } else if (memoryData) {
                totalRelevance += 0.7; // Working memory gets default high relevance
                itemCount++;
            }
        });
        
        return itemCount > 0 ? totalRelevance / itemCount : 0.5;
    }

    calculateMemoryStrength(memory) {
        let strength = 0;
        let factors = 0;
        
        // Factor 1: Memory freshness
        Object.values(memory).forEach(memoryData => {
            if (Array.isArray(memoryData)) {
                memoryData.forEach(item => {
                    const age = item.age || (Date.now() - (item.timestamp || Date.now()));
                    const freshness = Math.max(0, 1 - age / (7 * 24 * 60 * 60 * 1000)); // 7 day decay
                    strength += freshness;
                    factors++;
                });
            }
        });
        
        // Factor 2: Memory diversity
        const memoryTypes = Object.keys(memory).length;
        strength += memoryTypes / 4; // 4 memory types max
        factors++;
        
        // Factor 3: Memory volume
        const totalItems = Object.values(memory).reduce((sum, data) => {
            return sum + (Array.isArray(data) ? data.length : 1);
        }, 0);
        strength += Math.min(1, totalItems / 20); // Normalize to 20 items
        factors++;
        
        return factors > 0 ? strength / factors : 0.5;
    }

    generateKeyInsights(memory, context) {
        const insights = [];
        
        // Insight from semantic memory patterns
        if (memory.semantic && memory.semantic.length > 0) {
            const topConcepts = this.getTopConcepts(memory.semantic);
            insights.push({
                type: 'knowledge',
                insight: `Key knowledge areas: ${topConcepts.join(', ')}`,
                confidence: 0.8
            });
        }
        
        // Insight from episodic memory patterns
        if (memory.episodic && memory.episodic.length > 0) {
            const successRate = memory.episodic.filter(exp => 
                exp.experience.success || exp.experience.outcome === 'success'
            ).length / memory.episodic.length;
            
            insights.push({
                type: 'experience',
                insight: `Historical success rate for similar tasks: ${Math.round(successRate * 100)}%`,
                confidence: 0.7
            });
        }
        
        // Insight from procedural memory patterns
        if (memory.procedural && memory.procedural.length > 0) {
            const avgSuccessRate = memory.procedural.reduce((sum, proc) => 
                sum + proc.success_rate, 0) / memory.procedural.length;
            
            insights.push({
                type: 'procedure',
                insight: `Available procedures have ${Math.round(avgSuccessRate * 100)}% average success rate`,
                confidence: 0.8
            });
        }
        
        return insights;
    }

    generateContextRecommendations(context) {
        const recommendations = [];
        
        // Recommend based on memory strength
        if (context.synthesis && context.synthesis.memoryStrength < 0.3) {
            recommendations.push({
                type: 'memory',
                message: 'Low memory strength - consider gathering more relevant information',
                priority: 'high'
            });
        }
        
        // Recommend based on confidence
        if (context.synthesis && context.synthesis.confidence < 0.4) {
            recommendations.push({
                type: 'confidence',
                message: 'Low confidence - validate assumptions before proceeding',
                priority: 'medium'
            });
        }
        
        // Domain-specific recommendations
        if (context.domain === 'business_requirements') {
            recommendations.push({
                type: 'domain',
                message: 'Focus on application impact assessment and estimation accuracy',
                priority: 'medium'
            });
        }
        
        return recommendations;
    }

    // Utility methods
    getDefaultStrategy() {
        return {
            memoryTypes: ['semantic', 'episodic'],
            weights: { semantic: 0.6, episodic: 0.4 },
            filters: {}
        };
    }

    extractKeywords(data) {
        try {
            const text = JSON.stringify(data).toLowerCase();
            const words = text.match(/\b\w{3,}\b/g) || [];
            const frequency = {};
            
            words.forEach(word => {
                frequency[word] = (frequency[word] || 0) + 1;
            });
            
            return Object.entries(frequency)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([word]) => word);
        } catch {
            return [];
        }
    }

    hasKeywordOverlap(data, keywords) {
        try {
            const text = JSON.stringify(data).toLowerCase();
            return keywords.some(keyword => text.includes(keyword));
        } catch {
            return false;
        }
    }

    getTopConcepts(semanticMemory) {
        const conceptFreq = {};
        
        semanticMemory.forEach(item => {
            if (item.concepts) {
                item.concepts.forEach(concept => {
                    conceptFreq[concept] = (conceptFreq[concept] || 0) + 1;
                });
            }
        });
        
        return Object.entries(conceptFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([concept]) => concept);
    }

    extractApplications(memory) {
        const applications = new Set();
        
        Object.values(memory).forEach(memoryData => {
            if (Array.isArray(memoryData)) {
                memoryData.forEach(item => {
                    if (item.data?.applications) {
                        item.data.applications.forEach(app => applications.add(app));
                    }
                });
            }
        });
        
        return Array.from(applications);
    }

    assessComplexity(memory) {
        // Simple complexity assessment based on memory content
        const totalItems = Object.values(memory).reduce((sum, data) => {
            return sum + (Array.isArray(data) ? data.length : 1);
        }, 0);
        
        if (totalItems > 15) return 'high';
        if (totalItems > 5) return 'medium';
        return 'low';
    }

    cacheContext(key, context) {
        // Maintain cache size limit
        if (this.contextCache.size >= this.maxCacheSize) {
            const oldestKey = this.contextCache.keys().next().value;
            this.contextCache.delete(oldestKey);
        }
        
        this.contextCache.set(key, {
            context,
            timestamp: Date.now()
        });
    }

    updateContext(context, newInformation) {
        const updated = {
            ...context,
            lastUpdate: Date.now(),
            updates: [...(context.updates || []), {
                timestamp: Date.now(),
                information: newInformation
            }]
        };
        
        // Invalidate related cache entries
        const cacheKey = `${context.agentId}_${context.taskId}_${context.operationType}`;
        this.contextCache.delete(cacheKey);
        
        return updated;
    }

    // Context strategy management
    registerStrategy(name, strategy) {
        this.strategies.set(name, strategy);
        this.logger.info('ContextManager', `Registered context strategy: ${name}`);
    }

    getAvailableStrategies() {
        return Array.from(this.strategies.keys());
    }
}