<div align="center">

# Proton Language

**A systems language platform for time-aware, adaptive, observable software.**

![Core Version](https://img.shields.io/badge/core-1.5.2-0B57D0?style=for-the-badge)
<<<<<<< HEAD
![VS Code Extension](https://img.shields.io/badge/vscode_extension-1.5.5-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)
=======
![VS Code Extension](https://img.shields.io/badge/vscode_extension-1.5.3-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)
[![Install on VS Code Marketplace](https://img.shields.io/badge/Install%20on-VS%20Code%20Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=magnificent-language.proton-language-support&ssr=false#overview)
>>>>>>> 6978eed0180eafc9aab347f3897dbc83dbb66050
![Phase](https://img.shields.io/badge/phase-5-6C2BD9?style=for-the-badge)
![Backend API](https://img.shields.io/badge/backend-HTTP_API-0F9D58?style=for-the-badge)
![Node](https://img.shields.io/badge/node-%3E%3D25-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Tests](https://img.shields.io/badge/tests-10_passing-1F883D?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-111111?style=for-the-badge)

[Why Proton](./docs/WHY_PROTON.md) • [Syntax Guide](./docs/syntax.md) • [Architecture](./docs/ARCHITECTURE.md) • [Backend API](./docs/BACKEND.md) • [VS Code Extension](./docs/VSCODE_EXTENSION.md)

</div>

Proton is a systems-flavored language and tooling stack that combines a compiler, analyzer engine, Git-aware developer tooling, a lightweight package registry workflow, editor support, a local backend API, and Phase 5 runtime-aware programming primitives. The current execution backend still targets JavaScript, but the platform is designed around a bigger idea: code should be able to express execution intent, observe itself, adapt to its environment, and integrate directly with the tools developers already use.

> **Project status**
> Proton is an active experimental language platform. The parser, typechecker, analyzer, backend API, and VS Code extension are real and working today. Some of the most ambitious systems concepts are intentionally implemented as metadata and constrained runtime behavior while the platform evolves toward deeper native execution.

## At a Glance

| Area | What Proton provides |
| --- | --- |
| Language | ADTs, generics, pattern matching, execution modes, ownership bindings |
| Runtime model | timelines, observation blocks, adaptive execution, goal metadata, injection hooks |
| Tooling | compiler CLI, analyzer engine, inspect output, Git-aware commands, package workflow |
| Integrations | local HTTP backend, VS Code extension, file icons, live-buffer diagnostics |

## Quick Start

### 1. Compile or run an example

```bash
npm test
node cli/protonc.ts run examples/phase5.ptn
node cli/protonc.ts inspect examples/phase5.ptn --json
```

### 2. Start the backend API

```bash
npm run backend
```

### 3. Launch the VS Code extension host

1. Open the repo root in VS Code
2. Choose `Run Proton VS Code Extension`
3. Press `F5`

## Why Proton

Proton exists to close the gap between language design and real systems behavior.

- Most languages can express logic, but not time, runtime observation, adaptation, or outcome-level intent as first-class concepts.
- Most tooling can inspect code after the fact, but Proton is designed to let the language, runtime, analyzer, backend API, and editor tooling reinforce each other.
- Most ambitious systems ideas get scattered across frameworks and infrastructure. Proton gives those ideas a place in the language itself.

If you want the longer rationale, start with [Why Proton exists](./docs/WHY_PROTON.md).

## Platform Highlights

### Language

- Algebraic data types with payload variants
- Generic functions and type constraints
- Pattern matching
- Ownership bindings: `core`, `link`, `ghost`
- Execution modes: `strict`, `unsafe`, `parallel`, `secure`, `gpu`, `adaptive`

### Runtime-aware systems features

- Temporal programming via `timeline { ... }` and duration literals like `5s` and `100ms`
- Self-observing runtime blocks with `observe { track: execution_time, memory_usage; ... }`
- Environment-adaptive execution with `adapt { ... }` and `adaptive fn`
- Safe behavior injection with `inject into target { before { ... } after { ... } }`
- Outcome-oriented programming with top-level `goal` declarations and in-function goal statements

### Tooling and integrations

- Analyzer engine with built-in performance, memory, and security rules
- Custom detector declarations
- Declarative algorithm, network, build, monitor, and suggest blocks
- `protonc analyze`, smarter `protonc build`, `proton git`, `proton ci init`, and `protonpm`
- `protond` / `npm run backend` for local HTTP API access
- VS Code syntax support, file icons, hover data, and live-buffer diagnostics

## Language Snapshot

```proton
module demo.phase5;

use core.io::print;
timeline {
  at "startup" -> init();
  after 5s -> refresh_cache();
  every 10s -> monitor_runtime();
}

goal {
  minimize latency;
  maximize throughput;
}

inject into handle_requests {
  before {
    log("Starting request handling");
  }
}

adaptive fn handle_requests() -> int :: strict :: parallel {
  let mut profile: str = "balanced";

  goal optimize_performance;

  adapt {
    if system.cpu < 4 {
      profile = "low_power";
    } else {
      profile = "high_performance";
    }
  }

  observe {
    track: execution_time, memory_usage;
    if memory_usage > 120 {
      warn("Memory threshold exceeded");
    }
  }

  print(profile);
  return 0;
}
```

## Analyzer Engine

`protonc analyze file.ptn` performs AST-based static analysis and reports:

- possible memory leaks from `alloc`/`free` imbalance
- unsafe execution-mode usage
- high-cost functions that may benefit from `inline`, `intent`, or scheduling review
- custom detector warnings declared in Proton source

Example:

```bash
node cli/protonc.ts analyze examples/analysis_memory.ptn
node cli/protonc.ts analyze examples/phase5.ptn
```

## CLI

Node 25+ is required.

```bash
node cli/protonc.ts check examples/main.ptn
node cli/protonc.ts analyze examples/phase4.ptn
node cli/protonc.ts analyze examples/phase5.ptn
node cli/protonc.ts build examples/phase4.ptn --out-dir build --analyze
node cli/protonc.ts run examples/phase5.ptn
node cli/protonc.ts run examples/phase4.ptn
node cli/protonc.ts inspect examples/phase4.ptn --json
node cli/protonc.ts inspect examples/phase5.ptn --json

node cli/proton.ts git status
node cli/proton.ts ci init

node cli/protonpm.ts search git
node cli/protonpm.ts add web 0.1.0
node cli/protonpm.ts list
node cli/protonpm.ts publish my-lib 0.1.0 "Local Proton package"

node backend/server.ts
node scripts/build-vscode-extension.mjs
```

Package scripts:

```bash
npm run protonc -- analyze examples/phase4.ptn
npm run proton -- ci init
npm run protonpm -- search web
npm run backend
npm test
```

## VS Code Extension

The repository includes a packaged VS Code extension under `vscode-extension/`.

Current extension metadata:

- package: `proton-language-support`
- publisher: `magnificent-language`
- version: `1.5.5`

Local development:

1. Open the repo root in VS Code
2. Choose `Run Proton VS Code Extension`
3. Press `F5`

The Extension Development Host rebuilds the extension entrypoint before launch.

To enable the Proton file icon theme in the host:

1. Run `Preferences: File Icon Theme`
2. Select `Proton File Icons`

Packaging:

```bash
cd vscode-extension
vsce package -o proton-language-1.5.5.vsix
```

Install locally:

```bash
code --install-extension proton-language-1.5.5.vsix
```

## What Is Implemented

- Real lexer/parser/AST pipeline for modules, contracts, ADTs, generics, match expressions, plugins, Phase 4 declarative blocks, and Phase 5 temporal/adaptive/runtime-aware constructs
- Type checking for ownership bindings, execution modes, algebraic data types, pattern matching, plugins, permissions, timelines, injections, goals, duration literals, and runtime identifiers such as `runtime` and `system`
- JavaScript code generation for executable Proton functions, plugin calls, graphs, channels, timelines, behavior injection hooks, adaptive runtime helpers, and runtime metadata
- Analyzer engine for built-in rule packs, custom detector declarations, and Phase 5 timeline/adaptation/observation insights
- CLI workflows for analysis, CI scaffold generation, Git passthrough, and a simple manifest-backed package registry flow
- Local backend service endpoints for health checks, example discovery, compile, build, inspect, analyze, and run

## Current Boundaries

- The backend still targets JavaScript rather than LLVM or native machine code
- Algorithm, build, monitor, suggest, and network cluster blocks are currently declarative metadata plus analyzer inputs; they are not yet full native orchestration/runtime subsystems
- Timeline `at "startup"` entries execute automatically today; `after` and `every` entries are emitted as runtime metadata for host-driven schedulers instead of autonomous background timers
- Goal declarations and goal statements currently feed the analyzer and runtime metadata; they do not yet trigger whole-program optimizer rewrites
- Behavior injection is implemented as safe generated wrappers around function bodies, not hot-patching a live native process
- The package registry is local-manifest/local-registry based today, not a hosted remote service
- Plugin execution is intentionally small and curated: `crypto` is simulated and `git` is host-assisted
- Distributed routing, runtime monitoring alerts, and pre-commit diff analysis are foundation features rather than fully autonomous agents

## Project Layout

```text
proton-lang/
├── cli/
│   ├── proton.ts
│   ├── protonc.ts
│   └── protonpm.ts
├── backend/
│   ├── server.ts
│   └── service.ts
├── compiler/
│   ├── analyzer.ts
│   ├── ast.ts
│   ├── codegen.ts
│   ├── compiler.ts
│   ├── diagnostics.ts
│   ├── lexer.ts
│   ├── meta.ts
│   ├── parser.ts
│   └── typechecker.ts
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── BACKEND.md
│   ├── CHANGELOG.md
│   ├── CODE_OF_CONDUCT.md
│   ├── CONTRIBUTING.md
│   ├── VSCODE_EXTENSION.md
│   ├── ROADMAP.md
│   ├── SECURITY.md
│   ├── SUPPORT.md
│   └── syntax.md
├── examples/
│   ├── analysis_memory.ptn
│   ├── main.ptn
│   ├── phase4.ptn
│   └── phase5.ptn
├── tests/
│   └── run-tests.ts
└── vscode-extension/
    ├── package.json
    └── syntaxes/
        └── proton.tmLanguage.json
```

## Testing

`npm test` covers:

- existing Phase 2 compilation and execution behavior
- ownership and secure-mode regressions
- Phase 4 program execution with plugins, networking, and channels
- Phase 5 program execution with adaptive runtime metadata, timelines, injections, and goals
- analyzer reports and custom detector output

## Temporary Website (for now)

[Visit website](https://proton-lang.carrd.co/#)

## Docs

- [Syntax guide](./docs/syntax.md)
- [Docs index](./docs/README.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Backend API](./docs/BACKEND.md)
- [VS Code extension](./docs/VSCODE_EXTENSION.md)
- [Roadmap](./docs/ROADMAP.md)
- [Contributing](./docs/CONTRIBUTING.md)
- [Security](./docs/SECURITY.md)
- [Code of conduct](./docs/CODE_OF_CONDUCT.md)
- [Support](./docs/SUPPORT.md)
- [Changelog](./docs/CHANGELOG.md)
