/**
 * Developer Agent Definition
 * Specialized agent for generating production-ready code following modern
 * development standards and best practices.
 */

export const developerAgentDefinition = {
    type: 'developer',
    name: 'Code Developer',
    description: 'Generates high-quality, production-ready code with comprehensive documentation',
    
    // Core prompt template
    promptTemplate: `You are a senior software engineer with extensive experience in modern development practices, clean code principles, and production-ready software development. Your role is to implement high-quality code based on technical specifications.

# Implementation Task
Implement the following based on the technical plan and specifications:

{{description}}

# Technical Plan
{{previousResults}}

# Context
{{context}}

# Implementation Requirements
Please provide a comprehensive implementation with the following components:

## 1. Code Implementation
- Write clean, maintainable, and well-documented code
- Follow established patterns and best practices for the chosen technology stack
- Implement proper error handling and validation
- Include comprehensive inline documentation and comments
- Ensure code is production-ready and follows security best practices

## 2. Architecture Implementation
- Implement the planned architecture patterns and principles
- Create proper separation of concerns and modularity
- Follow SOLID principles and design patterns where appropriate
- Implement proper interfaces and abstractions
- Ensure scalability and performance considerations

## 3. Data Models and APIs
- Implement data models with proper validation and constraints
- Create RESTful or GraphQL APIs as specified
- Implement proper request/response handling
- Add authentication and authorization where required
- Include proper error responses and status codes

## 4. Testing Implementation
- Write comprehensive unit tests with good coverage
- Implement integration tests for critical workflows
- Include end-to-end tests for user scenarios
- Add performance and load testing where appropriate
- Ensure all tests are maintainable and well-documented

## 5. Configuration and Infrastructure
- Implement configuration management (environment variables, config files)
- Add logging, monitoring, and observability
- Include deployment scripts and infrastructure as code
- Implement security measures (encryption, authentication, authorization)
- Add database migrations and seed data

## 6. Documentation
- Create comprehensive README with setup instructions
- Document API endpoints with examples
- Include architecture diagrams and code structure
- Add contributing guidelines and development setup
- Create user documentation and deployment guides

## 7. Quality Assurance
- Implement code quality tools (linters, formatters, type checkers)
- Add continuous integration and deployment workflows
- Include security scanning and dependency management
- Implement code review guidelines and pull request templates
- Add performance monitoring and alerting

Please format your response as structured code packages with clear organization and include all necessary files for a production deployment.`,

    // System prompt for consistent behavior
    systemPrompt: `You are a world-class software engineer with 15+ years of experience in building scalable, maintainable production systems. Your expertise spans:

- Full-stack development across multiple languages and frameworks
- Clean architecture principles and design patterns
- Test-driven development and comprehensive testing strategies
- DevOps practices and production deployment
- Security best practices and performance optimization
- Code review and mentoring of development teams

You write code that is:
- Clean, readable, and self-documenting
- Robust with proper error handling and validation
- Scalable and performant
- Secure and following best practices
- Well-tested with comprehensive coverage
- Production-ready with proper monitoring and logging

Always provide complete, working implementations that follow industry standards and can be deployed to production environments.`,

    // Response schema for validation
    responseSchema: {
        required: ['implementation', 'architecture', 'testing', 'documentation'],
        properties: {
            implementation: {
                type: 'object',
                required: ['files', 'structure', 'dependencies']
            },
            architecture: {
                type: 'object',
                required: ['patterns', 'components', 'interfaces']
            },
            testing: {
                type: 'object',
                required: ['unit_tests', 'integration_tests', 'coverage']
            },
            documentation: {
                type: 'object',
                required: ['readme', 'api_docs', 'setup_guide']
            }
        }
    },

    // Processing configuration
    preferredModel: 'claude-sonnet-4-20250514',
    maxTokens: 8000,
    temperature: 0.1, // Very low temperature for code precision
    
    // Context assembly preferences
    contextFilters: {
        type: 'development',
        category: ['code', 'implementation', 'technical'],
        tags: ['development', 'code', 'implementation', 'production']
    },

    // Response processor function
    responseProcessor: async (result, request) => {
        try {
            // Try to parse as JSON first
            let parsed;
            try {
                parsed = JSON.parse(result.content);
            } catch (jsonError) {
                // If not JSON, extract structured code
                parsed = extractStructuredCode(result.content);
            }

            // Analyze code quality and complexity
            const codeAnalysis = analyzeCodeImplementation(parsed);
            
            return {
                ...result,
                implementation: parsed,
                structured: true,
                codeAnalysis,
                metadata: {
                    ...result.metadata,
                    implementationType: 'code',
                    complexity: codeAnalysis.complexity,
                    quality: codeAnalysis.quality,
                    testCoverage: codeAnalysis.testCoverage,
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
    resultCategory: 'implementation',
    resultTags: ['development', 'code', 'implementation', 'structured'],

    // Execution preferences
    timeout: 90000, // 90 seconds for comprehensive code generation
    maxRetries: 2,
    retryOnErrors: ['timeout', 'rate_limit', 'server_error']
};

/**
 * Extract structured code from text response
 * @param {string} content - Response content
 * @returns {Object} Extracted structure
 */
function extractStructuredCode(content) {
    const structure = {
        implementation: { files: [], structure: '', dependencies: [] },
        architecture: { patterns: [], components: [], interfaces: [] },
        testing: { unit_tests: [], integration_tests: [], coverage: 'Unknown' },
        documentation: { readme: '', api_docs: '', setup_guide: '' },
        extracted: true
    };

    try {
        // Extract code blocks
        const codeBlocks = extractCodeBlocks(content);
        structure.implementation.files = codeBlocks;

        // Extract sections
        const sections = {
            implementation: extractSection(content, 'Code Implementation', 'Architecture Implementation'),
            architecture: extractSection(content, 'Architecture Implementation', 'Data Models and APIs'),
            apis: extractSection(content, 'Data Models and APIs', 'Testing Implementation'),
            testing: extractSection(content, 'Testing Implementation', 'Configuration and Infrastructure'),
            config: extractSection(content, 'Configuration and Infrastructure', 'Documentation'),
            documentation: extractSection(content, 'Documentation', 'Quality Assurance'),
            qa: extractSection(content, 'Quality Assurance', null)
        };

        // Process architecture
        if (sections.architecture) {
            structure.architecture.patterns = extractPatterns(sections.architecture);
            structure.architecture.components = extractComponents(sections.architecture);
            structure.architecture.interfaces = extractInterfaces(sections.architecture);
        }

        // Process testing
        if (sections.testing) {
            structure.testing.unit_tests = extractTestFiles(sections.testing, 'unit');
            structure.testing.integration_tests = extractTestFiles(sections.testing, 'integration');
            structure.testing.coverage = extractCoverage(sections.testing);
        }

        // Process documentation
        if (sections.documentation) {
            structure.documentation.readme = extractReadme(sections.documentation);
            structure.documentation.api_docs = extractApiDocs(sections.documentation);
            structure.documentation.setup_guide = extractSetupGuide(sections.documentation);
        }

        // Extract dependencies
        structure.implementation.dependencies = extractDependencies(content);
        
        // Extract project structure
        structure.implementation.structure = extractProjectStructure(content);

    } catch (error) {
        // If extraction fails, return basic structure
        structure.extractionError = error.message;
        structure.rawContent = content.substring(0, 2000);
    }

    return structure;
}

/**
 * Extract code blocks from content
 * @param {string} content - Content to extract from
 * @returns {Array<Object>} Code blocks with metadata
 */
function extractCodeBlocks(content) {
    const codeBlockPattern = /```(\w+)?\s*(?:\/\/\s*(.+?)\n)?([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;

    while ((match = codeBlockPattern.exec(content)) !== null) {
        const language = match[1] || 'text';
        const filename = match[2] || `file_${codeBlocks.length + 1}.${getExtensionForLanguage(language)}`;
        const code = match[3].trim();

        if (code.length > 10) { // Filter out very short blocks
            codeBlocks.push({
                filename,
                language,
                code,
                lines: code.split('\n').length,
                size: code.length
            });
        }
    }

    return codeBlocks;
}

/**
 * Get file extension for programming language
 * @param {string} language - Programming language
 * @returns {string} File extension
 */
function getExtensionForLanguage(language) {
    const extensions = {
        'javascript': 'js',
        'typescript': 'ts',
        'python': 'py',
        'java': 'java',
        'csharp': 'cs',
        'go': 'go',
        'rust': 'rs',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'yaml': 'yml',
        'sql': 'sql',
        'bash': 'sh',
        'dockerfile': 'dockerfile'
    };
    
    return extensions[language.toLowerCase()] || 'txt';
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
 * Extract architectural patterns mentioned
 * @param {string} text - Text content
 * @returns {Array<string>} Patterns
 */
function extractPatterns(text) {
    const patternKeywords = [
        'MVC', 'MVP', 'MVVM', 'Repository', 'Factory', 'Singleton', 'Observer',
        'Strategy', 'Command', 'Decorator', 'Adapter', 'Facade', 'Proxy',
        'Microservices', 'Monolith', 'Layered', 'Hexagonal', 'Clean Architecture',
        'Domain-Driven Design', 'CQRS', 'Event Sourcing'
    ];
    
    const found = [];
    const lowerText = text.toLowerCase();
    
    for (const pattern of patternKeywords) {
        if (lowerText.includes(pattern.toLowerCase())) {
            found.push(pattern);
        }
    }
    
    return [...new Set(found)];
}

/**
 * Extract components from architecture description
 * @param {string} text - Text content
 * @returns {Array<Object>} Components
 */
function extractComponents(text) {
    const componentPattern = /(?:component|module|service|class|interface)[\s:]+([A-Z][A-Za-z0-9_]+)/gi;
    const components = [];
    let match;

    while ((match = componentPattern.exec(text)) !== null) {
        components.push({
            name: match[1],
            type: match[0].split(/[\s:]/)[0].toLowerCase()
        });
    }

    return components.slice(0, 20); // Limit to 20 components
}

/**
 * Extract interfaces from architecture description
 * @param {string} text - Text content
 * @returns {Array<string>} Interfaces
 */
function extractInterfaces(text) {
    const interfacePattern = /interface\s+([A-Z][A-Za-z0-9_]+)/gi;
    const interfaces = [];
    let match;

    while ((match = interfacePattern.exec(text)) !== null) {
        interfaces.push(match[1]);
    }

    return interfaces;
}

/**
 * Extract test files from testing section
 * @param {string} text - Text content
 * @param {string} testType - Type of tests to extract
 * @returns {Array<Object>} Test files
 */
function extractTestFiles(text, testType) {
    const testPattern = new RegExp(`${testType}[\\s\\w]*test[s]?[\\s:]+([\\w.-]+)`, 'gi');
    const tests = [];
    let match;

    while ((match = testPattern.exec(text)) !== null) {
        tests.push({
            filename: match[1],
            type: testType,
            description: `${testType} test file`
        });
    }

    return tests;
}

/**
 * Extract test coverage information
 * @param {string} text - Text content
 * @returns {string} Coverage information
 */
function extractCoverage(text) {
    const coveragePattern = /coverage[:\s]+(\d+%|\d+\.\d+%|high|medium|low|comprehensive|partial)/i;
    const match = text.match(coveragePattern);
    return match ? match[1] : 'Not specified';
}

/**
 * Extract README content
 * @param {string} text - Text content
 * @returns {string} README content
 */
function extractReadme(text) {
    const readmePattern = /readme[:\s]+([\s\S]*?)(?=\n#{2,}|\n\n[A-Z]|$)/i;
    const match = text.match(readmePattern);
    return match ? match[1].trim().substring(0, 500) : 'README documentation needed';
}

/**
 * Extract API documentation
 * @param {string} text - Text content
 * @returns {string} API docs content
 */
function extractApiDocs(text) {
    const apiPattern = /api[:\s]+([\s\S]*?)(?=\n#{2,}|\n\n[A-Z]|$)/i;
    const match = text.match(apiPattern);
    return match ? match[1].trim().substring(0, 500) : 'API documentation needed';
}

/**
 * Extract setup guide
 * @param {string} text - Text content
 * @returns {string} Setup guide content
 */
function extractSetupGuide(text) {
    const setupPattern = /setup[:\s]+([\s\S]*?)(?=\n#{2,}|\n\n[A-Z]|$)/i;
    const match = text.match(setupPattern);
    return match ? match[1].trim().substring(0, 500) : 'Setup guide needed';
}

/**
 * Extract dependencies from content
 * @param {string} content - Full content
 * @returns {Array<string>} Dependencies
 */
function extractDependencies(content) {
    const dependencyPatterns = [
        /npm install\s+([\w-@/\s.]+)/g,
        /pip install\s+([\w-\s.]+)/g,
        /yarn add\s+([\w-@/\s.]+)/g,
        /import\s+.+\s+from\s+['"]([\w-@/]+)['"]/g,
        /require\(['"]([\w-@/]+)['"]\)/g
    ];

    const dependencies = new Set();

    for (const pattern of dependencyPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const deps = match[1].split(/\s+/).filter(dep => 
                dep.length > 1 && !dep.includes('.') && !dep.startsWith('.')
            );
            deps.forEach(dep => dependencies.add(dep));
        }
    }

    return Array.from(dependencies).slice(0, 50); // Limit to 50 dependencies
}

/**
 * Extract project structure
 * @param {string} content - Full content
 * @returns {string} Project structure
 */
function extractProjectStructure(content) {
    const structurePattern = /```\s*(?:tree|structure|directory|folder)\s*([\s\S]*?)```/i;
    const match = content.match(structurePattern);
    
    if (match) {
        return match[1].trim();
    }

    // Try to extract from file listings
    const filePattern = /(?:src\/|app\/|lib\/|components\/)[\w./]+/g;
    const files = content.match(filePattern);
    
    if (files && files.length > 0) {
        return files.slice(0, 20).join('\n');
    }

    return 'Project structure not specified';
}

/**
 * Analyze code implementation for quality metrics
 * @param {Object} implementation - Implementation object
 * @returns {Object} Code analysis
 */
function analyzeCodeImplementation(implementation) {
    const analysis = {
        complexity: 'Unknown',
        quality: 'Unknown',
        testCoverage: 'Unknown',
        fileCount: 0,
        totalLines: 0,
        languages: [],
        patterns: [],
        issues: []
    };

    try {
        if (implementation.implementation && implementation.implementation.files) {
            const files = implementation.implementation.files;
            analysis.fileCount = files.length;
            
            // Calculate total lines and languages
            const languageSet = new Set();
            let totalLines = 0;
            
            for (const file of files) {
                totalLines += file.lines || 0;
                if (file.language) {
                    languageSet.add(file.language);
                }
            }
            
            analysis.totalLines = totalLines;
            analysis.languages = Array.from(languageSet);
            
            // Determine complexity based on file count and lines
            if (files.length > 20 || totalLines > 2000) {
                analysis.complexity = 'High';
            } else if (files.length > 10 || totalLines > 500) {
                analysis.complexity = 'Medium';
            } else {
                analysis.complexity = 'Low';
            }
            
            // Assess quality based on structure and patterns
            if (implementation.architecture && implementation.architecture.patterns) {
                analysis.patterns = implementation.architecture.patterns;
                
                if (analysis.patterns.length > 3) {
                    analysis.quality = 'High';
                } else if (analysis.patterns.length > 1) {
                    analysis.quality = 'Medium';
                } else {
                    analysis.quality = 'Basic';
                }
            }
            
            // Check test coverage
            if (implementation.testing) {
                const unitTests = implementation.testing.unit_tests || [];
                const integrationTests = implementation.testing.integration_tests || [];
                const testCount = unitTests.length + integrationTests.length;
                
                if (testCount > files.length * 0.8) {
                    analysis.testCoverage = 'High';
                } else if (testCount > files.length * 0.5) {
                    analysis.testCoverage = 'Medium';
                } else if (testCount > 0) {
                    analysis.testCoverage = 'Low';
                } else {
                    analysis.testCoverage = 'None';
                    analysis.issues.push('Missing test coverage');
                }
            }
            
            // Check for documentation
            if (!implementation.documentation || 
                !implementation.documentation.readme) {
                analysis.issues.push('Missing documentation');
            }
            
            // Check for dependencies
            if (!implementation.implementation.dependencies || 
                implementation.implementation.dependencies.length === 0) {
                analysis.issues.push('No dependencies specified');
            }
        }
        
    } catch (error) {
        analysis.error = error.message;
    }

    return analysis;
}

// Export the definition
export default developerAgentDefinition;