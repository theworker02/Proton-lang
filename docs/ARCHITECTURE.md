# Proton Architecture

## Overview

Proton is structured as a compact language platform with five major layers:

1. Frontend: lexer, parser, and AST construction
2. Semantics: typechecker, permission checks, contract validation, and module summaries
3. Execution: meta evaluator and JavaScript code generator
4. Service API: local HTTP backend for compile/analyze/inspect/run workflows
5. Tooling: analyzer engine, CLI commands, package workflow, and VS Code support

## Compiler Pipeline

Source compilation flows through:

1. `compiler/lexer.ts`
2. `compiler/parser.ts`
3. `compiler/typechecker.ts`
4. `compiler/meta.ts`
5. `compiler/codegen.ts`
6. `compiler/compiler.ts`

The output is JavaScript plus rich analysis metadata used by the CLI and docs tooling.

## Runtime Model

The generated runtime exposes:

- ownership-friendly cell wrappers
- plugin bridges for `crypto` and `git`
- memory and networking helpers
- graph and channel logs
- timeline metadata
- goal metadata
- runtime/system inspection helpers

Phase 5 features are represented in two ways:

- executable behavior for startup hooks, injected before/after wrappers, observation locals, and adaptive runtime branches
- metadata for future host/runtime evolution, including deferred timeline entries and optimization goals

## Phase 5 Systems

### Temporal Execution

`timeline` declarations are gathered at compile time and emitted into `globalThis.__proton_timeline`.

- `at "startup"` hooks execute before `main()`
- `after` and `every` entries remain declarative metadata today

### Self-Observation

`observe` blocks synthesize runtime locals such as:

- `execution_time`
- `memory_usage`

These values are available to normal Proton control flow and also inform analyzer messaging.

### Adaptive Execution

`adaptive fn` is a semantic marker, while `adapt { ... }` emits environment-aware branches using runtime system info.

Current runtime signals:

- `system.cpu`
- `system.memory`
- `system.profile`

### Behavior Injection

`inject into target` wraps generated functions with `before` and `after` blocks. This is compile-time weaving, not live machine-code hot patching.

### Outcome-Oriented Goals

`goal` declarations and statements are collected into summaries and runtime metadata. Today they are advisory and analyzable, not auto-optimizing compiler directives.

## Analyzer Architecture

The analyzer in `compiler/analyzer.ts` walks AST structures and merges:

- built-in rule packs
- custom detector declarations
- system-level heuristics from timelines, observation blocks, injections, goals, and adaptive functions

This keeps Proton's "intelligence" layer explicit and inspectable rather than hidden in opaque compiler behavior.

## Tooling Surface

CLI entrypoints:

- `cli/protonc.ts`: check, inspect, analyze, build, run
- `cli/proton.ts`: Git passthrough and CI scaffolding
- `cli/protonpm.ts`: local package/registry workflow

Backend entrypoints:

- `backend/server.ts`: HTTP server bootstrap
- `backend/service.ts`: backend-facing compiler/analyzer/run service layer

Editor support:

- `vscode-extension/` for language registration and syntax highlighting

## Current Technical Boundaries

- JavaScript is the only backend
- the HTTP service is local-process oriented and does not yet include auth, persistence, or job queues
- plugins are curated and host-assisted
- timelines beyond startup are metadata rather than background schedulers
- goals and suggestions do not yet rewrite generated code automatically
- runtime monitoring is modeled through observation and analyzer insight rather than a daemonized profiler
