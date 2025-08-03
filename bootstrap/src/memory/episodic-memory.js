/**
 * Episodic Memory
 * Experience storage for workflow histories, user interactions, and pattern recognition.
 * Implements temporal memory with timeline operations and analytics.
 * 
 * Follows the EpisodicMemory interface defined in API_CONTRACTS.md
 */

import MemoryStore from './memory-store.js';
import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';

export class EpisodicMemory extends MemoryStore {
    constructor() {
        super('episodic', {
            maxItems: 100000,
            maxSize: 200 * 1024 * 1024, // 200MB as per config
            enableCache: true,
            enableCompression: true,
            autoCleanup: true,
            cleanupInterval: 600000 // 10 minutes
        });
        
        this.timeline = new Map(); // Date-indexed timeline
        this.patterns = new Map(); // Recognized patterns
        this.insights = new Map(); // Cached insights
        
        this.initialize();
    }

    /**
     * Initialize episodic memory with timeline indexing
     */
    async initialize() {
        await super.initialize();
        
        try {
            await this.rebuildTimeline();
            await this.loadPatterns();
            
            await logger.info('Episodic Memory initialized with timeline indexing', {
                memoryType: this.memoryType,
                timelineEntries: this.timeline.size,
                patterns: this.patterns.size
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'episodic_memory_initialization',
                component: 'EpisodicMemory'
            });
        }
    }

    /**
     * Store experience in episodic memory
     * @param {Object} experience - Experience object
     * @returns {Promise<void>}
     */
    async storeExperience(experience) {
        try {
            this.validateExperience(experience);

            const experienceKey = `experience:${experience.id}`;
            
            await this.store(experienceKey, experience, {
                type: 'episodic',
                category: 'experience',
                tags: ['experience', experience.type, ...experience.participants],
                priority: this.calculateExperiencePriority(experience),
                timestamp: experience.timestamp
            });

            // Update timeline
            await this.addToTimeline(experience);

            // Analyze for patterns
            await this.analyzeExperiencePatterns(experience);

            await logger.debug('Experience stored', {
                experienceId: experience.id,
                type: experience.type,
                participants: experience.participants.length,
                outcome: experience.outcome.success
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_experience',
                component: 'EpisodicMemory',
                metadata: { experience }
            });
            throw error;
        }
    }

    /**
     * Retrieve experiences based on query
     * @param {Object} query - Experience query
     * @returns {Promise<Array>} Matching experiences
     */
    async retrieveExperiences(query) {
        try {
            const {
                type,
                timeRange,
                context,
                outcome,
                participants = [],
                limit = 100
            } = query;

            let searchCriteria = {
                type: 'episodic',
                category: 'experience',
                limit: limit * 2 // Get more for filtering
            };

            // Apply time range filter
            if (timeRange) {
                searchCriteria.dateRange = {
                    start: timeRange.start,
                    end: timeRange.end,
                    field: 'created'
                };
            }

            let results = await this.query(searchCriteria);

            // Apply additional filters
            results = results.filter(item => {
                const exp = item.data;
                
                if (type && exp.type !== type) {
                    return false;
                }
                
                if (context) {
                    if (!this.matchesContext(exp.context, context)) {
                        return false;
                    }
                }
                
                if (outcome) {
                    if (!this.matchesOutcome(exp.outcome, outcome)) {
                        return false;
                    }
                }
                
                if (participants.length > 0) {
                    if (!participants.some(p => exp.participants.includes(p))) {
                        return false;
                    }
                }
                
                return true;
            });

            // Sort by timestamp (most recent first)
            results.sort((a, b) => 
                new Date(b.data.timestamp) - new Date(a.data.timestamp)
            );

            // Apply final limit
            return results.slice(0, limit).map(r => r.data);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'retrieve_experiences',
                component: 'EpisodicMemory',
                metadata: { query }
            });
            return [];
        }
    }

    /**
     * Store workflow history
     * @param {Object} workflow - Workflow history object
     * @returns {Promise<void>}
     */
    async storeWorkflowHistory(workflow) {
        try {
            this.validateWorkflowHistory(workflow);

            const workflowKey = `workflow:${workflow.workflowId}`;
            
            await this.store(workflowKey, workflow, {
                type: 'episodic',
                category: 'workflow',
                tags: ['workflow', workflow.type, workflow.status],
                priority: this.calculateWorkflowPriority(workflow),
                timestamp: workflow.startTime,
                workflowId: workflow.workflowId
            });

            // Create timeline events for workflow steps
            await this.createWorkflowTimelineEvents(workflow);

            // Analyze workflow patterns
            await this.analyzeWorkflowPatterns(workflow);

            await logger.info('Workflow history stored', {
                workflowId: workflow.workflowId,
                type: workflow.type,
                status: workflow.status,
                steps: workflow.steps.length,
                duration: workflow.endTime ? 
                    new Date(workflow.endTime) - new Date(workflow.startTime) : 
                    'ongoing'
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'store_workflow_history',
                component: 'EpisodicMemory',
                metadata: { workflowId: workflow.workflowId }
            });
            throw error;
        }
    }

    /**
     * Get workflow history by ID
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object|null>} Workflow history
     */
    async getWorkflowHistory(workflowId) {
        try {
            const workflowKey = `workflow:${workflowId}`;
            const workflow = await this.retrieve(workflowKey);
            
            return workflow ? workflow.data : null;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_workflow_history',
                component: 'EpisodicMemory',
                metadata: { workflowId }
            });
            return null;
        }
    }

    /**
     * Search workflow history with criteria
     * @param {Object} criteria - Search criteria
     * @returns {Promise<Array>} Matching workflows
     */
    async searchWorkflowHistory(criteria) {
        try {
            const {
                type,
                status,
                timeRange,
                agentTypes = [],
                minDuration,
                maxDuration,
                hasErrors
            } = criteria;

            let searchCriteria = {
                type: 'episodic',
                category: 'workflow',
                limit: 1000
            };

            if (timeRange) {
                searchCriteria.dateRange = {
                    start: timeRange.start,
                    end: timeRange.end,
                    field: 'created'
                };
            }

            let results = await this.query(searchCriteria);

            // Apply filters
            results = results.filter(item => {
                const workflow = item.data;
                
                if (type && workflow.type !== type) {
                    return false;
                }
                
                if (status && workflow.status !== status) {
                    return false;
                }
                
                if (agentTypes.length > 0) {
                    const workflowAgents = workflow.steps.map(s => s.agentType);
                    if (!agentTypes.some(at => workflowAgents.includes(at))) {
                        return false;
                    }
                }
                
                if (minDuration || maxDuration) {
                    const duration = workflow.endTime ? 
                        new Date(workflow.endTime) - new Date(workflow.startTime) : 0;
                    
                    if (minDuration && duration < minDuration) {
                        return false;
                    }
                    
                    if (maxDuration && duration > maxDuration) {
                        return false;
                    }
                }
                
                if (hasErrors !== undefined) {
                    const workflowHasErrors = workflow.steps.some(s => s.errors && s.errors.length > 0);
                    if (hasErrors !== workflowHasErrors) {
                        return false;
                    }
                }
                
                return true;
            });

            return results.map(r => r.data);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'search_workflow_history',
                component: 'EpisodicMemory',
                metadata: { criteria }
            });
            return [];
        }
    }

    /**
     * Track user interaction
     * @param {Object} interaction - User interaction object
     * @returns {Promise<void>}
     */
    async trackInteraction(interaction) {
        try {
            this.validateUserInteraction(interaction);

            const interactionKey = `interaction:${interaction.id}`;
            
            await this.store(interactionKey, interaction, {
                type: 'episodic',
                category: 'interaction',
                tags: ['interaction', interaction.type, interaction.userId],
                priority: this.calculateInteractionPriority(interaction),
                timestamp: interaction.timestamp,
                userId: interaction.userId
            });

            // Add to timeline
            await this.addInteractionToTimeline(interaction);

            await logger.debug('User interaction tracked', {
                interactionId: interaction.id,
                userId: interaction.userId,
                type: interaction.type,
                sentiment: interaction.sentiment
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'track_interaction',
                component: 'EpisodicMemory',
                metadata: { interaction }
            });
            throw error;
        }
    }

    /**
     * Get interaction history for user
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of interactions
     * @returns {Promise<Array>} User interactions
     */
    async getInteractionHistory(userId, limit = 100) {
        try {
            const results = await this.query({
                type: 'episodic',
                category: 'interaction',
                userId,
                limit,
                sortBy: 'created',
                sortOrder: 'desc'
            });

            return results.map(r => r.data);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_interaction_history',
                component: 'EpisodicMemory',
                metadata: { userId }
            });
            return [];
        }
    }

    /**
     * Identify patterns in experiences within time range
     * @param {Object} timeRange - Time range for analysis
     * @returns {Promise<Array>} Identified patterns
     */
    async identifyPatterns(timeRange) {
        try {
            const experiences = await this.retrieveExperiences({
                timeRange,
                limit: 10000
            });

            const patterns = [];

            // Success patterns
            const successPatterns = await this.identifySuccessPatterns(experiences);
            patterns.push(...successPatterns);

            // Failure patterns
            const failurePatterns = await this.identifyFailurePatterns(experiences);
            patterns.push(...failurePatterns);

            // Temporal patterns
            const temporalPatterns = await this.identifyTemporalPatterns(experiences);
            patterns.push(...temporalPatterns);

            // Cache patterns
            for (const pattern of patterns) {
                this.patterns.set(pattern.id, pattern);
            }

            await logger.info('Patterns identified', {
                timeRange,
                experienceCount: experiences.length,
                patternCount: patterns.length,
                successPatterns: successPatterns.length,
                failurePatterns: failurePatterns.length
            });

            return patterns;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'identify_patterns',
                component: 'EpisodicMemory',
                metadata: { timeRange }
            });
            return [];
        }
    }

    /**
     * Get success patterns for context
     * @param {Object} context - Pattern context
     * @returns {Promise<Array>} Success patterns
     */
    async getSuccessPatterns(context) {
        try {
            const patterns = await this.query({
                type: 'episodic',
                category: 'pattern',
                tags: ['success'],
                limit: 100
            });

            return patterns
                .map(p => p.data)
                .filter(pattern => this.matchesPatternContext(pattern, context))
                .sort((a, b) => b.successRate - a.successRate);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_success_patterns',
                component: 'EpisodicMemory',
                metadata: { context }
            });
            return [];
        }
    }

    /**
     * Get failure patterns for context
     * @param {Object} context - Pattern context
     * @returns {Promise<Array>} Failure patterns
     */
    async getFailurePatterns(context) {
        try {
            const patterns = await this.query({
                type: 'episodic',
                category: 'pattern',
                tags: ['failure'],
                limit: 100
            });

            return patterns
                .map(p => p.data)
                .filter(pattern => this.matchesPatternContext(pattern, context))
                .sort((a, b) => b.frequency - a.frequency);

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_failure_patterns',
                component: 'EpisodicMemory',
                metadata: { context }
            });
            return [];
        }
    }

    /**
     * Get timeline events with filtering
     * @param {Object} filter - Timeline filter
     * @returns {Promise<Array>} Timeline events
     */
    async getTimeline(filter) {
        try {
            const {
                timeRange,
                eventTypes = [],
                participants = [],
                workflowIds = [],
                severity = []
            } = filter;

            let events = [];

            // Get events from timeline cache
            const startDate = new Date(timeRange.start);
            const endDate = new Date(timeRange.end);
            
            for (const [dateKey, dayEvents] of this.timeline) {
                const eventDate = new Date(dateKey);
                if (eventDate >= startDate && eventDate <= endDate) {
                    events.push(...dayEvents);
                }
            }

            // Apply filters
            if (eventTypes.length > 0) {
                events = events.filter(event => eventTypes.includes(event.type));
            }
            
            if (participants.length > 0) {
                events = events.filter(event => 
                    participants.some(p => event.participants.includes(p))
                );
            }
            
            if (workflowIds.length > 0) {
                events = events.filter(event => 
                    workflowIds.includes(event.workflowId)
                );
            }
            
            if (severity.length > 0) {
                events = events.filter(event => severity.includes(event.impact));
            }

            // Sort by timestamp
            events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            return events;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_timeline',
                component: 'EpisodicMemory',
                metadata: { filter }
            });
            return [];
        }
    }

    /**
     * Create timeline snapshot with label
     * @param {string} label - Snapshot label
     * @returns {Promise<string>} Snapshot ID
     */
    async createTimelineSnapshot(label) {
        try {
            const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const snapshot = {
                id: snapshotId,
                label,
                timestamp: new Date().toISOString(),
                timeline: Object.fromEntries(this.timeline),
                patterns: Object.fromEntries(this.patterns),
                stats: await this.getStorageInfo()
            };

            await this.store(`snapshot:${snapshotId}`, snapshot, {
                type: 'episodic',
                category: 'snapshot',
                tags: ['snapshot', label],
                priority: 8
            });

            await logger.info('Timeline snapshot created', {
                snapshotId,
                label,
                timelineEntries: this.timeline.size,
                patterns: this.patterns.size
            });

            return snapshotId;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'create_timeline_snapshot',
                component: 'EpisodicMemory',
                metadata: { label }
            });
            throw error;
        }
    }

    /**
     * Get experience insights for time range
     * @param {Object} timeRange - Time range for analysis
     * @returns {Promise<Object>} Experience insights
     */
    async getExperienceInsights(timeRange) {
        try {
            // Check cache first
            const cacheKey = this.getInsightsCacheKey(timeRange);
            if (this.insights.has(cacheKey)) {
                const cached = this.insights.get(cacheKey);
                if (this.isInsightsFresh(cached.timestamp)) {
                    return cached.insights;
                }
            }

            const experiences = await this.retrieveExperiences({
                timeRange,
                limit: 10000
            });

            const insights = await this.calculateExperienceInsights(experiences);
            
            // Cache insights
            this.insights.set(cacheKey, {
                insights,
                timestamp: new Date().toISOString()
            });

            return insights;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_experience_insights',
                component: 'EpisodicMemory',
                metadata: { timeRange }
            });
            return this.getDefaultInsights();
        }
    }

    /**
     * Get performance trends for metric over time
     * @param {string} metric - Metric name
     * @param {Object} timeRange - Time range for analysis
     * @returns {Promise<Array>} Trend data points
     */
    async getPerformanceTrends(metric, timeRange) {
        try {
            const workflows = await this.searchWorkflowHistory({
                timeRange,
                status: 'completed'
            });

            const trendData = [];
            const startTime = new Date(timeRange.start).getTime();
            const endTime = new Date(timeRange.end).getTime();
            const interval = (endTime - startTime) / 20; // 20 data points

            for (let i = 0; i < 20; i++) {
                const periodStart = startTime + (i * interval);
                const periodEnd = startTime + ((i + 1) * interval);
                
                const periodWorkflows = workflows.filter(w => {
                    const wTime = new Date(w.startTime).getTime();
                    return wTime >= periodStart && wTime < periodEnd;
                });

                const value = this.calculateMetricValue(metric, periodWorkflows);
                
                trendData.push({
                    timestamp: new Date(periodStart).toISOString(),
                    value,
                    metadata: {
                        workflowCount: periodWorkflows.length
                    }
                });
            }

            return trendData;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_performance_trends',
                component: 'EpisodicMemory',
                metadata: { metric, timeRange }
            });
            return [];
        }
    }

    // Utility Methods

    /**
     * Validate experience structure
     * @param {Object} experience - Experience to validate
     */
    validateExperience(experience) {
        const required = ['id', 'type', 'timestamp', 'context', 'outcome', 'participants'];
        
        for (const field of required) {
            if (!experience[field]) {
                throw new Error(`Experience missing required field: ${field}`);
            }
        }

        const validTypes = ['workflow', 'task', 'decision', 'outcome', 'learning'];
        if (!validTypes.includes(experience.type)) {
            throw new Error(`Invalid experience type: ${experience.type}`);
        }

        if (!experience.outcome.hasOwnProperty('success')) {
            throw new Error('Experience outcome must have success field');
        }
    }

    /**
     * Validate workflow history structure
     * @param {Object} workflow - Workflow to validate
     */
    validateWorkflowHistory(workflow) {
        const required = ['workflowId', 'type', 'startTime', 'status', 'steps', 'feedback', 'metrics', 'outcome'];
        
        for (const field of required) {
            if (!workflow[field]) {
                throw new Error(`Workflow history missing required field: ${field}`);
            }
        }

        const validStatuses = ['completed', 'failed', 'cancelled'];
        if (!validStatuses.includes(workflow.status)) {
            throw new Error(`Invalid workflow status: ${workflow.status}`);
        }

        if (!Array.isArray(workflow.steps)) {
            throw new Error('Workflow steps must be an array');
        }
    }

    /**
     * Validate user interaction structure
     * @param {Object} interaction - Interaction to validate
     */
    validateUserInteraction(interaction) {
        const required = ['id', 'userId', 'type', 'timestamp', 'input', 'context'];
        
        for (const field of required) {
            if (!interaction[field]) {
                throw new Error(`User interaction missing required field: ${field}`);
            }
        }

        const validTypes = ['approval', 'revision', 'rejection', 'feedback', 'configuration'];
        if (!validTypes.includes(interaction.type)) {
            throw new Error(`Invalid interaction type: ${interaction.type}`);
        }
    }

    /**
     * Calculate experience priority
     * @param {Object} experience - Experience object
     * @returns {number} Priority score (1-10)
     */
    calculateExperiencePriority(experience) {
        let priority = 5;
        
        // Failed experiences are more important for learning
        if (!experience.outcome.success) {
            priority += 2;
        }
        
        // More participants = higher importance
        priority += Math.min(experience.participants.length * 0.5, 2);
        
        // Learning experiences are important
        if (experience.type === 'learning') {
            priority += 1;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Calculate workflow priority
     * @param {Object} workflow - Workflow object
     * @returns {number} Priority score (1-10)
     */
    calculateWorkflowPriority(workflow) {
        let priority = 6; // Base priority for workflows
        
        // Failed workflows are important
        if (workflow.status === 'failed') {
            priority += 2;
        }
        
        // Longer workflows are more significant
        if (workflow.endTime) {
            const duration = new Date(workflow.endTime) - new Date(workflow.startTime);
            const hours = duration / (1000 * 60 * 60);
            priority += Math.min(hours * 0.1, 2);
        }
        
        // Workflows with errors need attention
        const hasErrors = workflow.steps.some(s => s.errors && s.errors.length > 0);
        if (hasErrors) {
            priority += 1;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Calculate interaction priority
     * @param {Object} interaction - Interaction object
     * @returns {number} Priority score (1-10)
     */
    calculateInteractionPriority(interaction) {
        let priority = 5;
        
        // Negative interactions are more important
        if (interaction.type === 'rejection' || 
            (interaction.sentiment && interaction.sentiment < 0.5)) {
            priority += 2;
        }
        
        // Configuration changes are important
        if (interaction.type === 'configuration') {
            priority += 1;
        }
        
        return Math.min(10, Math.max(1, Math.round(priority)));
    }

    /**
     * Add experience to timeline
     * @param {Object} experience - Experience object
     * @returns {Promise<void>}
     */
    async addToTimeline(experience) {
        const dateKey = this.getDateKey(experience.timestamp);
        
        if (!this.timeline.has(dateKey)) {
            this.timeline.set(dateKey, []);
        }
        
        const timelineEvent = {
            id: experience.id,
            timestamp: experience.timestamp,
            type: experience.type,
            title: this.generateEventTitle(experience),
            description: this.generateEventDescription(experience),
            participants: experience.participants,
            metadata: {
                experienceType: experience.type,
                success: experience.outcome.success
            },
            impact: experience.outcome.success ? 'medium' : 'high'
        };
        
        this.timeline.get(dateKey).push(timelineEvent);
    }

    /**
     * Create timeline events for workflow steps
     * @param {Object} workflow - Workflow object
     * @returns {Promise<void>}
     */
    async createWorkflowTimelineEvents(workflow) {
        for (const step of workflow.steps) {
            const dateKey = this.getDateKey(step.startTime);
            
            if (!this.timeline.has(dateKey)) {
                this.timeline.set(dateKey, []);
            }
            
            const event = {
                id: `${workflow.workflowId}_${step.stepId}`,
                timestamp: step.startTime,
                type: 'workflow_step',
                title: `${step.agentType} Step`,
                description: `${step.agentType} agent executed step in workflow`,
                participants: [step.agentType],
                workflowId: workflow.workflowId,
                metadata: {
                    stepId: step.stepId,
                    agentType: step.agentType,
                    status: step.status,
                    duration: step.duration
                },
                impact: step.status === 'failed' ? 'high' : 'low'
            };
            
            this.timeline.get(dateKey).push(event);
        }
    }

    /**
     * Add interaction to timeline
     * @param {Object} interaction - Interaction object
     * @returns {Promise<void>}
     */
    async addInteractionToTimeline(interaction) {
        const dateKey = this.getDateKey(interaction.timestamp);
        
        if (!this.timeline.has(dateKey)) {
            this.timeline.set(dateKey, []);
        }
        
        const event = {
            id: interaction.id,
            timestamp: interaction.timestamp,
            type: 'user_interaction',
            title: `User ${interaction.type}`,
            description: `User provided ${interaction.type}`,
            participants: [interaction.userId],
            metadata: {
                interactionType: interaction.type,
                sentiment: interaction.sentiment,
                satisfaction: interaction.satisfaction
            },
            impact: interaction.type === 'rejection' ? 'high' : 'medium'
        };
        
        this.timeline.get(dateKey).push(event);
    }

    /**
     * Rebuild timeline from stored data
     * @returns {Promise<void>}
     */
    async rebuildTimeline() {
        try {
            this.timeline.clear();
            
            // Get all experiences
            const experiences = await this.query({
                type: 'episodic',
                category: 'experience',
                limit: 10000,
                sortBy: 'created'
            });
            
            for (const exp of experiences) {
                await this.addToTimeline(exp.data);
            }
            
            // Get all interactions
            const interactions = await this.query({
                type: 'episodic',
                category: 'interaction',
                limit: 10000,
                sortBy: 'created'
            });
            
            for (const interaction of interactions) {
                await this.addInteractionToTimeline(interaction.data);
            }
            
        } catch (error) {
            await logger.warn('Failed to rebuild timeline', error);
        }
    }

    /**
     * Load existing patterns from storage
     * @returns {Promise<void>}
     */
    async loadPatterns() {
        try {
            const patterns = await this.query({
                type: 'episodic',
                category: 'pattern',
                limit: 1000
            });
            
            for (const pattern of patterns) {
                this.patterns.set(pattern.data.id, pattern.data);
            }
            
        } catch (error) {
            await logger.warn('Failed to load patterns', error);
        }
    }

    /**
     * Analyze experience for patterns
     * @param {Object} experience - Experience object
     * @returns {Promise<void>}
     */
    async analyzeExperiencePatterns(experience) {
        // Simple pattern analysis - could be much more sophisticated
        try {
            const contextKey = this.getContextSignature(experience.context);
            const patternId = `pattern_${contextKey}_${experience.type}`;
            
            let pattern = this.patterns.get(patternId);
            
            if (!pattern) {
                pattern = {
                    id: patternId,
                    type: 'experience',
                    pattern: contextKey,
                    frequency: 0,
                    confidence: 0.5,
                    examples: [],
                    timeRange: {
                        start: experience.timestamp,
                        end: experience.timestamp
                    }
                };
            }
            
            pattern.frequency++;
            pattern.examples.push(experience.id);
            pattern.timeRange.end = experience.timestamp;
            
            // Keep only recent examples
            if (pattern.examples.length > 10) {
                pattern.examples = pattern.examples.slice(-10);
            }
            
            // Update confidence based on success rate
            const recentExperiences = await this.getRecentExperiencesByPattern(patternId);
            const successRate = recentExperiences.filter(e => e.outcome.success).length / recentExperiences.length;
            pattern.confidence = successRate;
            
            this.patterns.set(patternId, pattern);
            
            // Store pattern
            await this.store(`pattern:${patternId}`, pattern, {
                type: 'episodic',
                category: 'pattern',
                tags: ['pattern', experience.type],
                priority: 6
            });
            
        } catch (error) {
            await logger.warn('Failed to analyze experience patterns', error);
        }
    }

    /**
     * Analyze workflow patterns
     * @param {Object} workflow - Workflow object
     * @returns {Promise<void>}
     */
    async analyzeWorkflowPatterns(workflow) {
        // Analyze agent sequences, timing patterns, failure modes
        try {
            const agentSequence = workflow.steps.map(s => s.agentType).join('->');
            const patternId = `workflow_sequence_${agentSequence}`;
            
            let pattern = this.patterns.get(patternId);
            
            if (!pattern) {
                pattern = {
                    id: patternId,
                    type: 'workflow_sequence',
                    pattern: agentSequence,
                    frequency: 0,
                    confidence: 0.5,
                    examples: [],
                    successRate: 0
                };
            }
            
            pattern.frequency++;
            pattern.examples.push(workflow.workflowId);
            
            // Calculate success rate
            const recentWorkflows = await this.getRecentWorkflowsByPattern(patternId);
            const successful = recentWorkflows.filter(w => w.status === 'completed').length;
            pattern.successRate = successful / recentWorkflows.length;
            pattern.confidence = pattern.successRate;
            
            this.patterns.set(patternId, pattern);
            
            // Store pattern
            await this.store(`pattern:${patternId}`, pattern, {
                type: 'episodic',
                category: 'pattern',
                tags: ['pattern', 'workflow', 'sequence'],
                priority: 7
            });
            
        } catch (error) {
            await logger.warn('Failed to analyze workflow patterns', error);
        }
    }

    // Pattern Analysis Methods

    /**
     * Identify success patterns in experiences
     * @param {Array} experiences - Experiences to analyze
     * @returns {Promise<Array>} Success patterns
     */
    async identifySuccessPatterns(experiences) {
        const successExperiences = experiences.filter(e => e.outcome.success);
        const patterns = new Map();
        
        for (const exp of successExperiences) {
            const contextSig = this.getContextSignature(exp.context);
            const key = `${exp.type}_${contextSig}`;
            
            if (!patterns.has(key)) {
                patterns.set(key, {
                    pattern: key,
                    conditions: this.extractConditions(exp.context),
                    successRate: 0,
                    frequency: 0,
                    averagePerformance: {},
                    recommendations: []
                });
            }
            
            const pattern = patterns.get(key);
            pattern.frequency++;
        }
        
        // Calculate success rates and recommendations
        for (const [key, pattern] of patterns) {
            const allMatching = experiences.filter(e => 
                this.getContextSignature(e.context) === pattern.pattern.split('_')[1]
            );
            const successful = allMatching.filter(e => e.outcome.success);
            
            pattern.successRate = successful.length / allMatching.length;
            pattern.averagePerformance = this.calculateAveragePerformance(successful);
            pattern.recommendations = this.generateSuccessRecommendations(pattern);
        }
        
        return Array.from(patterns.values())
            .filter(p => p.successRate > 0.7 && p.frequency > 2);
    }

    /**
     * Identify failure patterns in experiences
     * @param {Array} experiences - Experiences to analyze
     * @returns {Promise<Array>} Failure patterns
     */
    async identifyFailurePatterns(experiences) {
        const failureExperiences = experiences.filter(e => !e.outcome.success);
        const patterns = new Map();
        
        for (const exp of failureExperiences) {
            const contextSig = this.getContextSignature(exp.context);
            const key = `${exp.type}_${contextSig}`;
            
            if (!patterns.has(key)) {
                patterns.set(key, {
                    pattern: key,
                    causes: this.extractFailureCauses(exp),
                    frequency: 0,
                    impact: 'medium',
                    mitigations: []
                });
            }
            
            const pattern = patterns.get(key);
            pattern.frequency++;
        }
        
        // Generate mitigations
        for (const [key, pattern] of patterns) {
            pattern.impact = this.calculateFailureImpact(pattern);
            pattern.mitigations = this.generateMitigations(pattern);
        }
        
        return Array.from(patterns.values())
            .filter(p => p.frequency > 1);
    }

    /**
     * Identify temporal patterns in experiences
     * @param {Array} experiences - Experiences to analyze
     * @returns {Promise<Array>} Temporal patterns
     */
    async identifyTemporalPatterns(experiences) {
        // Analyze time-based patterns (hourly, daily, weekly)
        const patterns = [];
        
        // Group by hour of day
        const hourlyGroups = new Map();
        for (const exp of experiences) {
            const hour = new Date(exp.timestamp).getHours();
            if (!hourlyGroups.has(hour)) {
                hourlyGroups.set(hour, []);
            }
            hourlyGroups.get(hour).push(exp);
        }
        
        // Find peak activity hours
        const hourlyActivity = Array.from(hourlyGroups.entries())
            .map(([hour, exps]) => ({ hour, count: exps.length }))
            .sort((a, b) => b.count - a.count);
        
        if (hourlyActivity.length > 0) {
            patterns.push({
                id: `temporal_peak_${Date.now()}`,
                type: 'temporal',
                pattern: 'peak_activity_hours',
                frequency: hourlyActivity[0].count,
                confidence: 0.8,
                examples: [`Peak activity at hour ${hourlyActivity[0].hour}`],
                timeRange: { start: experiences[0].timestamp, end: experiences[experiences.length - 1].timestamp }
            });
        }
        
        return patterns;
    }

    // Helper Methods

    /**
     * Get date key for timeline indexing
     * @param {string} timestamp - ISO timestamp
     * @returns {string} Date key (YYYY-MM-DD)
     */
    getDateKey(timestamp) {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    /**
     * Generate event title for timeline
     * @param {Object} experience - Experience object
     * @returns {string} Event title
     */
    generateEventTitle(experience) {
        return `${experience.type} - ${experience.outcome.success ? 'Success' : 'Failure'}`;
    }

    /**
     * Generate event description for timeline
     * @param {Object} experience - Experience object
     * @returns {string} Event description
     */
    generateEventDescription(experience) {
        return `${experience.type} experience with ${experience.participants.length} participants`;
    }

    /**
     * Get context signature for pattern matching
     * @param {Object} context - Context object
     * @returns {string} Context signature
     */
    getContextSignature(context) {
        const keys = Object.keys(context).sort();
        const values = keys.map(k => `${k}:${typeof context[k]}`);
        return values.join('|');
    }

    /**
     * Calculate experience insights
     * @param {Array} experiences - Experiences to analyze
     * @returns {Promise<Object>} Insights object
     */
    async calculateExperienceInsights(experiences) {
        const totalExperiences = experiences.length;
        const successfulExperiences = experiences.filter(e => e.outcome.success);
        const successRate = totalExperiences > 0 ? successfulExperiences.length / totalExperiences : 0;
        
        const durations = experiences
            .filter(e => e.duration)
            .map(e => e.duration);
        const averageDuration = durations.length > 0 ? 
            durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
        
        // Top success factors
        const successFactors = this.extractTopFactors(successfulExperiences, 'success');
        
        // Top failure reasons
        const failedExperiences = experiences.filter(e => !e.outcome.success);
        const failureReasons = this.extractTopFactors(failedExperiences, 'failure');
        
        // Performance trends
        const performanceTrends = this.calculatePerformanceTrends(experiences);
        
        // Recommendations
        const recommendations = this.generateInsightRecommendations(experiences);
        
        return {
            totalExperiences,
            successRate,
            averageDuration,
            topSuccessFactors: successFactors,
            topFailureReasons: failureReasons,
            performanceTrends,
            recommendations
        };
    }

    /**
     * Extract top factors from experiences
     * @param {Array} experiences - Experiences to analyze
     * @param {string} type - Factor type ('success' or 'failure')
     * @returns {Array} Top factors
     */
    extractTopFactors(experiences, type) {
        const factors = new Map();
        
        for (const exp of experiences) {
            const contextKeys = Object.keys(exp.context);
            for (const key of contextKeys) {
                const value = exp.context[key];
                const factor = `${key}:${value}`;
                factors.set(factor, (factors.get(factor) || 0) + 1);
            }
        }
        
        return Array.from(factors.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([factor, count]) => factor);
    }

    /**
     * Calculate performance trends
     * @param {Array} experiences - Experiences to analyze
     * @returns {Object} Performance trends
     */
    calculatePerformanceTrends(experiences) {
        // Simple trend calculation - success rate over time
        const sortedExperiences = experiences.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );
        
        const trends = {};
        
        if (sortedExperiences.length >= 10) {
            const firstHalf = sortedExperiences.slice(0, Math.floor(sortedExperiences.length / 2));
            const secondHalf = sortedExperiences.slice(Math.floor(sortedExperiences.length / 2));
            
            const firstSuccessRate = firstHalf.filter(e => e.outcome.success).length / firstHalf.length;
            const secondSuccessRate = secondHalf.filter(e => e.outcome.success).length / secondHalf.length;
            
            trends.successRateChange = secondSuccessRate - firstSuccessRate;
        }
        
        return trends;
    }

    /**
     * Generate insight recommendations
     * @param {Array} experiences - Experiences to analyze
     * @returns {Array} Recommendations
     */
    generateInsightRecommendations(experiences) {
        const recommendations = [];
        
        const successRate = experiences.filter(e => e.outcome.success).length / experiences.length;
        
        if (successRate < 0.7) {
            recommendations.push('Success rate is below 70% - analyze failure patterns for improvement opportunities');
        }
        
        if (experiences.length < 10) {
            recommendations.push('Limited experience data - collect more interactions for better insights');
        }
        
        return recommendations;
    }

    /**
     * Get default insights for error cases
     * @returns {Object} Default insights
     */
    getDefaultInsights() {
        return {
            totalExperiences: 0,
            successRate: 0,
            averageDuration: 0,
            topSuccessFactors: [],
            topFailureReasons: [],
            performanceTrends: {},
            recommendations: ['No experience data available for analysis']
        };
    }

    /**
     * Get insights cache key
     * @param {Object} timeRange - Time range
     * @returns {string} Cache key
     */
    getInsightsCacheKey(timeRange) {
        return `insights_${timeRange.start}_${timeRange.end}`;
    }

    /**
     * Check if insights are still fresh
     * @param {string} timestamp - Insights timestamp
     * @returns {boolean} Is fresh
     */
    isInsightsFresh(timestamp) {
        const age = Date.now() - new Date(timestamp).getTime();
        return age < (60 * 60 * 1000); // 1 hour
    }

    /**
     * Calculate metric value for trend analysis
     * @param {string} metric - Metric name
     * @param {Array} workflows - Workflows to analyze
     * @returns {number} Metric value
     */
    calculateMetricValue(metric, workflows) {
        if (workflows.length === 0) return 0;
        
        switch (metric) {
            case 'success_rate':
                return workflows.filter(w => w.status === 'completed').length / workflows.length;
            case 'average_duration':
                const durations = workflows
                    .filter(w => w.endTime)
                    .map(w => new Date(w.endTime) - new Date(w.startTime));
                return durations.length > 0 ? 
                    durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
            case 'error_rate':
                const withErrors = workflows.filter(w => 
                    w.steps.some(s => s.errors && s.errors.length > 0)
                ).length;
                return withErrors / workflows.length;
            default:
                return 0;
        }
    }

    // Utility methods for pattern analysis

    matchesContext(experienceContext, queryContext) {
        for (const [key, value] of Object.entries(queryContext)) {
            if (experienceContext[key] !== value) {
                return false;
            }
        }
        return true;
    }

    matchesOutcome(experienceOutcome, queryOutcome) {
        for (const [key, value] of Object.entries(queryOutcome)) {
            if (experienceOutcome[key] !== value) {
                return false;
            }
        }
        return true;
    }

    matchesPatternContext(pattern, context) {
        // Simple context matching - could be more sophisticated
        return true;
    }

    extractConditions(context) {
        return Object.entries(context).map(([k, v]) => `${k} = ${v}`);
    }

    extractFailureCauses(experience) {
        const causes = [];
        if (experience.outcome.errors) {
            causes.push(...experience.outcome.errors.map(e => e.message || e));
        }
        return causes;
    }

    calculateAveragePerformance(experiences) {
        // Calculate average performance metrics
        return {
            duration: experiences.reduce((sum, e) => sum + (e.duration || 0), 0) / experiences.length
        };
    }

    calculateFailureImpact(pattern) {
        if (pattern.frequency > 5) return 'high';
        if (pattern.frequency > 2) return 'medium';
        return 'low';
    }

    generateSuccessRecommendations(pattern) {
        return [`Apply conditions: ${pattern.conditions.join(', ')}`];
    }

    generateMitigations(pattern) {
        return [`Address causes: ${pattern.causes.join(', ')}`];
    }

    async getRecentExperiencesByPattern(patternId) {
        // Get recent experiences matching pattern
        return [];
    }

    async getRecentWorkflowsByPattern(patternId) {
        // Get recent workflows matching pattern
        return [];
    }
}

// Create and export singleton instance
export const episodicMemory = new EpisodicMemory();

// Export for ES6 modules
export default EpisodicMemory;