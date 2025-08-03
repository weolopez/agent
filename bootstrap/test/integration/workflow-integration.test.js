/**
 * Multi-Agent Workflow Integration Tests
 * Tests the complete agent pipeline from analysis to testing
 */

import { agentEngine } from '../../src/agents/agent-engine.js';
import { workingMemory } from '../../src/memory/working-memory.js';
import { contextManager } from '../../src/memory/context-manager.js';
import { logger } from '../../src/core/logger.js';

/**
 * Comprehensive workflow integration test suite
 */
export class WorkflowIntegrationTests {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
    }

    /**
     * Run all workflow integration tests
     */
    async runAllTests() {
        await logger.info('🚀 Starting Multi-Agent Workflow Integration Tests');

        try {
            // Test 1: Complete Agent Pipeline
            await this.testCompleteAgentPipeline();
            
            // Test 2: Memory Integration
            await this.testMemoryIntegration();
            
            // Test 3: Error Recovery Workflow
            await this.testErrorRecoveryWorkflow();
            
            // Test 4: Concurrent Agent Execution
            await this.testConcurrentAgentExecution();
            
            // Test 5: Context Persistence Across Agents
            await this.testContextPersistence();

            // Generate final report
            await this.generateTestReport();

        } catch (error) {
            await logger.error('Integration test suite failed', error);
            this.addResult('Integration Test Suite', false, error.message);
        }

        return this.testResults;
    }

    /**
     * Test complete agent pipeline: Analyst → Planner → Developer → Tester
     */
    async testCompleteAgentPipeline() {
        await logger.info('🔄 Testing complete agent pipeline...');
        
        try {
            // Create test session
            const sessionId = `integration_test_${Date.now()}`;
            await workingMemory.createSession(sessionId);
            await workingMemory.switchSession(sessionId);

            // Step 1: Analyst Agent
            const analysisRequest = {
                type: 'analysis',
                description: 'Build a simple task management system with user authentication',
                requirements: [
                    'User registration and login',
                    'Create, edit, delete tasks',
                    'Mark tasks as complete',
                    'Simple responsive UI'
                ],
                priority: 'high'
            };

            await logger.info('🔍 Running Analyst Agent...');
            const analysisResult = await agentEngine.executeAgent('analyst', analysisRequest);
            
            if (!analysisResult || !analysisResult.success) {
                throw new Error('Analyst agent execution failed');
            }

            // Verify analysis output structure
            this.validateAnalysisOutput(analysisResult.result);
            await workingMemory.setContext('analysis_result', analysisResult.result);

            // Step 2: Planner Agent
            const planningRequest = {
                type: 'planning',
                analysisResult: analysisResult.result,
                constraints: {
                    timeline: '2 weeks',
                    technology: 'vanilla JavaScript',
                    complexity: 'medium'
                }
            };

            await logger.info('📋 Running Planner Agent...');
            const planningResult = await agentEngine.executeAgent('planner', planningRequest);
            
            if (!planningResult || !planningResult.success) {
                throw new Error('Planner agent execution failed');
            }

            this.validatePlanningOutput(planningResult.result);
            await workingMemory.setContext('planning_result', planningResult.result);

            // Step 3: Developer Agent
            const developmentRequest = {
                type: 'development',
                planningResult: planningResult.result,
                analysisResult: analysisResult.result,
                phase: 'implementation'
            };

            await logger.info('💻 Running Developer Agent...');
            const developmentResult = await agentEngine.executeAgent('developer', developmentRequest);
            
            if (!developmentResult || !developmentResult.success) {
                throw new Error('Developer agent execution failed');
            }

            this.validateDevelopmentOutput(developmentResult.result);
            await workingMemory.setContext('development_result', developmentResult.result);

            // Step 4: Tester Agent
            const testingRequest = {
                type: 'testing',
                developmentResult: developmentResult.result,
                requirements: analysisResult.result.requirements,
                testTypes: ['functional', 'usability', 'performance']
            };

            await logger.info('🧪 Running Tester Agent...');
            const testingResult = await agentEngine.executeAgent('tester', testingRequest);
            
            if (!testingResult || !testingResult.success) {
                throw new Error('Tester agent execution failed');
            }

            this.validateTestingOutput(testingResult.result);
            await workingMemory.setContext('testing_result', testingResult.result);

            // Verify complete workflow
            const workflowComplete = await this.verifyWorkflowCompletion();
            
            this.addResult('Complete Agent Pipeline', true, 'All 4 agents executed successfully');
            await logger.info('✅ Complete agent pipeline test passed');

        } catch (error) {
            this.addResult('Complete Agent Pipeline', false, error.message);
            await logger.error('❌ Complete agent pipeline test failed', error);
        }
    }

    /**
     * Test memory integration across agents
     */
    async testMemoryIntegration() {
        await logger.info('🧠 Testing memory integration...');
        
        try {
            // Test context persistence
            const testContext = {
                projectName: 'Integration Test Project',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            };

            await workingMemory.setContext('project_context', testContext);
            
            // Simulate agent execution with memory retrieval
            const retrievedContext = await workingMemory.getContext('project_context');
            
            if (!retrievedContext || retrievedContext.projectName !== testContext.projectName) {
                throw new Error('Context persistence failed');
            }

            // Test context manager integration
            const assembledContext = await contextManager.assembleContext({
                type: 'development',
                scope: 'current_session',
                includeHistory: true
            });

            if (!assembledContext || !assembledContext.context) {
                throw new Error('Context assembly failed');
            }

            // Test agent state persistence
            const agentState = {
                type: 'analyst',
                status: 'completed',
                lastUpdate: new Date().toISOString(),
                performance: {
                    operationsCompleted: 5,
                    averageResponseTime: 1200,
                    successRate: 1.0
                }
            };

            await workingMemory.setAgentState('analyst', agentState);
            const retrievedState = await workingMemory.getAgentState('analyst');

            if (!retrievedState || retrievedState.type !== 'analyst') {
                throw new Error('Agent state persistence failed');
            }

            this.addResult('Memory Integration', true, 'Context and state persistence working');
            await logger.info('✅ Memory integration test passed');

        } catch (error) {
            this.addResult('Memory Integration', false, error.message);
            await logger.error('❌ Memory integration test failed', error);
        }
    }

    /**
     * Test error recovery workflow
     */
    async testErrorRecoveryWorkflow() {
        await logger.info('🔄 Testing error recovery workflow...');
        
        try {
            // Simulate agent failure and recovery
            const failingRequest = {
                type: 'invalid_type',
                data: null
            };

            try {
                await agentEngine.executeAgent('analyst', failingRequest);
                throw new Error('Expected agent execution to fail');
            } catch (expectedError) {
                // This should fail - verify error handling
                if (!expectedError.message.includes('Invalid') && !expectedError.message.includes('validation')) {
                    throw new Error('Error handling not working properly');
                }
            }

            // Test recovery with valid request
            const recoveryRequest = {
                type: 'analysis',
                description: 'Simple recovery test',
                requirements: ['Basic functionality']
            };

            const recoveryResult = await agentEngine.executeAgent('analyst', recoveryRequest);
            
            if (!recoveryResult || !recoveryResult.success) {
                throw new Error('Recovery execution failed');
            }

            this.addResult('Error Recovery Workflow', true, 'Error handling and recovery working');
            await logger.info('✅ Error recovery workflow test passed');

        } catch (error) {
            this.addResult('Error Recovery Workflow', false, error.message);
            await logger.error('❌ Error recovery workflow test failed', error);
        }
    }

    /**
     * Test concurrent agent execution
     */
    async testConcurrentAgentExecution() {
        await logger.info('🔄 Testing concurrent agent execution...');
        
        try {
            // Create multiple sessions for concurrent testing
            const sessionIds = [
                `concurrent_test_1_${Date.now()}`,
                `concurrent_test_2_${Date.now()}`,
                `concurrent_test_3_${Date.now()}`
            ];

            // Create sessions
            for (const sessionId of sessionIds) {
                await workingMemory.createSession(sessionId);
            }

            // Execute agents concurrently in different sessions
            const concurrentPromises = sessionIds.map(async (sessionId, index) => {
                await workingMemory.switchSession(sessionId);
                
                const request = {
                    type: 'analysis',
                    description: `Concurrent test ${index + 1}`,
                    requirements: [`Requirement ${index + 1}`]
                };

                return await agentEngine.executeAgent('analyst', request);
            });

            const results = await Promise.all(concurrentPromises);

            // Verify all executions succeeded
            for (const result of results) {
                if (!result || !result.success) {
                    throw new Error('Concurrent execution failed');
                }
            }

            // Cleanup test sessions
            for (const sessionId of sessionIds) {
                await workingMemory.destroySession(sessionId);
            }

            this.addResult('Concurrent Agent Execution', true, 'Multiple agents executed successfully');
            await logger.info('✅ Concurrent agent execution test passed');

        } catch (error) {
            this.addResult('Concurrent Agent Execution', false, error.message);
            await logger.error('❌ Concurrent agent execution test failed', error);
        }
    }

    /**
     * Test context persistence across agents
     */
    async testContextPersistence() {
        await logger.info('💾 Testing context persistence across agents...');
        
        try {
            // Set initial context
            const initialContext = {
                projectScope: 'E-commerce Platform',
                techStack: ['JavaScript', 'HTML5', 'CSS3'],
                timeline: '4 weeks',
                team: ['frontend', 'backend', 'qa']
            };

            await workingMemory.setContext('project_scope', initialContext);

            // Execute analyst with context
            const analysisRequest = {
                type: 'analysis',
                description: 'Analyze e-commerce platform requirements',
                requirements: ['User management', 'Product catalog', 'Shopping cart']
            };

            const analysisResult = await agentEngine.executeAgent('analyst', analysisRequest);
            
            // Verify context is still available after agent execution
            const persistedContext = await workingMemory.getContext('project_scope');
            
            if (!persistedContext || persistedContext.projectScope !== initialContext.projectScope) {
                throw new Error('Context not persisted across agent execution');
            }

            // Add context during agent execution
            await workingMemory.setContext('analysis_complete', {
                timestamp: new Date().toISOString(),
                agent: 'analyst',
                status: 'completed'
            });

            // Execute planner and verify both contexts exist
            const planningRequest = {
                type: 'planning',
                analysisResult: analysisResult.result
            };

            const planningResult = await agentEngine.executeAgent('planner', planningRequest);

            // Verify both contexts still exist
            const originalContext = await workingMemory.getContext('project_scope');
            const addedContext = await workingMemory.getContext('analysis_complete');

            if (!originalContext || !addedContext) {
                throw new Error('Context not maintained across multiple agent executions');
            }

            // Get all context and verify completeness
            const allContext = await workingMemory.getAllContext();
            const expectedKeys = ['project_scope', 'analysis_complete', 'analysis_result', 'planning_result'];
            
            for (const key of expectedKeys) {
                if (!(key in allContext)) {
                    throw new Error(`Missing context key: ${key}`);
                }
            }

            this.addResult('Context Persistence', true, 'Context maintained across all agent executions');
            await logger.info('✅ Context persistence test passed');

        } catch (error) {
            this.addResult('Context Persistence', false, error.message);
            await logger.error('❌ Context persistence test failed', error);
        }
    }

    // Validation Methods

    validateAnalysisOutput(output) {
        const required = ['requirements', 'challenges', 'recommendations', 'complexity'];
        for (const field of required) {
            if (!output[field]) {
                throw new Error(`Analysis output missing: ${field}`);
            }
        }
    }

    validatePlanningOutput(output) {
        const required = ['architecture', 'timeline', 'phases', 'resources'];
        for (const field of required) {
            if (!output[field]) {
                throw new Error(`Planning output missing: ${field}`);
            }
        }
    }

    validateDevelopmentOutput(output) {
        const required = ['implementation', 'codeQuality', 'documentation'];
        for (const field of required) {
            if (!output[field]) {
                throw new Error(`Development output missing: ${field}`);
            }
        }
    }

    validateTestingOutput(output) {
        const required = ['testPlan', 'coverage', 'results'];
        for (const field of required) {
            if (!output[field]) {
                throw new Error(`Testing output missing: ${field}`);
            }
        }
    }

    async verifyWorkflowCompletion() {
        const requiredContexts = ['analysis_result', 'planning_result', 'development_result', 'testing_result'];
        
        for (const context of requiredContexts) {
            const value = await workingMemory.getContext(context);
            if (!value) {
                throw new Error(`Workflow incomplete: missing ${context}`);
            }
        }
        
        return true;
    }

    // Utility Methods

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

    async generateTestReport() {
        const report = {
            summary: {
                total: this.testResults.total,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                passRate: this.testResults.total > 0 ? 
                    (this.testResults.passed / this.testResults.total * 100).toFixed(2) : 0
            },
            details: this.testResults.details,
            timestamp: new Date().toISOString()
        };

        await logger.info('📊 Integration Test Report', report);
        
        console.log('\n🧪 WORKFLOW INTEGRATION TEST REPORT');
        console.log('=====================================');
        console.log(`Total Tests: ${report.summary.total}`);
        console.log(`Passed: ${report.summary.passed}`);
        console.log(`Failed: ${report.summary.failed}`);
        console.log(`Pass Rate: ${report.summary.passRate}%`);
        console.log('\nTest Details:');
        
        for (const detail of report.details) {
            const status = detail.passed ? '✅' : '❌';
            console.log(`${status} ${detail.test}: ${detail.message}`);
        }
        
        return report;
    }
}

// Export for use in test runner
export default WorkflowIntegrationTests;

// Auto-run if loaded directly
if (typeof window !== 'undefined' && window.location.pathname.includes('workflow-integration')) {
    const tests = new WorkflowIntegrationTests();
    tests.runAllTests().then(results => {
        console.log('Workflow Integration Tests completed:', results);
    });
}