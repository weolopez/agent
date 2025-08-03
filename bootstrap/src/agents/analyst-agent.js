/**
 * Analyst Agent Definition
 * Specialized agent for analyzing requirements, identifying challenges,
 * and breaking down complex problems into manageable components.
 */

export const analystAgentDefinition = {
    type: 'analyst',
    name: 'Requirements Analyst',
    description: 'Analyzes business requirements and identifies technical challenges',
    
    // Core prompt template
    promptTemplate: `You are a senior business analyst and requirements engineer with deep technical knowledge. Your role is to analyze requirements, identify challenges, and provide structured analysis.

# Task
Analyze the following requirement and provide a comprehensive analysis:

{{description}}

# Context
{{context}}

# Analysis Instructions
Please provide a structured analysis with the following sections:

## 1. Requirements Summary
- Summarize the core requirements in clear, concise language
- Identify the primary objectives and success criteria

## 2. Stakeholder Analysis
- Identify key stakeholders and their concerns
- Analyze potential impacts on different user groups

## 3. Technical Challenges
- Identify technical complexities and potential roadblocks
- Assess feasibility and risk factors
- Highlight any architectural considerations

## 4. Functional Breakdown
- Break down the requirement into specific functional components
- Identify dependencies between components
- Suggest logical implementation phases

## 5. Non-Functional Requirements
- Identify performance, security, and scalability requirements
- Consider usability and accessibility needs
- Address compliance and regulatory considerations

## 6. Risk Assessment
- Identify potential risks and mitigation strategies
- Assess timeline and resource implications
- Highlight critical decision points

## 7. Recommendations
- Provide clear recommendations for next steps
- Suggest alternative approaches if applicable
- Identify areas requiring further investigation

Please format your response as structured JSON with clear sections and actionable insights.`,

    // System prompt for consistent behavior
    systemPrompt: `You are an expert business analyst with 15+ years of experience in requirements analysis, system design, and project management. You excel at:

- Breaking down complex business requirements into manageable components
- Identifying hidden dependencies and potential risks
- Translating business needs into technical specifications
- Providing actionable recommendations based on industry best practices

Always provide thorough, well-structured analysis that helps stakeholders make informed decisions. Be precise, practical, and forward-thinking in your recommendations.`,

    // Response schema for validation
    responseSchema: {
        required: ['summary', 'challenges', 'breakdown', 'recommendations'],
        properties: {
            summary: {
                type: 'object',
                required: ['objectives', 'stakeholders', 'scope']
            },
            challenges: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['challenge', 'impact', 'mitigation']
                }
            },
            breakdown: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['component', 'description', 'dependencies']
                }
            },
            recommendations: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['recommendation', 'rationale', 'priority']
                }
            }
        }
    },

    // Processing configuration
    preferredModel: 'claude-sonnet-4-20250514',
    maxTokens: 4000,
    temperature: 0.3, // Lower temperature for analytical consistency
    
    // Context assembly preferences
    contextFilters: {
        type: 'analysis',
        category: ['requirements', 'technical', 'business'],
        tags: ['analysis', 'planning', 'requirements']
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
                parsed = extractStructuredAnalysis(result.content);
            }

            return {
                ...result,
                analysis: parsed,
                structured: true,
                metadata: {
                    ...result.metadata,
                    analysisType: 'requirements',
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
    resultCategory: 'analysis',
    resultTags: ['analysis', 'requirements', 'structured'],

    // Execution preferences
    timeout: 45000, // 45 seconds for thorough analysis
    maxRetries: 2,
    retryOnErrors: ['timeout', 'rate_limit', 'server_error']
};

/**
 * Extract structured analysis from text response
 * @param {string} content - Response content
 * @returns {Object} Extracted structure
 */
function extractStructuredAnalysis(content) {
    const structure = {
        summary: { objectives: [], stakeholders: [], scope: '' },
        challenges: [],
        breakdown: [],
        recommendations: [],
        extracted: true
    };

    try {
        // Extract sections using regex patterns
        const sections = {
            summary: extractSection(content, 'Requirements Summary', 'Stakeholder Analysis'),
            stakeholders: extractSection(content, 'Stakeholder Analysis', 'Technical Challenges'),
            challenges: extractSection(content, 'Technical Challenges', 'Functional Breakdown'),
            breakdown: extractSection(content, 'Functional Breakdown', 'Non-Functional Requirements'),
            nonFunctional: extractSection(content, 'Non-Functional Requirements', 'Risk Assessment'),
            risks: extractSection(content, 'Risk Assessment', 'Recommendations'),
            recommendations: extractSection(content, 'Recommendations', null)
        };

        // Process summary
        if (sections.summary) {
            structure.summary.scope = sections.summary.substring(0, 500);
            structure.summary.objectives = extractBulletPoints(sections.summary);
        }

        // Process stakeholders
        if (sections.stakeholders) {
            structure.summary.stakeholders = extractBulletPoints(sections.stakeholders);
        }

        // Process challenges
        if (sections.challenges) {
            const challengePoints = extractBulletPoints(sections.challenges);
            structure.challenges = challengePoints.map(challenge => ({
                challenge: challenge.substring(0, 200),
                impact: 'Medium', // Default impact
                mitigation: 'Requires further analysis'
            }));
        }

        // Process breakdown
        if (sections.breakdown) {
            const breakdownPoints = extractBulletPoints(sections.breakdown);
            structure.breakdown = breakdownPoints.map(component => ({
                component: component.split(':')[0] || component.substring(0, 100),
                description: component.substring(0, 300),
                dependencies: []
            }));
        }

        // Process recommendations
        if (sections.recommendations) {
            const recommendationPoints = extractBulletPoints(sections.recommendations);
            structure.recommendations = recommendationPoints.map(rec => ({
                recommendation: rec.substring(0, 200),
                rationale: 'Based on analysis',
                priority: 'Medium'
            }));
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
    
    // If no bullet points found, try numbered lists
    if (matches.length === 0) {
        const numberedPattern = /^[\s]*\d+[\.)]\s*(.+)$/gm;
        while ((match = numberedPattern.exec(text)) !== null) {
            if (match[1].trim()) {
                matches.push(match[1].trim());
            }
        }
    }
    
    return matches;
}

// Export the definition
export default analystAgentDefinition;