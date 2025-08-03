/**
 * Performance Integration Tests
 * Tests system performance under various load conditions
 */

import { agentEngine } from '../../src/agents/agent-engine.js';
import { workingMemory } from '../../src/memory/working-memory.js';
import { contextManager } from '../../src/memory/context-manager.js';
import { logger } from '../../src/core/logger.js';

export class PerformanceIntegrationTests {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            performance: {},
            details: []
        };
    }

    /**
     * Run all performance integration tests
     */
    async runAllTests() {
        await logger.info('⚡ Starting Performance Integration Tests');

        try {
            // Test 1: Memory Operations Performance
            await this.testMemoryOperationsPerformance();
            
            // Test 2: Agent Execution Performance
            await this.testAgentExecutionPerformance();
            
            // Test 3: Context Assembly Performance
            await this.testContextAssemblyPerformance();
            
            // Test 4: Concurrent Load Testing
            await this.testConcurrentLoadPerformance();
            
            // Test 5: Memory Usage Under Load
            await this.testMemoryUsageUnderLoad();

            // Generate performance report
            await this.generatePerformanceReport();

        } catch (error) {
            await logger.error('Performance test suite failed', error);
            this.addResult('Performance Test Suite', false, error.message);
        }

        return this.testResults;
    }

    /**
     * Test memory operations performance
     */
    async testMemoryOperationsPerformance() {
        await logger.info('💾 Testing memory operations performance...');
        
        try {
            const sessionId = `perf_memory_${Date.now()}`;
            await workingMemory.createSession(sessionId);
            await workingMemory.switchSession(sessionId);

            // Test context operations performance
            const contextOperations = 1000;
            const contextStartTime = performance.now();

            for (let i = 0; i < contextOperations; i++) {
                await workingMemory.setContext(`test_key_${i}`, {
                    index: i,
                    data: `test_data_${i}`,
                    timestamp: new Date().toISOString()
                });
            }

            const contextSetTime = performance.now() - contextStartTime;
            
            // Test context retrieval performance
            const retrievalStartTime = performance.now();
            
            for (let i = 0; i < contextOperations; i++) {
                await workingMemory.getContext(`test_key_${i}`);
            }
            
            const contextGetTime = performance.now() - retrievalStartTime;

            // Performance benchmarks
            const avgSetTime = contextSetTime / contextOperations;
            const avgGetTime = contextGetTime / contextOperations;

            this.testResults.performance.memoryOperations = {
                contextSetAvg: avgSetTime,
                contextGetAvg: avgGetTime,
                totalOperations: contextOperations * 2,
                totalTime: contextSetTime + contextGetTime
            };

            // Verify performance meets requirements (sub-millisecond operations)
            if (avgSetTime < 2 && avgGetTime < 1) {
                this.addResult('Memory Operations Performance', true, 
                    `Avg set: ${avgSetTime.toFixed(3)}ms, Avg get: ${avgGetTime.toFixed(3)}ms`);
            } else {
                this.addResult('Memory Operations Performance', false, 
                    `Performance below threshold: set ${avgSetTime.toFixed(3)}ms, get ${avgGetTime.toFixed(3)}ms`);
            }

            await workingMemory.destroySession(sessionId);

        } catch (error) {
            this.addResult('Memory Operations Performance', false, error.message);
            await logger.error('❌ Memory operations performance test failed', error);
        }
    }

    /**
     * Test agent execution performance
     */
    async testAgentExecutionPerformance() {
        await logger.info('🤖 Testing agent execution performance...');
        
        try {
            const sessionId = `perf_agent_${Date.now()}`;
            await workingMemory.createSession(sessionId);
            await workingMemory.switchSession(sessionId);

            // Test single agent execution time
            const singleExecutionStart = performance.now();
            
            const request = {
                type: 'analysis',
                description: 'Performance test analysis',
                requirements: ['Fast execution', 'Efficient processing']
            };

            const result = await agentEngine.executeAgent('analyst', request);
            const singleExecutionTime = performance.now() - singleExecutionStart;

            if (!result || !result.success) {
                throw new Error('Agent execution failed during performance test');
            }

            // Test multiple sequential executions
            const sequentialExecutions = 5;
            const sequentialStartTime = performance.now();

            for (let i = 0; i < sequentialExecutions; i++) {
                const seqRequest = {
                    type: 'analysis',
                    description: `Sequential test ${i + 1}`,
                    requirements: [`Requirement ${i + 1}`]
                };
                
                await agentEngine.executeAgent('analyst', seqRequest);
            }

            const sequentialTime = performance.now() - sequentialStartTime;
            const avgSequentialTime = sequentialTime / sequentialExecutions;

            this.testResults.performance.agentExecution = {
                singleExecution: singleExecutionTime,
                sequentialAverage: avgSequentialTime,
                totalSequentialTime: sequentialTime,
                executions: sequentialExecutions + 1
            };

            // Performance verification (agents should execute reasonably quickly)
            if (singleExecutionTime < 5000 && avgSequentialTime < 3000) { // 5s for single, 3s avg for sequential
                this.addResult('Agent Execution Performance', true,
                    `Single: ${singleExecutionTime.toFixed(0)}ms, Sequential avg: ${avgSequentialTime.toFixed(0)}ms`);
            } else {
                this.addResult('Agent Execution Performance', false,
                    `Performance below threshold: single ${singleExecutionTime.toFixed(0)}ms, sequential ${avgSequentialTime.toFixed(0)}ms`);
            }

            await workingMemory.destroySession(sessionId);

        } catch (error) {
            this.addResult('Agent Execution Performance', false, error.message);
            await logger.error('❌ Agent execution performance test failed', error);
        }
    }

    /**
     * Test context assembly performance
     */
    async testContextAssemblyPerformance() {
        await logger.info('🧠 Testing context assembly performance...');
        
        try {
            const sessionId = `perf_context_${Date.now()}`;
            await workingMemory.createSession(sessionId);
            await workingMemory.switchSession(sessionId);

            // Set up complex context for assembly testing
            const contextItems = 100;
            
            for (let i = 0; i < contextItems; i++) {
                await workingMemory.setContext(`context_item_${i}`, {
                    type: 'test_data',
                    index: i,
                    relevance: Math.random(),
                    data: new Array(50).fill(`data_${i}`).join(' '),
                    metadata: {
                        category: `category_${i % 10}`,
                        priority: Math.floor(Math.random() * 10),
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Test context assembly performance
            const assemblyTests = 20;
            const assemblyStartTime = performance.now();

            for (let i = 0; i < assemblyTests; i++) {
                await contextManager.assembleContext({
                    type: 'analysis',
                    scope: 'current_session',
                    includeHistory: true,
                    maxItems: 50,
                    relevanceThreshold: 0.3
                });
            }

            const assemblyTime = performance.now() - assemblyStartTime;
            const avgAssemblyTime = assemblyTime / assemblyTests;

            this.testResults.performance.contextAssembly = {
                averageAssemblyTime: avgAssemblyTime,
                totalAssemblyTime: assemblyTime,
                contextItemsProcessed: contextItems,
                assemblyOperations: assemblyTests
            };

            // Performance verification (context assembly should be efficient)
            if (avgAssemblyTime < 500) { // 500ms max for context assembly
                this.addResult('Context Assembly Performance', true,
                    `Average assembly time: ${avgAssemblyTime.toFixed(2)}ms`);
            } else {
                this.addResult('Context Assembly Performance', false,
                    `Assembly time too slow: ${avgAssemblyTime.toFixed(2)}ms`);
            }

            await workingMemory.destroySession(sessionId);

        } catch (error) {
            this.addResult('Context Assembly Performance', false, error.message);
            await logger.error('❌ Context assembly performance test failed', error);
        }
    }

    /**
     * Test concurrent load performance
     */
    async testConcurrentLoadPerformance() {
        await logger.info('🔄 Testing concurrent load performance...');
        
        try {
            const concurrentSessions = 10;
            const sessionIds = [];

            // Create multiple sessions
            for (let i = 0; i < concurrentSessions; i++) {
                const sessionId = `perf_concurrent_${i}_${Date.now()}`;
                sessionIds.push(sessionId);
                await workingMemory.createSession(sessionId);
            }

            // Test concurrent operations
            const concurrentStartTime = performance.now();

            const concurrentPromises = sessionIds.map(async (sessionId, index) => {
                await workingMemory.switchSession(sessionId);
                
                // Perform multiple operations per session
                for (let i = 0; i < 10; i++) {
                    await workingMemory.setContext(`concurrent_key_${i}`, {
                        sessionIndex: index,
                        operationIndex: i,
                        timestamp: new Date().toISOString()
                    });
                }

                // Execute agent in session
                const request = {
                    type: 'analysis',
                    description: `Concurrent test for session ${index}`,
                    requirements: [`Concurrent requirement ${index}`]
                };

                return await agentEngine.executeAgent('analyst', request);
            });

            const concurrentResults = await Promise.all(concurrentPromises);
            const concurrentTime = performance.now() - concurrentStartTime;

            // Verify all concurrent operations succeeded
            const successfulOperations = concurrentResults.filter(result => result && result.success).length;

            this.testResults.performance.concurrentLoad = {
                totalConcurrentTime: concurrentTime,
                concurrentSessions: concurrentSessions,
                successfulOperations,
                averageTimePerSession: concurrentTime / concurrentSessions
            };

            // Cleanup sessions
            for (const sessionId of sessionIds) {
                await workingMemory.destroySession(sessionId);
            }

            // Performance verification
            if (successfulOperations === concurrentSessions && concurrentTime < 15000) { // 15s max for concurrent load
                this.addResult('Concurrent Load Performance', true,
                    `${successfulOperations}/${concurrentSessions} sessions completed in ${concurrentTime.toFixed(0)}ms`);
            } else {
                this.addResult('Concurrent Load Performance', false,
                    `Only ${successfulOperations}/${concurrentSessions} sessions succeeded in ${concurrentTime.toFixed(0)}ms`);
            }

        } catch (error) {
            this.addResult('Concurrent Load Performance', false, error.message);
            await logger.error('❌ Concurrent load performance test failed', error);
        }
    }

    /**
     * Test memory usage under load
     */
    async testMemoryUsageUnderLoad() {
        await logger.info('📊 Testing memory usage under load...');
        
        try {
            const sessionId = `perf_memory_load_${Date.now()}`;
            await workingMemory.createSession(sessionId);
            await workingMemory.switchSession(sessionId);

            // Get initial memory usage
            const initialMetrics = await workingMemory.getSessionMetrics();
            const initialMemory = this.getMemoryUsage();

            // Create substantial memory load
            const largeDataItems = 500;
            const loadStartTime = performance.now();

            for (let i = 0; i < largeDataItems; i++) {
                const largeData = {
                    index: i,
                    largeArray: new Array(1000).fill(`large_data_item_${i}`),
                    metadata: {
                        timestamp: new Date().toISOString(),
                        size: 'large',
                        category: `category_${i % 20}`
                    },
                    nestedData: {
                        level1: new Array(100).fill(`level1_${i}`),
                        level2: new Array(100).fill(`level2_${i}`)
                    }
                };
                
                await workingMemory.setContext(`large_item_${i}`, largeData);
                
                // Set agent states to simulate realistic usage
                if (i % 100 === 0) {
                    await workingMemory.setAgentState('analyst', {
                        type: 'analyst',
                        status: 'working',
                        lastUpdate: new Date().toISOString(),
                        currentOperation: `Processing item ${i}`,
                        performance: {
                            operationsCompleted: i,
                            averageResponseTime: 150,
                            successRate: 0.99
                        }
                    });
                }
            }

            const loadTime = performance.now() - loadStartTime;

            // Get final memory usage
            const finalMetrics = await workingMemory.getSessionMetrics();
            const finalMemory = this.getMemoryUsage();

            const memoryGrowth = finalMemory && initialMemory ? 
                finalMemory.used - initialMemory.used : 0;

            this.testResults.performance.memoryLoad = {
                itemsCreated: largeDataItems,
                loadTime: loadTime,
                initialMemoryUsage: initialMetrics.memoryUsage,
                finalMemoryUsage: finalMetrics.memoryUsage,
                memoryGrowth: memoryGrowth,
                averageItemProcessingTime: loadTime / largeDataItems
            };

            // Performance verification (memory should grow predictably and not excessively)
            const memoryGrowthMB = memoryGrowth / (1024 * 1024);
            const avgProcessingTime = loadTime / largeDataItems;

            if (avgProcessingTime < 10 && (memoryGrowthMB < 200 || memoryGrowthMB === 0)) { // 10ms per item, <200MB growth
                this.addResult('Memory Usage Under Load', true,
                    `${largeDataItems} items processed in ${loadTime.toFixed(0)}ms, memory growth: ${memoryGrowthMB.toFixed(2)}MB`);
            } else {
                this.addResult('Memory Usage Under Load', false,
                    `Performance issues: ${avgProcessingTime.toFixed(2)}ms per item, ${memoryGrowthMB.toFixed(2)}MB growth`);
            }

            await workingMemory.destroySession(sessionId);

        } catch (error) {
            this.addResult('Memory Usage Under Load', false, error.message);
            await logger.error('❌ Memory usage under load test failed', error);
        }
    }

    // Utility Methods

    getMemoryUsage() {
        if (typeof performance !== 'undefined' && performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }
        return null;
    }

    addResult(testName, passed, message) {
        this.testResults.total++;
        if (passed) {
            this.testResults.passed++;
        } else {
            this.testResults.failed++;
        }
        
        this.testResults.details.push({
            test: testName,
            passed,
            message,
            timestamp: new Date().toISOString()
        });
    }

    async generatePerformanceReport() {
        const report = {
            summary: {
                total: this.testResults.total,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                passRate: this.testResults.total > 0 ? 
                    (this.testResults.passed / this.testResults.total * 100).toFixed(2) : 0
            },
            performance: this.testResults.performance,
            details: this.testResults.details,
            timestamp: new Date().toISOString()
        };

        await logger.info('⚡ Performance Integration Test Report', report);
        
        console.log('\n⚡ PERFORMANCE INTEGRATION TEST REPORT');
        console.log('=======================================');
        console.log(`Total Tests: ${report.summary.total}`);
        console.log(`Passed: ${report.summary.passed}`);
        console.log(`Failed: ${report.summary.failed}`);
        console.log(`Pass Rate: ${report.summary.passRate}%`);
        
        console.log('\nPerformance Metrics:');
        if (report.performance.memoryOperations) {
            const mem = report.performance.memoryOperations;
            console.log(`  Memory Operations: Set ${mem.contextSetAvg.toFixed(3)}ms, Get ${mem.contextGetAvg.toFixed(3)}ms avg`);
        }
        if (report.performance.agentExecution) {
            const agent = report.performance.agentExecution;
            console.log(`  Agent Execution: Single ${agent.singleExecution.toFixed(0)}ms, Sequential ${agent.sequentialAverage.toFixed(0)}ms avg`);
        }
        if (report.performance.contextAssembly) {
            const context = report.performance.contextAssembly;
            console.log(`  Context Assembly: ${context.averageAssemblyTime.toFixed(2)}ms avg`);
        }
        if (report.performance.concurrentLoad) {
            const concurrent = report.performance.concurrentLoad;
            console.log(`  Concurrent Load: ${concurrent.concurrentSessions} sessions in ${concurrent.totalConcurrentTime.toFixed(0)}ms`);
        }
        
        console.log('\nTest Details:');
        for (const detail of report.details) {
            const status = detail.passed ? '✅' : '❌';
            console.log(`${status} ${detail.test}: ${detail.message}`);
        }
        
        return report;
    }
}

// Export for use in test runner
export default PerformanceIntegrationTests;

// Auto-run if loaded directly
if (typeof window !== 'undefined' && window.location.pathname.includes('performance-integration')) {
    const tests = new PerformanceIntegrationTests();
    tests.runAllTests().then(results => {
        console.log('Performance Integration Tests completed:', results);
    });
}