/**
 * Working Memory
 * Session-scoped memory for current task context, active agent states,
 * and immediate user feedback. Implements short-term memory patterns.
 * 
 * Follows the WorkingMemory interface defined in API_CONTRACTS.md
 */

import MemoryStore from './memory-store.js';
import { logger } from '../core/logger.js';
import { errorHandler } from '../core/error-handler.js';
import { configManager } from '../core/config.js';

export class WorkingMemory extends MemoryStore {
    constructor() {
        super('working', {
            maxItems: 10000,
            maxSize: 50 * 1024 * 1024, // 50MB as per config
            enableCache: true,
            autoCleanup: true,
            cleanupInterval: 30000 // 30 seconds - more frequent for working memory
        });
        
        this.currentSession = null;
        this.sessions = new Map();
        this.taskState = null;
        this.agentStates = new Map();
        this.context = new Map();
        
        this.initialize();
    }

    /**
     * Initialize working memory with default session
     */
    async initialize() {
        await super.initialize();
        
        try {
            // Create default session
            const defaultSessionId = 'default_session';
            await this.createSession(defaultSessionId);
            
            await logger.info('Working Memory initialized with default session', {
                sessionId: defaultSessionId,
                memoryType: this.memoryType
            });
            
        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'working_memory_initialization',
                component: 'WorkingMemory'
            });
        }
    }

    /**
     * Create a new session
     * @param {string} sessionId - Unique session identifier
     * @returns {Promise<void>}
     */
    async createSession(sessionId) {
        try {
            if (!sessionId || typeof sessionId !== 'string') {
                throw new Error('Session ID must be a non-empty string');
            }

            if (this.sessions.has(sessionId)) {
                throw new Error(`Session ${sessionId} already exists`);
            }

            const session = {
                id: sessionId,
                created: new Date().toISOString(),
                lastAccessed: new Date().toISOString(),
                context: new Map(),
                taskState: null,
                agentStates: new Map(),
                metrics: {
                    operationsCount: 0,
                    memoryUsage: 0,
                    agentsUsed: new Set(),
                    tasksCompleted: 0
                }
            };

            this.sessions.set(sessionId, session);
            this.currentSession = sessionId;

            // Store session in memory store for persistence
            await this.store(`session:${sessionId}`, session, {
                type: 'working',
                category: 'session',
                tags: ['session', 'active'],
                priority: 10 // High priority for sessions
            });

            await logger.info('Working memory session created', {
                sessionId,
                totalSessions: this.sessions.size
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'create_session',
                component: 'WorkingMemory',
                metadata: { sessionId }
            });
            throw error;
        }
    }

    /**
     * Destroy a session and clean up its data
     * @param {string} sessionId - Session identifier
     * @returns {Promise<void>}
     */
    async destroySession(sessionId) {
        try {
            if (!this.sessions.has(sessionId)) {
                throw new Error(`Session ${sessionId} does not exist`);
            }

            const session = this.sessions.get(sessionId);
            
            // Clean up all session-related data
            const sessionKeys = [];
            for (const [key, metadata] of this.metadata) {
                if (metadata.sessionId === sessionId) {
                    sessionKeys.push(key);
                }
            }

            for (const key of sessionKeys) {
                await this.delete(key);
            }

            // Remove session from memory
            this.sessions.delete(sessionId);
            await this.delete(`session:${sessionId}`);

            // Switch to default session if current session was destroyed
            if (this.currentSession === sessionId) {
                const remainingSessions = Array.from(this.sessions.keys());
                if (remainingSessions.length > 0) {
                    this.currentSession = remainingSessions[0];
                } else {
                    // Create new default session
                    await this.createSession('default_session');
                }
            }

            await logger.info('Working memory session destroyed', {
                sessionId,
                itemsCleanedUp: sessionKeys.length,
                newCurrentSession: this.currentSession
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'destroy_session',
                component: 'WorkingMemory',
                metadata: { sessionId }
            });
            throw error;
        }
    }

    /**
     * Get current session ID
     * @returns {string|null} Current session ID
     */
    getCurrentSession() {
        return this.currentSession;
    }

    /**
     * Switch to a different session
     * @param {string} sessionId - Target session ID
     * @returns {Promise<void>}
     */
    async switchSession(sessionId) {
        try {
            if (!this.sessions.has(sessionId)) {
                throw new Error(`Session ${sessionId} does not exist`);
            }

            const oldSession = this.currentSession;
            this.currentSession = sessionId;

            // Update session access time
            const session = this.sessions.get(sessionId);
            session.lastAccessed = new Date().toISOString();
            await this.update(`session:${sessionId}`, session);

            // Load session context
            await this.loadSessionContext(sessionId);

            await logger.info('Switched working memory session', {
                from: oldSession,
                to: sessionId
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'switch_session',
                component: 'WorkingMemory',
                metadata: { sessionId, currentSession: this.currentSession }
            });
            throw error;
        }
    }

    /**
     * Set context value for current session
     * @param {string} key - Context key
     * @param {any} value - Context value
     * @returns {Promise<void>}
     */
    async setContext(key, value) {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            const contextKey = this.getContextKey(key);
            
            await this.store(contextKey, value, {
                type: 'working',
                category: 'context',
                sessionId: this.currentSession,
                tags: ['context', 'session'],
                priority: 8
            });

            // Update session context cache
            const session = this.sessions.get(this.currentSession);
            if (session) {
                session.context.set(key, value);
                session.metrics.operationsCount++;
                await this.update(`session:${this.currentSession}`, session);
            }

            await logger.debug('Working memory context updated', {
                sessionId: this.currentSession,
                key,
                valueType: typeof value
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'set_context',
                component: 'WorkingMemory',
                metadata: { key, sessionId: this.currentSession }
            });
            throw error;
        }
    }

    /**
     * Get context value from current session
     * @param {string} key - Context key
     * @returns {Promise<any>} Context value
     */
    async getContext(key) {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            // Check session cache first
            const session = this.sessions.get(this.currentSession);
            if (session && session.context.has(key)) {
                return session.context.get(key);
            }

            // Retrieve from memory store
            const contextKey = this.getContextKey(key);
            const item = await this.retrieve(contextKey);
            
            if (item) {
                // Update session cache
                if (session) {
                    session.context.set(key, item.data);
                }
                return item.data;
            }

            return null;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_context',
                component: 'WorkingMemory',
                metadata: { key, sessionId: this.currentSession }
            });
            return null;
        }
    }

    /**
     * Get all context for current session
     * @returns {Promise<Object>} All context data
     */
    async getAllContext() {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            const session = this.sessions.get(this.currentSession);
            if (session) {
                return Object.fromEntries(session.context);
            }

            // Fallback: query from memory store
            const contextItems = await this.query({
                type: 'working',
                category: 'context',
                sessionId: this.currentSession
            });

            const allContext = {};
            for (const item of contextItems) {
                const key = item.key.replace(`context:${this.currentSession}:`, '');
                allContext[key] = item.data;
            }

            return allContext;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_all_context',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession }
            });
            return {};
        }
    }

    /**
     * Clear all context for current session
     * @returns {Promise<void>}
     */
    async clearContext() {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            // Clear from memory store
            const contextItems = await this.query({
                type: 'working',
                category: 'context',
                sessionId: this.currentSession
            });

            for (const item of contextItems) {
                await this.delete(item.key);
            }

            // Clear session cache
            const session = this.sessions.get(this.currentSession);
            if (session) {
                session.context.clear();
                await this.update(`session:${this.currentSession}`, session);
            }

            await logger.info('Working memory context cleared', {
                sessionId: this.currentSession,
                itemsCleared: contextItems.length
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'clear_context',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession }
            });
            throw error;
        }
    }

    /**
     * Set task state for current session
     * @param {Object} state - Task state object
     * @returns {Promise<void>}
     */
    async setTaskState(state) {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            // Validate task state structure
            this.validateTaskState(state);

            const taskKey = `task:${this.currentSession}`;
            
            await this.store(taskKey, state, {
                type: 'working',
                category: 'task',
                sessionId: this.currentSession,
                tags: ['task', 'state'],
                priority: 9
            });

            // Update session cache
            const session = this.sessions.get(this.currentSession);
            if (session) {
                session.taskState = state;
                session.metrics.operationsCount++;
                await this.update(`session:${this.currentSession}`, session);
            }

            await logger.info('Working memory task state updated', {
                sessionId: this.currentSession,
                taskId: state.id,
                status: state.status,
                progress: state.progress
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'set_task_state',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession, taskState: state }
            });
            throw error;
        }
    }

    /**
     * Get task state for current session
     * @returns {Promise<Object|null>} Task state
     */
    async getTaskState() {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            // Check session cache first
            const session = this.sessions.get(this.currentSession);
            if (session && session.taskState) {
                return session.taskState;
            }

            // Retrieve from memory store
            const taskKey = `task:${this.currentSession}`;
            const item = await this.retrieve(taskKey);
            
            if (item) {
                // Update session cache
                if (session) {
                    session.taskState = item.data;
                }
                return item.data;
            }

            return null;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_task_state',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession }
            });
            return null;
        }
    }

    /**
     * Update task progress
     * @param {Object} progress - Progress update
     * @returns {Promise<void>}
     */
    async updateTaskProgress(progress) {
        try {
            const currentState = await this.getTaskState();
            if (!currentState) {
                throw new Error('No active task to update');
            }

            const updatedState = {
                ...currentState,
                progress: progress.percentage || currentState.progress,
                lastUpdate: new Date().toISOString()
            };

            // Update progress details if provided
            if (progress.completed) {
                updatedState.completedItems = progress.completed;
            }
            if (progress.inProgress) {
                updatedState.inProgressItems = progress.inProgress;
            }
            if (progress.pending) {
                updatedState.pendingItems = progress.pending;
            }
            if (progress.estimatedCompletion) {
                updatedState.estimatedCompletion = progress.estimatedCompletion;
            }

            await this.setTaskState(updatedState);

            await logger.debug('Task progress updated', {
                sessionId: this.currentSession,
                taskId: currentState.id,
                progress: progress.percentage || currentState.progress
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'update_task_progress',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession, progress }
            });
            throw error;
        }
    }

    /**
     * Set agent state
     * @param {string} agentType - Type of agent
     * @param {Object} state - Agent state
     * @returns {Promise<void>}
     */
    async setAgentState(agentType, state) {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            // Validate agent state structure
            this.validateAgentState(state);

            const agentKey = `agent:${this.currentSession}:${agentType}`;
            
            await this.store(agentKey, state, {
                type: 'working',
                category: 'agent',
                sessionId: this.currentSession,
                agentType,
                tags: ['agent', 'state', agentType],
                priority: 7
            });

            // Update session cache
            const session = this.sessions.get(this.currentSession);
            if (session) {
                session.agentStates.set(agentType, state);
                session.metrics.agentsUsed.add(agentType);
                session.metrics.operationsCount++;
                await this.update(`session:${this.currentSession}`, session);
            }

            await logger.debug('Agent state updated', {
                sessionId: this.currentSession,
                agentType,
                status: state.status,
                operation: state.currentOperation
            });

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'set_agent_state',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession, agentType }
            });
            throw error;
        }
    }

    /**
     * Get agent state
     * @param {string} agentType - Type of agent
     * @returns {Promise<Object|null>} Agent state
     */
    async getAgentState(agentType) {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            // Check session cache first
            const session = this.sessions.get(this.currentSession);
            if (session && session.agentStates.has(agentType)) {
                return session.agentStates.get(agentType);
            }

            // Retrieve from memory store
            const agentKey = `agent:${this.currentSession}:${agentType}`;
            const item = await this.retrieve(agentKey);
            
            if (item) {
                // Update session cache
                if (session) {
                    session.agentStates.set(agentType, item.data);
                }
                return item.data;
            }

            return null;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_agent_state',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession, agentType }
            });
            return null;
        }
    }

    /**
     * Get all agent states
     * @returns {Promise<Object>} All agent states
     */
    async getAllAgentStates() {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            const session = this.sessions.get(this.currentSession);
            if (session) {
                return Object.fromEntries(session.agentStates);
            }

            // Fallback: query from memory store
            const agentItems = await this.query({
                type: 'working',
                category: 'agent',
                sessionId: this.currentSession
            });

            const allStates = {};
            for (const item of agentItems) {
                const agentType = item.metadata.agentType;
                if (agentType) {
                    allStates[agentType] = item.data;
                }
            }

            return allStates;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_all_agent_states',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession }
            });
            return {};
        }
    }

    /**
     * Get session metrics
     * @returns {Promise<Object>} Session metrics
     */
    async getSessionMetrics() {
        try {
            if (!this.currentSession) {
                throw new Error('No active session');
            }

            const session = this.sessions.get(this.currentSession);
            if (!session) {
                throw new Error('Current session not found');
            }

            const sessionDuration = Date.now() - new Date(session.created).getTime();
            
            // Calculate memory usage for session
            let memoryUsage = 0;
            const sessionItems = await this.query({
                type: 'working',
                sessionId: this.currentSession
            });

            for (const item of sessionItems) {
                memoryUsage += this.estimateSize(item.data);
            }

            const metrics = {
                sessionId: this.currentSession,
                duration: sessionDuration,
                operationsCount: session.metrics.operationsCount,
                memoryUsage,
                agentsUsed: Array.from(session.metrics.agentsUsed),
                tasksCompleted: session.metrics.tasksCompleted,
                efficiency: this.calculateSessionEfficiency(session, sessionDuration, memoryUsage)
            };

            return metrics;

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'get_session_metrics',
                component: 'WorkingMemory',
                metadata: { sessionId: this.currentSession }
            });
            return {
                sessionId: this.currentSession,
                duration: 0,
                operationsCount: 0,
                memoryUsage: 0,
                agentsUsed: [],
                tasksCompleted: 0,
                efficiency: 0
            };
        }
    }

    // Utility Methods

    /**
     * Get context key for current session
     * @param {string} key - Context key
     * @returns {string} Full context key
     */
    getContextKey(key) {
        return `context:${this.currentSession}:${key}`;
    }

    /**
     * Load session context into cache
     * @param {string} sessionId - Session ID
     * @returns {Promise<void>}
     */
    async loadSessionContext(sessionId) {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) return;

            // Load context
            const contextItems = await this.query({
                type: 'working',
                category: 'context',
                sessionId
            });

            session.context.clear();
            for (const item of contextItems) {
                const key = item.key.replace(`context:${sessionId}:`, '');
                session.context.set(key, item.data);
            }

            // Load task state
            const taskItem = await this.retrieve(`task:${sessionId}`);
            session.taskState = taskItem ? taskItem.data : null;

            // Load agent states
            const agentItems = await this.query({
                type: 'working',
                category: 'agent',
                sessionId
            });

            session.agentStates.clear();
            for (const item of agentItems) {
                const agentType = item.metadata.agentType;
                if (agentType) {
                    session.agentStates.set(agentType, item.data);
                    session.metrics.agentsUsed.add(agentType);
                }
            }

        } catch (error) {
            await logger.warn('Failed to load session context', error, { sessionId });
        }
    }

    /**
     * Validate task state structure
     * @param {Object} state - Task state to validate
     */
    validateTaskState(state) {
        const required = ['id', 'type', 'status', 'description'];
        const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];

        for (const field of required) {
            if (!state[field]) {
                throw new Error(`Task state missing required field: ${field}`);
            }
        }

        if (!validStatuses.includes(state.status)) {
            throw new Error(`Invalid task status: ${state.status}`);
        }

        if (typeof state.progress !== 'undefined' && 
            (typeof state.progress !== 'number' || state.progress < 0 || state.progress > 100)) {
            throw new Error('Task progress must be a number between 0 and 100');
        }
    }

    /**
     * Validate agent state structure
     * @param {Object} state - Agent state to validate
     */
    validateAgentState(state) {
        const required = ['type', 'status', 'lastUpdate'];
        const validStatuses = ['idle', 'thinking', 'working', 'waiting', 'error'];

        for (const field of required) {
            if (!state[field]) {
                throw new Error(`Agent state missing required field: ${field}`);
            }
        }

        if (!validStatuses.includes(state.status)) {
            throw new Error(`Invalid agent status: ${state.status}`);
        }

        // Validate performance metrics if present
        if (state.performance) {
            const perf = state.performance;
            if (typeof perf.operationsCompleted !== 'number' || perf.operationsCompleted < 0) {
                throw new Error('Invalid performance.operationsCompleted');
            }
            if (typeof perf.averageResponseTime !== 'number' || perf.averageResponseTime < 0) {
                throw new Error('Invalid performance.averageResponseTime');
            }
        }
    }

    /**
     * Calculate session efficiency score
     * @param {Object} session - Session object
     * @param {number} duration - Session duration in ms
     * @param {number} memoryUsage - Memory usage in bytes
     * @returns {number} Efficiency score (0-1)
     */
    calculateSessionEfficiency(session, duration, memoryUsage) {
        try {
            const durationHours = duration / (1000 * 60 * 60);
            const memoryMB = memoryUsage / (1024 * 1024);
            
            // Simple efficiency calculation based on operations per hour and memory efficiency
            const operationsPerHour = durationHours > 0 ? session.metrics.operationsCount / durationHours : 0;
            const memoryEfficiency = memoryMB > 0 ? session.metrics.operationsCount / memoryMB : 1;
            
            // Normalize and combine metrics
            const timeEfficiency = Math.min(operationsPerHour / 100, 1); // Normalize to max 100 ops/hour
            const memEfficiency = Math.min(memoryEfficiency / 10, 1); // Normalize to max 10 ops/MB
            
            return (timeEfficiency + memEfficiency) / 2;
            
        } catch (error) {
            return 0.5; // Default middle efficiency
        }
    }

    /**
     * Cleanup expired sessions and data
     * @returns {Promise<void>}
     */
    async cleanupExpiredSessions() {
        try {
            const now = Date.now();
            const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
            const expiredSessions = [];

            for (const [sessionId, session] of this.sessions) {
                const lastAccessed = new Date(session.lastAccessed).getTime();
                if (now - lastAccessed > sessionTimeout && sessionId !== 'default_session') {
                    expiredSessions.push(sessionId);
                }
            }

            for (const sessionId of expiredSessions) {
                await this.destroySession(sessionId);
            }

            if (expiredSessions.length > 0) {
                await logger.info('Cleaned up expired working memory sessions', {
                    expiredSessions: expiredSessions.length,
                    remainingSessions: this.sessions.size
                });
            }

        } catch (error) {
            await errorHandler.handleError(error, {
                operation: 'cleanup_expired_sessions',
                component: 'WorkingMemory'
            });
        }
    }

    /**
     * Enhanced compaction that includes session cleanup
     * @returns {Promise<Object>} Compaction result
     */
    async compact() {
        const result = await super.compact();
        
        // Add session cleanup
        await this.cleanupExpiredSessions();
        
        return result;
    }
}

// Create and export singleton instance
export const workingMemory = new WorkingMemory();

// Export for ES6 modules
export default WorkingMemory;