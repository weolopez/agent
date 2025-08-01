# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser-based agentic AI system built as a single-page web application using modern web standards. The system is designed to autonomously handle complex multi-step tasks, with the primary use case being deep business requirements research - analyzing requirements and identifying impacted applications with t-shirt sized estimates based on historical data.

## Architecture

### Core Design Principles
- **Single Agent First**: Implement one agent properly before adding multiple agents
- **Memory-Driven Design**: Every operation checks memory before acting and updates memory after
- **Modern Web Standards**: Uses IndexedDB, WebGPU, WebNN where appropriate
- **No Third-Party Dependencies**: Avoid external libraries, use native web APIs
- **Single HTML + Web Components**: One index.html with modular web components

### Key Components
- **Memory System**: Four memory types (Working, Semantic, Episodic, Procedural) with multi-level caching (L1/L2/L3)
- **Agent Engine**: Follows Analysis → Planning → Execution loop with memory-driven behavior
- **LLM Integration**: Primary integration with Claude Pro, fallback to OpenRouter for external APIs
- **Cross-Cutting Concerns**: Configuration, logging, error handling, caching infrastructure

### File Structure (Planned)
```
src/
├── core/          # Configuration, logging, errors, cache
├── memory/        # Memory stores, operations, context management
├── llm/           # LLM interface, prompts, templates
├── operations/    # Cognitive, tool, and interaction operations
├── agent/         # Agent engine, state management, operation queue
├── tools/         # Tool registry and business-specific tools
└── ui/            # UI bridge and web components
```

## Development Commands

Since this is a new project, development commands will be established as the codebase grows. The system will be browser-based with no build step required - direct HTML/JS/CSS development.

## LLM Integration

- **Primary**: Claude Pro integration (no API key required)
- **Secondary**: OpenRouter API for additional LLM providers
- **Prompt Caching**: Multi-level prompt caching to reduce redundant LLM calls
- **Context Assembly**: Dynamic context building from memory systems

## Memory Architecture

The system uses a sophisticated memory model:
- **Working Memory**: Current task context and active information
- **Semantic Memory**: Facts and knowledge base
- **Episodic Memory**: Past experiences and interactions
- **Procedural Memory**: How-to patterns and workflows

Each memory type supports caching at L1 (hot), L2 (recent), and L3 (relevant) levels.

## Operation Patterns

### Cognitive Operations
- Analysis processes for understanding requirements
- Planning processes for task decomposition
- Execution processes for plan implementation
- State evaluation for progress tracking

### Tool Operations
- Two-step pattern: prepare → execute
- Business API integrations for requirements research
- Error handling with fallback strategies

### User Interactions
- Clarification loops for ambiguous requirements
- Confirmation patterns for important decisions
- Feedback collection for system improvement

## Business Use Case

The primary implementation focuses on business requirements research:
1. Take business requirements description
2. Query business APIs (application catalog, roadmaps, project history)
3. Analyze historical patterns for similar requirements
4. Generate impacted applications list with t-shirt size estimates
5. Handle follow-up questions with maintained context
6. Learn from user feedback for future improvements

## Development Guidelines

- Use modern JavaScript (ES6+) with native web APIs
- Implement proper error handling and recovery at all levels
- Design for memory-first architecture - check memory before acting
- Use web components for modular UI development
- Maintain browser compatibility without transpilation
- Log all operations for observability and debugging