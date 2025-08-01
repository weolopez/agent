class ChatInterface extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        // Component state
        this.agent = null;
        this.messages = [];
        this.isProcessing = false;
        this.currentSession = null;
        
        // UI references
        this.messagesContainer = null;
        this.inputField = null;
        this.sendButton = null;
        this.statusIndicator = null;
        
        // Event handlers
        this.handleSendMessage = this.handleSendMessage.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleAgentResponse = this.handleAgentResponse.bind(this);
        
        this.render();
        this.setupEventListeners();
    }

    setAgent(agent) {
        this.agent = agent;
        if (agent) {
            agent.on('response', this.handleAgentResponse);
            agent.on('processing', (isProcessing) => {
                this.isProcessing = isProcessing;
                this.updateStatus();
            });
            agent.on('error', (error) => {
                this.addMessage('system', `Error: ${error.message}`, 'error');
            });
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #0a0a0a;
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .chat-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid #333;
                    background: #111;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .chat-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                }
                
                .status-indicator {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    color: #999;
                }
                
                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #666;
                    transition: background-color 0.3s ease;
                }
                
                .status-dot.ready {
                    background: #4CAF50;
                }
                
                .status-dot.processing {
                    background: #FF9800;
                    animation: pulse 1.5s infinite;
                }
                
                .status-dot.error {
                    background: #f44336;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                .messages-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                .message {
                    display: flex;
                    gap: 12px;
                    max-width: 80%;
                    align-self: flex-start;
                    animation: slideIn 0.3s ease-out;
                }
                
                .message.user {
                    align-self: flex-end;
                    flex-direction: row-reverse;
                }
                
                .message.system {
                    align-self: center;
                    max-width: 60%;
                    opacity: 0.7;
                }
                
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .message-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 600;
                    flex-shrink: 0;
                }
                
                .message.user .message-avatar {
                    background: #007acc;
                    color: white;
                }
                
                .message.agent .message-avatar {
                    background: #333;
                    color: #fff;
                }
                
                .message.system .message-avatar {
                    background: #666;
                    color: #ccc;
                }
                
                .message-content {
                    background: #1a1a1a;
                    border-radius: 12px;
                    padding: 12px 16px;
                    line-height: 1.5;
                    word-wrap: break-word;
                    border: 1px solid #333;
                    position: relative;
                }
                
                .message.user .message-content {
                    background: #007acc;
                    color: white;
                    border-color: #0056b3;
                }
                
                .message.system .message-content {
                    background: #2a2a2a;
                    border-color: #555;
                    font-style: italic;
                    text-align: center;
                }
                
                .message.error .message-content {
                    background: #4a1a1a;
                    border-color: #f44336;
                    color: #ffcdd2;
                }
                
                .message-meta {
                    font-size: 12px;
                    color: #666;
                    margin-top: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .thinking-indicator {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: #1a1a1a;
                    border-radius: 12px;
                    border: 1px solid #333;
                    opacity: 0.8;
                    animation: fadeIn 0.3s ease-out;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 0.8; }
                }
                
                .thinking-dots {
                    display: flex;
                    gap: 4px;
                }
                
                .thinking-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #666;
                    animation: thinking 1.4s infinite ease-in-out both;
                }
                
                .thinking-dot:nth-child(1) { animation-delay: -0.32s; }
                .thinking-dot:nth-child(2) { animation-delay: -0.16s; }
                
                @keyframes thinking {
                    0%, 80%, 100% {
                        transform: scale(0);
                        opacity: 0.5;
                    }
                    40% {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
                
                .input-container {
                    padding: 20px;
                    border-top: 1px solid #333;
                    background: #111;
                    display: flex;
                    gap: 12px;
                    align-items: end;
                }
                
                .input-field {
                    flex: 1;
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 12px 16px;
                    color: #fff;
                    font-size: 14px;
                    line-height: 1.4;
                    resize: none;
                    min-height: 20px;
                    max-height: 120px;
                    overflow-y: auto;
                    font-family: inherit;
                }
                
                .input-field:focus {
                    outline: none;
                    border-color: #007acc;
                    background: #222;
                }
                
                .input-field::placeholder {
                    color: #666;
                }
                
                .send-button {
                    background: #007acc;
                    border: none;
                    border-radius: 8px;
                    padding: 12px 16px;
                    color: white;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .send-button:hover:not(:disabled) {
                    background: #0056b3;
                }
                
                .send-button:disabled {
                    background: #333;
                    color: #666;
                    cursor: not-allowed;
                }
                
                .send-icon {
                    width: 16px;
                    height: 16px;
                    fill: currentColor;
                }
                
                .empty-state {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    color: #666;
                    gap: 16px;
                }
                
                .empty-state h3 {
                    color: #fff;
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                }
                
                .empty-state p {
                    margin: 0;
                    font-size: 14px;
                    line-height: 1.5;
                    max-width: 400px;
                }
                
                .suggestions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    justify-content: center;
                    margin-top: 20px;
                }
                
                .suggestion {
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 6px;
                    padding: 8px 12px;
                    font-size: 13px;
                    color: #ccc;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .suggestion:hover {
                    background: #333;
                    border-color: #007acc;
                    color: #fff;
                }
                
                /* Scrollbar styling */
                .messages-container::-webkit-scrollbar {
                    width: 6px;
                }
                
                .messages-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .messages-container::-webkit-scrollbar-thumb {
                    background: #333;
                    border-radius: 3px;
                }
                
                .messages-container::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            </style>
            
            <div class="chat-header">
                <div class="chat-title">Agent Assistant</div>
                <div class="status-indicator">
                    <div class="status-dot ready"></div>
                    <span class="status-text">Ready</span>
                </div>
            </div>
            
            <div class="messages-container">
                <div class="empty-state">
                    <h3>Welcome to the Agent System</h3>
                    <p>I'm your AI assistant specialized in business requirements analysis and application impact assessment. Ask me about your requirements or try one of the suggestions below.</p>
                    <div class="suggestions">
                        <div class="suggestion">Analyze business requirements</div>
                        <div class="suggestion">Estimate project impact</div>
                        <div class="suggestion">Find affected applications</div>
                        <div class="suggestion">Create implementation plan</div>
                    </div>
                </div>
            </div>
            
            <div class="input-container">
                <textarea 
                    class="input-field" 
                    placeholder="Type your message here..."
                    rows="1"
                ></textarea>
                <button class="send-button">
                    <svg class="send-icon" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                    Send
                </button>
            </div>
        `;
        
        // Get references to elements
        this.messagesContainer = this.shadowRoot.querySelector('.messages-container');
        this.inputField = this.shadowRoot.querySelector('.input-field');
        this.sendButton = this.shadowRoot.querySelector('.send-button');
        this.statusIndicator = this.shadowRoot.querySelector('.status-indicator');
        this.emptyState = this.shadowRoot.querySelector('.empty-state');
    }

    setupEventListeners() {
        // Send button click
        this.sendButton.addEventListener('click', this.handleSendMessage);
        
        // Enter key to send (Shift+Enter for new line)
        this.inputField.addEventListener('keydown', this.handleKeyPress);
        
        // Auto-resize textarea
        this.inputField.addEventListener('input', () => {
            this.inputField.style.height = 'auto';
            this.inputField.style.height = this.inputField.scrollHeight + 'px';
        });
        
        // Suggestion clicks
        this.shadowRoot.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion')) {
                this.inputField.value = e.target.textContent;
                this.inputField.focus();
            }
        });
    }

    handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendMessage();
        }
    }

    async handleSendMessage() {
        const message = this.inputField.value.trim();
        if (!message || this.isProcessing || !this.agent) {
            return;
        }
        
        // Clear input and hide empty state
        this.inputField.value = '';
        this.inputField.style.height = 'auto';
        this.hideEmptyState();
        
        // Add user message
        this.addMessage('user', message);
        
        // Show thinking indicator
        this.showThinking();
        
        try {
            // Send to agent
            await this.agent.processUserMessage(message);
            
        } catch (error) {
            this.addMessage('system', `Failed to process message: ${error.message}`, 'error');
        } finally {
            this.hideThinking();
        }
    }

    handleAgentResponse(response) {
        this.hideThinking();
        
        if (response.content) {
            this.addMessage('agent', response.content, 'success', response.metadata);
        }
        
        if (response.error) {
            this.addMessage('system', `Agent error: ${response.error}`, 'error');
        }
    }

    addMessage(sender, content, type = 'normal', metadata = null) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender} ${type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = this.getAvatarText(sender);
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Format content based on type
        if (typeof content === 'object') {
            messageContent.innerHTML = this.formatComplexContent(content);
        } else {
            messageContent.innerHTML = this.formatTextContent(content);
        }
        
        messageElement.appendChild(avatar);
        messageElement.appendChild(messageContent);
        
        // Add metadata if available
        if (metadata) {
            const metaElement = document.createElement('div');
            metaElement.className = 'message-meta';
            metaElement.innerHTML = this.formatMetadata(metadata);
            messageContent.appendChild(metaElement);
        }
        
        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-meta';
        timestamp.textContent = new Date().toLocaleTimeString();
        messageContent.appendChild(timestamp);
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
        
        // Store message
        this.messages.push({
            sender,
            content,
            type,
            timestamp: Date.now(),
            metadata
        });
    }

    formatTextContent(text) {
        // Convert markdown-like formatting
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    formatComplexContent(content) {
        if (content.type === 'analysis') {
            return this.formatAnalysis(content);
        } else if (content.type === 'plan') {
            return this.formatPlan(content);
        } else if (content.type === 'list') {
            return this.formatList(content.items);
        }
        
        return `<pre>${JSON.stringify(content, null, 2)}</pre>`;
    }

    formatAnalysis(analysis) {
        let html = '';
        
        if (analysis.summary) {
            html += `<div class="analysis-section"><strong>Summary:</strong><br>${analysis.summary}</div>`;
        }
        
        if (analysis.findings) {
            html += `<div class="analysis-section"><strong>Findings:</strong><br>${analysis.findings}</div>`;
        }
        
        if (analysis.recommendations) {
            html += `<div class="analysis-section"><strong>Recommendations:</strong><br>${analysis.recommendations}</div>`;
        }
        
        if (analysis.confidence) {
            html += `<div class="confidence-bar">Confidence: ${Math.round(analysis.confidence * 100)}%</div>`;
        }
        
        return html;
    }

    formatPlan(plan) {
        let html = `<div class="plan-goal"><strong>Goal:</strong> ${plan.goal}</div>`;
        
        if (plan.steps && plan.steps.length > 0) {
            html += '<div class="plan-steps"><strong>Steps:</strong><ol>';
            plan.steps.forEach(step => {
                html += `<li><strong>${step.title}</strong><br>${step.description}</li>`;
            });
            html += '</ol></div>';
        }
        
        return html;
    }

    formatList(items) {
        return '<ul>' + items.map(item => `<li>${item}</li>`).join('') + '</ul>';
    }

    formatMetadata(metadata) {
        const parts = [];
        
        if (metadata.model) {
            parts.push(`Model: ${metadata.model}`);
        }
        
        if (metadata.tokens) {
            parts.push(`Tokens: ${metadata.tokens}`);
        }
        
        if (metadata.duration) {
            parts.push(`${Math.round(metadata.duration)}ms`);
        }
        
        return parts.join(' • ');
    }

    getAvatarText(sender) {
        switch (sender) {
            case 'user': return 'U';
            case 'agent': return 'A';
            case 'system': return 'S';
            default: return '?';
        }
    }

    showThinking() {
        const thinkingElement = document.createElement('div');
        thinkingElement.className = 'message agent';
        thinkingElement.innerHTML = `
            <div class="message-avatar">A</div>
            <div class="thinking-indicator">
                <span>Thinking</span>
                <div class="thinking-dots">
                    <div class="thinking-dot"></div>
                    <div class="thinking-dot"></div>
                    <div class="thinking-dot"></div>
                </div>
            </div>
        `;
        thinkingElement.dataset.thinking = 'true';
        
        this.messagesContainer.appendChild(thinkingElement);
        this.scrollToBottom();
    }

    hideThinking() {
        const thinkingElement = this.messagesContainer.querySelector('[data-thinking="true"]');
        if (thinkingElement) {
            thinkingElement.remove();
        }
    }

    hideEmptyState() {
        if (this.emptyState && this.emptyState.style.display !== 'none') {
            this.emptyState.style.display = 'none';
        }
    }

    updateStatus() {
        const statusDot = this.statusIndicator.querySelector('.status-dot');
        const statusText = this.statusIndicator.querySelector('.status-text');
        
        if (this.isProcessing) {
            statusDot.className = 'status-dot processing';
            statusText.textContent = 'Processing...';
        } else if (this.agent) {
            statusDot.className = 'status-dot ready';
            statusText.textContent = 'Ready';
        } else {
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Disconnected';
        }
        
        // Update send button state
        this.sendButton.disabled = this.isProcessing || !this.agent;
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    // Public methods
    clearMessages() {
        this.messages = [];
        this.messagesContainer.innerHTML = '';
        this.emptyState.style.display = 'flex';
    }

    getMessages() {
        return [...this.messages];
    }

    addSystemMessage(message, type = 'info') {
        this.addMessage('system', message, type);
    }

    focus() {
        this.inputField.focus();
    }

    // Lifecycle methods
    connectedCallback() {
        this.focus();
    }

    disconnectedCallback() {
        if (this.agent) {
            this.agent.off('response', this.handleAgentResponse);
        }
    }
}

// Register the custom element
customElements.define('chat-interface', ChatInterface);