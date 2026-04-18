# Changelog

## Unreleased

- Added VS Code extension documentation covering local debugging, icon theme activation, live-buffer diagnostics, and VSIX installation
- Added `check-stdin` and `inspect-stdin` CLI entrypoints for editor-integrated validation against unsaved buffers
- Improved extension packaging metadata and produced a `1.5.3` VSIX artifact
- Added a local HTTP backend service with health, examples, check, build, inspect, analyze, and run endpoints
- Added structured runtime execution capture for logs, warnings, goals, timeline metadata, graph metadata, and channel metadata
- Added backend integration coverage to the automated test suite

## 1.5.3 - 2026-04-17

- Updated the VS Code extension publisher to `magnificent-language`
- Added extension-local packaging support with `.vscodeignore` and a bundled license
- Added Proton file icon theme contribution and refreshed icon artwork behavior notes
- Updated extension debug flow so `F5` rebuilds the extension before launching the host
- Fixed extension diagnostics so unsaved editor content is validated correctly

## 1.5.2 - 2026-04-17

- Added Phase 5 runtime-aware language constructs:
  - `timeline`
  - duration literals such as `5s` and `100ms`
  - `observe`
  - `adapt`
  - `adaptive fn`
  - `inject into`
  - top-level and in-function `goal`
- Added runtime/typechecker support for `runtime` and `system` inspection values
- Added generated runtime metadata for timelines and goals
- Added compile-time behavior injection wrappers for function `before` and `after` hooks
- Expanded analyzer coverage for timelines, observations, goals, injections, and adaptive functions
- Added `examples/phase5.ptn`
- Added end-to-end Phase 5 test coverage
- Updated README, syntax guide, editor grammar, and GitHub-facing docs under `docs/`

## 0.4.0

- Added analyzer engine and detector system
- Added algorithm, build, monitor, suggest, network cluster, and channel declarations
- Added `protonc analyze`, `proton git`, `proton ci init`, and `protonpm`
- Expanded runtime support for networking, plugins, graphs, and channels
