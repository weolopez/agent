# 🔄 Execution Flow Visualization Guide

## Overview
The execution flow visualization system provides real-time insights into the agent's cognitive journey, showing every step of the decision-making process from user input to final response.

## 🎯 What Gets Visualized

### **Agent State Changes**
- `idle` → `thinking` → `processing` → `responding` → `idle`
- State transitions with timestamps and context

### **Operations Timeline**
- **Context Building**: Memory gathering and synthesis
- **Prompt Generation**: System and user prompt creation  
- **LLM Requests**: Model calls with token usage
- **Memory Updates**: Storage of new information
- **Decision Points**: Agent reasoning and choices

### **Memory Access Tracking**
- **Working Memory**: Task context updates
- **Semantic Memory**: Knowledge retrieval and storage
- **Episodic Memory**: Experience recording  
- **Procedural Memory**: Pattern matching and application

### **LLM Interactions**
- Model selection and configuration
- Prompt lengths and token usage
- Response times and success rates
- Error handling and retries

## 🎮 How to Use

### **1. Start Recording**
```javascript
// In the UI, click "Start Recording" button
// Or programmatically:
executionFlow.toggleRecording();
```

### **2. Send Complex Query**
Use the complex business requirements example I provided earlier to see the full flow in action.

### **3. Watch the Timeline**
The execution flow will show:
- Real-time operations as they happen
- Color-coded event types
- Detailed metadata for each step
- Performance metrics

### **4. Analyze the Flow**
- **Timeline View**: Chronological sequence of events
- **Graph View**: Visual flow diagram (coming soon)
- **Statistics**: Performance metrics and summaries

## 📊 Event Types & Colors

| Event Type | Color | Description |
|------------|-------|-------------|
| **State Change** | 🟢 Green | Agent lifecycle transitions |
| **Operation** | 🔵 Blue | Core processing operations |
| **Memory Access** | 🟠 Orange | Memory read/write operations |
| **LLM Call** | 🟣 Purple | Language model interactions |
| **Decision** | 🔴 Red | Agent decision points |

## 🔍 Detailed Event Information

### **Context Building Event**
```json
{
  "type": "context_building",
  "description": "Building context from memory systems",
  "context": {
    "taskId": "task_1703123456_abc123",
    "domain": "business_analysis",
    "memoryTypes": ["working", "semantic", "episodic", "procedural"],
    "contextItems": 15
  },
  "duration": 125
}
```

### **LLM Call Event**
```json
{
  "type": "llm_call",
  "description": "LLM Call: qwen/qwen3-coder",
  "data": {
    "model": "qwen/qwen3-coder",
    "provider": "openrouter",
    "tokens": 1250,
    "duration": 2300,
    "promptLength": 3400
  }
}
```

### **Memory Access Event**
```json
{
  "type": "memory_access",
  "description": "Memory: episodic store",
  "data": {
    "memoryType": "episodic",
    "operation": "store",
    "key": "interaction_task_123",
    "hitMiss": "store"
  }
}
```

## 🎨 Advanced Features

### **1. Export Execution Flow**
```javascript
// Click "Export" to download JSON with full execution trace
{
  "timestamp": "2024-01-20T10:30:00.000Z",
  "executionHistory": [...],
  "stats": {
    "totalSteps": 45,
    "totalDuration": 5200,
    "memoryAccesses": 12,
    "llmCalls": 3
  }
}
```

### **2. Real-time Statistics**
- **Total Steps**: Number of discrete operations
- **Duration**: End-to-end processing time
- **Memory Accesses**: Read/write operations count
- **LLM Calls**: Model interaction frequency

### **3. Performance Analysis**
- Identify bottlenecks in the cognitive process
- Track memory usage patterns
- Monitor LLM efficiency
- Analyze decision-making paths

## 🚀 Use Cases

### **1. Complex Business Analysis**
Watch how the agent:
1. Builds context from business domain knowledge
2. Analyzes requirements across multiple dimensions
3. Accesses historical project data
4. Generates comprehensive recommendations

### **2. Multi-Step Reasoning**
Observe the agent's cognitive journey:
- Initial problem decomposition
- Knowledge retrieval from memory
- Iterative refinement of understanding  
- Final synthesis and response generation

### **3. Performance Optimization**
Identify optimization opportunities:
- Slow memory operations
- Inefficient LLM calls
- Redundant context building
- Memory cache miss patterns

## 🔧 Developer Integration

### **Adding Custom Events**
```javascript
// In your custom operations
this.emit('operationStart', {
  type: 'custom_analysis',
  description: 'Performing specialized analysis',
  context: { analysisType: 'risk_assessment' }
});

// After completion
this.emit('operationComplete', {
  success: true,
  data: { risksIdentified: 5 },
  duration: operationTime
});
```

### **Memory Access Tracking**
```javascript
// Automatically tracked in memory operations
this.emit('memoryAccess', {
  type: 'semantic',
  operation: 'retrieve',
  key: 'business_rules_v2',
  hitMiss: 'hit'
});
```

### **Decision Tracking**
```javascript
// Track important decision points
this.emit('decision', {
  type: 'estimation_strategy',
  options: ['historical', 'algorithmic', 'hybrid'],
  selected: 'hybrid',
  reasoning: 'Combines historical accuracy with algorithmic precision',
  confidence: 0.85
});
```

## 📈 Understanding Agent Cognition

The execution flow reveals the agent's:

1. **Memory-Driven Reasoning**: How past experiences inform current decisions
2. **Context Assembly**: How relevant information is gathered and synthesized
3. **Iterative Refinement**: How understanding evolves through the process
4. **Multi-Modal Analysis**: How different types of information are integrated
5. **Performance Patterns**: Consistent behaviors and optimization opportunities

This visualization transforms the "black box" of AI reasoning into a transparent, observable process that helps you understand exactly how the agent arrives at its conclusions! 🎯