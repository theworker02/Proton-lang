# Proton Docs

This directory contains the GitHub-facing project documentation for Proton Phase 5.

## Core Docs

- [Syntax guide](./syntax.md)
- [Why Proton exists](./WHY_PROTON.md)
- [Architecture](./ARCHITECTURE.md)
- [Backend API](./BACKEND.md)
- [VS Code extension](./VSCODE_EXTENSION.md)
- [Roadmap](./ROADMAP.md)
- [Changelog](./CHANGELOG.md)

## Community Docs

- [Contributing](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Support](./SUPPORT.md)

## What Proton Is Today

Proton currently ships:

- a parser, typechecker, meta evaluator, and JavaScript code generator
- analyzer and detector workflows for performance, memory, security, and system insights
- runtime-aware Phase 5 features including timelines, observation, adaptation, goals, and injection wrappers
- CLI tooling for compile, inspect, analyze, Git passthrough, CI scaffolding, and local package workflows
- a local HTTP backend for editor, automation, and service-style integration
- a VS Code extension with `.ptn` registration, icon theme support, and live-buffer diagnostics

The current backend remains JavaScript-based, so some of the most ambitious systems concepts are implemented as runtime metadata and analyzer hooks rather than native schedulers or optimizer passes.
