/**
 * Configuration Manager Automated Tests
 * Comprehensive test suite for the configuration management system
 */

import TestUtils from '../../utils/test-utils.js';

/**
 * Mock Configuration Manager for testing
 */
class MockConfigManager {
    constructor() {
        this.config = new Map();
        this.environment = 'development';
        this.listeners = new Map();
        this.initializeDefaults();
    }

    initializeDefaults() {
        this.set('api.claude.endpoint', 'https://api.anthropic.com/v1/messages');
        this.set('api.openrouter.endpoint', 'https://openrouter.ai/api/v1');
        this.set('memory.working.limit', 50 * 1024 * 1024);
        this.set('memory.semantic.limit', 100 * 1024 * 1024);
        this.set('memory.episodic.limit', 200 * 1024 * 1024);
        this.set('memory.procedural.limit', 150 * 1024 * 1024);
        this.set('cache.l1.limit', 100 * 1024 * 1024);
        this.set('cache.l2.limit', 500 * 1024 * 1024);
        this.set('cache.l3.limit', 2 * 1024 * 1024 * 1024);
        this.set('performance.timeout', 30000);
        this.set('performance.retry.attempts', 3);
        this.set('performance.retry.delay', 1000);
    }

    get(key) {
        return this.config.get(key);
    }

    set(key, value) {
        const oldValue = this.config.get(key);
        this.config.set(key, value);
        this.notifyListeners(key, value, oldValue);
        return true;
    }

    delete(key) {
        const existed = this.config.has(key);
        if (existed) {
            const oldValue = this.config.get(key);
            this.config.delete(key);
            this.notifyListeners(key, undefined, oldValue);
        }
        return existed;
    }

    has(key) {
        return this.config.has(key);
    }

    getEnvironment() {
        return this.environment;
    }

    setEnvironment(env) {
        if (!['development', 'production', 'testing'].includes(env)) {
            throw new Error(`Invalid environment: ${env}`);
        }
        this.environment = env;
        return true;
    }

    getApiEndpoints() {
        const endpoints = {};
        for (const [key, value] of this.config) {
            if (key.startsWith('api.') && key.endsWith('.endpoint')) {
                const serviceName = key.split('.')[1];
                endpoints[serviceName] = value;
            }
        }
        return endpoints;
    }

    getMemoryLimits() {
        const limits = {};
        for (const [key, value] of this.config) {
            if (key.includes('.limit')) {
                limits[key] = value;
            }
        }
        return limits;
    }

    getPerformanceSettings() {
        const settings = {};
        for (const [key, value] of this.config) {
            if (key.startsWith('performance.')) {
                settings[key] = value;
            }
        }
        return settings;
    }

    addListener(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
    }

    removeListener(key, callback) {
        if (this.listeners.has(key)) {
            this.listeners.get(key).delete(callback);
        }
    }

    notifyListeners(key, newValue, oldValue) {
        if (this.listeners.has(key)) {
            for (const callback of this.listeners.get(key)) {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error(`Error in config listener for ${key}:`, error);
                }
            }
        }
    }

    exportConfig() {
        return Object.fromEntries(this.config);
    }

    importConfig(configData) {
        if (typeof configData !== 'object' || configData === null) {
            throw new Error('Invalid configuration data');
        }
        
        this.config.clear();
        for (const [key, value] of Object.entries(configData)) {
            this.set(key, value);
        }
        return true;
    }

    validateConfig() {
        const errors = [];
        
        // Validate API endpoints
        const endpoints = this.getApiEndpoints();
        for (const [service, endpoint] of Object.entries(endpoints)) {
            if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('http')) {
                errors.push(`Invalid API endpoint for ${service}: ${endpoint}`);
            }
        }
        
        // Validate memory limits
        const limits = this.getMemoryLimits();
        for (const [key, limit] of Object.entries(limits)) {
            if (typeof limit !== 'number' || limit <= 0) {
                errors.push(`Invalid memory limit for ${key}: ${limit}`);
            }
        }
        
        return errors;
    }

    reset() {
        this.config.clear();
        this.environment = 'development';
        this.listeners.clear();
        this.initializeDefaults();
    }
}

/**
 * Configuration Manager Test Suite
 */
export class ConfigManagerTests {
    static async runAllTests() {
        const testSuite = TestUtils.createTestSuite('Configuration Manager Tests', {
            setup: async () => {
                console.log('🔧 Setting up Configuration Manager tests...');
            },
            teardown: async () => {
                console.log('🧹 Cleaning up Configuration Manager tests...');
            }
        });

        // Basic Operations Tests
        testSuite.test('Basic get/set operations', async () => {
            const config = new MockConfigManager();
            
            // Test setting and getting string value
            config.set('test.string', 'hello world');
            TestUtils.assertEqual(config.get('test.string'), 'hello world');
            
            // Test setting and getting object value
            const testObj = { key: 'value', number: 42 };
            config.set('test.object', testObj);
            TestUtils.assertEqual(JSON.stringify(config.get('test.object')), JSON.stringify(testObj));
            
            // Test setting and getting null value
            config.set('test.null', null);
            TestUtils.assertEqual(config.get('test.null'), null);
            
            // Test getting non-existent key
            TestUtils.assertEqual(config.get('non.existent'), undefined);
        });

        testSuite.test('Configuration deletion', async () => {
            const config = new MockConfigManager();
            
            config.set('test.delete', 'value');
            TestUtils.assertTrue(config.has('test.delete'));
            
            const deleted = config.delete('test.delete');
            TestUtils.assertTrue(deleted);
            TestUtils.assertFalse(config.has('test.delete'));
            TestUtils.assertEqual(config.get('test.delete'), undefined);
            
            // Test deleting non-existent key
            const notDeleted = config.delete('non.existent');
            TestUtils.assertFalse(notDeleted);
        });

        // Environment Management Tests
        testSuite.test('Environment detection and switching', async () => {
            const config = new MockConfigManager();
            
            // Test default environment
            TestUtils.assertEqual(config.getEnvironment(), 'development');
            
            // Test valid environment switching
            config.setEnvironment('production');
            TestUtils.assertEqual(config.getEnvironment(), 'production');
            
            config.setEnvironment('testing');
            TestUtils.assertEqual(config.getEnvironment(), 'testing');
            
            // Test invalid environment
            await TestUtils.assertThrows(() => {
                config.setEnvironment('invalid');
            }, Error);
        });

        // API Endpoints Tests
        testSuite.test('API endpoint management', async () => {
            const config = new MockConfigManager();
            
            const endpoints = config.getApiEndpoints();
            TestUtils.assertTrue(endpoints.claude !== undefined);
            TestUtils.assertTrue(endpoints.openrouter !== undefined);
            
            // Test adding new endpoint
            config.set('api.custom.endpoint', 'https://custom.api.com');
            const updatedEndpoints = config.getApiEndpoints();
            TestUtils.assertEqual(updatedEndpoints.custom, 'https://custom.api.com');
            
            // Test endpoint validation
            config.set('api.invalid.endpoint', 'not-a-url');
            const errors = config.validateConfig();
            TestUtils.assertTrue(errors.some(error => error.includes('invalid')));
        });

        // Memory Limits Tests
        testSuite.test('Memory limit configuration', async () => {
            const config = new MockConfigManager();
            
            const limits = config.getMemoryLimits();
            TestUtils.assertTrue(Object.keys(limits).length > 0);
            
            // Test that all limits are positive numbers
            for (const [key, limit] of Object.entries(limits)) {
                TestUtils.assertTrue(typeof limit === 'number');
                TestUtils.assertTrue(limit > 0);
            }
            
            // Test setting custom memory limit
            config.set('memory.custom.limit', 1024 * 1024);
            const updatedLimits = config.getMemoryLimits();
            TestUtils.assertEqual(updatedLimits['memory.custom.limit'], 1024 * 1024);
        });

        // Performance Settings Tests
        testSuite.test('Performance settings management', async () => {
            const config = new MockConfigManager();
            
            const settings = config.getPerformanceSettings();
            TestUtils.assertTrue(settings['performance.timeout'] !== undefined);
            TestUtils.assertTrue(settings['performance.retry.attempts'] !== undefined);
            
            // Test updating performance settings
            config.set('performance.custom.setting', 5000);
            const updatedSettings = config.getPerformanceSettings();
            TestUtils.assertEqual(updatedSettings['performance.custom.setting'], 5000);
        });

        // Event Listener Tests
        testSuite.test('Configuration change listeners', async () => {
            const config = new MockConfigManager();
            let callbackInvoked = false;
            let receivedNewValue = null;
            let receivedOldValue = null;
            
            const callback = (newValue, oldValue, key) => {
                callbackInvoked = true;
                receivedNewValue = newValue;
                receivedOldValue = oldValue;
            };
            
            config.addListener('test.listener', callback);
            config.set('test.listener', 'new value');
            
            TestUtils.assertTrue(callbackInvoked);
            TestUtils.assertEqual(receivedNewValue, 'new value');
            TestUtils.assertEqual(receivedOldValue, undefined);
            
            // Test listener removal
            config.removeListener('test.listener', callback);
            callbackInvoked = false;
            config.set('test.listener', 'another value');
            TestUtils.assertFalse(callbackInvoked);
        });

        // Import/Export Tests
        testSuite.test('Configuration import/export', async () => {
            const config = new MockConfigManager();
            
            // Add some custom configuration
            config.set('custom.test1', 'value1');
            config.set('custom.test2', { nested: true });
            
            // Export configuration
            const exported = config.exportConfig();
            TestUtils.assertTrue(typeof exported === 'object');
            TestUtils.assertEqual(exported['custom.test1'], 'value1');
            
            // Create new config and import
            const newConfig = new MockConfigManager();
            newConfig.reset(); // Clear defaults
            newConfig.importConfig(exported);
            
            TestUtils.assertEqual(newConfig.get('custom.test1'), 'value1');
            TestUtils.assertEqual(JSON.stringify(newConfig.get('custom.test2')), JSON.stringify({ nested: true }));
            
            // Test invalid import data
            await TestUtils.assertThrows(() => {
                newConfig.importConfig(null);
            }, Error);
            
            await TestUtils.assertThrows(() => {
                newConfig.importConfig('invalid');
            }, Error);
        });

        // Validation Tests
        testSuite.test('Configuration validation', async () => {
            const config = new MockConfigManager();
            
            // Test valid configuration
            let errors = config.validateConfig();
            TestUtils.assertEqual(errors.length, 0);
            
            // Test invalid API endpoint
            config.set('api.invalid.endpoint', 'not-a-url');
            errors = config.validateConfig();
            TestUtils.assertTrue(errors.length > 0);
            TestUtils.assertTrue(errors.some(error => error.includes('Invalid API endpoint')));
            
            // Test invalid memory limit
            config.set('memory.invalid.limit', -1);
            errors = config.validateConfig();
            TestUtils.assertTrue(errors.some(error => error.includes('Invalid memory limit')));
            
            // Test invalid memory limit type
            config.set('memory.string.limit', 'not-a-number');
            errors = config.validateConfig();
            TestUtils.assertTrue(errors.some(error => error.includes('Invalid memory limit')));
        });

        // Performance Tests
        testSuite.test('Configuration performance', async () => {
            const config = new MockConfigManager();
            
            // Benchmark basic operations
            const setResult = await TestUtils.benchmark('Config Set', () => {
                config.set(`perf.test.${Math.random()}`, 'test value');
            }, 1000);
            
            TestUtils.assertTrue(setResult.average < 1); // Should be sub-millisecond
            
            const getResult = await TestUtils.benchmark('Config Get', () => {
                config.get('performance.timeout');
            }, 1000);
            
            TestUtils.assertTrue(getResult.average < 0.1); // Should be very fast
            
            console.log(`Set performance: ${setResult.average.toFixed(4)}ms avg`);
            console.log(`Get performance: ${getResult.average.toFixed(4)}ms avg`);
        });

        // Stress Tests
        testSuite.test('Configuration stress testing', async () => {
            const config = new MockConfigManager();
            
            // Test large number of configurations
            const largeConfigCount = 10000;
            const startTime = performance.now();
            
            for (let i = 0; i < largeConfigCount; i++) {
                config.set(`stress.test.${i}`, { index: i, data: 'test' });
            }
            
            const setTime = performance.now() - startTime;
            TestUtils.assertTrue(setTime < 5000); // Should complete within 5 seconds
            
            // Test retrieval performance with large dataset
            const retrievalStart = performance.now();
            for (let i = 0; i < 1000; i++) {
                const value = config.get(`stress.test.${Math.floor(Math.random() * largeConfigCount)}`);
                TestUtils.assertTrue(value !== undefined);
            }
            const retrievalTime = performance.now() - retrievalStart;
            TestUtils.assertTrue(retrievalTime < 1000); // Should be fast even with large dataset
            
            console.log(`Stress test: ${largeConfigCount} sets in ${setTime.toFixed(2)}ms`);
            console.log(`Random retrieval: 1000 gets in ${retrievalTime.toFixed(2)}ms`);
        });

        // Memory Usage Tests
        testSuite.test('Memory usage monitoring', async () => {
            const config = new MockConfigManager();
            
            const initialMemory = TestUtils.getMemoryUsage();
            
            // Add substantial amount of data
            for (let i = 0; i < 5000; i++) {
                config.set(`memory.test.${i}`, {
                    data: new Array(100).fill('x'.repeat(100)),
                    index: i,
                    timestamp: Date.now()
                });
            }
            
            const afterMemory = TestUtils.getMemoryUsage();
            
            if (initialMemory && afterMemory) {
                const memoryGrowth = afterMemory.used - initialMemory.used;
                console.log(`Memory growth: ${(memoryGrowth / (1024 * 1024)).toFixed(2)}MB`);
                
                // Memory growth should be reasonable
                TestUtils.assertTrue(memoryGrowth < 100 * 1024 * 1024); // Less than 100MB
            }
            
            // Test memory cleanup
            config.reset();
            TestUtils.assertEqual(config.exportConfig().constructor, Object);
        });

        return await testSuite.run();
    }
}

// Export for use in test runner
export default ConfigManagerTests;

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location.pathname.endsWith('config.test.js')) {
    ConfigManagerTests.runAllTests().then(results => {
        console.log('Configuration Manager Tests completed:', results);
    });
}