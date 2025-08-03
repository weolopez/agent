/**
 * Context Manager
 * Dynamic context assembly system that queries across all memory types
 * to build relevant context for agent operations and LLM prompts.
 * 
 * Follows the ContextManager interface defined in API_CONTRACTS.md
 */

import { workingMemory } from './working-memory.js';
import { semanticMemory } from './semantic-memory.js';
import { episodicMemory } from './episodic-memory.js';
import { proceduralMemory } from './procedural-memory.js';
import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';
import { cacheSystem } from '../core/cache.js';

export class ContextManager {
    constructor() {
        this.memoryTypes = {
            working: workingMemory,
            semantic: semanticMemory,
            episodic: episodicMemory,
            procedural: proceduralMemory
        };
        
        this.relevanceWeights = {
            working: 1.0,    // Highest priority - current context
            procedural: 0.8, // High priority - how-to knowledge
            semantic: 0.6,   // Medium priority - facts and patterns
            episodic: 0.4    // Lower priority - historical experiences
        };
        
        this.maxContextSize = 100000; // 100KB default context limit
        this.contextCache = new Map();
        this.assemblyMetrics = {
            totalAssemblies: 0,
            averageAssemblyTime: 0,
            cacheHitRate: 0,
            averageContextSize: 0
        };
        
        this.initialize();
    }

    /**
     * Initialize context manager
     */
    async initialize() {
        try {
            // Load configuration
            const config = await configManager.getMemoryLimits();
            if (config.working) {
                this.maxContextSize = Math.floor(config.working * 0.1); // 10% of working memory limit
            }
            
            await logger.info('Context Manager initialized', {
                maxContextSize: this.maxContextSize,
                memoryTypes: Object.keys(this.memoryTypes).length,
                relevanceWeights: this.relevanceWeights
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'context_manager_initialization',
                component: 'ContextManager'
            });
        }
    }

    /**
     * Assemble context for a specific request
     * @param {Object} request - Context request object
     * @param {string} request.type - Type of context needed (e.g., 'task', 'agent', 'prompt')
     * @param {string} request.target - Target entity (e.g., agent type, task ID)
     * @param {Array<string>} request.keywords - Keywords for relevance matching
     * @param {Object} request.filters - Additional filters
     * @param {number} request.maxSize - Maximum context size in bytes
     * @returns {Promise<Object>} Assembled context
     */
    async assembleContext(request) {
        const startTime = performance.now();
        
        try {
            // Validate request
            this.validateContextRequest(request);
            
            // Check cache first
            const cacheKey = this.generateCacheKey(request);
            const cached = await this.getFromCache(cacheKey);
            if (cached) {
                this.updateMetrics(startTime, true, cached.size);
                return cached;
            }
            
            // Build context from all memory types
            const context = await this.buildContextFromMemories(request);
            
            // Optimize and trim context if needed
            const optimizedContext = await this.optimizeContext(context, request);
            
            // Cache the result
            await this.cacheContext(cacheKey, optimizedContext);
            
            // Update metrics
            const contextSize = JSON.stringify(optimizedContext).length;
            this.updateMetrics(startTime, false, contextSize);
            
            await logger.debug('Context assembled', {
                type: request.type,
                target: request.target,
                sourceMemories: Object.keys(context.sources).length,
                finalSize: contextSize,
                assemblyTime: performance.now() - startTime
            });
            
            return optimizedContext;
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'assemble_context',
                component: 'ContextManager',
                metadata: { request }
            });
            
            // Return minimal context on error
            return this.getMinimalContext(request);
        }
    }

    /**
     * Build context by querying all memory types
     * @param {Object} request - Context request
     * @returns {Promise<Object>} Raw context from all memories
     */
    async buildContextFromMemories(request) {
        const context = {
            sources: {},
            items: [],
            metadata: {
                request,
                timestamp: new Date().toISOString(),
                memoryStats: {}
            }
        };
        
        // Query each memory type concurrently
        const memoryQueries = Object.entries(this.memoryTypes).map(async ([type, memory]) => {
            try {
                const items = await this.queryMemoryType(memory, request, type);
                const scoredItems = await this.scoreRelevance(items, request, type);
                
                context.sources[type] = {
                    itemCount: scoredItems.length,
                    totalRelevance: scoredItems.reduce((sum, item) => sum + item.relevanceScore, 0),
                    averageRelevance: scoredItems.length > 0 ? 
                        scoredItems.reduce((sum, item) => sum + item.relevanceScore, 0) / scoredItems.length : 0
                };
                
                return { type, items: scoredItems };
                
            } catch (error) {
                await logger.warn(`Failed to query ${type} memory`, error, { request });
                context.sources[type] = { itemCount: 0, error: error.message };
                return { type, items: [] };
            }
        });
        
        const results = await Promise.all(memoryQueries);
        
        // Merge and sort items by relevance
        for (const { type, items } of results) {
            context.items.push(...items.map(item => ({ ...item, sourceType: type })));
        }
        
        // Sort by relevance score (descending)
        context.items.sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        return context;
    }

    /**
     * Query a specific memory type
     * @param {MemoryStore} memory - Memory store instance
     * @param {Object} request - Context request
     * @param {string} memoryType - Type of memory being queried
     * @returns {Promise<Array>} Query results
     */
    async queryMemoryType(memory, request, memoryType) {
        const queryFilters = this.buildMemoryQuery(request, memoryType);
        
        // Use memory-specific query optimizations
        switch (memoryType) {
            case 'working':
                return this.queryWorkingMemory(memory, queryFilters, request);
                
            case 'semantic':
                return this.querySemanticMemory(memory, queryFilters, request);
                
            case 'episodic':
                return this.queryEpisodicMemory(memory, queryFilters, request);
                
            case 'procedural':
                return this.queryProceduralMemory(memory, queryFilters, request);
                
            default:
                return memory.query(queryFilters);
        }
    }

    /**
     * Query working memory with session awareness
     * @param {WorkingMemory} memory - Working memory instance
     * @param {Object} filters - Query filters
     * @param {Object} request - Original request
     * @returns {Promise<Array>} Query results
     */
    async queryWorkingMemory(memory, filters, request) {
        const results = [];
        
        // Always include current session context
        const currentContext = await memory.getAllContext();
        if (currentContext && Object.keys(currentContext).length > 0) {
            results.push({
                key: 'current_context',
                data: currentContext,
                metadata: { 
                    type: 'working', 
                    category: 'context',
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // Include current task state if relevant
        if (request.type === 'task' || request.type === 'agent') {
            const taskState = await memory.getTaskState();
            if (taskState) {
                results.push({
                    key: 'current_task',
                    data: taskState,
                    metadata: { 
                        type: 'working', 
                        category: 'task',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }
        
        // Include relevant agent states
        if (request.type === 'agent' && request.target) {
            const agentState = await memory.getAgentState(request.target);
            if (agentState) {
                results.push({
                    key: `agent_${request.target}`,
                    data: agentState,
                    metadata: { 
                        type: 'working', 
                        category: 'agent',
                        agentType: request.target,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }
        
        // Query general working memory with filters
        const generalResults = await memory.query(filters);
        results.push(...generalResults);
        
        return results;
    }

    /**
     * Query semantic memory with knowledge patterns
     * @param {SemanticMemory} memory - Semantic memory instance
     * @param {Object} filters - Query filters
     * @param {Object} request - Original request
     * @returns {Promise<Array>} Query results
     */
    async querySemanticMemory(memory, filters, request) {
        const results = [];
        
        // Query by keywords if provided
        if (request.keywords && request.keywords.length > 0) {
            for (const keyword of request.keywords) {
                const keywordResults = await memory.query({
                    ...filters,
                    tags: [keyword],
                    limit: 10
                });
                results.push(...keywordResults);
            }
        }
        
        // Query by type and target
        if (request.type && request.target) {
            const typeResults = await memory.query({
                ...filters,
                category: request.type,
                tags: [request.target],
                limit: 15
            });
            results.push(...typeResults);
        }
        
        // General semantic query
        const generalResults = await memory.query({
            ...filters,
            limit: 20
        });
        results.push(...generalResults);
        
        // Remove duplicates
        const seen = new Set();
        return results.filter(item => {
            if (seen.has(item.key)) return false;
            seen.add(item.key);
            return true;
        });
    }

    /**
     * Query episodic memory with temporal patterns
     * @param {EpisodicMemory} memory - Episodic memory instance
     * @param {Object} filters - Query filters
     * @param {Object} request - Original request
     * @returns {Promise<Array>} Query results
     */
    async queryEpisodicMemory(memory, filters, request) {
        const results = [];
        
        // Recent experiences (last 24 hours)
        const recentResults = await memory.query({
            ...filters,
            timeRange: {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                end: new Date().toISOString()
            },
            limit: 10
        });
        results.push(...recentResults);
        
        // Relevant experiences by type/target
        if (request.type || request.target) {
            const relevantResults = await memory.query({
                ...filters,
                tags: [request.type, request.target].filter(Boolean),
                limit: 15
            });
            results.push(...relevantResults);
        }
        
        // Similar successful patterns
        const successResults = await memory.query({
            ...filters,
            tags: ['success', 'completed'],
            limit: 10
        });
        results.push(...successResults);
        
        // Remove duplicates
        const seen = new Set();
        return results.filter(item => {
            if (seen.has(item.key)) return false;
            seen.add(item.key);
            return true;
        });
    }

    /**
     * Query procedural memory with workflow patterns
     * @param {ProceduralMemory} memory - Procedural memory instance
     * @param {Object} filters - Query filters
     * @param {Object} request - Original request
     * @returns {Promise<Array>} Query results
     */
    async queryProceduralMemory(memory, filters, request) {
        const results = [];
        
        // Workflow templates for the target type
        if (request.target) {
            const workflowResults = await memory.query({
                ...filters,
                category: 'workflow',
                tags: [request.target],
                limit: 5
            });
            results.push(...workflowResults);
        }
        
        // Prompt templates for the request type
        if (request.type === 'prompt' || request.type === 'agent') {
            const promptResults = await memory.query({
                ...filters,
                category: 'prompt',
                tags: [request.target || request.type],
                limit: 10
            });
            results.push(...promptResults);
        }
        
        // Best practices and patterns
        const practiceResults = await memory.query({
            ...filters,
            category: 'practice',
            tags: [request.type, request.target].filter(Boolean),
            limit: 10
        });
        results.push(...practiceResults);
        
        // Configuration patterns
        const configResults = await memory.query({
            ...filters,
            category: 'configuration',
            limit: 5
        });
        results.push(...configResults);
        
        return results;
    }

    /**
     * Score items for relevance to the request
     * @param {Array} items - Items to score
     * @param {Object} request - Context request
     * @param {string} memoryType - Type of memory
     * @returns {Promise<Array>} Scored items
     */
    async scoreRelevance(items, request, memoryType) {
        const baseWeight = this.relevanceWeights[memoryType] || 0.5;
        
        return items.map(item => {
            let score = baseWeight;
            
            // Keyword matching
            if (request.keywords && request.keywords.length > 0) {
                const keywordScore = this.calculateKeywordScore(item, request.keywords);
                score *= (1 + keywordScore);
            }
            
            // Type/target matching
            if (request.type || request.target) {
                const typeScore = this.calculateTypeScore(item, request);
                score *= (1 + typeScore);
            }
            
            // Temporal relevance (recent items score higher)
            const timeScore = this.calculateTimeScore(item);
            score *= (1 + timeScore);
            
            // Quality/priority scoring
            const qualityScore = this.calculateQualityScore(item);
            score *= (1 + qualityScore);
            
            return {
                ...item,
                relevanceScore: Math.min(score, 10), // Cap at 10
                scoringBreakdown: {
                    base: baseWeight,
                    keyword: request.keywords ? this.calculateKeywordScore(item, request.keywords) : 0,
                    type: this.calculateTypeScore(item, request),
                    time: timeScore,
                    quality: qualityScore
                }
            };
        });
    }

    /**
     * Calculate keyword relevance score
     * @param {Object} item - Memory item
     * @param {Array<string>} keywords - Keywords to match
     * @returns {number} Keyword score (0-1)
     */
    calculateKeywordScore(item, keywords) {
        if (!keywords || keywords.length === 0) return 0;
        
        const itemText = JSON.stringify(item).toLowerCase();
        const matches = keywords.filter(keyword => 
            itemText.includes(keyword.toLowerCase())
        );
        
        return matches.length / keywords.length;
    }

    /**
     * Calculate type/target relevance score
     * @param {Object} item - Memory item
     * @param {Object} request - Context request
     * @returns {number} Type score (0-1)
     */
    calculateTypeScore(item, request) {
        let score = 0;
        
        if (request.type && item.metadata) {
            if (item.metadata.type === request.type) score += 0.5;
            if (item.metadata.category === request.type) score += 0.3;
            if (item.metadata.tags && item.metadata.tags.includes(request.type)) score += 0.2;
        }
        
        if (request.target && item.metadata) {
            if (item.metadata.agentType === request.target) score += 0.5;
            if (item.metadata.target === request.target) score += 0.5;
            if (item.metadata.tags && item.metadata.tags.includes(request.target)) score += 0.3;
        }
        
        return Math.min(score, 1);
    }

    /**
     * Calculate temporal relevance score
     * @param {Object} item - Memory item
     * @returns {number} Time score (0-0.5)
     */
    calculateTimeScore(item) {
        if (!item.metadata || !item.metadata.timestamp) return 0;
        
        const now = Date.now();
        const itemTime = new Date(item.metadata.timestamp).getTime();
        const ageHours = (now - itemTime) / (1000 * 60 * 60);
        
        // Recent items (< 1 hour) get highest score
        if (ageHours < 1) return 0.5;
        // Items from last 24 hours get medium score
        if (ageHours < 24) return 0.3;
        // Items from last week get low score
        if (ageHours < 168) return 0.1;
        // Older items get minimal score
        return 0.05;
    }

    /**
     * Calculate quality/priority score
     * @param {Object} item - Memory item
     * @returns {number} Quality score (0-0.3)
     */
    calculateQualityScore(item) {
        if (!item.metadata) return 0;
        
        let score = 0;
        
        // Priority-based scoring
        if (item.metadata.priority) {
            score += Math.min(item.metadata.priority / 10, 0.2);
        }
        
        // Success indicators
        if (item.metadata.tags) {
            if (item.metadata.tags.includes('success')) score += 0.1;
            if (item.metadata.tags.includes('verified')) score += 0.1;
            if (item.metadata.tags.includes('important')) score += 0.1;
        }
        
        return Math.min(score, 0.3);
    }

    /**
     * Optimize context by trimming and organizing
     * @param {Object} context - Raw context
     * @param {Object} request - Original request
     * @returns {Promise<Object>} Optimized context
     */
    async optimizeContext(context, request) {
        const maxSize = request.maxSize || this.maxContextSize;
        let currentSize = 0;
        const optimized = {
            summary: this.generateContextSummary(context, request),
            items: [],
            sources: context.sources,
            metadata: {
                ...context.metadata,
                optimization: {
                    originalItemCount: context.items.length,
                    maxSize,
                    timestamp: new Date().toISOString()
                }
            }
        };
        
        // Include items until size limit is reached
        for (const item of context.items) {
            const itemSize = JSON.stringify(item).length;
            
            if (currentSize + itemSize > maxSize) {
                // Try to include a compressed version
                const compressed = this.compressItem(item);
                const compressedSize = JSON.stringify(compressed).length;
                
                if (currentSize + compressedSize <= maxSize) {
                    optimized.items.push(compressed);
                    currentSize += compressedSize;
                } else {
                    break; // Stop if even compressed version doesn't fit
                }
            } else {
                optimized.items.push(item);
                currentSize += itemSize;
            }
        }
        
        optimized.metadata.optimization.finalItemCount = optimized.items.length;
        optimized.metadata.optimization.finalSize = currentSize;
        optimized.metadata.optimization.compressionRatio = 
            optimized.metadata.optimization.originalItemCount > 0 ?
            optimized.metadata.optimization.finalItemCount / optimized.metadata.optimization.originalItemCount : 0;
        
        return optimized;
    }

    /**
     * Generate a summary of the context
     * @param {Object} context - Context object
     * @param {Object} request - Original request
     * @returns {Object} Context summary
     */
    generateContextSummary(context, request) {
        const summary = {
            type: request.type,
            target: request.target,
            itemCount: context.items.length,
            sourceBreakdown: {},
            topRelevanceScores: [],
            averageRelevance: 0
        };
        
        // Source breakdown
        for (const [sourceType, sourceData] of Object.entries(context.sources)) {
            summary.sourceBreakdown[sourceType] = sourceData.itemCount || 0;
        }
        
        // Top relevance scores
        const topItems = context.items.slice(0, 5);
        summary.topRelevanceScores = topItems.map(item => ({
            key: item.key,
            score: item.relevanceScore,
            sourceType: item.sourceType
        }));
        
        // Average relevance
        if (context.items.length > 0) {
            summary.averageRelevance = context.items.reduce(
                (sum, item) => sum + (item.relevanceScore || 0), 0
            ) / context.items.length;
        }
        
        return summary;
    }

    /**
     * Compress an item to reduce size
     * @param {Object} item - Item to compress
     * @returns {Object} Compressed item
     */
    compressItem(item) {
        const compressed = {
            key: item.key,
            sourceType: item.sourceType,
            relevanceScore: item.relevanceScore
        };
        
        // Include essential metadata
        if (item.metadata) {
            compressed.metadata = {
                type: item.metadata.type,
                category: item.metadata.category,
                timestamp: item.metadata.timestamp
            };
        }
        
        // Compress data based on type
        if (item.data) {
            if (typeof item.data === 'string') {
                compressed.data = item.data.length > 200 ? 
                    item.data.substring(0, 200) + '...' : item.data;
            } else if (typeof item.data === 'object') {
                compressed.data = this.compressObject(item.data);
            } else {
                compressed.data = item.data;
            }
        }
        
        return compressed;
    }

    /**
     * Compress an object by keeping only essential fields
     * @param {Object} obj - Object to compress
     * @returns {Object} Compressed object
     */
    compressObject(obj) {
        const essential = ['id', 'type', 'status', 'description', 'result', 'summary'];
        const compressed = {};
        
        for (const key of essential) {
            if (obj[key] !== undefined) {
                compressed[key] = obj[key];
            }
        }
        
        // If no essential fields found, include first few properties
        if (Object.keys(compressed).length === 0) {
            const keys = Object.keys(obj).slice(0, 3);
            for (const key of keys) {
                compressed[key] = obj[key];
            }
        }
        
        return compressed;
    }

    /**
     * Build memory query filters
     * @param {Object} request - Context request
     * @param {string} memoryType - Type of memory
     * @returns {Object} Query filters
     */
    buildMemoryQuery(request, memoryType) {
        const filters = {};
        
        // Common filters
        if (request.filters) {
            Object.assign(filters, request.filters);
        }
        
        // Memory-type specific filters
        switch (memoryType) {
            case 'working':
                if (request.sessionId) filters.sessionId = request.sessionId;
                break;
                
            case 'semantic':
                if (request.keywords) filters.tags = request.keywords;
                break;
                
            case 'episodic':
                if (request.timeRange) filters.timeRange = request.timeRange;
                break;
                
            case 'procedural':
                if (request.type) filters.category = request.type;
                break;
        }
        
        return filters;
    }

    /**
     * Validate context request
     * @param {Object} request - Context request to validate
     */
    validateContextRequest(request) {
        if (!request || typeof request !== 'object') {
            throw new Error('Context request must be an object');
        }
        
        if (!request.type || typeof request.type !== 'string') {
            throw new Error('Context request must have a valid type');
        }
        
        if (request.keywords && !Array.isArray(request.keywords)) {
            throw new Error('Keywords must be an array');
        }
        
        if (request.maxSize && (typeof request.maxSize !== 'number' || request.maxSize <= 0)) {
            throw new Error('maxSize must be a positive number');
        }
    }

    /**
     * Generate cache key for context request
     * @param {Object} request - Context request
     * @returns {string} Cache key
     */
    generateCacheKey(request) {
        const keyComponents = [
            request.type,
            request.target || '',
            (request.keywords || []).sort().join(','),
            JSON.stringify(request.filters || {}),
            request.maxSize || this.maxContextSize
        ];
        
        return `context:${keyComponents.join(':')}`;
    }

    /**
     * Get context from cache
     * @param {string} cacheKey - Cache key
     * @returns {Promise<Object|null>} Cached context
     */
    async getFromCache(cacheKey) {
        try {
            const result = await cacheSystem.get(cacheKey);
            if (result.hit) {
                return result.value;
            }
        } catch (error) {
            await logger.debug('Cache lookup failed', error, { cacheKey });
        }
        return null;
    }

    /**
     * Cache context result
     * @param {string} cacheKey - Cache key
     * @param {Object} context - Context to cache
     * @returns {Promise<void>}
     */
    async cacheContext(cacheKey, context) {
        try {
            await cacheSystem.set(cacheKey, context, 300); // 5 minute TTL
        } catch (error) {
            await logger.debug('Failed to cache context', error, { cacheKey });
        }
    }

    /**
     * Get minimal fallback context
     * @param {Object} request - Original request
     * @returns {Object} Minimal context
     */
    getMinimalContext(request) {
        return {
            summary: {
                type: request.type,
                target: request.target,
                itemCount: 0,
                sourceBreakdown: {},
                topRelevanceScores: [],
                averageRelevance: 0,
                error: 'Failed to assemble context'
            },
            items: [],
            sources: {},
            metadata: {
                request,
                timestamp: new Date().toISOString(),
                error: true
            }
        };
    }

    /**
     * Update assembly metrics
     * @param {number} startTime - Assembly start time
     * @param {boolean} cacheHit - Whether this was a cache hit
     * @param {number} contextSize - Final context size
     */
    updateMetrics(startTime, cacheHit, contextSize) {
        const assemblyTime = performance.now() - startTime;
        
        this.assemblyMetrics.totalAssemblies++;
        
        // Update average assembly time
        const totalTime = this.assemblyMetrics.averageAssemblyTime * (this.assemblyMetrics.totalAssemblies - 1);
        this.assemblyMetrics.averageAssemblyTime = (totalTime + assemblyTime) / this.assemblyMetrics.totalAssemblies;
        
        // Update cache hit rate
        if (cacheHit) {
            const totalHits = this.assemblyMetrics.cacheHitRate * (this.assemblyMetrics.totalAssemblies - 1) * this.assemblyMetrics.totalAssemblies;
            this.assemblyMetrics.cacheHitRate = (totalHits + 1) / this.assemblyMetrics.totalAssemblies;
        }
        
        // Update average context size
        const totalSize = this.assemblyMetrics.averageContextSize * (this.assemblyMetrics.totalAssemblies - 1);
        this.assemblyMetrics.averageContextSize = (totalSize + contextSize) / this.assemblyMetrics.totalAssemblies;
    }

    /**
     * Get context assembly metrics
     * @returns {Object} Assembly metrics
     */
    getMetrics() {
        return {
            ...this.assemblyMetrics,
            cacheSize: this.contextCache.size,
            memoryTypes: Object.keys(this.memoryTypes).length,
            relevanceWeights: this.relevanceWeights
        };
    }

    /**
     * Clear context cache
     * @returns {Promise<void>}
     */
    async clearCache() {
        this.contextCache.clear();
        await logger.info('Context Manager cache cleared');
    }

    /**
     * Update relevance weights
     * @param {Object} newWeights - New relevance weights
     * @returns {Promise<void>}
     */
    async updateRelevanceWeights(newWeights) {
        if (typeof newWeights !== 'object') {
            throw new Error('Relevance weights must be an object');
        }
        
        for (const [type, weight] of Object.entries(newWeights)) {
            if (typeof weight !== 'number' || weight < 0 || weight > 1) {
                throw new Error(`Invalid weight for ${type}: must be number between 0 and 1`);
            }
        }
        
        Object.assign(this.relevanceWeights, newWeights);
        
        await logger.info('Context Manager relevance weights updated', {
            newWeights: this.relevanceWeights
        });
    }
}

// Create and export singleton instance
export const contextManager = new ContextManager();

// Export for ES6 modules
export default ContextManager;