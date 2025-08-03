/**
 * Semantic Memory
 * Knowledge base for facts, patterns, user preferences, and technology recommendations.
 * Implements long-term knowledge storage with relationship mapping.
 * 
 * Follows the SemanticMemory interface defined in API_CONTRACTS.md
 */

import MemoryStore from './memory-store.js';
import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';

export class SemanticMemory extends MemoryStore {
    constructor() {
        super('semantic', {
            maxItems: 50000,
            maxSize: 100 * 1024 * 1024, // 100MB as per config
            enableCache: true,
            enableCompression: true,
            autoCleanup: true,
            cleanupInterval: 300000 // 5 minutes
        });
        
        this.knowledgeGraph = new Map(); // For relationship mapping
        this.userPreferences = new Map();
        this.patterns = new Map();
        this.recommendations = new Map();
        
        this.initialize();
    }

    /**
     * Initialize semantic memory with base knowledge
     */
    async initialize() {
        await super.initialize();
        
        try {
            await this.loadBaseKnowledge();
            await this.loadExistingRelationships();
            
            await logger.info('Semantic Memory initialized with knowledge base', {
                memoryType: this.memoryType,
                knowledgeGraphSize: this.knowledgeGraph.size
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'semantic_memory_initialization',
                component: 'SemanticMemory'
            });
        }
    }

    /**
     * Store knowledge fact
     * @param {Object} fact - Knowledge fact object
     * @returns {Promise<void>}
     */
    async storeKnowledge(fact) {
        try {
            // Validate knowledge fact structure
            this.validateKnowledgeFact(fact);

            const factKey = `knowledge:${fact.id}`;
            
            await this.store(factKey, fact, {
                type: 'semantic',
                category: 'knowledge',
                tags: ['knowledge', fact.type, fact.subject],
                priority: this.calculateKnowledgePriority(fact),
                confidence: fact.confidence
            });

            // Update knowledge graph relationships
            if (fact.relations && fact.relations.length > 0) {
                await this.updateKnowledgeGraph(fact.id, fact.relations);
            }

            await logger.debug('Knowledge fact stored', {
                factId: fact.id,
                subject: fact.subject,
                type: fact.type,
                confidence: fact.confidence
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_knowledge',
                component: 'SemanticMemory',
                metadata: { fact }
            });
            throw error;
        }
    }

    /**
     * Retrieve knowledge based on query
     * @param {Object} query - Knowledge query
     * @returns {Promise<Array>} Matching knowledge facts
     */
    async retrieveKnowledge(query) {
        try {
            const {
                subject,
                predicate,
                objectType,
                minConfidence = 0,
                context = {},
                limit = 100
            } = query;

            // Build search criteria
            const searchCriteria = {
                type: 'semantic',
                category: 'knowledge',
                limit
            };

            // Apply confidence filter
            if (minConfidence > 0) {
                searchCriteria.confidenceMin = minConfidence;
            }

            let results = await this.query(searchCriteria);

            // Filter by specific criteria
            results = results.filter(item => {
                const fact = item.data;
                
                if (subject && !fact.subject.toLowerCase().includes(subject.toLowerCase())) {
                    return false;
                }
                
                if (predicate && fact.predicate !== predicate) {
                    return false;
                }
                
                if (objectType && typeof fact.object !== objectType) {
                    return false;
                }
                
                if (fact.confidence < minConfidence) {
                    return false;
                }
                
                return true;
            });

            // Apply context-based relevance scoring
            for (const result of results) {
                result.relevanceScore = this.calculateContextRelevance(result.data, context);
            }

            // Sort by relevance and confidence
            results.sort((a, b) => {
                const scoreA = (a.relevanceScore * 0.7) + (a.data.confidence * 0.3);
                const scoreB = (b.relevanceScore * 0.7) + (b.data.confidence * 0.3);
                return scoreB - scoreA;
            });

            return results.map(r => r.data);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'retrieve_knowledge',
                component: 'SemanticMemory',
                metadata: { query }
            });
            return [];
        }
    }

    /**
     * Update existing knowledge fact
     * @param {string} id - Fact ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<boolean>} Success status
     */
    async updateKnowledge(id, updates) {
        try {
            const factKey = `knowledge:${id}`;
            const existing = await this.retrieve(factKey);
            
            if (!existing) {
                return false;
            }

            const updatedFact = {
                ...existing.data,
                ...updates,
                modified: new Date().toISOString()
            };

            // Validate updated fact
            this.validateKnowledgeFact(updatedFact);

            await this.update(factKey, updatedFact, {
                confidence: updatedFact.confidence
            });

            // Update relationships if changed
            if (updates.relations) {
                await this.updateKnowledgeGraph(id, updates.relations);
            }

            await logger.debug('Knowledge fact updated', {
                factId: id,
                updatedFields: Object.keys(updates)
            });

            return true;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'update_knowledge',
                component: 'SemanticMemory',
                metadata: { id, updates }
            });
            return false;
        }
    }

    /**
     * Store pattern
     * @param {Object} pattern - Pattern object
     * @returns {Promise<void>}
     */
    async storePattern(pattern) {
        try {
            this.validatePattern(pattern);

            const patternKey = `pattern:${pattern.id}`;
            
            await this.store(patternKey, pattern, {
                type: 'semantic',
                category: 'pattern',
                tags: ['pattern', pattern.type],
                priority: this.calculatePatternPriority(pattern)
            });

            // Update pattern cache
            this.patterns.set(pattern.id, pattern);

            await logger.debug('Pattern stored', {
                patternId: pattern.id,
                type: pattern.type,
                frequency: pattern.frequency,
                confidence: pattern.confidence
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_pattern',
                component: 'SemanticMemory',
                metadata: { pattern }
            });
            throw error;
        }
    }

    /**
     * Find patterns matching criteria
     * @param {Object} criteria - Pattern search criteria
     * @returns {Promise<Array>} Matching patterns
     */
    async findPatterns(criteria) {
        try {
            const {
                type,
                minFrequency = 0,
                minConfidence = 0,
                context = {}
            } = criteria;

            let results = await this.query({
                type: 'semantic',
                category: 'pattern',
                limit: 1000
            });

            // Filter by criteria
            results = results.filter(item => {
                const pattern = item.data;
                
                if (type && pattern.type !== type) {
                    return false;
                }
                
                if (pattern.frequency < minFrequency) {
                    return false;
                }
                
                if (pattern.confidence < minConfidence) {
                    return false;
                }
                
                return true;
            });

            // Sort by relevance
            results.sort((a, b) => {
                const scoreA = (a.data.frequency * 0.4) + (a.data.confidence * 0.6);
                const scoreB = (b.data.frequency * 0.4) + (b.data.confidence * 0.6);
                return scoreB - scoreA;
            });

            return results.map(r => r.data);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'find_patterns',
                component: 'SemanticMemory',
                metadata: { criteria }
            });
            return [];
        }
    }

    /**
     * Set user preference
     * @param {string} userId - User identifier
     * @param {Object} preference - Preference object
     * @returns {Promise<void>}
     */
    async setUserPreference(userId, preference) {
        try {
            this.validateUserPreference(preference);

            const prefKey = `preference:${userId}:${preference.category}:${preference.preference}`;
            
            await this.store(prefKey, preference, {
                type: 'semantic',
                category: 'preference',
                userId,
                tags: ['preference', preference.category, userId],
                priority: preference.strength || 5
            });

            // Update preference cache
            if (!this.userPreferences.has(userId)) {
                this.userPreferences.set(userId, new Map());
            }
            const userPrefs = this.userPreferences.get(userId);
            const prefId = `${preference.category}:${preference.preference}`;
            userPrefs.set(prefId, preference);

            await logger.debug('User preference set', {
                userId,
                category: preference.category,
                preference: preference.preference,
                strength: preference.strength
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'set_user_preference',
                component: 'SemanticMemory',
                metadata: { userId, preference }
            });
            throw error;
        }
    }

    /**
     * Get user preferences
     * @param {string} userId - User identifier
     * @returns {Promise<Array>} User preferences
     */
    async getUserPreferences(userId) {
        try {
            // Check cache first
            if (this.userPreferences.has(userId)) {
                const userPrefs = this.userPreferences.get(userId);
                return Array.from(userPrefs.values());
            }

            // Query from storage
            const results = await this.query({
                type: 'semantic',
                category: 'preference',
                userId,
                limit: 1000
            });

            const preferences = results.map(r => r.data);
            
            // Update cache
            const userPrefs = new Map();
            for (const pref of preferences) {
                const prefId = `${pref.category}:${pref.preference}`;
                userPrefs.set(prefId, pref);
            }
            this.userPreferences.set(userId, userPrefs);

            return preferences;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_user_preferences',
                component: 'SemanticMemory',
                metadata: { userId }
            });
            return [];
        }
    }

    /**
     * Get technology recommendations
     * @param {Object} context - Recommendation context
     * @returns {Promise<Array>} Technology recommendations
     */
    async getRecommendations(context) {
        try {
            const {
                task,
                requirements = [],
                constraints = [],
                userPreferences = {},
                historicalData = []
            } = context;

            // Generate recommendation ID for caching
            const contextHash = this.hashContext(context);
            const recKey = `recommendation:${contextHash}`;
            
            // Check for cached recommendations
            const cached = await this.retrieve(recKey);
            if (cached && this.isRecommendationFresh(cached.metadata.created)) {
                return cached.data;
            }

            // Generate new recommendations
            const recommendations = await this.generateRecommendations(context);
            
            // Store recommendations
            await this.store(recKey, recommendations, {
                type: 'semantic',
                category: 'recommendation',
                tags: ['recommendation', task],
                priority: 8,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
            });

            await logger.info('Technology recommendations generated', {
                task,
                recommendationCount: recommendations.length,
                contextHash
            });

            return recommendations;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_recommendations',
                component: 'SemanticMemory',
                metadata: { context }
            });
            return [];
        }
    }

    /**
     * Update recommendation feedback
     * @param {string} recommendationId - Recommendation ID
     * @param {Object} feedback - User feedback
     * @returns {Promise<void>}
     */
    async updateRecommendationFeedback(recommendationId, feedback) {
        try {
            const feedbackKey = `feedback:${recommendationId}`;
            
            const feedbackData = {
                recommendationId,
                ...feedback,
                timestamp: new Date().toISOString()
            };

            await this.store(feedbackKey, feedbackData, {
                type: 'semantic',
                category: 'feedback',
                tags: ['feedback', 'recommendation'],
                priority: 7
            });

            // Learn from feedback
            await this.learnFromRecommendationFeedback(recommendationId, feedback);

            await logger.debug('Recommendation feedback updated', {
                recommendationId,
                accepted: feedback.accepted,
                satisfaction: feedback.satisfaction
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'update_recommendation_feedback',
                component: 'SemanticMemory',
                metadata: { recommendationId, feedback }
            });
            throw error;
        }
    }

    /**
     * Create knowledge relationship
     * @param {string} sourceId - Source knowledge ID
     * @param {string} targetId - Target knowledge ID
     * @param {Object} relation - Relationship object
     * @returns {Promise<void>}
     */
    async createRelation(sourceId, targetId, relation) {
        try {
            this.validateKnowledgeRelation(relation);

            const relationKey = `relation:${sourceId}:${targetId}`;
            
            const relationData = {
                sourceId,
                targetId,
                ...relation,
                created: new Date().toISOString()
            };

            await this.store(relationKey, relationData, {
                type: 'semantic',
                category: 'relation',
                tags: ['relation', relation.type],
                priority: 6
            });

            // Update knowledge graph
            if (!this.knowledgeGraph.has(sourceId)) {
                this.knowledgeGraph.set(sourceId, new Set());
            }
            this.knowledgeGraph.get(sourceId).add(targetId);

            await logger.debug('Knowledge relation created', {
                sourceId,
                targetId,
                relationType: relation.type,
                strength: relation.strength
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'create_relation',
                component: 'SemanticMemory',
                metadata: { sourceId, targetId, relation }
            });
            throw error;
        }
    }

    /**
     * Get related knowledge
     * @param {string} id - Knowledge ID
     * @param {number} depth - Relationship depth (default: 2)
     * @returns {Promise<Object>} Knowledge graph
     */
    async getRelatedKnowledge(id, depth = 2) {
        try {
            const startTime = performance.now();
            const visited = new Set();
            const nodes = new Map();
            const edges = [];

            await this.traverseKnowledgeGraph(id, depth, visited, nodes, edges);

            const queryTime = performance.now() - startTime;

            const knowledgeGraph = {
                nodes: Array.from(nodes.values()),
                edges,
                metadata: {
                    depth,
                    totalNodes: nodes.size,
                    queryTime
                }
            };

            await logger.debug('Related knowledge retrieved', {
                rootId: id,
                depth,
                nodeCount: nodes.size,
                edgeCount: edges.length,
                queryTime
            });

            return knowledgeGraph;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_related_knowledge',
                component: 'SemanticMemory',
                metadata: { id, depth }
            });
            return { nodes: [], edges: [], metadata: { depth, totalNodes: 0, queryTime: 0 } };
        }
    }

    /**
     * Learn from interaction
     * @param {Object} interaction - Learning interaction
     * @returns {Promise<void>}
     */
    async learnFromInteraction(interaction) {
        try {
            this.validateLearningInteraction(interaction);

            // Store the interaction
            const interactionKey = `interaction:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
            
            await this.store(interactionKey, interaction, {
                type: 'semantic',
                category: 'learning',
                tags: ['learning', interaction.type],
                priority: 6
            });

            // Extract learnings
            await this.extractLearningsFromInteraction(interaction);

            await logger.debug('Learning interaction processed', {
                type: interaction.type,
                context: Object.keys(interaction.context),
                outcome: typeof interaction.outcome
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'learn_from_interaction',
                component: 'SemanticMemory',
                metadata: { interaction }
            });
            throw error;
        }
    }

    /**
     * Get knowledge confidence score
     * @param {string} id - Knowledge ID
     * @returns {Promise<number>} Confidence score
     */
    async getKnowledgeConfidence(id) {
        try {
            const factKey = `knowledge:${id}`;
            const knowledge = await this.retrieve(factKey);
            
            if (!knowledge) {
                return 0;
            }

            let confidence = knowledge.data.confidence || 0.5;
            
            // Adjust confidence based on corroborating evidence
            const relatedFacts = await this.getRelatedKnowledge(id, 1);
            const corroboratingEvidence = relatedFacts.edges.filter(edge => 
                edge.relation.type === 'corroborates' || edge.relation.type === 'supports'
            );
            
            // Increase confidence with corroborating evidence
            confidence += Math.min(corroboratingEvidence.length * 0.1, 0.3);
            
            // Decrease confidence with conflicting evidence
            const conflictingEvidence = relatedFacts.edges.filter(edge => 
                edge.relation.type === 'conflicts_with'
            );
            confidence -= Math.min(conflictingEvidence.length * 0.2, 0.4);
            
            return Math.max(0, Math.min(1, confidence));

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_knowledge_confidence',
                component: 'SemanticMemory',
                metadata: { id }
            });
            return 0;
        }
    }

    // Utility Methods

    /**
     * Validate knowledge fact structure
     * @param {Object} fact - Fact to validate
     */
    validateKnowledgeFact(fact) {
        const required = ['id', 'type', 'subject', 'predicate', 'object'];
        
        for (const field of required) {
            if (!fact[field]) {
                throw new Error(`Knowledge fact missing required field: ${field}`);
            }
        }

        const validTypes = ['fact', 'rule', 'procedure', 'constraint'];
        if (!validTypes.includes(fact.type)) {
            throw new Error(`Invalid fact type: ${fact.type}`);
        }

        if (typeof fact.confidence !== 'undefined' && 
            (typeof fact.confidence !== 'number' || fact.confidence < 0 || fact.confidence > 1)) {
            throw new Error('Confidence must be a number between 0 and 1');
        }
    }

    /**
     * Validate pattern structure
     * @param {Object} pattern - Pattern to validate
     */
    validatePattern(pattern) {
        const required = ['id', 'name', 'type', 'pattern', 'frequency', 'confidence'];
        
        for (const field of required) {
            if (pattern[field] === undefined || pattern[field] === null) {
                throw new Error(`Pattern missing required field: ${field}`);
            }
        }

        const validTypes = ['behavioral', 'structural', 'performance', 'error'];
        if (!validTypes.includes(pattern.type)) {
            throw new Error(`Invalid pattern type: ${pattern.type}`);
        }
    }

    /**
     * Validate user preference structure
     * @param {Object} preference - Preference to validate
     */
    validateUserPreference(preference) {
        const required = ['userId', 'category', 'preference', 'value'];
        
        for (const field of required) {
            if (!preference[field]) {
                throw new Error(`User preference missing required field: ${field}`);
            }
        }

        if (typeof preference.strength !== 'undefined' && 
            (typeof preference.strength !== 'number' || preference.strength < 0 || preference.strength > 10)) {
            throw new Error('Preference strength must be a number between 0 and 10');
        }
    }

    /**
     * Validate knowledge relation structure
     * @param {Object} relation - Relation to validate
     */
    validateKnowledgeRelation(relation) {
        const required = ['type', 'strength'];
        const validTypes = ['causes', 'enables', 'requires', 'conflicts', 'similar', 'alternative', 'corroborates', 'supports'];
        
        for (const field of required) {
            if (relation[field] === undefined) {
                throw new Error(`Knowledge relation missing required field: ${field}`);
            }
        }

        if (!validTypes.includes(relation.type)) {
            throw new Error(`Invalid relation type: ${relation.type}`);
        }

        if (typeof relation.strength !== 'number' || relation.strength < 0 || relation.strength > 1) {
            throw new Error('Relation strength must be a number between 0 and 1');
        }
    }

    /**
     * Validate learning interaction structure
     * @param {Object} interaction - Interaction to validate
     */
    validateLearningInteraction(interaction) {
        const required = ['type', 'context', 'outcome', 'timestamp'];
        const validTypes = ['success', 'failure', 'feedback', 'observation'];
        
        for (const field of required) {
            if (!interaction[field]) {
                throw new Error(`Learning interaction missing required field: ${field}`);
            }
        }

        if (!validTypes.includes(interaction.type)) {
            throw new Error(`Invalid interaction type: ${interaction.type}`);
        }
    }

    /**
     * Calculate knowledge priority based on confidence and relations
     * @param {Object} fact - Knowledge fact
     * @returns {number} Priority score (1-10)
     */
    calculateKnowledgePriority(fact) {
        let priority = 5; // Base priority
        
        // Higher confidence = higher priority
        if (fact.confidence) {
            priority += fact.confidence * 3;
        }
        
        // More relations = higher priority
        if (fact.relations && fact.relations.length > 0) {
            priority += Math.min(fact.relations.length * 0.5, 2);
        }
        
        // Important fact types get higher priority
        if (fact.type === 'rule' || fact.type === 'procedure') {
            priority += 1;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Calculate pattern priority
     * @param {Object} pattern - Pattern object
     * @returns {number} Priority score (1-10)
     */
    calculatePatternPriority(pattern) {
        let priority = 5;
        
        // Higher frequency = higher priority
        priority += Math.min(pattern.frequency / 10, 3);
        
        // Higher confidence = higher priority
        priority += pattern.confidence * 2;
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Calculate context relevance for knowledge
     * @param {Object} fact - Knowledge fact
     * @param {Object} context - Query context
     * @returns {number} Relevance score (0-1)
     */
    calculateContextRelevance(fact, context) {
        let relevance = 0.5; // Base relevance
        
        // Check context match in fact context
        if (fact.context && context) {
            const factContext = fact.context;
            const queryContext = context;
            
            let matches = 0;
            let total = 0;
            
            for (const [key, value] of Object.entries(queryContext)) {
                total++;
                if (factContext[key] === value) {
                    matches++;
                }
            }
            
            if (total > 0) {
                relevance += (matches / total) * 0.3;
            }
        }
        
        // Check source reliability
        if (fact.source === 'verified' || fact.source === 'expert') {
            relevance += 0.2;
        }
        
        return Math.min(1, relevance);
    }

    /**
     * Generate recommendations based on context
     * @param {Object} context - Recommendation context
     * @returns {Promise<Array>} Generated recommendations
     */
    async generateRecommendations(context) {
        const recommendations = [];
        
        try {
            const { task, requirements, constraints, userPreferences } = context;
            
            // Query relevant knowledge
            const relevantKnowledge = await this.retrieveKnowledge({
                subject: task,
                minConfidence: 0.6,
                context: { task },
                limit: 50
            });
            
            // Query relevant patterns
            const relevantPatterns = await this.findPatterns({
                type: 'behavioral',
                minConfidence: 0.7,
                context: { task }
            });
            
            // Generate technology recommendations based on knowledge and patterns
            const technologies = this.extractTechnologies(relevantKnowledge, relevantPatterns);
            
            for (const tech of technologies) {
                const recommendation = {
                    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    technology: tech.name,
                    reason: tech.reason,
                    confidence: tech.confidence,
                    pros: tech.pros || [],
                    cons: tech.cons || [],
                    alternatives: tech.alternatives || [],
                    estimatedEffort: tech.estimatedEffort || 5
                };
                
                recommendations.push(recommendation);
            }
            
            // Sort by confidence and user preferences
            recommendations.sort((a, b) => {
                let scoreA = a.confidence;
                let scoreB = b.confidence;
                
                // Apply user preference weighting
                if (userPreferences) {
                    if (userPreferences.preferredTechnologies?.includes(a.technology)) {
                        scoreA += 0.2;
                    }
                    if (userPreferences.preferredTechnologies?.includes(b.technology)) {
                        scoreB += 0.2;
                    }
                }
                
                return scoreB - scoreA;
            });
            
            return recommendations.slice(0, 10); // Top 10 recommendations
            
        } catch (error) {
            await logger.warn('Failed to generate recommendations', error, { context });
            return [];
        }
    }

    /**
     * Extract technologies from knowledge and patterns
     * @param {Array} knowledge - Relevant knowledge facts
     * @param {Array} patterns - Relevant patterns
     * @returns {Array} Technology objects
     */
    extractTechnologies(knowledge, patterns) {
        const technologies = [];
        
        // Extract from knowledge facts
        for (const fact of knowledge) {
            if (fact.object && typeof fact.object === 'object' && fact.object.technology) {
                technologies.push({
                    name: fact.object.technology,
                    reason: fact.predicate,
                    confidence: fact.confidence || 0.5,
                    pros: fact.object.pros || [],
                    cons: fact.object.cons || [],
                    alternatives: fact.object.alternatives || []
                });
            }
        }
        
        // Extract from patterns
        for (const pattern of patterns) {
            if (pattern.metadata && pattern.metadata.recommendedTechnologies) {
                for (const tech of pattern.metadata.recommendedTechnologies) {
                    technologies.push({
                        name: tech,
                        reason: `Frequently used pattern: ${pattern.name}`,
                        confidence: pattern.confidence,
                        estimatedEffort: pattern.metadata.averageEffort || 5
                    });
                }
            }
        }
        
        return technologies;
    }

    /**
     * Load base knowledge into the system
     * @returns {Promise<void>}
     */
    async loadBaseKnowledge() {
        const baseKnowledge = [
            {
                id: 'web_components_v1',
                type: 'fact',
                subject: 'web development',
                predicate: 'uses_technology',
                object: {
                    technology: 'Custom Elements v1',
                    pros: ['Native browser support', 'Encapsulation', 'Reusability'],
                    cons: ['Limited styling options', 'Browser compatibility'],
                    alternatives: ['React', 'Vue', 'Angular']
                },
                confidence: 0.9,
                source: 'verified',
                timestamp: new Date().toISOString()
            },
            {
                id: 'es6_modules',
                type: 'fact',
                subject: 'javascript',
                predicate: 'supports_feature',
                object: {
                    technology: 'ES6 Modules',
                    pros: ['Native support', 'Tree shaking', 'Static analysis'],
                    cons: ['Older browser compatibility', 'Runtime loading'],
                    alternatives: ['CommonJS', 'AMD', 'UMD']
                },
                confidence: 0.95,
                source: 'verified',
                timestamp: new Date().toISOString()
            }
        ];
        
        for (const fact of baseKnowledge) {
            await this.storeKnowledge(fact);
        }
    }

    /**
     * Load existing relationships into knowledge graph
     * @returns {Promise<void>}
     */
    async loadExistingRelationships() {
        const relations = await this.query({
            type: 'semantic',
            category: 'relation',
            limit: 10000
        });
        
        for (const relation of relations) {
            const { sourceId, targetId } = relation.data;
            if (!this.knowledgeGraph.has(sourceId)) {
                this.knowledgeGraph.set(sourceId, new Set());
            }
            this.knowledgeGraph.get(sourceId).add(targetId);
        }
    }

    /**
     * Hash context for recommendation caching
     * @param {Object} context - Context object
     * @returns {string} Context hash
     */
    hashContext(context) {
        const str = JSON.stringify(context, Object.keys(context).sort());
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Check if recommendation is still fresh
     * @param {string} createdDate - Creation date
     * @returns {boolean} Is fresh
     */
    isRecommendationFresh(createdDate) {
        const created = new Date(createdDate).getTime();
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        return (now - created) < maxAge;
    }

    /**
     * Update knowledge graph with relationships
     * @param {string} factId - Fact ID
     * @param {Array} relations - Relations array
     * @returns {Promise<void>}
     */
    async updateKnowledgeGraph(factId, relations) {
        if (!this.knowledgeGraph.has(factId)) {
            this.knowledgeGraph.set(factId, new Set());
        }
        
        const factRelations = this.knowledgeGraph.get(factId);
        
        for (const relation of relations) {
            factRelations.add(relation.targetKey);
            
            // Store the relation
            await this.createRelation(factId, relation.targetKey, {
                type: relation.relationType,
                strength: relation.strength,
                confidence: 0.8
            });
        }
    }

    /**
     * Traverse knowledge graph for related knowledge
     * @param {string} id - Starting ID
     * @param {number} depth - Remaining depth
     * @param {Set} visited - Visited nodes
     * @param {Map} nodes - Collected nodes
     * @param {Array} edges - Collected edges
     * @returns {Promise<void>}
     */
    async traverseKnowledgeGraph(id, depth, visited, nodes, edges) {
        if (depth <= 0 || visited.has(id)) {
            return;
        }
        
        visited.add(id);
        
        // Get the knowledge node
        const knowledge = await this.retrieve(`knowledge:${id}`);
        if (knowledge) {
            nodes.set(id, {
                id,
                type: knowledge.data.type,
                data: knowledge.data,
                confidence: knowledge.data.confidence || 0.5
            });
        }
        
        // Get related nodes
        if (this.knowledgeGraph.has(id)) {
            const related = this.knowledgeGraph.get(id);
            
            for (const relatedId of related) {
                // Get relation details
                const relation = await this.retrieve(`relation:${id}:${relatedId}`);
                if (relation) {
                    edges.push({
                        source: id,
                        target: relatedId,
                        relation: relation.data
                    });
                }
                
                // Recurse
                await this.traverseKnowledgeGraph(relatedId, depth - 1, visited, nodes, edges);
            }
        }
    }

    /**
     * Learn from recommendation feedback
     * @param {string} recommendationId - Recommendation ID
     * @param {Object} feedback - Feedback object
     * @returns {Promise<void>}
     */
    async learnFromRecommendationFeedback(recommendationId, feedback) {
        try {
            if (feedback.accepted) {
                // Increase confidence for similar recommendations
                await this.increasePatternConfidence(feedback);
            } else {
                // Decrease confidence or create negative patterns
                await this.decreasePatternConfidence(feedback);
            }
            
            // Store the learning
            await this.learnFromInteraction({
                type: feedback.accepted ? 'success' : 'failure',
                context: {
                    recommendationId,
                    technology: feedback.technology || 'unknown'
                },
                outcome: feedback,
                factors: {
                    satisfaction: feedback.satisfaction,
                    actualEffort: feedback.actualEffort
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            await logger.warn('Failed to learn from recommendation feedback', error);
        }
    }

    /**
     * Increase pattern confidence based on positive feedback
     * @param {Object} feedback - Feedback object
     * @returns {Promise<void>}
     */
    async increasePatternConfidence(feedback) {
        // Implementation would analyze feedback and strengthen related patterns
        // This is a simplified version
        await logger.debug('Increasing pattern confidence', { feedback });
    }

    /**
     * Decrease pattern confidence based on negative feedback
     * @param {Object} feedback - Feedback object
     * @returns {Promise<void>}
     */
    async decreasePatternConfidence(feedback) {
        // Implementation would analyze feedback and weaken related patterns
        // This is a simplified version
        await logger.debug('Decreasing pattern confidence', { feedback });
    }

    /**
     * Extract learnings from interaction
     * @param {Object} interaction - Learning interaction
     * @returns {Promise<void>}
     */
    async extractLearningsFromInteraction(interaction) {
        // Create new knowledge facts or patterns based on the interaction
        // This is a simplified implementation
        if (interaction.type === 'success') {
            // Create positive knowledge
            const learningId = `learning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await this.storeKnowledge({
                id: learningId,
                type: 'fact',
                subject: 'interaction_success',
                predicate: 'leads_to_success',
                object: interaction.outcome,
                confidence: 0.7,
                source: 'learning',
                timestamp: interaction.timestamp,
                context: interaction.context
            });
        }
    }
}

// Create and export singleton instance
export const semanticMemory = new SemanticMemory();

// Export for ES6 modules
export default SemanticMemory;