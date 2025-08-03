/**
 * Planner Agent Definition
 * Specialized agent for creating technical specifications, architecture designs,
 * and detailed implementation roadmaps based on analyzed requirements.
 */

export const plannerAgentDefinition = {
    type: 'planner',
    name: 'Technical Planner',
    description: 'Creates detailed technical plans and implementation roadmaps',
    
    // Core prompt template
    promptTemplate: `You are a senior technical architect and project planner with extensive experience in software design and implementation planning. Your role is to create comprehensive technical plans and implementation roadmaps.

# Task
Create a detailed technical plan for the following requirements:

{{description}}

# Previous Analysis
{{previousResults}}

# Context
{{context}}

# Planning Instructions
Please provide a comprehensive technical plan with the following sections:

## 1. Technical Architecture
- System architecture overview and design principles
- Technology stack recommendations with justifications
- Integration patterns and data flow design
- Security and performance considerations

## 2. Implementation Plan
- Detailed development phases with milestones
- Task breakdown with estimated effort and dependencies
- Resource requirements and team structure
- Critical path analysis and risk mitigation

## 3. Technical Specifications
- Detailed functional specifications for each component
- API designs and data models
- User interface mockups and user experience flows
- Database schema and data management strategy

## 4. Quality Assurance Plan
- Testing strategy (unit, integration, e2e, performance)
- Code review processes and quality gates
- Continuous integration and deployment pipeline
- Monitoring and observability requirements

## 5. Infrastructure Plan
- Deployment architecture and environment strategy
- Scalability and disaster recovery planning
- Security controls and compliance requirements
- Operational procedures and maintenance plans

## 6. Project Timeline
- Detailed project schedule with dependencies
- Resource allocation and capacity planning
- Risk assessment and contingency planning
- Success metrics and acceptance criteria

## 7. Implementation Recommendations
- Development best practices and coding standards
- Technology choices and architectural decisions
- Team coordination and communication strategies
- Change management and deployment procedures

Please format your response as structured JSON with detailed technical specifications and actionable implementation guidance.`,

    // System prompt for consistent behavior
    systemPrompt: `You are a distinguished technical architect and planning expert with 20+ years of experience in enterprise software development. Your expertise includes:

- Designing scalable, maintainable software architectures
- Creating detailed implementation plans with accurate estimates
- Selecting optimal technology stacks for diverse requirements
- Balancing technical excellence with business constraints
- Leading cross-functional teams through complex implementations

You excel at translating business requirements into concrete technical solutions, creating realistic timelines, and anticipating implementation challenges. Always provide practical, implementable recommendations based on industry best practices and proven patterns.`,

    // Response schema for validation
    responseSchema: {
        required: ['architecture', 'implementation', 'specifications', 'timeline'],
        properties: {
            architecture: {
                type: 'object',
                required: ['overview', 'technology_stack', 'patterns', 'principles']
            },
            implementation: {
                type: 'object',
                required: ['phases', 'tasks', 'resources', 'risks']
            },
            specifications: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['component', 'specification', 'dependencies']
                }
            },
            timeline: {
                type: 'object',
                required: ['phases', 'milestones', 'critical_path', 'estimates']
            }
        }
    },

    // Processing configuration
    preferredModel: 'claude-sonnet-4-20250514',
    maxTokens: 6000,
    temperature: 0.2, // Very low temperature for technical precision
    
    // Context assembly preferences
    contextFilters: {
        type: 'planning',
        category: ['technical', 'architecture', 'implementation'],
        tags: ['planning', 'architecture', 'technical', 'specifications']
    },

    // Response processor function
    responseProcessor: async (result, request) => {
        try {
            // Try to parse as JSON first
            let parsed;
            try {
                parsed = JSON.parse(result.content);
            } catch (jsonError) {
                // If not JSON, extract structured information
                parsed = extractStructuredPlan(result.content);
            }

            // Calculate complexity and effort estimates
            const complexity = calculatePlanComplexity(parsed);
            
            return {
                ...result,
                plan: parsed,
                structured: true,
                complexity,
                metadata: {
                    ...result.metadata,
                    planType: 'technical',
                    complexity: complexity.level,
                    estimatedEffort: complexity.effort,
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
    resultCategory: 'planning',
    resultTags: ['planning', 'technical', 'architecture', 'structured'],

    // Execution preferences
    timeout: 60000, // 60 seconds for comprehensive planning
    maxRetries: 2,
    retryOnErrors: ['timeout', 'rate_limit', 'server_error']
};

/**
 * Extract structured plan from text response
 * @param {string} content - Response content
 * @returns {Object} Extracted structure
 */
function extractStructuredPlan(content) {
    const structure = {
        architecture: { overview: '', technology_stack: [], patterns: [], principles: [] },
        implementation: { phases: [], tasks: [], resources: [], risks: [] },
        specifications: [],
        timeline: { phases: [], milestones: [], critical_path: [], estimates: {} },
        extracted: true
    };

    try {
        // Extract sections using regex patterns
        const sections = {
            architecture: extractSection(content, 'Technical Architecture', 'Implementation Plan'),
            implementation: extractSection(content, 'Implementation Plan', 'Technical Specifications'),
            specifications: extractSection(content, 'Technical Specifications', 'Quality Assurance Plan'),
            qa: extractSection(content, 'Quality Assurance Plan', 'Infrastructure Plan'),
            infrastructure: extractSection(content, 'Infrastructure Plan', 'Project Timeline'),
            timeline: extractSection(content, 'Project Timeline', 'Implementation Recommendations'),
            recommendations: extractSection(content, 'Implementation Recommendations', null)
        };

        // Process architecture
        if (sections.architecture) {
            structure.architecture.overview = sections.architecture.substring(0, 800);
            structure.architecture.technology_stack = extractTechnologies(sections.architecture);
            structure.architecture.patterns = extractBulletPoints(sections.architecture);
            structure.architecture.principles = extractPrinciples(sections.architecture);
        }

        // Process implementation
        if (sections.implementation) {
            structure.implementation.phases = extractPhases(sections.implementation);
            structure.implementation.tasks = extractTasks(sections.implementation);
            structure.implementation.resources = extractResources(sections.implementation);
            structure.implementation.risks = extractRisks(sections.implementation);
        }

        // Process specifications
        if (sections.specifications) {
            structure.specifications = extractSpecifications(sections.specifications);
        }

        // Process timeline
        if (sections.timeline) {
            structure.timeline.phases = extractPhases(sections.timeline);
            structure.timeline.milestones = extractMilestones(sections.timeline);
            structure.timeline.critical_path = extractCriticalPath(sections.timeline);
            structure.timeline.estimates = extractEstimates(sections.timeline);
        }

    } catch (error) {
        // If extraction fails, return basic structure
        structure.extractionError = error.message;
        structure.rawContent = content.substring(0, 1000);
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
 * Extract technology stack mentions
 * @param {string} text - Text content
 * @returns {Array<string>} Technologies
 */
function extractTechnologies(text) {
    const techKeywords = [
        'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'C#', 'Go', 'Rust',
        'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes',
        'AWS', 'Azure', 'GCP', 'TypeScript', 'JavaScript', 'HTML', 'CSS',
        'GraphQL', 'REST', 'WebSocket', 'Microservices', 'Serverless'
    ];
    
    const found = [];
    const lowerText = text.toLowerCase();
    
    for (const tech of techKeywords) {
        if (lowerText.includes(tech.toLowerCase())) {
            found.push(tech);
        }
    }
    
    return [...new Set(found)]; // Remove duplicates
}

/**
 * Extract architectural principles
 * @param {string} text - Text content
 * @returns {Array<string>} Principles
 */
function extractPrinciples(text) {
    const principleKeywords = [
        'SOLID', 'DRY', 'KISS', 'YAGNI', 'Separation of Concerns',
        'Single Responsibility', 'Open/Closed', 'Liskov Substitution',
        'Interface Segregation', 'Dependency Inversion', 'Scalability',
        'Maintainability', 'Security', 'Performance', 'Reliability'
    ];
    
    const found = [];
    const lowerText = text.toLowerCase();
    
    for (const principle of principleKeywords) {
        if (lowerText.includes(principle.toLowerCase())) {
            found.push(principle);
        }
    }
    
    return [...new Set(found)];
}

/**
 * Extract implementation phases
 * @param {string} text - Text content
 * @returns {Array<Object>} Phases
 */
function extractPhases(text) {
    const phasePattern = /phase\s+(\d+|[ivx]+|one|two|three|four|five)[:.]?\s*(.+?)(?=phase|\n\n|$)/gi;
    const phases = [];
    let match;
    
    while ((match = phasePattern.exec(text)) !== null) {
        phases.push({
            number: match[1],
            description: match[2].trim().substring(0, 200),
            tasks: extractBulletPoints(match[2])
        });
    }
    
    return phases;
}

/**
 * Extract tasks with estimates
 * @param {string} text - Text content
 * @returns {Array<Object>} Tasks
 */
function extractTasks(text) {
    const taskPattern = /^[\s]*[-*•]\s*(.+?)(?:\s*\((\d+\.?\d*)\s*(hours?|days?|weeks?)\))?/gm;
    const tasks = [];
    let match;
    
    while ((match = taskPattern.exec(text)) !== null) {
        const task = {
            name: match[1].trim(),
            estimate: match[2] ? parseFloat(match[2]) : null,
            unit: match[3] || null
        };
        
        if (task.name.length > 10) { // Filter out very short items
            tasks.push(task);
        }
    }
    
    return tasks;
}

/**
 * Extract resource requirements
 * @param {string} text - Text content
 * @returns {Array<Object>} Resources
 */
function extractResources(text) {
    const roleKeywords = [
        'Developer', 'Engineer', 'Architect', 'Designer', 'Manager',
        'Tester', 'DevOps', 'Frontend', 'Backend', 'Fullstack'
    ];
    
    const resources = [];
    const lowerText = text.toLowerCase();
    
    for (const role of roleKeywords) {
        if (lowerText.includes(role.toLowerCase())) {
            const pattern = new RegExp(`(\\d+)\\s*${role.toLowerCase()}`, 'i');
            const match = text.match(pattern);
            resources.push({
                role: role,
                count: match ? parseInt(match[1]) : 1,
                required: true
            });
        }
    }
    
    return resources;
}

/**
 * Extract risk items
 * @param {string} text - Text content
 * @returns {Array<Object>} Risks
 */
function extractRisks(text) {
    const riskKeywords = ['risk', 'challenge', 'issue', 'concern', 'blocker'];
    const risks = [];
    
    for (const keyword of riskKeywords) {
        const pattern = new RegExp(`${keyword}[s]?:?\\s*(.+?)(?=\\n|\\.|,|;)`, 'gi');
        let match;
        
        while ((match = pattern.exec(text)) !== null) {
            risks.push({
                description: match[1].trim().substring(0, 150),
                severity: 'Medium', // Default
                mitigation: 'Requires analysis'
            });
        }
    }
    
    return risks.slice(0, 10); // Limit to top 10 risks
}

/**
 * Extract component specifications
 * @param {string} text - Text content
 * @returns {Array<Object>} Specifications
 */
function extractSpecifications(text) {
    const componentPattern = /#{3,4}\s*(.+?)\n([\s\S]+?)(?=#{3,4}|$)/g;
    const specifications = [];
    let match;
    
    while ((match = componentPattern.exec(text)) !== null) {
        specifications.push({
            component: match[1].trim(),
            specification: match[2].trim().substring(0, 500),
            dependencies: extractBulletPoints(match[2])
        });
    }
    
    return specifications;
}

/**
 * Extract milestones
 * @param {string} text - Text content
 * @returns {Array<Object>} Milestones
 */
function extractMilestones(text) {
    const milestonePattern = /milestone[:.]?\s*(.+?)(?=milestone|\n\n|$)/gi;
    const milestones = [];
    let match;
    
    while ((match = milestonePattern.exec(text)) !== null) {
        milestones.push({
            name: match[1].trim().substring(0, 100),
            description: match[1].trim()
        });
    }
    
    return milestones;
}

/**
 * Extract critical path items
 * @param {string} text - Text content
 * @returns {Array<string>} Critical path items
 */
function extractCriticalPath(text) {
    const criticalKeywords = ['critical', 'blocking', 'dependency', 'prerequisite'];
    const items = [];
    
    for (const keyword of criticalKeywords) {
        const pattern = new RegExp(`${keyword}[^.\\n]*`, 'gi');
        const matches = text.match(pattern);
        if (matches) {
            items.push(...matches.map(m => m.trim().substring(0, 100)));
        }
    }
    
    return [...new Set(items)]; // Remove duplicates
}

/**
 * Extract time estimates
 * @param {string} text - Text content
 * @returns {Object} Estimates
 */
function extractEstimates(text) {
    const timePattern = /(\d+\.?\d*)\s*(hours?|days?|weeks?|months?)/gi;
    const estimates = { total: 0, breakdown: [] };
    let match;
    
    while ((match = timePattern.exec(text)) !== null) {
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        
        estimates.breakdown.push({ value, unit });
        
        // Convert to hours for total
        let hours = value;
        if (unit.includes('day')) hours *= 8;
        else if (unit.includes('week')) hours *= 40;
        else if (unit.includes('month')) hours *= 160;
        
        estimates.total += hours;
    }
    
    return estimates;
}

/**
 * Calculate plan complexity metrics
 * @param {Object} plan - Structured plan
 * @returns {Object} Complexity analysis
 */
function calculatePlanComplexity(plan) {
    let complexity = 0;
    let effort = 0;
    
    try {
        // Count components and specifications
        if (plan.specifications && Array.isArray(plan.specifications)) {
            complexity += plan.specifications.length * 2;
        }
        
        // Count implementation tasks
        if (plan.implementation && plan.implementation.tasks) {
            complexity += plan.implementation.tasks.length;
            
            // Sum effort estimates
            for (const task of plan.implementation.tasks) {
                if (task.estimate) {
                    let hours = task.estimate;
                    if (task.unit && task.unit.includes('day')) hours *= 8;
                    else if (task.unit && task.unit.includes('week')) hours *= 40;
                    effort += hours;
                }
            }
        }
        
        // Count technology stack complexity
        if (plan.architecture && plan.architecture.technology_stack) {
            complexity += plan.architecture.technology_stack.length;
        }
        
        // Count phases
        if (plan.timeline && plan.timeline.phases) {
            complexity += plan.timeline.phases.length;
        }
        
        // Determine complexity level
        let level = 'Simple';
        if (complexity > 20) level = 'Complex';
        else if (complexity > 10) level = 'Medium';
        
        return { level, score: complexity, effort: effort || 'Unknown' };
        
    } catch (error) {
        return { level: 'Unknown', score: 0, effort: 0, error: error.message };
    }
}

// Export the definition
export default plannerAgentDefinition;