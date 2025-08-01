export class CacheManager {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        
        // Get cache configuration
        const memoryConfig = config.getMemoryConfig();
        this.cacheLevels = memoryConfig.cacheLevels; // [L1, L2, L3] sizes
        this.ttl = memoryConfig.ttl; // TTL for each level
        
        // Initialize cache levels
        this.L1Cache = new Map(); // Hot data - smallest, fastest
        this.L2Cache = new Map(); // Recent data - medium size
        this.L3Cache = new Map(); // Relevant data - largest
        this.promptCache = new Map(); // Special cache for prompts
        
        // Cache metadata for eviction and statistics
        this.cacheMetadata = {
            L1: new Map(),
            L2: new Map(),
            L3: new Map(),
            prompt: new Map()
        };
        
        // Statistics
        this.stats = {
            hits: { L1: 0, L2: 0, L3: 0, prompt: 0 },
            misses: { L1: 0, L2: 0, L3: 0, prompt: 0 },
            evictions: { L1: 0, L2: 0, L3: 0, prompt: 0 },
            promotions: 0,
            demotions: 0
        };
        
        this.setupCleanupTimer();
        this.setupConfigListeners();
    }

    setupCleanupTimer() {
        // Run cleanup every 5 minutes
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    setupConfigListeners() {
        this.config.on('memoryConfigChanged', (newConfig) => {
            this.cacheLevels = newConfig.cacheLevels;
            this.ttl = newConfig.ttl;
            this.cleanup(); // Trigger cleanup after config change
        });
    }

    // Main cache interface
    get(key, level = 'auto') {
        if (level === 'auto') {
            return this.getAuto(key);
        } else {
            return this.getFromLevel(key, level);
        }
    }

    set(key, value, level = 'L1', ttl = null) {
        const cache = this.getCacheByLevel(level);
        const metadata = this.cacheMetadata[level];
        
        if (!cache || !metadata) {
            throw new Error(`Invalid cache level: ${level}`);
        }

        // Calculate TTL
        const effectiveTTL = ttl || this.ttl[level] || this.ttl.L1;
        const expiry = Date.now() + effectiveTTL;
        
        // Store value and metadata
        cache.set(key, value);
        metadata.set(key, {
            accessCount: 1,
            lastAccess: Date.now(),
            created: Date.now(),
            expiry,
            size: this.estimateSize(value)
        });
        
        // Check if eviction is needed
        this.evictIfNeeded(level);
        
        this.logger.logMemoryAccess(level, 'set', { key, size: this.estimateSize(value) });
        return true;
    }

    // Auto-retrieval with promotion/demotion
    getAuto(key) {
        // Try L1 first (hottest)
        if (this.L1Cache.has(key)) {
            const value = this.L1Cache.get(key);
            if (this.isValid(key, 'L1')) {
                this.updateAccess(key, 'L1');
                this.stats.hits.L1++;
                this.logger.logMemoryAccess('L1', 'get', null, 'hit');
                return value;
            } else {
                this.invalidate(key, 'L1');
            }
        }

        // Try L2 (recent)
        if (this.L2Cache.has(key)) {
            const value = this.L2Cache.get(key);
            if (this.isValid(key, 'L2')) {
                this.updateAccess(key, 'L2');
                this.stats.hits.L2++;
                
                // Promote to L1 if frequently accessed
                const meta = this.cacheMetadata.L2.get(key);
                if (meta && meta.accessCount > 3) {
                    this.promote(key, 'L2', 'L1');
                }
                
                this.logger.logMemoryAccess('L2', 'get', null, 'hit');
                return value;
            } else {
                this.invalidate(key, 'L2');
            }
        }

        // Try L3 (relevant)
        if (this.L3Cache.has(key)) {
            const value = this.L3Cache.get(key);
            if (this.isValid(key, 'L3')) {
                this.updateAccess(key, 'L3');
                this.stats.hits.L3++;
                
                // Promote to L2 if accessed
                this.promote(key, 'L3', 'L2');
                
                this.logger.logMemoryAccess('L3', 'get', null, 'hit');
                return value;
            } else {
                this.invalidate(key, 'L3');
            }
        }

        // Not found in any cache
        this.stats.misses.L1++;
        this.logger.logMemoryAccess('auto', 'get', null, 'miss');
        return null;
    }

    getFromLevel(key, level) {
        const cache = this.getCacheByLevel(level);
        if (!cache || !cache.has(key)) {
            this.stats.misses[level]++;
            return null;
        }

        if (this.isValid(key, level)) {
            this.updateAccess(key, level);
            this.stats.hits[level]++;
            return cache.get(key);
        } else {
            this.invalidate(key, level);
            this.stats.misses[level]++;
            return null;
        }
    }

    // Prompt-specific caching
    setPrompt(promptHash, prompt, context) {
        return this.set(promptHash, { prompt, context }, 'prompt');
    }

    getPrompt(promptHash) {
        const cached = this.getFromLevel(promptHash, 'prompt');
        if (cached) {
            this.logger.logMemoryAccess('prompt', 'get', null, 'hit');
            return cached;
        }
        return null;
    }

    // Cache management operations
    promote(key, fromLevel, toLevel) {
        const fromCache = this.getCacheByLevel(fromLevel);
        const toCache = this.getCacheByLevel(toLevel);
        const fromMeta = this.cacheMetadata[fromLevel];
        const toMeta = this.cacheMetadata[toLevel];
        
        if (!fromCache.has(key)) return false;
        
        const value = fromCache.get(key);
        const metadata = fromMeta.get(key);
        
        // Move to higher level
        toCache.set(key, value);
        toMeta.set(key, {
            ...metadata,
            lastAccess: Date.now(),
            promoted: true
        });
        
        // Remove from lower level
        fromCache.delete(key);
        fromMeta.delete(key);
        
        this.stats.promotions++;
        this.logger.debug('Cache', `Promoted ${key} from ${fromLevel} to ${toLevel}`);
        
        // Check if eviction needed in target level
        this.evictIfNeeded(toLevel);
        
        return true;
    }

    demote(key, fromLevel, toLevel = null) {
        if (!toLevel) {
            // Auto-select demotion target
            toLevel = fromLevel === 'L1' ? 'L2' : fromLevel === 'L2' ? 'L3' : null;
        }
        
        if (!toLevel) {
            // Can't demote from L3, just remove
            this.invalidate(key, fromLevel);
            return false;
        }
        
        const fromCache = this.getCacheByLevel(fromLevel);
        const toCache = this.getCacheByLevel(toLevel);
        const fromMeta = this.cacheMetadata[fromLevel];
        const toMeta = this.cacheMetadata[toLevel];
        
        if (!fromCache.has(key)) return false;
        
        const value = fromCache.get(key);
        const metadata = fromMeta.get(key);
        
        // Move to lower level
        toCache.set(key, value);
        toMeta.set(key, {
            ...metadata,
            lastAccess: Date.now(),
            demoted: true
        });
        
        // Remove from higher level
        fromCache.delete(key);
        fromMeta.delete(key);
        
        this.stats.demotions++;
        this.logger.debug('Cache', `Demoted ${key} from ${fromLevel} to ${toLevel}`);
        
        return true;
    }

    // Eviction strategies
    evictIfNeeded(level) {
        const cache = this.getCacheByLevel(level);
        const maxSize = this.cacheLevels[this.getLevelIndex(level)];
        
        if (cache.size <= maxSize) return;
        
        const metadata = this.cacheMetadata[level];
        const entries = Array.from(metadata.entries());
        
        // Sort by eviction priority (LRU + access frequency)
        entries.sort((a, b) => {
            const [keyA, metaA] = a;
            const [keyB, metaB] = b;
            
            // Priority score: recency + frequency
            const scoreA = metaA.lastAccess + (metaA.accessCount * 10000);
            const scoreB = metaB.lastAccess + (metaB.accessCount * 10000);
            
            return scoreA - scoreB; // Lower score = higher eviction priority
        });
        
        // Evict entries until under limit
        const evictCount = cache.size - maxSize;
        for (let i = 0; i < evictCount; i++) {
            const [key] = entries[i];
            
            // Try to demote instead of evicting
            if (level !== 'L3' && !this.demote(key, level)) {
                // Demotion failed, evict
                this.evict(key, level);
            }
        }
    }

    evict(key, level) {
        const cache = this.getCacheByLevel(level);
        const metadata = this.cacheMetadata[level];
        
        cache.delete(key);
        metadata.delete(key);
        
        this.stats.evictions[level]++;
        this.logger.debug('Cache', `Evicted ${key} from ${level}`);
    }

    // Pattern-based invalidation
    invalidate(pattern, level = 'all') {
        const levels = level === 'all' ? ['L1', 'L2', 'L3', 'prompt'] : [level];
        let invalidated = 0;
        
        levels.forEach(lvl => {
            const cache = this.getCacheByLevel(lvl);
            const metadata = this.cacheMetadata[lvl];
            
            if (typeof pattern === 'string') {
                // Simple key invalidation
                if (cache.has(pattern)) {
                    cache.delete(pattern);
                    metadata.delete(pattern);
                    invalidated++;
                }
            } else if (pattern instanceof RegExp) {
                // Pattern-based invalidation
                const keys = Array.from(cache.keys());
                keys.forEach(key => {
                    if (pattern.test(key)) {
                        cache.delete(key);
                        metadata.delete(key);
                        invalidated++;
                    }
                });
            } else if (typeof pattern === 'function') {
                // Function-based invalidation
                const entries = Array.from(cache.entries());
                entries.forEach(([key, value]) => {
                    if (pattern(key, value)) {
                        cache.delete(key);
                        metadata.delete(key);
                        invalidated++;
                    }
                });
            }
        });
        
        this.logger.info('Cache', `Invalidated ${invalidated} entries matching pattern`);
        return invalidated;
    }

    // Cleanup expired entries
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        ['L1', 'L2', 'L3', 'prompt'].forEach(level => {
            const cache = this.getCacheByLevel(level);
            const metadata = this.cacheMetadata[level];
            
            const entries = Array.from(metadata.entries());
            entries.forEach(([key, meta]) => {
                if (meta.expiry && now > meta.expiry) {
                    cache.delete(key);
                    metadata.delete(key);
                    cleaned++;
                }
            });
        });
        
        if (cleaned > 0) {
            this.logger.info('Cache', `Cleaned up ${cleaned} expired entries`);
        }
    }

    // Utility methods
    getCacheByLevel(level) {
        switch (level) {
            case 'L1': return this.L1Cache;
            case 'L2': return this.L2Cache;
            case 'L3': return this.L3Cache;
            case 'prompt': return this.promptCache;
            default: return null;
        }
    }

    getLevelIndex(level) {
        switch (level) {
            case 'L1': return 0;
            case 'L2': return 1;
            case 'L3': return 2;
            default: return 0;
        }
    }

    isValid(key, level) {
        const metadata = this.cacheMetadata[level];
        const meta = metadata.get(key);
        
        if (!meta) return false;
        if (meta.expiry && Date.now() > meta.expiry) return false;
        
        return true;
    }

    updateAccess(key, level) {
        const metadata = this.cacheMetadata[level];
        const meta = metadata.get(key);
        
        if (meta) {
            meta.accessCount++;
            meta.lastAccess = Date.now();
        }
    }

    estimateSize(value) {
        try {
            return JSON.stringify(value).length;
        } catch {
            return 1000; // Default estimate
        }
    }

    // Statistics and monitoring
    getStats() {
        const totalHits = Object.values(this.stats.hits).reduce((sum, val) => sum + val, 0);
        const totalMisses = Object.values(this.stats.misses).reduce((sum, val) => sum + val, 0);
        const totalRequests = totalHits + totalMisses;
        
        return {
            ...this.stats,
            hitRate: totalRequests > 0 ? (totalHits / totalRequests) : 0,
            sizes: {
                L1: this.L1Cache.size,
                L2: this.L2Cache.size,
                L3: this.L3Cache.size,
                prompt: this.promptCache.size
            },
            limits: {
                L1: this.cacheLevels[0],
                L2: this.cacheLevels[1],
                L3: this.cacheLevels[2]
            }
        };
    }

    getDetailedStats() {
        const stats = this.getStats();
        const memoryUsage = this.getMemoryUsage();
        const topKeys = this.getTopKeys();
        
        return {
            ...stats,
            memoryUsage,
            topKeys,
            healthScore: this.calculateHealthScore()
        };
    }

    getMemoryUsage() {
        const usage = {};
        
        ['L1', 'L2', 'L3', 'prompt'].forEach(level => {
            const metadata = this.cacheMetadata[level];
            let totalSize = 0;
            let oldestEntry = Date.now();
            let newestEntry = 0;
            
            metadata.forEach((meta) => {
                totalSize += meta.size || 0;
                oldestEntry = Math.min(oldestEntry, meta.created);
                newestEntry = Math.max(newestEntry, meta.created);
            });
            
            usage[level] = {
                totalSize,
                averageSize: metadata.size > 0 ? totalSize / metadata.size : 0,
                oldestEntry,
                newestEntry,
                ageSpread: newestEntry - oldestEntry
            };
        });
        
        return usage;
    }

    getTopKeys() {
        const allKeys = [];
        
        ['L1', 'L2', 'L3', 'prompt'].forEach(level => {
            const metadata = this.cacheMetadata[level];
            metadata.forEach((meta, key) => {
                allKeys.push({
                    key,
                    level,
                    accessCount: meta.accessCount,
                    lastAccess: meta.lastAccess,
                    age: Date.now() - meta.created
                });
            });
        });
        
        // Sort by access count
        allKeys.sort((a, b) => b.accessCount - a.accessCount);
        
        return allKeys.slice(0, 10);
    }

    calculateHealthScore() {
        const stats = this.getStats();
        let score = 100;
        
        // Penalize low hit rate
        if (stats.hitRate < 0.5) {
            score -= (0.5 - stats.hitRate) * 100;
        }
        
        // Penalize high eviction rate
        const totalEvictions = Object.values(stats.evictions).reduce((sum, val) => sum + val, 0);
        const totalRequests = Object.values(stats.hits).reduce((sum, val) => sum + val, 0) + 
                             Object.values(stats.misses).reduce((sum, val) => sum + val, 0);
        const evictionRate = totalRequests > 0 ? totalEvictions / totalRequests : 0;
        
        if (evictionRate > 0.1) {
            score -= evictionRate * 200;
        }
        
        return Math.max(0, Math.min(100, score));
    }

    // Administrative operations
    clear(level = 'all') {
        const levels = level === 'all' ? ['L1', 'L2', 'L3', 'prompt'] : [level];
        
        levels.forEach(lvl => {
            const cache = this.getCacheByLevel(lvl);
            const metadata = this.cacheMetadata[lvl];
            
            cache.clear();
            metadata.clear();
        });
        
        this.logger.info('Cache', `Cleared cache level(s): ${levels.join(', ')}`);
    }

    resetStats() {
        this.stats = {
            hits: { L1: 0, L2: 0, L3: 0, prompt: 0 },
            misses: { L1: 0, L2: 0, L3: 0, prompt: 0 },
            evictions: { L1: 0, L2: 0, L3: 0, prompt: 0 },
            promotions: 0,
            demotions: 0
        };
        
        this.logger.info('Cache', 'Cache statistics reset');
    }
}