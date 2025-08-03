/**
 * Multi-Level Cache System
 * Three-tier caching system with L1 (Memory), L2 (IndexedDB), L3 (Compressed IndexedDB)
 * Automatic promotion/demotion and intelligent eviction policies.
 * 
 * Follows the CacheSystem interface defined in API_CONTRACTS.md
 */

import { logger } from './logger.js';
import { errorHandler } from './error-handler.js';

export class CacheSystem {
    constructor() {
        this.l1 = new MemoryCache('L1');
        this.l2 = new PersistentCache('L2');
        this.l3 = new ArchivalCache('L3');
        
        this.stats = {
            totalKeys: 0,
            totalSize: 0,
            hitCount: 0,
            missCount: 0,
            evictionCount: 0,
            levels: {
                l1: { keyCount: 0, size: 0, hitRatio: 0, averageAge: 0 },
                l2: { keyCount: 0, size: 0, hitRatio: 0, averageAge: 0 },
                l3: { keyCount: 0, size: 0, hitRatio: 0, averageAge: 0 }
            }
        };
        
        this.initialized = this.initialize();
    }

    /**
     * Initialize cache system
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await Promise.all([
                this.l2.initialize(),
                this.l3.initialize()
            ]);
            
            await logger.info('Cache system initialized successfully');
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_initialization',
                component: 'CacheSystem'
            });
        }
    }

    /**
     * Get value from cache with automatic level promotion
     * @param {string} key - Cache key
     * @param {'l1'|'l2'|'l3'} level - Specific level to check (optional)
     * @returns {Promise<Object|null>} Cache result
     */
    async get(key, level = null) {
        await this.initialized;
        
        try {
            // If specific level requested, check only that level
            if (level) {
                const cache = this.getCache(level);
                const value = await cache.get(key);
                
                if (value !== null) {
                    this.updateHitStats(level);
                    return {
                        value,
                        hit: true,
                        level,
                        age: await this.getKeyAge(key, level)
                    };
                } else {
                    this.updateMissStats();
                    return { value: null, hit: false, level, age: 0 };
                }
            }

            // Check L1 first (fastest)
            let value = await this.l1.get(key);
            if (value !== null) {
                this.updateHitStats('l1');
                return {
                    value,
                    hit: true,
                    level: 'l1',
                    age: await this.getKeyAge(key, 'l1')
                };
            }

            // Check L2 (medium speed)
            value = await this.l2.get(key);
            if (value !== null) {
                this.updateHitStats('l2');
                
                // Promote to L1 for faster future access
                await this.promote(key, 'l1');
                
                return {
                    value,
                    hit: true,
                    level: 'l2',
                    age: await this.getKeyAge(key, 'l2')
                };
            }

            // Check L3 (slowest but largest)
            value = await this.l3.get(key);
            if (value !== null) {
                this.updateHitStats('l3');
                
                // Promote to L2 for faster future access
                await this.promote(key, 'l2');
                
                return {
                    value,
                    hit: true,
                    level: 'l3',
                    age: await this.getKeyAge(key, 'l3')
                };
            }

            // Cache miss
            this.updateMissStats();
            return { value: null, hit: false, level: null, age: 0 };

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_get',
                component: 'CacheSystem',
                metadata: { key, level }
            });
            return { value: null, hit: false, level: null, age: 0 };
        }
    }

    /**
     * Set value in cache with intelligent level placement
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {Object} options - Cache options
     * @returns {Promise<void>}
     */
    async set(key, value, options = {}) {
        await this.initialized;
        
        try {
            const {
                ttl = 3600000, // 1 hour default
                level = null,
                priority = 5,
                compress = false,
                metadata = {}
            } = options;

            const cacheEntry = {
                value,
                timestamp: Date.now(),
                ttl,
                priority,
                accessCount: 0,
                lastAccessed: Date.now(),
                size: this.estimateSize(value),
                metadata: {
                    ...metadata,
                    compressed: compress
                }
            };

            // If specific level requested, use it
            if (level) {
                const cache = this.getCache(level);
                await cache.set(key, cacheEntry, ttl);
                return;
            }

            // Intelligent level placement based on size and priority
            const targetLevel = this.determineOptimalLevel(cacheEntry);
            const cache = this.getCache(targetLevel);
            
            await cache.set(key, cacheEntry, ttl);
            
            await logger.debug('Cache entry stored', {
                key: key.substring(0, 50),
                level: targetLevel,
                size: cacheEntry.size,
                priority
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_set',
                component: 'CacheSystem',
                metadata: { key, options }
            });
        }
    }

    /**
     * Delete key from cache
     * @param {string} key - Cache key
     * @param {'l1'|'l2'|'l3'} level - Specific level (optional)
     * @returns {Promise<boolean>} True if key was deleted
     */
    async delete(key, level = null) {
        await this.initialized;
        
        try {
            let deleted = false;

            if (level) {
                const cache = this.getCache(level);
                deleted = await cache.delete(key);
            } else {
                // Delete from all levels
                const results = await Promise.all([
                    this.l1.delete(key),
                    this.l2.delete(key),
                    this.l3.delete(key)
                ]);
                deleted = results.some(result => result);
            }

            if (deleted) {
                await logger.debug('Cache entry deleted', { key, level });
            }

            return deleted;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_delete',
                component: 'CacheSystem',
                metadata: { key, level }
            });
            return false;
        }
    }

    /**
     * Clear cache entries matching pattern
     * @param {string} pattern - Pattern to match (supports wildcards)
     * @param {'l1'|'l2'|'l3'} level - Specific level (optional)
     * @returns {Promise<number>} Number of entries cleared
     */
    async clear(pattern = '*', level = null) {
        await this.initialized;
        
        try {
            let cleared = 0;

            const caches = level ? [this.getCache(level)] : [this.l1, this.l2, this.l3];

            for (const cache of caches) {
                if (pattern === '*') {
                    await cache.clear();
                    cleared += await cache.size();
                } else {
                    const keys = await cache.keys();
                    const matchingKeys = keys.filter(key => this.matchesPattern(key, pattern));
                    
                    for (const key of matchingKeys) {
                        await cache.delete(key);
                        cleared++;
                    }
                }
            }

            await logger.info('Cache cleared', { pattern, level, entriesCleared: cleared });
            return cleared;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_clear',
                component: 'CacheSystem',
                metadata: { pattern, level }
            });
            return 0;
        }
    }

    /**
     * Invalidate cache entries matching pattern
     * @param {string} pattern - Pattern to match
     * @returns {Promise<number>} Number of entries invalidated
     */
    async invalidate(pattern) {
        return await this.clear(pattern);
    }

    /**
     * Refresh cache entry by reloading it
     * @param {string} key - Cache key
     * @returns {Promise<void>}
     */
    async refresh(key) {
        await this.initialized;
        
        try {
            // Delete from all levels to force refresh
            await this.delete(key);
            
            await logger.debug('Cache entry invalidated for refresh', { key });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_refresh',
                component: 'CacheSystem',
                metadata: { key }
            });
        }
    }

    /**
     * Promote cache entry to higher level
     * @param {string} key - Cache key
     * @param {'l1'|'l2'|'l3'} targetLevel - Target cache level
     * @returns {Promise<boolean>} Success status
     */
    async promote(key, targetLevel) {
        await this.initialized;
        
        try {
            // Find the entry in lower levels
            let entry = null;
            let sourceLevel = null;

            if (targetLevel === 'l1') {
                entry = await this.l2.get(key);
                if (entry) sourceLevel = 'l2';
                
                if (!entry) {
                    entry = await this.l3.get(key);
                    if (entry) sourceLevel = 'l3';
                }
            } else if (targetLevel === 'l2') {
                entry = await this.l3.get(key);
                if (entry) sourceLevel = 'l3';
            }

            if (!entry || !sourceLevel) {
                return false;
            }

            // Add to target level
            const targetCache = this.getCache(targetLevel);
            await targetCache.set(key, entry);

            // Optionally remove from source level (for now, keep it for redundancy)
            
            await logger.debug('Cache entry promoted', { 
                key, 
                from: sourceLevel, 
                to: targetLevel 
            });

            return true;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_promote',
                component: 'CacheSystem',
                metadata: { key, targetLevel }
            });
            return false;
        }
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache statistics
     */
    async getStats() {
        await this.initialized;
        
        try {
            const [l1Size, l2Size, l3Size] = await Promise.all([
                this.l1.size(),
                this.l2.size(),
                this.l3.size()
            ]);

            this.stats.levels.l1.keyCount = l1Size;
            this.stats.levels.l2.keyCount = l2Size;
            this.stats.levels.l3.keyCount = l3Size;
            this.stats.totalKeys = l1Size + l2Size + l3Size;

            return { ...this.stats };

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_get_stats',
                component: 'CacheSystem'
            });
            return this.stats;
        }
    }

    /**
     * Get cache hit ratio
     * @returns {Promise<number>} Hit ratio (0-1)
     */
    async getHitRatio() {
        const total = this.stats.hitCount + this.stats.missCount;
        return total > 0 ? this.stats.hitCount / total : 0;
    }

    /**
     * Optimize cache performance
     * @returns {Promise<Object>} Optimization result
     */
    async optimize() {
        await this.initialized;
        
        try {
            let keysOptimized = 0;
            let spaceSaved = 0;
            const recommendations = [];

            // Compact all cache levels
            await Promise.all([
                this.l2.compact(),
                this.l3.compact()
            ]);

            // Remove expired entries
            const expiredKeys = await this.findExpiredKeys();
            for (const key of expiredKeys) {
                await this.delete(key);
                keysOptimized++;
            }

            // Compress large entries in L3
            const largeEntries = await this.findLargeEntries();
            for (const key of largeEntries) {
                const compressed = await this.l3.compress(key);
                if (compressed) {
                    keysOptimized++;
                }
            }

            // Generate recommendations
            const hitRatio = await this.getHitRatio();
            if (hitRatio < 0.8) {
                recommendations.push('Consider increasing cache size or TTL values');
            }

            const l1Usage = await this.getCacheUsage('l1');
            if (l1Usage > 0.9) {
                recommendations.push('L1 cache is near capacity, consider increasing size');
            }

            await logger.info('Cache optimization completed', {
                keysOptimized,
                spaceSaved,
                recommendations: recommendations.length
            });

            return {
                keysOptimized,
                spaceSaved,
                performanceGain: keysOptimized * 0.1, // Estimated
                recommendations
            };

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cache_optimize',
                component: 'CacheSystem'
            });
            return {
                keysOptimized: 0,
                spaceSaved: 0,
                performanceGain: 0,
                recommendations: ['Optimization failed - check system logs']
            };
        }
    }

    // Utility Methods

    /**
     * Get cache instance by level
     * @param {'l1'|'l2'|'l3'} level
     * @returns {Object} Cache instance
     */
    getCache(level) {
        switch (level) {
            case 'l1': return this.l1;
            case 'l2': return this.l2;
            case 'l3': return this.l3;
            default: throw new Error(`Invalid cache level: ${level}`);
        }
    }

    /**
     * Determine optimal cache level for entry
     * @param {Object} entry - Cache entry
     * @returns {'l1'|'l2'|'l3'} Optimal level
     */
    determineOptimalLevel(entry) {
        const { size, priority, ttl } = entry;
        
        // High priority or small size -> L1
        if (priority >= 8 || size < 1024) {
            return 'l1';
        }
        
        // Medium priority or medium size -> L2
        if (priority >= 5 || size < 1024 * 1024) {
            return 'l2';
        }
        
        // Low priority or large size -> L3
        return 'l3';
    }

    /**
     * Estimate size of value in bytes
     * @param {any} value
     * @returns {number} Estimated size
     */
    estimateSize(value) {
        try {
            return JSON.stringify(value).length * 2; // Unicode is 2 bytes per char
        } catch (error) {
            return 1024; // Default estimate
        }
    }

    /**
     * Get age of cache entry
     * @param {string} key
     * @param {'l1'|'l2'|'l3'} level
     * @returns {Promise<number>} Age in milliseconds
     */
    async getKeyAge(key, level) {
        try {
            const cache = this.getCache(level);
            const entry = await cache.get(key);
            
            if (entry && entry.timestamp) {
                return Date.now() - entry.timestamp;
            }
            
            return 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Check if key matches pattern
     * @param {string} key
     * @param {string} pattern
     * @returns {boolean}
     */
    matchesPattern(key, pattern) {
        if (pattern === '*') return true;
        
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        return new RegExp(`^${regexPattern}$`).test(key);
    }

    /**
     * Update hit statistics
     * @param {'l1'|'l2'|'l3'} level
     */
    updateHitStats(level) {
        this.stats.hitCount++;
        this.stats.levels[level].hitRatio = this.calculateLevelHitRatio(level);
    }

    /**
     * Update miss statistics
     */
    updateMissStats() {
        this.stats.missCount++;
    }

    /**
     * Calculate hit ratio for specific level
     * @param {'l1'|'l2'|'l3'} level
     * @returns {number}
     */
    calculateLevelHitRatio(level) {
        // This would require more detailed tracking in a real implementation
        return 0.8; // Placeholder
    }

    /**
     * Find expired cache keys
     * @returns {Promise<Array>} Expired keys
     */
    async findExpiredKeys() {
        const expiredKeys = [];
        const now = Date.now();
        
        for (const cache of [this.l1, this.l2, this.l3]) {
            try {
                const keys = await cache.keys();
                for (const key of keys) {
                    const entry = await cache.get(key);
                    if (entry && entry.timestamp && entry.ttl) {
                        if (now > entry.timestamp + entry.ttl) {
                            expiredKeys.push(key);
                        }
                    }
                }
            } catch (error) {
                // Continue with other caches
            }
        }
        
        return expiredKeys;
    }

    /**
     * Find large cache entries that could be compressed
     * @returns {Promise<Array>} Large entry keys
     */
    async findLargeEntries() {
        const largeKeys = [];
        const sizeThreshold = 100 * 1024; // 100KB
        
        try {
            const keys = await this.l3.keys();
            for (const key of keys) {
                const entry = await this.l3.get(key);
                if (entry && entry.size > sizeThreshold && !entry.metadata?.compressed) {
                    largeKeys.push(key);
                }
            }
        } catch (error) {
            // Return empty array on error
        }
        
        return largeKeys;
    }

    /**
     * Get cache usage percentage
     * @param {'l1'|'l2'|'l3'} level
     * @returns {Promise<number>} Usage percentage (0-1)
     */
    async getCacheUsage(level) {
        try {
            const cache = this.getCache(level);
            if (cache.getStorageInfo) {
                const info = await cache.getStorageInfo();
                return info.used / info.quota;
            }
            return 0.5; // Default estimate
        } catch (error) {
            return 0;
        }
    }
}

/**
 * Memory Cache (L1)
 * Fast in-memory cache with LRU eviction
 */
export class MemoryCache {
    constructor(name, maxSize = 100 * 1024 * 1024) { // 100MB default
        this.name = name;
        this.maxSize = maxSize;
        this.cache = new Map();
        this.accessOrder = new Map(); // For LRU tracking
    }

    async get(key) {
        if (this.cache.has(key)) {
            // Update access order for LRU
            this.accessOrder.set(key, Date.now());
            return this.cache.get(key);
        }
        return null;
    }

    async set(key, value, ttl = null) {
        // Check if we need to evict
        await this.ensureCapacity();
        
        this.cache.set(key, value);
        this.accessOrder.set(key, Date.now());
    }

    async delete(key) {
        const deleted = this.cache.delete(key);
        this.accessOrder.delete(key);
        return deleted;
    }

    async clear() {
        this.cache.clear();
        this.accessOrder.clear();
    }

    async size() {
        return this.cache.size;
    }

    async keys() {
        return Array.from(this.cache.keys());
    }

    async ensureCapacity() {
        // Simple size-based eviction (could be improved with actual memory measurement)
        if (this.cache.size > 1000) { // Max 1000 entries
            // Remove least recently used items
            const sortedByAccess = Array.from(this.accessOrder.entries())
                .sort((a, b) => a[1] - b[1]);
            
            const toRemove = sortedByAccess.slice(0, 100); // Remove oldest 100
            for (const [key] of toRemove) {
                this.cache.delete(key);
                this.accessOrder.delete(key);
            }
        }
    }
}

/**
 * Persistent Cache (L2)
 * IndexedDB-based cache with persistence
 */
export class PersistentCache {
    constructor(name, dbName = 'MultiAgentCache') {
        this.name = name;
        this.dbName = dbName;
        this.storeName = `cache_${name}`;
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp');
                    store.createIndex('ttl', 'ttl');
                }
            };
        });
    }

    async get(key) {
        if (!this.db) return null;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    // Check TTL
                    if (result.ttl && Date.now() > result.timestamp + result.ttl) {
                        this.delete(key); // Async cleanup
                        resolve(null);
                    } else {
                        resolve(result.value);
                    }
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => resolve(null);
        });
    }

    async set(key, value, ttl = null) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const entry = {
                key,
                value,
                timestamp: Date.now(),
                ttl
            };
            
            const request = store.put(entry);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async delete(key) {
        if (!this.db) return false;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    async clear() {
        if (!this.db) return;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        });
    }

    async size() {
        if (!this.db) return 0;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(0);
        });
    }

    async keys() {
        if (!this.db) return [];
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAllKeys();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve([]);
        });
    }

    async flush() {
        // IndexedDB automatically persists, so this is a no-op
    }

    async compact() {
        // Remove expired entries
        const now = Date.now();
        
        if (!this.db) return;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const entry = cursor.value;
                    if (entry.ttl && now > entry.timestamp + entry.ttl) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            
            request.onerror = () => resolve();
        });
    }

    async getStorageInfo() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { used: 0, available: 0, quota: 0 };
        }
        
        try {
            const estimate = await navigator.storage.estimate();
            return {
                used: estimate.usage || 0,
                available: (estimate.quota || 0) - (estimate.usage || 0),
                quota: estimate.quota || 0,
                efficiency: estimate.usage && estimate.quota ? 
                    estimate.usage / estimate.quota : 0
            };
        } catch (error) {
            return { used: 0, available: 0, quota: 0, efficiency: 0 };
        }
    }
}

/**
 * Archival Cache (L3)
 * Compressed storage for long-term caching
 */
export class ArchivalCache extends PersistentCache {
    constructor(name) {
        super(name, 'MultiAgentArchiveCache');
    }

    async compress(key) {
        // Simple compression simulation (in real implementation, use actual compression)
        const entry = await this.get(key);
        if (!entry) return false;
        
        try {
            // Mark as compressed
            entry.metadata = entry.metadata || {};
            entry.metadata.compressed = true;
            
            await this.set(key, entry);
            return true;
        } catch (error) {
            return false;
        }
    }

    async decompress(key) {
        // Decompression would happen automatically in get()
        return true;
    }

    async archive(key) {
        // Move from active to archive state
        const entry = await this.get(key);
        if (!entry) return false;
        
        entry.metadata = entry.metadata || {};
        entry.metadata.archived = true;
        entry.metadata.archivedAt = Date.now();
        
        await this.set(key, entry);
        return true;
    }
}

// Create and export singleton instance
export const cacheSystem = new CacheSystem();

// Export for ES6 modules
export default CacheSystem;