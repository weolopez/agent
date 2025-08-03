/**
 * Common Testing Utilities
 * Shared utilities for component testing across the system
 */

export class TestUtils {
    /**
     * Create a test suite with setup and teardown
     */
    static createTestSuite(name, options = {}) {
        return new TestSuite(name, options);
    }

    /**
     * Create mock data for testing
     */
    static createMockData(type, count = 1) {
        const generators = {
            user: () => ({
                id: TestUtils.generateId(),
                name: `Test User ${Math.floor(Math.random() * 1000)}`,
                email: `test${Math.floor(Math.random() * 1000)}@example.com`,
                created: new Date().toISOString()
            }),
            
            workflow: () => ({
                id: TestUtils.generateId(),
                status: TestUtils.randomChoice(['ready', 'running', 'completed', 'failed']),
                projectDescription: `Test project ${Math.floor(Math.random() * 1000)}`,
                iteration: Math.floor(Math.random() * 5) + 1,
                created: new Date().toISOString()
            }),
            
            feedback: () => ({
                id: TestUtils.generateId(),
                type: TestUtils.randomChoice(['approval', 'revision', 'rejection']),
                content: `Test feedback content ${Math.floor(Math.random() * 1000)}`,
                sentiment: Math.random(),
                tags: TestUtils.randomChoice([['performance'], ['security'], ['ui'], ['testing']]),
                timestamp: new Date().toISOString()
            }),
            
            memory: () => ({
                key: TestUtils.generateId(),
                data: { test: true, value: Math.random() },
                metadata: {
                    type: TestUtils.randomChoice(['working', 'semantic', 'episodic', 'procedural']),
                    timestamp: new Date().toISOString()
                }
            }),
            
            agent: () => ({
                type: TestUtils.randomChoice(['analyst', 'planner', 'developer', 'tester']),
                status: TestUtils.randomChoice(['idle', 'running', 'completed', 'error']),
                context: { test: true },
                lastUpdate: new Date().toISOString()
            })
        };

        if (!generators[type]) {
            throw new Error(`Unknown mock data type: ${type}`);
        }

        return count === 1 ? generators[type]() : Array.from({ length: count }, generators[type]);
    }

    /**
     * Generate unique ID for testing
     */
    static generateId() {
        return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Random choice from array
     */
    static randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Wait for specified milliseconds
     */
    static async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Measure execution time of a function
     */
    static async measureTime(fn) {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();
        return {
            result,
            duration: end - start
        };
    }

    /**
     * Assert equality with detailed error messages
     */
    static assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected: ${expected}\nActual: ${actual}`);
        }
    }

    /**
     * Assert that value is truthy
     */
    static assertTrue(value, message = '') {
        if (!value) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected truthy value, got: ${value}`);
        }
    }

    /**
     * Assert that value is falsy
     */
    static assertFalse(value, message = '') {
        if (value) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected falsy value, got: ${value}`);
        }
    }

    /**
     * Assert that array contains value
     */
    static assertContains(array, value, message = '') {
        if (!array.includes(value)) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nArray does not contain: ${value}`);
        }
    }

    /**
     * Assert that function throws error
     */
    static async assertThrows(fn, expectedError = null, message = '') {
        try {
            await fn();
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected function to throw error`);
        } catch (error) {
            if (expectedError && !(error instanceof expectedError)) {
                throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected error type: ${expectedError.name}\nActual error type: ${error.constructor.name}`);
            }
        }
    }

    /**
     * Create a spy function for testing
     */
    static createSpy(name = 'spy') {
        const spy = function(...args) {
            spy.calls.push(args);
            spy.callCount++;
            return spy.returnValue;
        };
        
        spy.calls = [];
        spy.callCount = 0;
        spy.returnValue = undefined;
        spy.name = name;
        
        spy.reset = () => {
            spy.calls = [];
            spy.callCount = 0;
        };
        
        spy.calledWith = (...args) => {
            return spy.calls.some(call => 
                call.length === args.length && 
                call.every((arg, i) => arg === args[i])
            );
        };
        
        return spy;
    }

    /**
     * Create mock implementation of interface
     */
    static createMock(interface) {
        const mock = {};
        
        for (const method of interface) {
            mock[method] = TestUtils.createSpy(method);
        }
        
        return mock;
    }

    /**
     * Performance benchmark for operations
     */
    static async benchmark(name, fn, iterations = 1000) {
        const times = [];
        
        // Warm up
        for (let i = 0; i < 10; i++) {
            await fn();
        }
        
        // Measure
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            await fn();
            const end = performance.now();
            times.push(end - start);
        }
        
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
        
        return {
            name,
            iterations,
            average: avg,
            median,
            min,
            max,
            standardDeviation: Math.sqrt(
                times.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / times.length
            )
        };
    }

    /**
     * Memory usage monitoring
     */
    static getMemoryUsage() {
        if (performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }
        return null;
    }

    /**
     * Create test data cleanup function
     */
    static createCleanup() {
        const cleanupTasks = [];
        
        return {
            add: (task) => cleanupTasks.push(task),
            run: async () => {
                for (const task of cleanupTasks) {
                    try {
                        await task();
                    } catch (error) {
                        console.warn('Cleanup task failed:', error);
                    }
                }
                cleanupTasks.length = 0;
            }
        };
    }
}

/**
 * Test Suite class for organizing tests
 */
class TestSuite {
    constructor(name, options = {}) {
        this.name = name;
        this.tests = [];
        this.beforeEach = options.beforeEach || null;
        this.afterEach = options.afterEach || null;
        this.setup = options.setup || null;
        this.teardown = options.teardown || null;
        this.timeout = options.timeout || 5000;
    }

    /**
     * Add a test to the suite
     */
    test(name, fn) {
        this.tests.push({ name, fn });
        return this;
    }

    /**
     * Run all tests in the suite
     */
    async run() {
        const results = {
            suite: this.name,
            passed: 0,
            failed: 0,
            errors: [],
            duration: 0
        };

        const startTime = performance.now();

        // Run setup
        if (this.setup) {
            try {
                await this.setup();
            } catch (error) {
                results.errors.push(`Setup failed: ${error.message}`);
                return results;
            }
        }

        // Run tests
        for (const test of this.tests) {
            try {
                // Run beforeEach
                if (this.beforeEach) {
                    await this.beforeEach();
                }

                // Run test with timeout
                await Promise.race([
                    test.fn(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Test timeout')), this.timeout)
                    )
                ]);

                results.passed++;
                console.log(`✅ ${this.name}: ${test.name}`);

            } catch (error) {
                results.failed++;
                results.errors.push(`${test.name}: ${error.message}`);
                console.error(`❌ ${this.name}: ${test.name} - ${error.message}`);
            } finally {
                // Run afterEach
                if (this.afterEach) {
                    try {
                        await this.afterEach();
                    } catch (error) {
                        console.warn(`AfterEach failed for ${test.name}:`, error);
                    }
                }
            }
        }

        // Run teardown
        if (this.teardown) {
            try {
                await this.teardown();
            } catch (error) {
                console.warn('Teardown failed:', error);
            }
        }

        results.duration = performance.now() - startTime;
        return results;
    }
}

export default TestUtils;