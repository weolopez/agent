export class MemoryOperations {
    constructor(memoryStore, logger) {
        this.store = memoryStore;
        this.logger = logger;
    }

    // Working Memory Operations - Current task context
    async workingMemoryOp(context = {}) {
        const timer = this.logger.startTimer('working_memory_op');
        
        try {
            const { taskId, operation, data } = context;
            
            if (!taskId) {
                throw new Error('Working memory operations require a taskId');
            }
            
            let workingContext = await this.store.retrieve('working', taskId);
            
            if (!workingContext) {
                // Initialize new working context
                workingContext = {
                    taskId,
                    startTime: Date.now(),
                    operations: [],
                    currentState: 'initialized',
                    variables: {},
                    goals: [],
                    constraints: [],
                    progress: {}
                };
                
                await this.store.storeWorkingMemory(taskId, workingContext, {
                    tags: ['current_task', 'active']
                });
            }
            
            // Update working context with new operation
            if (operation && data) {
                workingContext.operations.push({
                    operation,
                    data,
                    timestamp: Date.now()
                });
                
                // Update variables if provided
                if (data.variables) {
                    Object.assign(workingContext.variables, data.variables);
                }
                
                // Update current state if provided
                if (data.state) {
                    workingContext.currentState = data.state;
                }
                
                // Update progress if provided
                if (data.progress) {
                    Object.assign(workingContext.progress, data.progress);
                }
                
                await this.store.storeWorkingMemory(taskId, workingContext);
            }
            
            const duration = timer.stop();
            this.logger.logOperation('memory', 'working_memory_op', context, workingContext, { duration });
            
            return workingContext;
            
        } catch (error) {
            this.logger.error('MemoryOperations', 'Working memory operation failed', error);
            throw error;
        }
    }

    // Semantic Memory Operations - Facts and knowledge
    async semanticMemoryOp(query, context = {}) {
        const timer = this.logger.startTimer('semantic_memory_op');
        
        try {
            const { concepts = [], importance = 0.5, limit = 10 } = context;
            
            // Search semantic memory for relevant knowledge
            const results = await this.store.search('semantic', query, {
                tags: concepts.length > 0 ? concepts : undefined,
                minImportance: importance * 0.5, // Lower threshold for search
                limit
            });
            
            // Extract knowledge items and sort by relevance
            const knowledge = results.map(result => ({
                key: result.key,
                data: result.value,
                relevance: result.relevanceScore,
                importance: result.metadata.importance,
                concepts: result.metadata.tags.filter(tag => tag !== 'knowledge')
            }));
            
            // Store search pattern for future reference
            if (knowledge.length > 0) {
                const searchKey = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                await this.store.storeSemanticMemory(searchKey, {
                    query,
                    results: knowledge.length,
                    concepts,
                    timestamp: Date.now()
                }, ['search_pattern']);
            }
            
            const duration = timer.stop();
            this.logger.logOperation('memory', 'semantic_memory_op', { query, concepts }, knowledge, { duration });
            
            return knowledge;
            
        } catch (error) {
            this.logger.error('MemoryOperations', 'Semantic memory operation failed', error);
            throw error;
        }
    }

    // Episodic Memory Operations - Past experiences
    async episodicMemoryOp(query, context = {}) {
        const timer = this.logger.startTimer('episodic_memory_op');
        
        try {
            const { 
                timeRange = null, 
                experienceType = null, 
                limit = 10,
                similarity = false 
            } = context;
            
            let filters = { limit };
            
            // Apply time range filter
            if (timeRange) {
                filters.since = Date.now() - timeRange;
            }
            
            // Apply experience type filter
            if (experienceType) {
                filters.tags = [experienceType];
            }
            
            // Search episodic memory
            let results = await this.store.search('episodic', query, filters);
            
            // Apply similarity matching if requested
            if (similarity && results.length > 0) {
                results = this.applySimilarityMatching(results, query);
            }
            
            // Format experiences with temporal context
            const experiences = results.map(result => ({
                key: result.key,
                experience: result.value,
                timestamp: result.metadata.timestamp,
                age: Date.now() - result.metadata.timestamp,
                relevance: result.relevanceScore,
                context: result.metadata.tags.filter(tag => !['experience', 'interaction'].includes(tag))
            }));
            
            // Learn from this retrieval pattern
            await this.learnFromEpisodicRetrieval(query, experiences, context);
            
            const duration = timer.stop();
            this.logger.logOperation('memory', 'episodic_memory_op', { query, timeRange }, experiences, { duration });
            
            return experiences;
            
        } catch (error) {
            this.logger.error('MemoryOperations', 'Episodic memory operation failed', error);
            throw error;
        }
    }

    // Procedural Memory Operations - How-to patterns
    async proceduralMemoryOp(query, context = {}) {
        const timer = this.logger.startTimer('procedural_memory_op');
        
        try {
            const { skillType = null, complexity = null, limit = 5 } = context;
            
            let filters = { limit };
            
            // Build search tags
            let searchTags = ['procedure', 'skill'];
            if (skillType) searchTags.push(skillType);
            if (complexity) searchTags.push(`complexity_${complexity}`);
            
            filters.tags = searchTags;
            
            // Search procedural memory
            const results = await this.store.search('procedural', query, filters);
            
            // Format procedures with execution context
            const procedures = results.map(result => ({
                key: result.key,
                procedure: result.value,
                skill: result.metadata.tags.find(tag => tag.startsWith('skill_')) || 'general',
                complexity: this.extractComplexity(result.metadata.tags),
                success_rate: result.value.successRate || 0.8,
                relevance: result.relevanceScore,
                lastUsed: result.metadata.lastAccess
            }));
            
            // Sort by success rate and relevance
            procedures.sort((a, b) => {
                const scoreA = a.success_rate * 0.6 + a.relevance * 0.4;
                const scoreB = b.success_rate * 0.6 + b.relevance * 0.4;
                return scoreB - scoreA;
            });
            
            const duration = timer.stop();
            this.logger.logOperation('memory', 'procedural_memory_op', { query, skillType }, procedures, { duration });
            
            return procedures;
            
        } catch (error) {
            this.logger.error('MemoryOperations', 'Procedural memory operation failed', error);
            throw error;
        }
    }

    // Memory Update Operations
    async memoryUpdateOp(data, type, context = {}) {
        const timer = this.logger.startTimer('memory_update_op');
        
        try {
            const { key, merge = false, importance = null } = context;
            
            if (!key) {
                throw new Error('Memory update requires a key');
            }
            
            let updateData = data;
            
            // Handle merge operations
            if (merge) {
                const existing = await this.store.retrieve(type, key);
                if (existing) {
                    updateData = this.mergeMemoryData(existing, data, type);
                }
            }
            
            // Store based on memory type
            let result;
            switch (type) {
                case 'working':
                    result = await this.store.storeWorkingMemory(key, updateData, context);
                    break;
                case 'semantic':
                    result = await this.store.storeSemanticMemory(key, updateData, context.concepts || []);
                    break;
                case 'episodic':
                    result = await this.store.storeEpisodicMemory(key, updateData, context);
                    break;
                case 'procedural':
                    result = await this.store.storeProceduralMemory(key, updateData, context.skills || []);
                    break;
                default:
                    throw new Error(`Invalid memory type for update: ${type}`);
            }
            
            // Update related memories if cross-references exist
            await this.updateCrossReferences(key, updateData, type);
            
            const duration = timer.stop();
            this.logger.logOperation('memory', 'memory_update_op', { key, type, merge }, result, { duration });
            
            return result;
            
        } catch (error) {
            this.logger.error('MemoryOperations', 'Memory update operation failed', error);
            throw error;
        }
    }

    // Composite Memory Operations
    async contextualMemoryRetrieval(query, taskContext = {}) {
        const timer = this.logger.startTimer('contextual_memory_retrieval');
        
        try {
            const { taskId, domain, urgency = 'normal' } = taskContext;
            
            // Gather from all memory types in parallel
            const [workingContext, semanticKnowledge, episodicExperiences, proceduralSkills] = await Promise.all([
                taskId ? this.workingMemoryOp({ taskId }) : Promise.resolve(null),
                this.semanticMemoryOp(query, { concepts: domain ? [domain] : [], limit: 5 }),
                this.episodicMemoryOp(query, { limit: 3, similarity: true }),
                this.proceduralMemoryOp(query, { limit: 3 })
            ]);
            
            // Synthesize contextual memory
            const contextualMemory = {
                query,
                timestamp: Date.now(),
                working: workingContext,
                semantic: semanticKnowledge,
                episodic: episodicExperiences,
                procedural: proceduralSkills,
                synthesis: this.synthesizeMemoryContext({
                    working: workingContext,
                    semantic: semanticKnowledge,
                    episodic: episodicExperiences,
                    procedural: proceduralSkills
                })
            };
            
            const duration = timer.stop();
            this.logger.logOperation('memory', 'contextual_retrieval', taskContext, contextualMemory, { duration });
            
            return contextualMemory;
            
        } catch (error) {
            this.logger.error('MemoryOperations', 'Contextual memory retrieval failed', error);
            throw error;
        }
    }

    async memoryConsolidation(taskId) {
        const timer = this.logger.startTimer('memory_consolidation');
        
        try {
            // Get working memory for the task
            const workingContext = await this.store.retrieve('working', taskId);
            if (!workingContext) {
                throw new Error(`No working memory found for task ${taskId}`);
            }
            
            // Extract learnings and insights
            const insights = this.extractInsights(workingContext);
            
            // Store important facts in semantic memory
            if (insights.facts.length > 0) {
                for (const fact of insights.facts) {
                    const factKey = `fact_${taskId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    await this.store.storeSemanticMemory(factKey, fact, fact.concepts || []);
                }
            }
            
            // Store experience in episodic memory
            const experienceKey = `exp_${taskId}_${Date.now()}`;
            await this.store.storeEpisodicMemory(experienceKey, {
                taskId,
                summary: insights.summary,
                outcome: workingContext.currentState,
                duration: Date.now() - workingContext.startTime,
                operations: workingContext.operations.length,
                success: workingContext.currentState === 'completed'
            }, {
                tags: ['task_completion', insights.domain || 'general'],
                importance: insights.importance
            });
            
            // Update procedural memory if new patterns learned
            if (insights.procedures.length > 0) {
                for (const procedure of insights.procedures) {
                    const procKey = `proc_${procedure.name}_${Date.now()}`;
                    await this.store.storeProceduralMemory(procKey, procedure, procedure.skills || []);
                }
            }
            
            // Clear working memory for completed task
            if (workingContext.currentState === 'completed') {
                // Keep a summary in working memory
                const summary = {
                    taskId,
                    completed: Date.now(),
                    outcome: 'success',
                    summary: insights.summary
                };
                await this.store.storeWorkingMemory(`${taskId}_summary`, summary);
            }
            
            const duration = timer.stop();
            this.logger.logOperation('memory', 'consolidation', { taskId }, insights, { duration });
            
            return insights;
            
        } catch (error) {
            this.logger.error('MemoryOperations', 'Memory consolidation failed', error);
            throw error;
        }
    }

    // Helper methods
    applySimilarityMatching(results, query) {
        // Simple similarity matching - could be enhanced with more sophisticated algorithms
        return results.map(result => {
            const similarity = this.calculateSimilarity(result.value, query);
            return {
                ...result,
                similarityScore: similarity,
                relevanceScore: result.relevanceScore * 0.7 + similarity * 0.3
            };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    calculateSimilarity(experience, query) {
        // Simple text-based similarity
        try {
            const expText = JSON.stringify(experience).toLowerCase();
            const queryText = query.toLowerCase();
            const commonWords = expText.split(' ').filter(word => queryText.includes(word));
            return commonWords.length / queryText.split(' ').length;
        } catch {
            return 0;
        }
    }

    async learnFromEpisodicRetrieval(query, experiences, context) {
        // Learn patterns from what memories were retrieved together
        if (experiences.length > 1) {
            const pattern = {
                query,
                experienceTypes: experiences.map(exp => exp.context).flat(),
                retrievalContext: context,
                timestamp: Date.now()
            };
            
            const patternKey = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await this.store.storeSemanticMemory(patternKey, pattern, ['retrieval_pattern']);
        }
    }

    extractComplexity(tags) {
        const complexityTag = tags.find(tag => tag.startsWith('complexity_'));
        return complexityTag ? complexityTag.split('_')[1] : 'medium';
    }

    mergeMemoryData(existing, newData, type) {
        switch (type) {
            case 'working':
                return {
                    ...existing,
                    ...newData,
                    operations: [...(existing.operations || []), ...(newData.operations || [])],
                    variables: { ...existing.variables, ...newData.variables }
                };
            case 'semantic':
                return {
                    ...existing,
                    ...newData,
                    lastUpdated: Date.now()
                };
            case 'episodic':
                return {
                    ...existing,
                    updates: [...(existing.updates || []), newData]
                };
            case 'procedural':
                return {
                    ...existing,
                    ...newData,
                    successRate: (existing.successRate + (newData.successRate || 0.8)) / 2
                };
            default:
                return newData;
        }
    }

    async updateCrossReferences(key, data, type) {
        // Update memories that reference this key
        const referencingPattern = new RegExp(key, 'i');
        
        const allTypes = ['working', 'semantic', 'episodic', 'procedural'].filter(t => t !== type);
        
        for (const memoryType of allTypes) {
            try {
                const references = await this.store.search(memoryType, referencingPattern, { limit: 5 });
                
                for (const ref of references) {
                    if (ref.value.references && ref.value.references.includes(key)) {
                        // Update reference with new data
                        ref.value.lastReferenceUpdate = Date.now();
                        await this.store.store(memoryType, ref.key, ref.value);
                    }
                }
            } catch (error) {
                this.logger.warn('MemoryOperations', `Failed to update cross-references in ${memoryType}`, error);
            }
        }
    }

    synthesizeMemoryContext(memories) {
        const synthesis = {
            relevantFacts: [],
            applicableExperiences: [],
            usefulProcedures: [],
            workingVariables: {},
            recommendations: []
        };
        
        // Extract relevant facts from semantic memory
        if (memories.semantic) {
            synthesis.relevantFacts = memories.semantic
                .filter(item => item.relevance > 0.5)
                .map(item => ({
                    fact: item.data,
                    relevance: item.relevance,
                    concepts: item.concepts
                }));
        }
        
        // Extract applicable experiences
        if (memories.episodic) {
            synthesis.applicableExperiences = memories.episodic
                .filter(exp => exp.relevance > 0.3)
                .map(exp => ({
                    experience: exp.experience,
                    age: exp.age,
                    relevance: exp.relevance,
                    outcome: exp.experience.outcome
                }));
        }
        
        // Extract useful procedures
        if (memories.procedural) {
            synthesis.usefulProcedures = memories.procedural
                .filter(proc => proc.success_rate > 0.6)
                .map(proc => ({
                    procedure: proc.procedure,
                    successRate: proc.success_rate,
                    complexity: proc.complexity
                }));
        }
        
        // Extract working variables
        if (memories.working) {
            synthesis.workingVariables = memories.working.variables || {};
        }
        
        // Generate recommendations based on synthesis
        synthesis.recommendations = this.generateRecommendations(synthesis);
        
        return synthesis;
    }

    generateRecommendations(synthesis) {
        const recommendations = [];
        
        // Recommend based on past experiences
        if (synthesis.applicableExperiences.length > 0) {
            const successfulExperiences = synthesis.applicableExperiences.filter(exp => 
                exp.experience.success || exp.experience.outcome === 'success'
            );
            
            if (successfulExperiences.length > 0) {
                recommendations.push({
                    type: 'experience',
                    suggestion: 'Apply patterns from successful past experiences',
                    confidence: 0.8,
                    experiences: successfulExperiences.slice(0, 2)
                });
            }
        }
        
        // Recommend based on procedures
        if (synthesis.usefulProcedures.length > 0) {
            const bestProcedure = synthesis.usefulProcedures[0];
            recommendations.push({
                type: 'procedure',
                suggestion: `Use ${bestProcedure.procedure.name || 'recommended procedure'}`,
                confidence: bestProcedure.successRate,
                procedure: bestProcedure
            });
        }
        
        // Recommend based on facts
        if (synthesis.relevantFacts.length > 0) {
            recommendations.push({
                type: 'knowledge',
                suggestion: 'Consider relevant domain knowledge',
                confidence: 0.7,
                facts: synthesis.relevantFacts.slice(0, 3)
            });
        }
        
        return recommendations;
    }

    extractInsights(workingContext) {
        const insights = {
            summary: '',
            facts: [],
            procedures: [],
            importance: 0.5,
            domain: null
        };
        
        // Generate summary
        insights.summary = `Task ${workingContext.taskId} completed with ${workingContext.operations.length} operations`;
        
        // Extract domain from operations
        const domains = workingContext.operations
            .map(op => op.data?.domain)
            .filter(domain => domain);
        insights.domain = domains.length > 0 ? domains[0] : 'general';
        
        // Extract facts from successful operations
        insights.facts = workingContext.operations
            .filter(op => op.data?.success)
            .map(op => ({
                type: 'operational_fact',
                content: op.data,
                concepts: [insights.domain, op.operation]
            }));
        
        // Extract procedures from operation patterns
        const operationTypes = workingContext.operations.map(op => op.operation);
        if (operationTypes.length > 2) {
            insights.procedures.push({
                name: `${insights.domain}_workflow`,
                steps: operationTypes,
                successRate: workingContext.currentState === 'completed' ? 0.9 : 0.6,
                skills: [insights.domain, 'workflow_execution']
            });
        }
        
        // Calculate importance based on success and complexity
        insights.importance = workingContext.currentState === 'completed' ? 0.8 : 0.4;
        insights.importance += Math.min(0.2, workingContext.operations.length * 0.02);
        
        return insights;
    }
}