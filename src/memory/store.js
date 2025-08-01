export class MemoryStore {
    constructor(config, logger, cacheManager) {
        this.config = config;
        this.logger = logger;
        this.cache = cacheManager;
        
        // In-memory storage for different memory types
        this.workingMemory = new Map();
        this.semanticMemory = new Map();
        this.episodicMemory = new Map();
        this.proceduralMemory = new Map();
        
        // IndexedDB for persistence
        this.dbName = 'AgentMemoryDB';
        this.dbVersion = 1;
        this.db = null;
        
        // Memory metadata
        this.metadata = {
            working: new Map(),
            semantic: new Map(),
            episodic: new Map(),
            procedural: new Map()
        };
        
        this.initialized = false;
        this.setupEventListeners();
    }

    async init() {
        try {
            // Initialize IndexedDB for persistence
            if (this.config.get('memory.persistentStorage')) {
                await this.initIndexedDB();
                await this.loadPersistedMemory();
            }
            
            this.initialized = true;
            this.logger.info('MemoryStore', 'Memory store initialized successfully');
            
        } catch (error) {
            throw new Error(`Failed to initialize memory store: ${error.message}`);
        }
    }

    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores for each memory type
                ['working', 'semantic', 'episodic', 'procedural'].forEach(type => {
                    if (!db.objectStoreNames.contains(type)) {
                        const store = db.createObjectStore(type, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    }
                });
            };
        });
    }

    async loadPersistedMemory() {
        if (!this.db) return;
        
        const types = ['working', 'semantic', 'episodic', 'procedural'];
        
        for (const type of types) {
            try {
                const entries = await this.getAllFromStore(type);
                const memoryMap = this.getMemoryMap(type);
                const metadataMap = this.metadata[type];
                
                entries.forEach(entry => {
                    memoryMap.set(entry.id, entry.data);
                    metadataMap.set(entry.id, {
                        timestamp: entry.timestamp,
                        tags: entry.tags || [],
                        accessCount: entry.accessCount || 0,
                        lastAccess: entry.lastAccess || entry.timestamp,
                        importance: entry.importance || 0.5
                    });
                });
                
                this.logger.info('MemoryStore', `Loaded ${entries.length} ${type} memory entries`);
                
            } catch (error) {
                this.logger.error('MemoryStore', `Failed to load ${type} memory`, error);
            }
        }
    }

    setupEventListeners() {
        // Listen for memory clear events from error handler
        window.addEventListener('agentClearMemory', (event) => {
            const { level } = event.detail;
            this.clearCacheLevel(level);
        });
        
        window.addEventListener('agentResetMemory', (event) => {
            const { memoryType } = event.detail;
            this.clearMemoryType(memoryType);
        });
    }

    // Core storage operations
    async store(type, key, value, metadata = {}) {
        if (!this.isValidMemoryType(type)) {
            throw new Error(`Invalid memory type: ${type}`);
        }

        const memoryMap = this.getMemoryMap(type);
        const metadataMap = this.metadata[type];
        
        // Prepare memory entry
        const entry = {
            id: key,
            data: value,
            timestamp: Date.now(),
            tags: metadata.tags || [],
            importance: metadata.importance || 0.5,
            accessCount: 0,
            lastAccess: Date.now()
        };
        
        // Store in memory
        memoryMap.set(key, value);
        metadataMap.set(key, {
            timestamp: entry.timestamp,
            tags: entry.tags,
            importance: entry.importance,
            accessCount: entry.accessCount,
            lastAccess: entry.lastAccess
        });
        
        // Cache in appropriate level based on importance
        const cacheLevel = this.determineCacheLevel(metadata.importance || 0.5);
        this.cache.set(this.getCacheKey(type, key), value, cacheLevel);
        
        // Persist to IndexedDB if enabled
        if (this.db) {
            try {
                await this.persistEntry(type, entry);
            } catch (error) {
                this.logger.warn('MemoryStore', `Failed to persist ${type} entry ${key}`, error);
            }
        }
        
        this.logger.logMemoryAccess(type, 'store', { key, size: this.estimateSize(value) });
        return true;
    }

    retrieve(type, key) {
        if (!this.isValidMemoryType(type)) {
            throw new Error(`Invalid memory type: ${type}`);
        }

        // Try cache first
        const cacheKey = this.getCacheKey(type, key);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.updateAccess(type, key);
            this.logger.logMemoryAccess(type, 'retrieve', null, 'cache_hit');
            return cached;
        }
        
        // Try in-memory storage
        const memoryMap = this.getMemoryMap(type);
        if (memoryMap.has(key)) {
            const value = memoryMap.get(key);
            this.updateAccess(type, key);
            
            // Update cache with retrieved value
            const metadata = this.metadata[type].get(key);
            if (metadata) {
                const cacheLevel = this.determineCacheLevel(metadata.importance);
                this.cache.set(cacheKey, value, cacheLevel);
            }
            
            this.logger.logMemoryAccess(type, 'retrieve', null, 'memory_hit');
            return value;
        }
        
        this.logger.logMemoryAccess(type, 'retrieve', null, 'miss');
        return null;
    }

    async search(type, query, filters = {}) {
        if (!this.isValidMemoryType(type)) {
            throw new Error(`Invalid memory type: ${type}`);
        }

        const memoryMap = this.getMemoryMap(type);
        const metadataMap = this.metadata[type];
        const results = [];
        
        // Search through entries
        for (const [key, value] of memoryMap.entries()) {
            const metadata = metadataMap.get(key);
            if (!metadata) continue;
            
            // Apply filters
            if (filters.tags && filters.tags.length > 0) {
                const hasMatchingTag = filters.tags.some(tag => 
                    metadata.tags.includes(tag)
                );
                if (!hasMatchingTag) continue;
            }
            
            if (filters.minImportance && metadata.importance < filters.minImportance) {
                continue;
            }
            
            if (filters.since && metadata.timestamp < filters.since) {
                continue;
            }
            
            // Apply text search
            let relevanceScore = 0;
            if (query && typeof query === 'string') {
                relevanceScore = this.calculateRelevance(value, query);
                if (relevanceScore < 0.1) continue; // Threshold for relevance
            } else if (query && typeof query === 'function') {
                if (!query(key, value, metadata)) continue;
                relevanceScore = 1.0; // Function matched
            } else {
                relevanceScore = metadata.importance; // Default relevance
            }
            
            results.push({
                key,
                value,
                metadata,
                relevanceScore
            });
        }
        
        // Sort by relevance and importance
        results.sort((a, b) => {
            const scoreA = a.relevanceScore * 0.7 + a.metadata.importance * 0.3;
            const scoreB = b.relevanceScore * 0.7 + b.metadata.importance * 0.3;
            return scoreB - scoreA;
        });
        
        // Apply limit
        const limit = filters.limit || 50;
        const limitedResults = results.slice(0, limit);
        
        this.logger.logMemoryAccess(type, 'search', { 
            query: typeof query === 'string' ? query : '[function]',
            resultCount: limitedResults.length 
        });
        
        return limitedResults;
    }

    // Specialized memory operations
    async storeWorkingMemory(key, value, context = {}) {
        return await this.store('working', key, value, {
            tags: ['current_task', ...(context.tags || [])],
            importance: 0.9 // Working memory is highly important
        });
    }

    async storeSemanticMemory(key, value, concepts = []) {
        return await this.store('semantic', key, value, {
            tags: ['knowledge', ...concepts],
            importance: 0.7
        });
    }

    async storeEpisodicMemory(key, value, context = {}) {
        return await this.store('episodic', key, value, {
            tags: ['experience', 'interaction', ...(context.tags || [])],
            importance: context.importance || 0.6
        });
    }

    async storeProceduralMemory(key, value, skillTags = []) {
        return await this.store('procedural', key, value, {
            tags: ['procedure', 'skill', ...skillTags],
            importance: 0.8
        });
    }

    // Memory analysis and insights
    getMemoryStats() {
        const stats = {
            working: this.workingMemory.size,
            semantic: this.semanticMemory.size,
            episodic: this.episodicMemory.size,
            procedural: this.proceduralMemory.size,
            total: 0,
            cacheHitRate: this.cache.getStats().hitRate,
            memoryUsage: this.estimateMemoryUsage()
        };
        
        stats.total = stats.working + stats.semantic + stats.episodic + stats.procedural;
        return stats;
    }

    getMemoryHealth() {
        const stats = this.getMemoryStats();
        let healthScore = 100;
        
        // Check for memory type balance
        const idealRatios = { working: 0.1, semantic: 0.4, episodic: 0.3, procedural: 0.2 };
        Object.keys(idealRatios).forEach(type => {
            const actual = stats[type] / stats.total;
            const ideal = idealRatios[type];
            const deviation = Math.abs(actual - ideal);
            healthScore -= deviation * 50; // Penalize deviation
        });
        
        // Check cache performance
        if (stats.cacheHitRate < 0.5) {
            healthScore -= (0.5 - stats.cacheHitRate) * 100;
        }
        
        return Math.max(0, Math.min(100, healthScore));
    }

    // Utility methods
    isValidMemoryType(type) {
        return ['working', 'semantic', 'episodic', 'procedural'].includes(type);
    }

    getMemoryMap(type) {
        switch (type) {
            case 'working': return this.workingMemory;
            case 'semantic': return this.semanticMemory;
            case 'episodic': return this.episodicMemory;
            case 'procedural': return this.proceduralMemory;
            default: throw new Error(`Invalid memory type: ${type}`);
        }
    }

    getCacheKey(type, key) {
        return `memory:${type}:${key}`;
    }

    determineCacheLevel(importance) {
        if (importance >= 0.8) return 'L1';
        if (importance >= 0.6) return 'L2';
        return 'L3';
    }

    updateAccess(type, key) {
        const metadata = this.metadata[type].get(key);
        if (metadata) {
            metadata.accessCount++;
            metadata.lastAccess = Date.now();
            
            // Update importance based on access pattern
            const accessRecency = Date.now() - metadata.lastAccess;
            const recencyBonus = Math.max(0, 0.1 - (accessRecency / (24 * 60 * 60 * 1000))); // Decay over 24h
            metadata.importance = Math.min(1.0, metadata.importance + recencyBonus);
        }
    }

    calculateRelevance(value, query) {
        try {
            const text = JSON.stringify(value).toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Simple text matching - could be enhanced with more sophisticated algorithms
            if (text.includes(queryLower)) {
                // Calculate match density
                const matches = (text.match(new RegExp(queryLower, 'g')) || []).length;
                return Math.min(1.0, matches / text.length * 100);
            }
            
            return 0;
        } catch {
            return 0;
        }
    }

    estimateSize(value) {
        try {
            return JSON.stringify(value).length;
        } catch {
            return 1000; // Default estimate
        }
    }

    estimateMemoryUsage() {
        let total = 0;
        
        ['working', 'semantic', 'episodic', 'procedural'].forEach(type => {
            const memoryMap = this.getMemoryMap(type);
            memoryMap.forEach(value => {
                total += this.estimateSize(value);
            });
        });
        
        return total;
    }

    // IndexedDB operations
    async persistEntry(type, entry) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([type], 'readwrite');
            const store = transaction.objectStore(type);
            const request = store.put(entry);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAllFromStore(type) {
        if (!this.db) return [];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([type], 'readonly');
            const store = transaction.objectStore(type);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Cleanup operations
    clearMemoryType(type) {
        if (!this.isValidMemoryType(type)) return;
        
        const memoryMap = this.getMemoryMap(type);
        const metadataMap = this.metadata[type];
        
        const count = memoryMap.size;
        memoryMap.clear();
        metadataMap.clear();
        
        // Clear related cache entries
        this.cache.invalidate(new RegExp(`^memory:${type}:`));
        
        this.logger.info('MemoryStore', `Cleared ${count} entries from ${type} memory`);
    }

    clearCacheLevel(level) {
        this.cache.clear(level);
        this.logger.info('MemoryStore', `Cleared cache level ${level}`);
    }

    async clearAll() {
        ['working', 'semantic', 'episodic', 'procedural'].forEach(type => {
            this.clearMemoryType(type);
        });
        
        // Clear IndexedDB if available
        if (this.db) {
            const types = ['working', 'semantic', 'episodic', 'procedural'];
            for (const type of types) {
                try {
                    const transaction = this.db.transaction([type], 'readwrite');
                    const store = transaction.objectStore(type);
                    await new Promise((resolve, reject) => {
                        const request = store.clear();
                        request.onsuccess = resolve;
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    this.logger.error('MemoryStore', `Failed to clear ${type} from IndexedDB`, error);
                }
            }
        }
        
        this.logger.info('MemoryStore', 'All memory cleared');
    }
}