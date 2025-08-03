/**
 * Memory Store Base
 * Abstract base class for all memory types with CRUD operations,
 * querying capabilities, and event system.
 * 
 * Follows the MemoryStore interface defined in API_CONTRACTS.md
 */

import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { cacheSystem } from '../core/cache.js';

export class MemoryStore {
    constructor(memoryType, options = {}) {
        if (new.target === MemoryStore) {
            throw new Error('MemoryStore is abstract and cannot be instantiated directly');
        }
        
        this.memoryType = memoryType;
        this.options = {
            maxItems: 100000,
            maxSize: 100 * 1024 * 1024, // 100MB
            enableCache: true,
            enableCompression: false,
            autoCleanup: true,
            cleanupInterval: 60000, // 1 minute
            ...options
        };
        
        this.items = new Map();
        this.metadata = new Map();
        this.subscribers = new Set();
        this.initialized = false;
        
        this.stats = {
            totalItems: 0,
            totalSize: 0,
            operations: {
                store: 0,
                retrieve: 0,
                update: 0,
                delete: 0,
                query: 0
            },
            performance: {
                averageStoreTime: 0,
                averageRetrieveTime: 0,
                averageQueryTime: 0
            }
        };
        
        this.initialize();
    }

    /**
     * Initialize the memory store
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await this.loadFromPersistence();
            
            if (this.options.autoCleanup) {
                this.startCleanupScheduler();
            }
            
            this.initialized = true;
            
            await logger.info(`${this.memoryType} memory store initialized`, {
                maxItems: this.options.maxItems,
                maxSize: this.options.maxSize
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_store_initialization',
                component: 'MemoryStore',
                memoryType: this.memoryType
            });
        }
    }

    /**
     * Store data in memory with metadata
     * @param {string} key - Unique identifier
     * @param {any} data - Data to store
     * @param {Object} metadata - Optional metadata
     * @returns {Promise<void>}
     */
    async store(key, data, metadata = {}) {
        const startTime = performance.now();
        
        try {
            await this.ensureInitialized();
            
            // Validate input
            if (!key || typeof key !== 'string') {
                throw new Error('Key must be a non-empty string');
            }
            
            // Check capacity
            await this.ensureCapacity();
            
            // Create memory item
            const memoryItem = this.createMemoryItem(key, data, metadata);
            
            // Store in memory
            this.items.set(key, memoryItem.data);
            this.metadata.set(key, memoryItem.metadata);
            
            // Cache if enabled
            if (this.options.enableCache) {
                await cacheSystem.set(
                    this.getCacheKey(key),
                    memoryItem,
                    { ttl: this.getCacheTTL(metadata) }
                );
            }
            
            // Update statistics
            this.updateStats('store', startTime);
            this.stats.totalItems = this.items.size;
            this.stats.totalSize += this.estimateSize(data);
            
            // Notify subscribers
            this.notifySubscribers({
                type: 'created',
                key,
                newData: data,
                timestamp: new Date().toISOString()
            });
            
            // Persist if necessary
            await this.persistIfNeeded(key, memoryItem);
            
            await logger.debug('Memory item stored', {
                memoryType: this.memoryType,
                key: key.substring(0, 50),
                size: this.estimateSize(data)
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_store',
                component: 'MemoryStore',
                memoryType: this.memoryType,
                metadata: { key, dataType: typeof data }
            });
            throw error;
        }
    }

    /**
     * Retrieve data from memory
     * @param {string} key - Item identifier
     * @returns {Promise<Object|null>} Memory item or null if not found
     */
    async retrieve(key) {
        const startTime = performance.now();
        
        try {
            await this.ensureInitialized();
            
            // Check memory first
            if (this.items.has(key)) {
                const data = this.items.get(key);
                const metadata = this.metadata.get(key) || {};
                
                // Update access information
                metadata.accessed = new Date().toISOString();
                metadata.accessCount = (metadata.accessCount || 0) + 1;
                this.metadata.set(key, metadata);
                
                this.updateStats('retrieve', startTime);
                
                return this.createMemoryItem(key, data, metadata);
            }
            
            // Check cache if enabled
            if (this.options.enableCache) {
                const cached = await cacheSystem.get(this.getCacheKey(key));
                if (cached.hit) {
                    const memoryItem = cached.value;
                    
                    // Store back in memory for faster future access
                    this.items.set(key, memoryItem.data);
                    this.metadata.set(key, memoryItem.metadata);
                    
                    this.updateStats('retrieve', startTime);
                    return memoryItem;
                }
            }
            
            // Check persistence
            const persisted = await this.loadFromPersistence(key);
            if (persisted) {
                this.items.set(key, persisted.data);
                this.metadata.set(key, persisted.metadata);
                
                this.updateStats('retrieve', startTime);
                return persisted;
            }
            
            this.updateStats('retrieve', startTime);
            return null;
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_retrieve',
                component: 'MemoryStore',
                memoryType: this.memoryType,
                metadata: { key }
            });
            return null;
        }
    }

    /**
     * Update existing memory item
     * @param {string} key - Item identifier
     * @param {any} data - New data
     * @param {Object} metadata - Metadata updates
     * @returns {Promise<boolean>} Success status
     */
    async update(key, data, metadata = {}) {
        const startTime = performance.now();
        
        try {
            await this.ensureInitialized();
            
            if (!this.items.has(key)) {
                return false;
            }
            
            const oldData = this.items.get(key);
            const oldMetadata = this.metadata.get(key) || {};
            
            // Merge metadata
            const newMetadata = {
                ...oldMetadata,
                ...metadata,
                modified: new Date().toISOString()
            };
            
            // Update in memory
            this.items.set(key, data);
            this.metadata.set(key, newMetadata);
            
            // Update cache
            if (this.options.enableCache) {
                const memoryItem = this.createMemoryItem(key, data, newMetadata);
                await cacheSystem.set(
                    this.getCacheKey(key),
                    memoryItem,
                    { ttl: this.getCacheTTL(newMetadata) }
                );
            }
            
            // Update statistics
            this.updateStats('update', startTime);
            
            // Notify subscribers
            this.notifySubscribers({
                type: 'updated',
                key,
                oldData,
                newData: data,
                timestamp: new Date().toISOString()
            });
            
            // Persist if necessary
            const memoryItem = this.createMemoryItem(key, data, newMetadata);
            await this.persistIfNeeded(key, memoryItem);
            
            await logger.debug('Memory item updated', {
                memoryType: this.memoryType,
                key: key.substring(0, 50)
            });
            
            return true;
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_update',
                component: 'MemoryStore',
                memoryType: this.memoryType,
                metadata: { key }
            });
            return false;
        }
    }

    /**
     * Delete memory item
     * @param {string} key - Item identifier
     * @returns {Promise<boolean>} Success status
     */
    async delete(key) {
        const startTime = performance.now();
        
        try {
            await this.ensureInitialized();
            
            if (!this.items.has(key)) {
                return false;
            }
            
            const oldData = this.items.get(key);
            
            // Remove from memory
            this.items.delete(key);
            this.metadata.delete(key);
            
            // Remove from cache
            if (this.options.enableCache) {
                await cacheSystem.delete(this.getCacheKey(key));
            }
            
            // Update statistics
            this.updateStats('delete', startTime);
            this.stats.totalItems = this.items.size;
            this.stats.totalSize -= this.estimateSize(oldData);
            
            // Notify subscribers
            this.notifySubscribers({
                type: 'deleted',
                key,
                oldData,
                timestamp: new Date().toISOString()
            });
            
            // Remove from persistence
            await this.removeFromPersistence(key);
            
            await logger.debug('Memory item deleted', {
                memoryType: this.memoryType,
                key: key.substring(0, 50)
            });
            
            return true;
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_delete',
                component: 'MemoryStore',
                memoryType: this.memoryType,
                metadata: { key }
            });
            return false;
        }
    }

    /**
     * Query memory items with filtering
     * @param {Object} filter - Query filter
     * @returns {Promise<Array>} Matching memory results
     */
    async query(filter) {
        const startTime = performance.now();
        
        try {
            await this.ensureInitialized();
            
            const results = [];
            const {
                type = this.memoryType,
                category,
                tags,
                dateRange,
                priority,
                limit = 100,
                offset = 0,
                sortBy = 'created',
                sortOrder = 'desc'
            } = filter;
            
            // Filter items
            for (const [key, data] of this.items) {
                const metadata = this.metadata.get(key) || {};
                
                // Type filter
                if (type && metadata.type !== type) continue;
                
                // Category filter
                if (category && metadata.category !== category) continue;
                
                // Tags filter
                if (tags && tags.length > 0) {
                    const itemTags = metadata.tags || [];
                    if (!tags.some(tag => itemTags.includes(tag))) continue;
                }
                
                // Date range filter
                if (dateRange) {
                    const itemDate = new Date(metadata[dateRange.field] || metadata.created);
                    const start = new Date(dateRange.start);
                    const end = new Date(dateRange.end);
                    if (itemDate < start || itemDate > end) continue;
                }
                
                // Priority filter
                if (priority) {
                    const itemPriority = metadata.priority || 0;
                    if (priority.min && itemPriority < priority.min) continue;
                    if (priority.max && itemPriority > priority.max) continue;
                }
                
                results.push({
                    key,
                    data,
                    metadata,
                    relevanceScore: this.calculateRelevance(data, metadata, filter)
                });
            }
            
            // Sort results
            results.sort((a, b) => {
                const aValue = this.getSortValue(a, sortBy);
                const bValue = this.getSortValue(b, sortBy);
                
                if (sortOrder === 'asc') {
                    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
                } else {
                    return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
                }
            });
            
            // Apply pagination
            const paginatedResults = results.slice(offset, offset + limit);
            
            this.updateStats('query', startTime);
            
            await logger.debug('Memory query executed', {
                memoryType: this.memoryType,
                filter: Object.keys(filter),
                resultsCount: paginatedResults.length,
                totalMatches: results.length
            });
            
            return paginatedResults;
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_query',
                component: 'MemoryStore',
                memoryType: this.memoryType,
                metadata: { filter }
            });
            return [];
        }
    }

    /**
     * Search memory items with text matching
     * @param {Object} query - Search query
     * @returns {Promise<Array>} Search results
     */
    async search(query) {
        const startTime = performance.now();
        
        try {
            await this.ensureInitialized();
            
            const {
                text,
                type = this.memoryType,
                fuzzy = false,
                maxResults = 50,
                minConfidence = 0.3
            } = query;
            
            const results = [];
            const searchTerms = text.toLowerCase().split(/\s+/);
            
            for (const [key, data] of this.items) {
                const metadata = this.metadata.get(key) || {};
                
                // Type filter
                if (type && metadata.type !== type) continue;
                
                // Calculate text relevance
                const relevance = this.calculateTextRelevance(data, searchTerms, fuzzy);
                
                if (relevance >= minConfidence) {
                    results.push({
                        key,
                        data,
                        metadata,
                        relevanceScore: relevance,
                        matchedFields: this.getMatchedFields(data, searchTerms)
                    });
                }
            }
            
            // Sort by relevance
            results.sort((a, b) => b.relevanceScore - a.relevanceScore);
            
            // Limit results
            const limitedResults = results.slice(0, maxResults);
            
            this.updateStats('query', startTime);
            
            await logger.debug('Memory search executed', {
                memoryType: this.memoryType,
                searchText: text.substring(0, 50),
                resultsCount: limitedResults.length
            });
            
            return limitedResults;
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_search',
                component: 'MemoryStore',
                memoryType: this.memoryType,
                metadata: { query }
            });
            return [];
        }
    }

    /**
     * Get memory type
     * @returns {string} Memory type
     */
    getMemoryType() {
        return this.memoryType;
    }

    /**
     * Get storage information
     * @returns {Promise<Object>} Storage info
     */
    async getStorageInfo() {
        const totalItems = this.items.size;
        let totalSize = 0;
        
        for (const [key, data] of this.items) {
            totalSize += this.estimateSize(data);
        }
        
        return {
            totalItems,
            totalSize,
            availableSpace: this.options.maxSize - totalSize,
            efficiency: totalSize / this.options.maxSize,
            fragmentationLevel: this.calculateFragmentation()
        };
    }

    /**
     * Compact memory store
     * @returns {Promise<Object>} Compaction result
     */
    async compact() {
        const startTime = performance.now();
        
        try {
            let itemsProcessed = 0;
            let spaceSaved = 0;
            const errors = [];
            
            // Remove expired items
            const now = Date.now();
            for (const [key, metadata] of this.metadata) {
                try {
                    if (metadata.expiresAt && new Date(metadata.expiresAt).getTime() < now) {
                        await this.delete(key);
                        itemsProcessed++;
                    }
                } catch (error) {
                    errors.push(`Failed to delete expired item ${key}: ${error.message}`);
                }
            }
            
            // Compress large items if enabled
            if (this.options.enableCompression) {
                for (const [key, data] of this.items) {
                    try {
                        const size = this.estimateSize(data);
                        if (size > 10240) { // 10KB threshold
                            const compressed = await this.compressData(data);
                            if (compressed.length < size) {
                                this.items.set(key, compressed);
                                spaceSaved += size - compressed.length;
                                itemsProcessed++;
                            }
                        }
                    } catch (error) {
                        errors.push(`Failed to compress item ${key}: ${error.message}`);
                    }
                }
            }
            
            const duration = performance.now() - startTime;
            
            await logger.info('Memory store compaction completed', {
                memoryType: this.memoryType,
                itemsProcessed,
                spaceSaved,
                duration,
                errors: errors.length
            });
            
            return {
                itemsProcessed,
                spaceSaved,
                duration,
                errors
            };
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'memory_compact',
                component: 'MemoryStore',
                memoryType: this.memoryType
            });
            
            return {
                itemsProcessed: 0,
                spaceSaved: 0,
                duration: performance.now() - startTime,
                errors: ['Compaction failed']
            };
        }
    }

    /**
     * Subscribe to memory changes
     * @param {Function} callback - Change callback
     * @returns {Object} Subscription object
     */
    subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        const subscription = {
            id: this.generateSubscriptionId(),
            callback,
            unsubscribe: () => {
                this.subscribers.delete(subscription);
            }
        };
        
        this.subscribers.add(subscription);
        
        return subscription;
    }

    /**
     * Unsubscribe from memory changes
     * @param {Object} subscription - Subscription object
     */
    unsubscribe(subscription) {
        this.subscribers.delete(subscription);
    }

    // Protected Methods (for subclasses)

    /**
     * Create memory item with standardized structure
     * @param {string} key
     * @param {any} data
     * @param {Object} metadata
     * @returns {Object}
     */
    createMemoryItem(key, data, metadata) {
        const now = new Date().toISOString();
        
        return {
            key,
            data,
            metadata: {
                type: this.memoryType,
                category: metadata.category || 'general',
                tags: metadata.tags || [],
                priority: metadata.priority || 1,
                expiresAt: metadata.expiresAt,
                source: metadata.source || 'user',
                confidence: metadata.confidence || 1.0,
                relations: metadata.relations || [],
                created: metadata.created || now,
                modified: metadata.modified || now,
                accessed: metadata.accessed || now,
                accessCount: metadata.accessCount || 0,
                ...metadata
            }
        };
    }

    /**
     * Ensure memory store is initialized
     * @returns {Promise<void>}
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Ensure memory capacity is available
     * @returns {Promise<void>}
     */
    async ensureCapacity() {
        if (this.items.size >= this.options.maxItems) {
            await this.evictOldestItems(Math.floor(this.options.maxItems * 0.1));
        }
    }

    /**
     * Evict oldest items to free up space
     * @param {number} count - Number of items to evict
     * @returns {Promise<void>}
     */
    async evictOldestItems(count) {
        const items = Array.from(this.metadata.entries())
            .sort((a, b) => new Date(a[1].accessed || a[1].created) - new Date(b[1].accessed || b[1].created))
            .slice(0, count);
        
        for (const [key] of items) {
            await this.delete(key);
        }
        
        await logger.debug('Evicted old memory items', {
            memoryType: this.memoryType,
            count: items.length
        });
    }

    // Utility Methods

    /**
     * Estimate size of data in bytes
     * @param {any} data
     * @returns {number}
     */
    estimateSize(data) {
        try {
            return JSON.stringify(data).length * 2; // Unicode chars are 2 bytes
        } catch (error) {
            return 1024; // Default estimate
        }
    }

    /**
     * Calculate relevance score for query
     * @param {any} data
     * @param {Object} metadata
     * @param {Object} filter
     * @returns {number}
     */
    calculateRelevance(data, metadata, filter) {
        let score = 0.5; // Base score
        
        // Priority weighting
        if (metadata.priority) {
            score += metadata.priority * 0.1;
        }
        
        // Recency weighting
        const age = Date.now() - new Date(metadata.created).getTime();
        const daysSinceCreated = age / (1000 * 60 * 60 * 24);
        score += Math.max(0, 1 - daysSinceCreated / 30) * 0.2; // Decay over 30 days
        
        // Access frequency weighting
        if (metadata.accessCount) {
            score += Math.min(metadata.accessCount * 0.01, 0.3);
        }
        
        return Math.min(score, 1.0);
    }

    /**
     * Calculate text relevance for search
     * @param {any} data
     * @param {Array} searchTerms
     * @param {boolean} fuzzy
     * @returns {number}
     */
    calculateTextRelevance(data, searchTerms, fuzzy) {
        const text = JSON.stringify(data).toLowerCase();
        let matches = 0;
        let totalTerms = searchTerms.length;
        
        for (const term of searchTerms) {
            if (fuzzy) {
                // Simple fuzzy matching - check for partial matches
                if (text.includes(term) || this.fuzzyMatch(text, term)) {
                    matches++;
                }
            } else {
                if (text.includes(term)) {
                    matches++;
                }
            }
        }
        
        return totalTerms > 0 ? matches / totalTerms : 0;
    }

    /**
     * Simple fuzzy matching
     * @param {string} text
     * @param {string} term
     * @returns {boolean}
     */
    fuzzyMatch(text, term) {
        if (term.length < 3) return false;
        
        // Check for partial matches with some character variations
        for (let i = 0; i <= text.length - term.length + 1; i++) {
            const substring = text.substring(i, i + term.length);
            let differences = 0;
            
            for (let j = 0; j < term.length; j++) {
                if (substring[j] !== term[j]) {
                    differences++;
                }
            }
            
            // Allow up to 20% character differences
            if (differences / term.length <= 0.2) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Get matched fields for search result
     * @param {any} data
     * @param {Array} searchTerms
     * @returns {Array}
     */
    getMatchedFields(data, searchTerms) {
        const matchedFields = [];
        
        if (typeof data === 'object' && data !== null) {
            for (const [field, value] of Object.entries(data)) {
                const fieldText = String(value).toLowerCase();
                for (const term of searchTerms) {
                    if (fieldText.includes(term)) {
                        if (!matchedFields.includes(field)) {
                            matchedFields.push(field);
                        }
                    }
                }
            }
        }
        
        return matchedFields;
    }

    /**
     * Get sort value for sorting
     * @param {Object} item
     * @param {string} sortBy
     * @returns {any}
     */
    getSortValue(item, sortBy) {
        const { metadata } = item;
        
        switch (sortBy) {
            case 'created':
                return new Date(metadata.created);
            case 'modified':
                return new Date(metadata.modified || metadata.created);
            case 'accessed':
                return new Date(metadata.accessed || metadata.created);
            case 'priority':
                return metadata.priority || 0;
            case 'accessCount':
                return metadata.accessCount || 0;
            default:
                return metadata[sortBy] || 0;
        }
    }

    /**
     * Generate cache key
     * @param {string} key
     * @returns {string}
     */
    getCacheKey(key) {
        return `memory:${this.memoryType}:${key}`;
    }

    /**
     * Get cache TTL for metadata
     * @param {Object} metadata
     * @returns {number}
     */
    getCacheTTL(metadata) {
        if (metadata.expiresAt) {
            return new Date(metadata.expiresAt).getTime() - Date.now();
        }
        return 3600000; // 1 hour default
    }

    /**
     * Notify subscribers of changes
     * @param {Object} change
     */
    notifySubscribers(change) {
        for (const subscription of this.subscribers) {
            try {
                subscription.callback(change);
            } catch (error) {
                console.error('Error in memory store subscriber:', error);
            }
        }
    }

    /**
     * Update performance statistics
     * @param {string} operation
     * @param {number} startTime
     */
    updateStats(operation, startTime) {
        const duration = performance.now() - startTime;
        
        this.stats.operations[operation]++;
        
        const avgKey = `average${operation.charAt(0).toUpperCase() + operation.slice(1)}Time`;
        const currentAvg = this.stats.performance[avgKey] || 0;
        const count = this.stats.operations[operation];
        
        this.stats.performance[avgKey] = (currentAvg * (count - 1) + duration) / count;
    }

    /**
     * Generate subscription ID
     * @returns {string}
     */
    generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Calculate memory fragmentation level
     * @returns {number}
     */
    calculateFragmentation() {
        // Simple fragmentation estimate based on size distribution
        const sizes = Array.from(this.items.values()).map(data => this.estimateSize(data));
        if (sizes.length === 0) return 0;
        
        const avg = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
        const variance = sizes.reduce((sum, size) => sum + Math.pow(size - avg, 2), 0) / sizes.length;
        
        return Math.min(variance / (avg * avg), 1); // Normalized fragmentation
    }

    /**
     * Start cleanup scheduler
     */
    startCleanupScheduler() {
        setInterval(async () => {
            try {
                await this.compact();
            } catch (error) {
                await logger.warn('Cleanup scheduler error', error, {
                    memoryType: this.memoryType
                });
            }
        }, this.options.cleanupInterval);
    }

    // Abstract methods (to be implemented by subclasses)

    /**
     * Load data from persistence layer
     * @param {string} key - Optional specific key
     * @returns {Promise<Object|null>}
     */
    async loadFromPersistence(key = null) {
        // Default implementation - no persistence
        return null;
    }

    /**
     * Persist data if necessary
     * @param {string} key
     * @param {Object} memoryItem
     * @returns {Promise<void>}
     */
    async persistIfNeeded(key, memoryItem) {
        // Default implementation - no persistence
    }

    /**
     * Remove from persistence
     * @param {string} key
     * @returns {Promise<void>}
     */
    async removeFromPersistence(key) {
        // Default implementation - no persistence
    }

    /**
     * Compress data
     * @param {any} data
     * @returns {Promise<any>}
     */
    async compressData(data) {
        // Default implementation - no compression
        return data;
    }
}

export default MemoryStore;