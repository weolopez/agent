export class PromptEngine {
    constructor(config, logger, cacheManager) {
        this.config = config;
        this.logger = logger;
        this.cache = cacheManager;
        
        // Template registry
        this.templates = new Map();
        this.registerDefaultTemplates();
        
        // Context builders
        this.contextBuilders = new Map();
        this.registerDefaultContextBuilders();
        
        // Prompt optimization settings
        this.optimization = {
            maxLength: 8000,
            prioritizeRecent: true,
            includeExamples: true,
            adaptToModel: true
        };
    }

    registerDefaultTemplates() {
        // Analysis operation template
        this.templates.set('analysis', {
            system: `You are an expert analyst specializing in {{domain}} analysis.

Your role: {{agentPersonality}}

Capabilities:
{{#each capabilities}}
- {{this}}
{{/each}}

Context Memory:
{{#if semanticMemory}}
Relevant Knowledge:
{{#each semanticMemory}}
- {{this.data.summary}} (Relevance: {{this.relevance}})
{{/each}}
{{/if}}

{{#if proceduralMemory}}
Available Procedures:
{{#each proceduralMemory}}
- {{this.procedure.name}}: {{this.procedure.description}} (Success Rate: {{this.success_rate}})
{{/each}}
{{/if}}

Your task is to perform thorough analysis. Structure your response with:
1. **Summary**: Key findings overview
2. **Analysis**: Detailed examination
3. **Insights**: Important patterns or trends
4. **Recommendations**: Actionable next steps
5. **Confidence**: Rate your confidence (0-100%)`,

            user: `Please analyze the following:

{{#if context.requirements}}
Requirements: {{context.requirements}}
{{/if}}

{{#if context.data}}
Data:
{{context.data}}
{{/if}}

{{#if context.constraints}}
Constraints:
{{#each context.constraints}}
- {{this}}
{{/each}}
{{/if}}

Focus on: {{context.focusAreas}}`
        });

        // Planning operation template
        this.templates.set('planning', {
            system: `You are a strategic planning expert with expertise in {{domain}}.

Agent Profile: {{agentPersonality}}

Your Planning Capabilities:
{{#each capabilities}}
- {{this}}
{{/each}}

{{#if episodicMemory}}
Relevant Past Experiences:
{{#each episodicMemory}}
- {{this.experience.summary}} ({{this.age}} ago, Success: {{this.experience.success}})
{{/each}}
{{/if}}

{{#if proceduralMemory}}
Proven Procedures:
{{#each proceduralMemory}}
- {{this.procedure.name}}: {{this.procedure.steps.length}} steps ({{this.success_rate}}% success)
{{/each}}
{{/if}}

Create detailed, executable plans with:
1. Clear goal definition
2. Step-by-step breakdown
3. Dependencies and sequencing
4. Resource requirements
5. Risk assessment
6. Success metrics`,

            user: `Create a plan for:

Goal: {{context.goal}}

{{#if context.constraints}}
Constraints:
{{#each context.constraints}}
- {{this}}
{{/each}}
{{/if}}

{{#if context.resources}}
Available Resources:
{{#each context.resources}}
- {{this}}
{{/each}}
{{/if}}

{{#if context.timeline}}
Timeline: {{context.timeline}}
{{/if}}

{{#if context.priority}}
Priority: {{context.priority}}
{{/if}}`
        });

        // Execution operation template
        this.templates.set('execution', {
            system: `You are an execution specialist focused on {{domain}} implementation.

Profile: {{agentPersonality}}

Execution Capabilities:
{{#each capabilities}}
- {{this}}
{{/each}}

{{#if workingMemory}}
Current Task Context:
- Task ID: {{workingMemory.taskId}}
- Current State: {{workingMemory.currentState}}
- Progress: {{workingMemory.progress}}
- Variables: {{workingMemory.variables}}
{{/if}}

{{#if proceduralMemory}}
Available Procedures:
{{#each proceduralMemory}}
- {{this.procedure.name}}: {{this.procedure.description}}
  Steps: {{#each this.procedure.steps}}{{@index}}. {{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}
{{/if}}

Your role is to execute plans effectively. Provide:
1. **Action Plan**: Specific steps to take
2. **Tool Usage**: Which tools to use and how
3. **Quality Checks**: How to verify success
4. **Next Steps**: What to do after completion`,

            user: `Execute this task:

{{context.task}}

{{#if context.plan}}
Based on this plan: {{context.plan}}
{{/if}}

{{#if context.currentStep}}
Current Step: {{context.currentStep}}
{{/if}}

{{#if context.availableTools}}
Available Tools:
{{#each context.availableTools}}
- {{this.name}}: {{this.description}}
{{/each}}
{{/if}}`
        });

        // Business requirements analysis template
        this.templates.set('business_requirements', {
            system: `You are a senior business analyst specializing in requirements analysis and application impact assessment.

Your expertise includes:
- Business requirements decomposition
- Application architecture analysis  
- Impact assessment and estimation
- Stakeholder needs analysis
- Technical feasibility evaluation

{{#if semanticMemory}}
Relevant Business Knowledge:
{{#each semanticMemory}}
- {{this.data.title}}: {{this.data.summary}}
{{/each}}
{{/if}}

{{#if episodicMemory}}
Past Requirements Projects:
{{#each episodicMemory}}
- {{this.experience.projectType}}: {{this.experience.outcome}} ({{this.age}} ago)
  Complexity: {{this.experience.complexity}}, Applications: {{this.experience.applicationsImpacted}}
{{/each}}
{{/if}}

Your analysis should include:
1. **Requirements Breakdown**: Decompose into functional/non-functional
2. **Application Impact**: Identify affected systems
3. **Effort Estimation**: T-shirt sizing with rationale
4. **Risk Assessment**: Technical and business risks
5. **Dependencies**: Cross-system dependencies
6. **Recommendations**: Implementation approach`,

            user: `Analyze these business requirements:

{{context.requirements}}

{{#if context.applicationCatalog}}
Available Applications:
{{#each context.applicationCatalog}}
- {{this.name}}: {{this.description}}
  Technology: {{this.technology}}, Complexity: {{this.complexity}}
{{/each}}
{{/if}}

{{#if context.constraints}}
Constraints:
{{#each context.constraints}}
- {{this}}
{{/each}}
{{/if}}

Please provide a comprehensive analysis with impact assessment and effort estimates.`
        });

        // State evaluation template
        this.templates.set('state_evaluation', {
            system: `You are a progress evaluation specialist for {{domain}} tasks.

Your role: {{agentPersonality}}

{{#if workingMemory}}
Current Task State:
- Task: {{workingMemory.taskId}}
- State: {{workingMemory.currentState}}
- Operations Completed: {{workingMemory.operations.length}}
- Progress: {{workingMemory.progress}}
{{/if}}

{{#if episodicMemory}}
Similar Past Tasks:
{{#each episodicMemory}}
- {{this.experience.taskType}}: {{this.experience.outcome}}
  Duration: {{this.experience.duration}}, Success: {{this.experience.success}}
{{/each}}
{{/if}}

Evaluate progress and provide:
1. **Current Status**: Where we are now
2. **Progress Assessment**: What's been accomplished
3. **Gap Analysis**: What's remaining
4. **Next Actions**: Immediate next steps
5. **Risk Factors**: Potential blockers
6. **Success Likelihood**: Probability of successful completion`,

            user: `Evaluate the current state of this task:

{{#if context.currentState}}
Current State: {{context.currentState}}
{{/if}}

{{#if context.originalGoal}}
Original Goal: {{context.originalGoal}}
{{/if}}

{{#if context.completedActions}}
Completed Actions:
{{#each context.completedActions}}
- {{this.action}}: {{this.result}} ({{this.timestamp}})
{{/each}}
{{/if}}

{{#if context.remainingWork}}
Remaining Work:
{{#each context.remainingWork}}
- {{this}}
{{/each}}
{{/if}}`
        });

        // Tool usage template
        this.templates.set('tool_usage', {
            system: `You are a tool execution specialist with expertise in {{domain}}.

Available Tools:
{{#each tools}}
- **{{this.name}}**: {{this.description}}
  Parameters: {{#each this.parameters}}{{this.name}} ({{this.type}}){{#unless @last}}, {{/unless}}{{/each}}
  Usage: {{this.usage}}
{{/each}}

{{#if proceduralMemory}}
Tool Usage Patterns:
{{#each proceduralMemory}}
- {{this.procedure.name}}: {{this.procedure.toolSequence}}
  Success Rate: {{this.success_rate}}%
{{/each}}
{{/if}}

Your role is to determine the best tool usage approach. Provide:
1. **Tool Selection**: Which tool(s) to use
2. **Parameter Configuration**: How to configure parameters
3. **Execution Sequence**: Order of operations
4. **Error Handling**: What to do if tools fail
5. **Validation**: How to verify results`,

            user: `Determine how to use tools for this task:

Task: {{context.task}}

{{#if context.parameters}}
Available Parameters:
{{#each context.parameters}}
- {{@key}}: {{this}}
{{/each}}
{{/if}}

{{#if context.constraints}}
Constraints:
{{#each context.constraints}}
- {{this}}
{{/each}}
{{/if}}

Please recommend the optimal tool usage approach.`
        });
    }

    registerDefaultContextBuilders() {
        // Memory context builder
        this.contextBuilders.set('memory', (context, memories) => {
            const memoryContext = {};
            
            if (memories.working) {
                memoryContext.workingMemory = memories.working;
            }
            
            if (memories.semantic && memories.semantic.length > 0) {
                memoryContext.semanticMemory = memories.semantic.slice(0, 5).map(item => ({
                    data: item.data,
                    relevance: item.relevance,
                    concepts: item.concepts
                }));
            }
            
            if (memories.episodic && memories.episodic.length > 0) {
                memoryContext.episodicMemory = memories.episodic.slice(0, 3).map(exp => ({
                    experience: exp.experience,
                    age: this.formatAge(exp.age),
                    relevance: exp.relevance
                }));
            }
            
            if (memories.procedural && memories.procedural.length > 0) {
                memoryContext.proceduralMemory = memories.procedural.slice(0, 3);
            }
            
            return memoryContext;
        });

        // Agent context builder
        this.contextBuilders.set('agent', (context, agentConfig) => {
            return {
                agentPersonality: agentConfig.personality,
                capabilities: agentConfig.capabilities,
                tools: agentConfig.tools,
                domain: context.domain || 'general'
            };
        });

        // Task context builder
        this.contextBuilders.set('task', (context, taskData) => {
            return {
                taskId: taskData.taskId,
                operationType: context.operationType,
                urgency: context.urgency,
                domain: context.domain,
                timestamp: new Date().toISOString()
            };
        });
    }

    async generateSystemPrompt(agentConfig, context, operationType, memories = {}) {
        const timer = this.logger.startTimer('generate_system_prompt');
        
        try {
            // Check cache first
            const cacheKey = this.buildCacheKey(agentConfig, context, operationType, memories);
            const cached = this.cache.getPrompt(cacheKey);
            if (cached) {
                this.logger.debug('PromptEngine', 'Using cached system prompt');
                return cached.prompt;
            }
            
            // Get template
            const template = this.templates.get(operationType);
            if (!template) {
                throw new Error(`No template found for operation type: ${operationType}`);
            }
            
            // Build template context
            const templateContext = await this.buildTemplateContext(agentConfig, context, operationType, memories);
            
            // Generate prompt from template
            const systemPrompt = this.renderTemplate(template.system, templateContext);
            
            // Optimize prompt length if needed
            const optimizedPrompt = this.optimizePrompt(systemPrompt, operationType);
            
            // Cache the prompt
            this.cache.setPrompt(cacheKey, optimizedPrompt, {
                operationType,
                agentId: agentConfig.id,
                memories: Object.keys(memories)
            });
            
            const duration = timer.stop();
            this.logger.debug('PromptEngine', `Generated system prompt for ${operationType}`, { duration, length: optimizedPrompt.length });
            
            return optimizedPrompt;
            
        } catch (error) {
            this.logger.error('PromptEngine', 'Failed to generate system prompt', error);
            throw error;
        }
    }

    async generateUserPrompt(operation, context, parameters, memories = {}) {
        const timer = this.logger.startTimer('generate_user_prompt');
        
        try {
            // Get template
            const template = this.templates.get(operation);
            if (!template || !template.user) {
                // Fallback to generic user prompt
                return this.generateGenericUserPrompt(operation, context, parameters);
            }
            
            // Build template context
            const templateContext = {
                context: {
                    ...context,
                    ...parameters
                },
                ...memories
            };
            
            // Generate prompt from template
            const userPrompt = this.renderTemplate(template.user, templateContext);
            
            const duration = timer.stop();
            this.logger.debug('PromptEngine', `Generated user prompt for ${operation}`, { duration, length: userPrompt.length });
            
            return userPrompt;
            
        } catch (error) {
            this.logger.error('PromptEngine', 'Failed to generate user prompt', error);
            throw error;
        }
    }

    async buildTemplateContext(agentConfig, context, operationType, memories) {
        const templateContext = {};
        
        // Add agent context
        const agentContext = this.contextBuilders.get('agent')(context, agentConfig);
        Object.assign(templateContext, agentContext);
        
        // Add memory context
        const memoryContext = this.contextBuilders.get('memory')(context, memories);
        Object.assign(templateContext, memoryContext);
        
        // Add task context
        const taskContext = this.contextBuilders.get('task')(context, { taskId: context.taskId });
        Object.assign(templateContext, taskContext);
        
        // Add operation-specific context
        if (operationType === 'business_requirements') {
            templateContext.applicationCatalog = context.applicationCatalog || [];
        }
        
        if (operationType === 'tool_usage') {
            templateContext.tools = context.availableTools || [];
        }
        
        return templateContext;
    }

    renderTemplate(template, context) {
        // Simple Handlebars-like template rendering
        let rendered = template;
        
        // Handle {{variable}} substitutions
        rendered = rendered.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const value = this.getNestedValue(context, path.trim());
            return value !== undefined ? String(value) : '';
        });
        
        // Handle {{#if condition}} blocks
        rendered = rendered.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
            const value = this.getNestedValue(context, condition.trim());
            return value ? content : '';
        });
        
        // Handle {{#each array}} blocks
        rendered = rendered.replace(/\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayPath, content) => {
            const array = this.getNestedValue(context, arrayPath.trim());
            if (!Array.isArray(array)) return '';
            
            return array.map((item, index) => {
                let itemContent = content;
                // Replace {{this}} with current item
                itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
                // Replace {{@index}} with current index
                itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
                // Replace {{@last}} with boolean
                itemContent = itemContent.replace(/\{\{@last\}\}/g, String(index === array.length - 1));
                // Replace {{this.property}} with item properties
                itemContent = itemContent.replace(/\{\{this\.([^}]+)\}\}/g, (match, prop) => {
                    const value = this.getNestedValue(item, prop);
                    return value !== undefined ? String(value) : '';
                });
                return itemContent;
            }).join('');
        });
        
        // Handle {{#unless condition}} blocks
        rendered = rendered.replace(/\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, condition, content) => {
            const value = this.getNestedValue(context, condition.trim());
            return !value ? content : '';
        });
        
        return rendered.trim();
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    optimizePrompt(prompt, operationType) {
        if (prompt.length <= this.optimization.maxLength) {
            return prompt;
        }
        
        this.logger.warn('PromptEngine', `Prompt too long (${prompt.length} chars), optimizing`);
        
        // Simple optimization: truncate less important sections
        const sections = prompt.split('\n\n');
        let optimized = '';
        let currentLength = 0;
        
        // Prioritize sections by importance
        const importantKeywords = ['role', 'task', 'capabilities', 'analysis', 'recommendations'];
        const sortedSections = sections.sort((a, b) => {
            const aImportance = importantKeywords.some(keyword => 
                a.toLowerCase().includes(keyword)
            ) ? 1 : 0;
            const bImportance = importantKeywords.some(keyword => 
                b.toLowerCase().includes(keyword)
            ) ? 1 : 0;
            return bImportance - aImportance;
        });
        
        for (const section of sortedSections) {
            if (currentLength + section.length + 2 <= this.optimization.maxLength) {
                optimized += (optimized ? '\n\n' : '') + section;
                currentLength += section.length + 2;
            } else {
                break;
            }
        }
        
        return optimized;
    }

    buildCacheKey(agentConfig, context, operationType, memories) {
        const keyComponents = [
            operationType,
            context.domain || 'general',
            context.urgency || 'normal',
            Object.keys(memories).sort().join(',')
        ];
        
        // Create hash of key components
        const keyString = keyComponents.join('|');
        return `prompt_${this.simpleHash(keyString)}`;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    generateGenericUserPrompt(operation, context, parameters) {
        let prompt = `Please perform the following operation: ${operation}\n\n`;
        
        if (context.goal) {
            prompt += `Goal: ${context.goal}\n\n`;
        }
        
        if (context.requirements) {
            prompt += `Requirements: ${context.requirements}\n\n`;
        }
        
        if (parameters && Object.keys(parameters).length > 0) {
            prompt += `Parameters:\n`;
            Object.entries(parameters).forEach(([key, value]) => {
                prompt += `- ${key}: ${value}\n`;
            });
            prompt += '\n';
        }
        
        if (context.constraints && context.constraints.length > 0) {
            prompt += `Constraints:\n`;
            context.constraints.forEach(constraint => {
                prompt += `- ${constraint}\n`;
            });
        }
        
        return prompt.trim();
    }

    formatAge(ageMs) {
        const seconds = Math.floor(ageMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }

    // Cache management
    invalidatePromptCache(pattern) {
        if (typeof pattern === 'string') {
            this.cache.invalidate(pattern, 'prompt');
        } else if (pattern instanceof RegExp) {
            this.cache.invalidate(pattern, 'prompt');
        }
        
        this.logger.info('PromptEngine', 'Invalidated prompt cache');
    }

    // Template management
    registerTemplate(name, template) {
        this.templates.set(name, template);
        this.logger.info('PromptEngine', `Registered template: ${name}`);
    }

    getAvailableTemplates() {
        return Array.from(this.templates.keys());
    }

    // Context builder management
    registerContextBuilder(name, builder) {
        this.contextBuilders.set(name, builder);
        this.logger.info('PromptEngine', `Registered context builder: ${name}`);
    }

    // Configuration
    updateOptimization(newSettings) {
        Object.assign(this.optimization, newSettings);
        this.logger.info('PromptEngine', 'Updated prompt optimization settings');
    }
}