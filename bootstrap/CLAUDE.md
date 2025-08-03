# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a single-file web application that implements a multi-agent programming loop using Claude AI. The application orchestrates a workflow of four specialized AI agents (Analyst → Planner → Developer → Tester) that collaborate to build software projects from requirements to production-ready code, with human oversight at each step.

## Architecture

### Single-File Application Structure
The entire application is contained in `agent_MVP.html` with embedded CSS, JavaScript, and HTML:
- **Frontend**: Vanilla HTML/CSS/JavaScript (ES6+) with no external dependencies
- **API Integration**: Direct Claude API calls to `https://api.anthropic.com/v1/messages`
- **State Management**: Local JavaScript state object with browser localStorage for persistence
- **UI Framework**: Custom CSS with gradient design and responsive layout

### Multi-Agent Workflow
Four specialized agents work in sequence:
1. **Analyst Agent** (🔍): Analyzes requirements, identifies challenges, breaks down components
2. **Planner Agent** (📋): Creates technical specifications, architecture designs, implementation roadmaps
3. **Developer Agent** (💻): Writes production-ready code following modern web standards
4. **Tester Agent** (🧪): Conducts comprehensive testing including functionality, performance, accessibility

### Human-in-the-Loop Design
- Manual approval required between each agent step
- Rich feedback system with quick-tag selection and custom text input
- Three approval modes: Approve & Continue, Request Revision, Reject & Stop
- Real-time feedback preview showing exactly what gets sent to the next agent

## Development Commands

Since this is a browser-based application with no build process:
- **Run**: Open `agent_MVP.html` directly in any modern web browser
- **Debug**: Use browser developer tools (F12) for console logs and debugging
- **Test**: Manual testing through the web interface
- **Deploy**: Serve the HTML file from any web server or open locally

## Core Components

### State Management (`currentState` object)
```javascript
currentState = {
    agent: 'analyst|planner|developer|tester',
    iteration: number,
    isRunning: boolean,
    projectDescription: string,
    history: Array<AgentOutput>,
    feedbackHistory: Array<HumanFeedback>,
    apiCallCount: number
}
```

### Agent Configuration
Each agent has structured prompts with JSON response requirements and specific responsibilities. Agent prompts are comprehensive and include context from previous agents, human feedback integration, and professional coding standards.

### API Integration Pattern
Uses fetch API to call Claude API directly:
- Model: `claude-sonnet-4-20250514`
- Max tokens: Configurable (default 4000)
- Context assembly: Dynamic prompt building with placeholders for project description, previous results, and human feedback

### Feedback System
- **Quick Tags**: Pre-defined feedback options (error handling, accessibility, performance, etc.)
- **Custom Feedback**: Free-form text input with automatic tag extraction
- **Feedback History**: Persistent tracking across iterations
- **Context Passing**: Feedback automatically included in next agent's prompt

## Key Features

### Professional Agent Prompts
Each agent has detailed, professional prompts that include:
- Clear role definition and responsibilities
- Context from previous agents in the workflow
- Human feedback integration patterns
- Structured JSON output requirements
- Modern web development best practices

### Workflow Controls
- Project configuration panel with description, max iterations, and token limits
- Real-time status tracking with visual agent flow diagram
- Keyboard shortcuts (Ctrl+Enter for continue, Ctrl+R for reset, Ctrl+P for pause)
- Auto-save functionality for project descriptions

### Output Management
- Structured JSON display with syntax formatting
- Comprehensive iteration history with approval status
- Collapsible output sections with character limits
- Export functionality for complete workflow results

## Browser Compatibility

- **Minimum Requirements**: Modern browsers supporting ES6+, fetch API, and localStorage
- **Tested**: Chrome, Firefox, Safari, Edge (latest versions)
- **Mobile**: Responsive design supports mobile browsers
- **No Dependencies**: Uses only native browser APIs

## Usage Patterns

1. **Project Setup**: Enter project description in configuration panel
2. **Workflow Execution**: Click "Start Analysis" to begin with Analyst agent
3. **Human Oversight**: Review each agent's output and provide feedback
4. **Iteration Control**: Approve to continue, request revisions, or stop workflow
5. **Results Export**: Download complete workflow history as JSON

## File Structure

```
bootstrap/
├── agent_MVP.html          # Complete single-file application
└── CLAUDE.md              # This documentation file
```

The application uses a self-contained architecture where all functionality is embedded in the single HTML file, making it easy to deploy and maintain without build processes or dependency management.