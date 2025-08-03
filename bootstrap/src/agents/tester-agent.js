/**
 * Tester Agent Definition
 * Specialized agent for comprehensive testing including functionality,
 * performance, accessibility, and security validation.
 */

export const testerAgentDefinition = {
    type: 'tester',
    name: 'Quality Assurance Engineer',
    description: 'Conducts comprehensive testing and quality validation of implemented solutions',
    
    // Core prompt template
    promptTemplate: `You are a senior quality assurance engineer and testing expert with extensive experience in comprehensive software testing, automation, and quality validation. Your role is to design and execute thorough testing strategies.

# Testing Task
Create a comprehensive testing strategy and implementation for the following:

{{description}}

# Implementation Details
{{previousResults}}

# Context
{{context}}

# Testing Requirements
Please provide a comprehensive testing strategy with the following components:

## 1. Test Strategy and Planning
- Overall testing approach and methodology
- Test levels (unit, integration, system, acceptance)
- Risk-based testing priorities and coverage areas
- Testing timeline and resource requirements
- Entry/exit criteria for each testing phase

## 2. Functional Testing
- Test case design for all functional requirements
- Positive and negative test scenarios
- Boundary value analysis and equivalence partitioning
- User acceptance testing scenarios
- Business logic validation tests

## 3. Non-Functional Testing
- Performance testing (load, stress, volume, spike)
- Security testing (authentication, authorization, data protection)
- Usability testing and user experience validation
- Accessibility testing (WCAG compliance)
- Compatibility testing (browsers, devices, platforms)

## 4. Automated Testing Implementation
- Unit test suites with comprehensive coverage
- Integration test automation
- End-to-end test scenarios and automation
- API testing and contract validation
- Continuous testing pipeline integration

## 5. Test Data Management
- Test data generation and management strategies
- Data privacy and security considerations
- Environment-specific test data requirements
- Data cleanup and maintenance procedures
- Synthetic data generation for testing

## 6. Defect Management and Reporting
- Bug tracking and reporting procedures
- Severity and priority classification
- Root cause analysis methodologies
- Regression testing strategies
- Quality metrics and reporting dashboards

## 7. Test Environment and Infrastructure
- Test environment setup and configuration
- Environment isolation and data management
- CI/CD pipeline integration and automated testing
- Test reporting and metrics collection
- Monitoring and observability for testing

Please format your response as structured test documentation with executable test cases, automation scripts, and comprehensive quality validation procedures.`,

    // System prompt for consistent behavior
    systemPrompt: `You are a world-class quality assurance engineer with 20+ years of experience in comprehensive software testing and quality validation. Your expertise includes:

- Advanced testing methodologies and strategies
- Test automation frameworks and tools across technologies
- Performance testing and optimization
- Security testing and vulnerability assessment
- Accessibility and usability testing
- Continuous testing and DevOps integration
- Quality metrics and process improvement

You excel at:
- Designing comprehensive test strategies that catch critical issues
- Creating maintainable and reliable automated test suites
- Identifying edge cases and potential failure scenarios
- Balancing thorough testing with practical time constraints
- Mentoring teams on quality engineering best practices

Always provide testing solutions that are practical, comprehensive, and aligned with industry best practices. Focus on preventing defects while ensuring efficient delivery timelines.`,

    // Response schema for validation
    responseSchema: {
        required: ['strategy', 'functional_tests', 'automation', 'quality_metrics'],
        properties: {
            strategy: {
                type: 'object',
                required: ['approach', 'levels', 'priorities', 'timeline']
            },
            functional_tests: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['test_case', 'description', 'steps', 'expected_result']
                }
            },
            automation: {
                type: 'object',
                required: ['unit_tests', 'integration_tests', 'e2e_tests', 'tools']
            },
            quality_metrics: {
                type: 'object',
                required: ['coverage_targets', 'performance_benchmarks', 'quality_gates']
            }
        }
    },

    // Processing configuration
    preferredModel: 'claude-sonnet-4-20250514',
    maxTokens: 8000,
    temperature: 0.2, // Low temperature for testing precision
    
    // Context assembly preferences
    contextFilters: {
        type: 'testing',
        category: ['testing', 'quality', 'validation'],
        tags: ['testing', 'quality', 'automation', 'validation']
    },

    // Response processor function
    responseProcessor: async (result, request) => {
        try {
            // Try to parse as JSON first
            let parsed;
            try {
                parsed = JSON.parse(result.content);
            } catch (jsonError) {
                // If not JSON, extract structured testing information
                parsed = extractStructuredTesting(result.content);
            }

            // Analyze testing comprehensiveness
            const testingAnalysis = analyzeTestingCoverage(parsed);
            
            return {
                ...result,
                testing: parsed,
                structured: true,
                testingAnalysis,
                metadata: {
                    ...result.metadata,
                    testingType: 'comprehensive',
                    coverage: testingAnalysis.coverage,
                    completeness: testingAnalysis.completeness,
                    automationLevel: testingAnalysis.automationLevel,
                    processingMethod: typeof parsed === 'object' && parsed !== null ? 'json' : 'extraction'
                }
            };
        } catch (error) {
            // Return original result if processing fails
            return {
                ...result,
                structured: false,
                processingError: error.message
            };
        }
    },

    // Memory storage configuration
    storeResults: true,
    resultCategory: 'testing',
    resultTags: ['testing', 'quality', 'validation', 'structured'],

    // Execution preferences
    timeout: 90000, // 90 seconds for comprehensive testing strategy
    maxRetries: 2,
    retryOnErrors: ['timeout', 'rate_limit', 'server_error']
};

/**
 * Extract structured testing information from text response
 * @param {string} content - Response content
 * @returns {Object} Extracted structure
 */
function extractStructuredTesting(content) {
    const structure = {
        strategy: { approach: '', levels: [], priorities: [], timeline: '' },
        functional_tests: [],
        non_functional_tests: [],
        automation: { unit_tests: [], integration_tests: [], e2e_tests: [], tools: [] },
        test_data: { strategy: '', requirements: [], procedures: [] },
        defect_management: { procedures: [], classification: [], metrics: [] },
        infrastructure: { environments: [], tools: [], monitoring: [] },
        quality_metrics: { coverage_targets: {}, performance_benchmarks: {}, quality_gates: [] },
        extracted: true
    };

    try {
        // Extract sections using regex patterns
        const sections = {
            strategy: extractSection(content, 'Test Strategy and Planning', 'Functional Testing'),
            functional: extractSection(content, 'Functional Testing', 'Non-Functional Testing'),
            nonFunctional: extractSection(content, 'Non-Functional Testing', 'Automated Testing Implementation'),
            automation: extractSection(content, 'Automated Testing Implementation', 'Test Data Management'),
            testData: extractSection(content, 'Test Data Management', 'Defect Management and Reporting'),
            defects: extractSection(content, 'Defect Management and Reporting', 'Test Environment and Infrastructure'),
            infrastructure: extractSection(content, 'Test Environment and Infrastructure', null)
        };

        // Process strategy
        if (sections.strategy) {
            structure.strategy.approach = sections.strategy.substring(0, 500);
            structure.strategy.levels = extractTestLevels(sections.strategy);
            structure.strategy.priorities = extractPriorities(sections.strategy);
            structure.strategy.timeline = extractTimeline(sections.strategy);
        }

        // Process functional tests
        if (sections.functional) {
            structure.functional_tests = extractTestCases(sections.functional);
        }

        // Process non-functional tests
        if (sections.nonFunctional) {
            structure.non_functional_tests = extractNonFunctionalTests(sections.nonFunctional);
        }

        // Process automation
        if (sections.automation) {
            structure.automation.unit_tests = extractAutomationTests(sections.automation, 'unit');
            structure.automation.integration_tests = extractAutomationTests(sections.automation, 'integration');
            structure.automation.e2e_tests = extractAutomationTests(sections.automation, 'e2e');
            structure.automation.tools = extractTestingTools(sections.automation);
        }

        // Process test data
        if (sections.testData) {
            structure.test_data.strategy = sections.testData.substring(0, 300);
            structure.test_data.requirements = extractBulletPoints(sections.testData);
            structure.test_data.procedures = extractProcedures(sections.testData);
        }

        // Process defect management
        if (sections.defects) {
            structure.defect_management.procedures = extractProcedures(sections.defects);
            structure.defect_management.classification = extractClassification(sections.defects);
            structure.defect_management.metrics = extractMetrics(sections.defects);
        }

        // Process infrastructure
        if (sections.infrastructure) {
            structure.infrastructure.environments = extractEnvironments(sections.infrastructure);
            structure.infrastructure.tools = extractTestingTools(sections.infrastructure);
            structure.infrastructure.monitoring = extractMonitoring(sections.infrastructure);
        }

        // Extract quality metrics from various sections
        structure.quality_metrics = extractQualityMetrics(content);

    } catch (error) {
        // If extraction fails, return basic structure
        structure.extractionError = error.message;
        structure.rawContent = content.substring(0, 2000);
    }

    return structure;
}

/**
 * Extract section content between headers
 * @param {string} content - Full content
 * @param {string} startHeader - Start header
 * @param {string} endHeader - End header (null for last section)
 * @returns {string} Section content
 */
function extractSection(content, startHeader, endHeader) {
    const startPattern = new RegExp(`#{1,3}\\s*\\d*\\.?\\s*${startHeader}`, 'i');
    const startMatch = content.match(startPattern);
    
    if (!startMatch) return '';
    
    const startIndex = startMatch.index + startMatch[0].length;
    
    if (!endHeader) {
        return content.substring(startIndex).trim();
    }
    
    const endPattern = new RegExp(`#{1,3}\\s*\\d*\\.?\\s*${endHeader}`, 'i');
    const endMatch = content.substring(startIndex).match(endPattern);
    
    if (!endMatch) {
        return content.substring(startIndex).trim();
    }
    
    return content.substring(startIndex, startIndex + endMatch.index).trim();
}

/**
 * Extract bullet points from text
 * @param {string} text - Text content
 * @returns {Array<string>} Bullet points
 */
function extractBulletPoints(text) {
    const bulletPattern = /^[\s]*[-*•]\s*(.+)$/gm;
    const matches = [];
    let match;
    
    while ((match = bulletPattern.exec(text)) !== null) {
        if (match[1].trim()) {
            matches.push(match[1].trim());
        }
    }
    
    return matches;
}

/**
 * Extract test levels from strategy
 * @param {string} text - Text content
 * @returns {Array<string>} Test levels
 */
function extractTestLevels(text) {
    const levels = ['unit', 'integration', 'system', 'acceptance', 'e2e', 'api', 'contract'];
    const found = [];
    const lowerText = text.toLowerCase();
    
    for (const level of levels) {
        if (lowerText.includes(level)) {
            found.push(level);
        }
    }
    
    return found;
}

/**
 * Extract testing priorities
 * @param {string} text - Text content
 * @returns {Array<string>} Priorities
 */
function extractPriorities(text) {
    const priorityPattern = /(?:priority|critical|high|medium|low)[:\s]+(.+?)(?=\n|\.|\||$)/gi;
    const priorities = [];
    let match;
    
    while ((match = priorityPattern.exec(text)) !== null) {
        priorities.push(match[1].trim());
    }
    
    return priorities.slice(0, 10);
}

/**
 * Extract timeline information
 * @param {string} text - Text content
 * @returns {string} Timeline
 */
function extractTimeline(text) {
    const timelinePattern = /timeline[:\s]+([\s\S]*?)(?=\n#{2,}|\n\n[A-Z]|$)/i;
    const match = text.match(timelinePattern);
    return match ? match[1].trim().substring(0, 200) : 'Timeline not specified';
}

/**
 * Extract test cases from functional testing section
 * @param {string} text - Text content
 * @returns {Array<Object>} Test cases
 */
function extractTestCases(text) {
    const testCases = [];
    
    // Look for structured test case patterns
    const testCasePattern = /test\s+case[:\s]*([^:\n]+)[:]\s*([\s\S]*?)(?=test\s+case|#{2,}|$)/gi;
    let match;
    
    while ((match = testCasePattern.exec(text)) !== null) {
        const testCase = {
            test_case: match[1].trim(),
            description: match[2].trim().substring(0, 200),
            steps: extractSteps(match[2]),
            expected_result: extractExpectedResult(match[2]),
            priority: 'Medium'
        };
        testCases.push(testCase);
    }
    
    // If no structured test cases found, extract from bullet points
    if (testCases.length === 0) {
        const bullets = extractBulletPoints(text);
        for (let i = 0; i < Math.min(bullets.length, 15); i++) {
            testCases.push({
                test_case: `Test Case ${i + 1}`,
                description: bullets[i],
                steps: ['Execute test scenario', 'Verify results'],
                expected_result: 'Test passes successfully',
                priority: 'Medium'
            });
        }
    }
    
    return testCases;
}

/**
 * Extract steps from test case description
 * @param {string} text - Test case text
 * @returns {Array<string>} Steps
 */
function extractSteps(text) {
    const stepPatterns = [
        /steps?[:\s]+([\s\S]*?)(?=expected|result|verify|$)/i,
        /procedure[:\s]+([\s\S]*?)(?=expected|result|verify|$)/i
    ];
    
    for (const pattern of stepPatterns) {
        const match = text.match(pattern);
        if (match) {
            const stepsText = match[1];
            const steps = extractBulletPoints(stepsText);
            if (steps.length > 0) return steps;
        }
    }
    
    return ['Execute the test scenario', 'Verify the results'];
}

/**
 * Extract expected result from test case
 * @param {string} text - Test case text
 * @returns {string} Expected result
 */
function extractExpectedResult(text) {
    const resultPatterns = [
        /expected\s+result[:\s]+(.*?)(?=\n|$)/i,
        /expected[:\s]+(.*?)(?=\n|$)/i,
        /result[:\s]+(.*?)(?=\n|$)/i
    ];
    
    for (const pattern of resultPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    return 'Test should pass successfully';
}

/**
 * Extract non-functional test types
 * @param {string} text - Text content
 * @returns {Array<Object>} Non-functional tests
 */
function extractNonFunctionalTests(text) {
    const testTypes = [
        'performance', 'security', 'usability', 'accessibility', 'compatibility',
        'load', 'stress', 'volume', 'spike', 'endurance'
    ];
    
    const tests = [];
    const lowerText = text.toLowerCase();
    
    for (const type of testTypes) {
        if (lowerText.includes(type)) {
            tests.push({
                type: type,
                description: `${type.charAt(0).toUpperCase() + type.slice(1)} testing requirements`,
                requirements: extractRequirements(text, type),
                tools: extractTestingTools(text, type)
            });
        }
    }
    
    return tests;
}

/**
 * Extract automation test information
 * @param {string} text - Text content
 * @param {string} testType - Type of automation tests
 * @returns {Array<Object>} Automation tests
 */
function extractAutomationTests(text, testType) {
    const pattern = new RegExp(`${testType}[\\s\\w]*test[s]?[\\s:]+(.*?)(?=\\n#{2,}|\\n\\n[A-Z]|$)`, 'gi');
    const tests = [];
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
        const content = match[1];
        const bullets = extractBulletPoints(content);
        
        for (const bullet of bullets.slice(0, 10)) {
            tests.push({
                name: bullet.substring(0, 100),
                type: testType,
                description: bullet,
                framework: extractTestFramework(content)
            });
        }
    }
    
    return tests;
}

/**
 * Extract testing tools mentioned
 * @param {string} text - Text content
 * @param {string} context - Context to look for specific tools
 * @returns {Array<string>} Testing tools
 */
function extractTestingTools(text, context = '') {
    const toolKeywords = [
        'Jest', 'Mocha', 'Jasmine', 'Cypress', 'Playwright', 'Selenium', 'Puppeteer',
        'JUnit', 'TestNG', 'pytest', 'RSpec', 'Cucumber', 'Postman', 'Newman',
        'JMeter', 'LoadRunner', 'k6', 'Artillery', 'OWASP ZAP', 'Burp Suite',
        'SonarQube', 'ESLint', 'Checkmarx', 'Snyk', 'axe', 'Lighthouse'
    ];
    
    const found = [];
    const lowerText = text.toLowerCase();
    
    for (const tool of toolKeywords) {
        if (lowerText.includes(tool.toLowerCase())) {
            found.push(tool);
        }
    }
    
    return [...new Set(found)];
}

/**
 * Extract test framework from text
 * @param {string} text - Text content
 * @returns {string} Test framework
 */
function extractTestFramework(text) {
    const frameworks = ['Jest', 'Mocha', 'Jasmine', 'pytest', 'JUnit', 'TestNG', 'RSpec'];
    const lowerText = text.toLowerCase();
    
    for (const framework of frameworks) {
        if (lowerText.includes(framework.toLowerCase())) {
            return framework;
        }
    }
    
    return 'Not specified';
}

/**
 * Extract requirements for a specific test type
 * @param {string} text - Text content
 * @param {string} testType - Type of test
 * @returns {Array<string>} Requirements
 */
function extractRequirements(text, testType) {
    const pattern = new RegExp(`${testType}[\\s\\w]*requirements?[:\\s]+(.*?)(?=\\n|\\.|;)`, 'gi');
    const requirements = [];
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
        requirements.push(match[1].trim());
    }
    
    return requirements;
}

/**
 * Extract procedures from text
 * @param {string} text - Text content
 * @returns {Array<string>} Procedures
 */
function extractProcedures(text) {
    const procedureKeywords = ['procedure', 'process', 'workflow', 'methodology'];
    const procedures = [];
    
    for (const keyword of procedureKeywords) {
        const pattern = new RegExp(`${keyword}[:\\s]+(.*?)(?=\\n|\\.|;)`, 'gi');
        let match;
        
        while ((match = pattern.exec(text)) !== null) {
            procedures.push(match[1].trim());
        }
    }
    
    return procedures;
}

/**
 * Extract classification information
 * @param {string} text - Text content
 * @returns {Array<Object>} Classification data
 */
function extractClassification(text) {
    const severityLevels = ['critical', 'high', 'medium', 'low'];
    const priorityLevels = ['p1', 'p2', 'p3', 'p4'];
    
    const classification = [];
    
    for (const severity of severityLevels) {
        if (text.toLowerCase().includes(severity)) {
            classification.push({
                type: 'severity',
                level: severity,
                description: `${severity.charAt(0).toUpperCase() + severity.slice(1)} severity issues`
            });
        }
    }
    
    for (const priority of priorityLevels) {
        if (text.toLowerCase().includes(priority)) {
            classification.push({
                type: 'priority',
                level: priority,
                description: `${priority.toUpperCase()} priority issues`
            });
        }
    }
    
    return classification;
}

/**
 * Extract metrics information
 * @param {string} text - Text content
 * @returns {Array<Object>} Metrics
 */
function extractMetrics(text) {
    const metricKeywords = [
        'coverage', 'defect rate', 'test execution', 'pass rate', 'automation',
        'cycle time', 'mean time', 'efficiency', 'quality gate'
    ];
    
    const metrics = [];
    const lowerText = text.toLowerCase();
    
    for (const metric of metricKeywords) {
        if (lowerText.includes(metric)) {
            metrics.push({
                name: metric,
                description: `${metric.charAt(0).toUpperCase() + metric.slice(1)} measurement`,
                target: 'TBD'
            });
        }
    }
    
    return metrics;
}

/**
 * Extract test environments
 * @param {string} text - Text content
 * @returns {Array<Object>} Environments
 */
function extractEnvironments(text) {
    const envKeywords = ['development', 'testing', 'staging', 'production', 'uat', 'integration'];
    const environments = [];
    const lowerText = text.toLowerCase();
    
    for (const env of envKeywords) {
        if (lowerText.includes(env)) {
            environments.push({
                name: env,
                purpose: `${env.charAt(0).toUpperCase() + env.slice(1)} environment`,
                configuration: 'Standard setup'
            });
        }
    }
    
    return environments;
}

/**
 * Extract monitoring information
 * @param {string} text - Text content
 * @returns {Array<string>} Monitoring items
 */
function extractMonitoring(text) {
    const monitoringKeywords = [
        'monitoring', 'observability', 'metrics', 'alerts', 'dashboards',
        'logging', 'tracing', 'health checks', 'uptime'
    ];
    
    const monitoring = [];
    const lowerText = text.toLowerCase();
    
    for (const keyword of monitoringKeywords) {
        if (lowerText.includes(keyword)) {
            monitoring.push(keyword);
        }
    }
    
    return [...new Set(monitoring)];
}

/**
 * Extract quality metrics from content
 * @param {string} content - Full content
 * @returns {Object} Quality metrics
 */
function extractQualityMetrics(content) {
    const metrics = {
        coverage_targets: {},
        performance_benchmarks: {},
        quality_gates: []
    };
    
    // Extract coverage targets
    const coveragePattern = /coverage[:\s]+(\d+)%/gi;
    let match;
    while ((match = coveragePattern.exec(content)) !== null) {
        metrics.coverage_targets.code_coverage = `${match[1]}%`;
    }
    
    // Extract performance benchmarks
    const perfPattern = /(?:response time|latency)[:\s]+(\d+)\s*ms/gi;
    while ((match = perfPattern.exec(content)) !== null) {
        metrics.performance_benchmarks.response_time = `${match[1]}ms`;
    }
    
    // Extract quality gates
    const gatePattern = /quality\s+gate[:\s]+(.+?)(?=\n|\.)/gi;
    while ((match = gatePattern.exec(content)) !== null) {
        metrics.quality_gates.push(match[1].trim());
    }
    
    return metrics;
}

/**
 * Analyze testing coverage and comprehensiveness
 * @param {Object} testing - Testing object
 * @returns {Object} Testing analysis
 */
function analyzeTestingCoverage(testing) {
    const analysis = {
        coverage: 'Unknown',
        completeness: 'Unknown',
        automationLevel: 'Unknown',
        testTypes: [],
        gaps: [],
        strengths: []
    };

    try {
        // Analyze functional test coverage
        const functionalTests = testing.functional_tests || [];
        if (functionalTests.length > 10) {
            analysis.strengths.push('Comprehensive functional test coverage');
        } else if (functionalTests.length > 5) {
            analysis.strengths.push('Good functional test coverage');
        } else if (functionalTests.length > 0) {
            analysis.gaps.push('Limited functional test coverage');
        } else {
            analysis.gaps.push('Missing functional tests');
        }

        // Analyze automation coverage
        const automation = testing.automation || {};
        const unitTests = automation.unit_tests || [];
        const integrationTests = automation.integration_tests || [];
        const e2eTests = automation.e2e_tests || [];
        
        const totalAutomatedTests = unitTests.length + integrationTests.length + e2eTests.length;
        
        if (totalAutomatedTests > 20) {
            analysis.automationLevel = 'High';
            analysis.strengths.push('Extensive test automation');
        } else if (totalAutomatedTests > 10) {
            analysis.automationLevel = 'Medium';
            analysis.strengths.push('Good test automation coverage');
        } else if (totalAutomatedTests > 0) {
            analysis.automationLevel = 'Low';
            analysis.gaps.push('Limited test automation');
        } else {
            analysis.automationLevel = 'None';
            analysis.gaps.push('Missing test automation');
        }

        // Analyze test types coverage
        const testTypes = new Set();
        if (unitTests.length > 0) testTypes.add('unit');
        if (integrationTests.length > 0) testTypes.add('integration');
        if (e2eTests.length > 0) testTypes.add('e2e');
        
        if (testing.non_functional_tests) {
            for (const nfTest of testing.non_functional_tests) {
                testTypes.add(nfTest.type);
            }
        }
        
        analysis.testTypes = Array.from(testTypes);
        
        // Determine overall coverage
        const requiredTypes = ['unit', 'integration', 'e2e', 'performance', 'security'];
        const coveredTypes = analysis.testTypes.filter(type => requiredTypes.includes(type));
        
        if (coveredTypes.length >= 4) {
            analysis.coverage = 'Comprehensive';
        } else if (coveredTypes.length >= 3) {
            analysis.coverage = 'Good';
        } else if (coveredTypes.length >= 2) {
            analysis.coverage = 'Basic';
        } else {
            analysis.coverage = 'Insufficient';
        }

        // Analyze completeness
        const hasStrategy = testing.strategy && testing.strategy.approach;
        const hasMetrics = testing.quality_metrics && Object.keys(testing.quality_metrics).length > 0;
        const hasInfrastructure = testing.infrastructure && testing.infrastructure.environments;
        
        if (hasStrategy && hasMetrics && hasInfrastructure && analysis.coverage === 'Comprehensive') {
            analysis.completeness = 'Complete';
        } else if (hasStrategy && (hasMetrics || hasInfrastructure) && analysis.coverage !== 'Insufficient') {
            analysis.completeness = 'Good';
        } else if (hasStrategy || hasMetrics || hasInfrastructure) {
            analysis.completeness = 'Partial';
        } else {
            analysis.completeness = 'Incomplete';
        }

        // Check for common gaps
        if (!analysis.testTypes.includes('security')) {
            analysis.gaps.push('Missing security testing');
        }
        if (!analysis.testTypes.includes('performance')) {
            analysis.gaps.push('Missing performance testing');
        }
        if (!analysis.testTypes.includes('accessibility')) {
            analysis.gaps.push('Missing accessibility testing');
        }

    } catch (error) {
        analysis.error = error.message;
    }

    return analysis;
}

// Export the definition
export default testerAgentDefinition;