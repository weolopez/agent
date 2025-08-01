# Browser-Based Agentic AI System

A sophisticated agentic AI system built as a single-page web application using modern web standards. The system demonstrates autonomous multi-step reasoning with memory-driven behavior, specialized in business requirements analysis and application impact assessment.

## 🎯 Key Features

- **Memory-Driven Architecture**: Four-tier memory system (Working, Semantic, Episodic, Procedural) with multi-level caching
- **Autonomous Agent Engine**: Analysis → Planning → Execution loops with contextual decision making  
- **Modern Web Standards**: Uses IndexedDB, WebGPU-ready, WebNN support, native ES6 modules
- **No Third-Party Dependencies**: Built entirely with native web APIs
- **OpenRouter Integration**: Support for multiple LLM providers through OpenRouter API
- **Business Requirements Specialization**: Specialized tools for requirements analysis and impact assessment

## 🏗️ Architecture Overview

### Core Systems
- **Configuration Management**: Reactive configuration with persistent settings
- **Logging & Observability**: Comprehensive logging with performance metrics
- **Error Handling**: Intelligent error recovery with circuit breaker patterns
- **Multi-Level Caching**: L1/L2/L3 cache hierarchy with automatic promotion/demotion

### Memory Architecture
- **Working Memory**: Current task context and active variables
- **Semantic Memory**: Facts, knowledge, and domain information  
- **Episodic Memory**: Past experiences and interaction history
- **Procedural Memory**: How-to patterns and successful workflows

### LLM Integration
- **Primary**: OpenRouter API with multiple model support
- **Prompt Engineering**: Dynamic prompt generation with context assembly
- **Response Parsing**: Intelligent parsing for structured outputs
- **Rate Limiting**: Built-in rate limiting and request optimization

### Agent Engine
- **State Management**: Finite state machine for agent lifecycle
- **Operation Queue**: Priority-based operation scheduling
- **Context Assembly**: Memory-driven context building for operations
- **Business Tools**: Mock APIs for application catalog, project history, and estimation

## 🚀 Getting Started

### Prerequisites
- Modern web browser with ES6 module support
- OpenRouter API key (optional, for LLM functionality)
- Local web server (for CORS compliance)

### Quick Start

1. **Clone or download the project files**

2. **Start a local web server**:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx http-server
   
   # Using PHP
   php -S localhost:8000
   ```

3. **Open the application**:
   - Main App: `http://localhost:8000/index.html`
   - Test Runner: `http://localhost:8000/test.html`

4. **Configure OpenRouter (Optional)**:
   - Get an API key from [OpenRouter](https://openrouter.ai)
   - The system will prompt for the key on first LLM request
   - Alternatively, configure in browser localStorage:
     ```javascript
     localStorage.setItem('agentSystemConfig', JSON.stringify({
       llm: { openRouterApiKey: 'your-key-here' }
     }));
     ```

## 📁 Project Structure

```
agent/
├── index.html              # Main application entry point
├── test.html              # Test runner interface
├── README.md              # This file
├── CLAUDE.md              # Claude Code integration guide
├── src/
│   ├── core/              # Core infrastructure
│   │   ├── config.js      # Configuration management
│   │   ├── logger.js      # Logging system
│   │   ├── errors.js      # Error handling & recovery
│   │   └── cache.js       # Multi-level caching
│   ├── memory/            # Memory architecture
│   │   ├── store.js       # Memory storage backend
│   │   ├── operations.js  # Memory operation patterns
│   │   └── context.js     # Context management
│   ├── llm/               # LLM integration
│   │   ├── interface.js   # LLM abstraction layer
│   │   ├── prompts.js     # Prompt engineering
│   │   └── openrouter.js  # OpenRouter client
│   ├── operations/        # Agent operations (planned)
│   ├── agent/             # Agent engine
│   │   └── engine.js      # Main agent orchestration
│   ├── ui/                # User interface
│   │   └── components/    # Web components
│   │       ├── chat-interface.js
│   │       ├── agent-status.js
│   │       └── memory-viewer.js
│   └── tools/             # Business tools
│       └── business-apis.js # Mock business APIs
```

## 🧪 Testing

The system includes a comprehensive test suite covering:

- **Unit Tests**: Core component functionality
- **Integration Tests**: Cross-component interactions  
- **UI Tests**: Web component initialization

Run tests by opening `test.html` in your browser and clicking "Run All Tests".

## 🎮 Usage Examples

### Basic Interaction
```
User: "Analyze the requirements for adding real-time notifications to our customer portal"

Agent: [Analyzes requirements using memory and business tools]
- Identifies impacted applications
- Reviews similar historical projects  
- Generates effort estimates with confidence levels
- Provides implementation recommendations
```

### Business Requirements Analysis
The agent specializes in:
- **Requirements Decomposition**: Breaking down complex requirements
- **Application Impact Assessment**: Identifying affected systems
- **Effort Estimation**: T-shirt sizing with historical data
- **Risk Assessment**: Technical and business risk analysis
- **Implementation Planning**: Step-by-step execution plans

### Memory-Driven Responses
The agent leverages its memory system to:
- **Learn from Interactions**: Store and recall past conversations
- **Apply Domain Knowledge**: Use accumulated business knowledge
- **Reference Past Projects**: Compare with historical successes
- **Improve Over Time**: Refine estimates based on feedback

## ⚙️ Configuration

### System Configuration
The agent supports extensive configuration through the UI or programmatically:

```javascript
// LLM Configuration
config.setLLMProvider('openrouter', { 
  apiKey: 'your-key',
  model: 'anthropic/claude-3-5-sonnet-20241022'
});

// Memory Configuration
config.updateMemoryConfig({
  cacheLevels: [100, 500, 1000], // L1, L2, L3 sizes
  persistentStorage: true,
  ttl: { L1: 300000, L2: 1800000, L3: 7200000 }
});

// Agent Configuration
config.updateAgentConfig({
  personality: 'Expert business analyst',
  maxOperationsPerLoop: 15,
  operationTimeout: 45000
});
```

### Environment Variables
Configure through localStorage or config API:
- `llm.openRouterApiKey`: OpenRouter API key
- `logging.level`: Logging level (debug, info, warn, error)
- `memory.persistentStorage`: Enable/disable IndexedDB persistence
- `ui.debugMode`: Enable debug UI features

## 🛠️ Development

### Adding New Memory Types
```javascript
// Extend memory store
class CustomMemoryStore extends MemoryStore {
  async storeCustomMemory(key, value, metadata) {
    return await this.store('custom', key, value, metadata);
  }
}
```

### Creating New Operations
```javascript
// Add to operations system
class CustomOperation {
  async execute(context, parameters) {
    // 1. Check memory for relevant context
    // 2. Perform operation logic
    // 3. Update memory with results
    // 4. Return structured response
  }
}
```

### Extending Business Tools
```javascript
// Add new mock APIs
class CustomBusinessAPI {
  async queryCustomData(criteria) {
    // Implement mock API logic
    return { success: true, data: [...] };
  }
}
```

## 🔧 Troubleshooting

### Common Issues

**Agent not responding to messages**:
- Check browser console for errors
- Verify OpenRouter API key is configured
- Ensure local server is running (not file:// protocol)

**Memory not persisting**:
- Check IndexedDB support in browser
- Verify `memory.persistentStorage` is enabled
- Clear browser data if corrupted

**LLM requests failing**:
- Verify OpenRouter API key is valid
- Check network connectivity
- Review rate limiting in browser console

**Tests failing**:
- Ensure all dependencies are loaded
- Check for browser compatibility issues
- Review test output for specific error messages

### Debug Mode
Enable debug mode for additional logging and UI features:
```javascript
config.set('ui.debugMode', true);
config.set('logging.level', 'debug');
```

## 🤝 Contributing

This is a demonstration project showcasing agentic AI architecture. Key areas for enhancement:

1. **Additional LLM Providers**: Extend beyond OpenRouter
2. **Real Business API Integration**: Replace mock APIs with real systems  
3. **Advanced Memory Algorithms**: Implement more sophisticated memory patterns
4. **Enhanced UI Components**: Add more interactive debugging tools
5. **Performance Optimization**: WebGPU/WebNN integration for local inference

## 📜 License

This project is provided as-is for educational and demonstration purposes. Feel free to use and modify according to your needs.

## 🙏 Acknowledgments

- Built with modern web standards and native APIs
- Inspired by cognitive architecture research
- Uses OpenRouter for LLM provider abstraction
- Designed for Claude Code integration

---

**Note**: This system is designed as a demonstration of agentic AI architecture. For production use, consider security implications, data persistence requirements, and scalability needs.# agent
