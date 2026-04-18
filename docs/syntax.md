# Proton Syntax Guide

## Modules, Imports, Plugins, Permissions

Every file starts with a module path.

```proton
module demo.main;
```

Regular imports stay explicit, and plugins are declared separately.

```proton
use core.io::print;
use plugin "git";

requires net, file;
```

## Execution Modes and Modifiers

Functions can declare execution intent and modifier-style capabilities.

```proton
inline fn fast_add(a: int, b: int) -> int :: strict {
  return a + b;
}

gpu fn render(batch: int) -> int :: parallel {
  return batch;
}

fn sanitize_input(input: str) -> str :: secure {
  return sanitize(input);
}

adaptive fn choose_strategy() -> int :: strict :: parallel {
  return 0;
}
```

Supported mode keywords:

- `strict`
- `unsafe`
- `parallel`
- `secure`
- `gpu`
- `adaptive`

## Ownership Bindings

Proton keeps the ownership model introduced earlier:

- `core`: owning binding
- `link`: shared mutable-capable link
- `ghost`: read-only shadow view

```proton
core data: Vec<int> = [1, 2, 3];
link shared: Vec<int> = data.link();
ghost view: Vec<int> = shared.ghost();

mutate(shared) {
  push(4);
}
```

## Types, Generics, and Constraints

### Built-in Types

- `int`
- `i32`
- `i64`
- `f32`
- `f64`
- `bool`
- `str`
- `void`
- `*T`
- `&T`
- `Vec<T>`
- named structs and algebraic types
- builtin runtime structs such as `MemBlock` and `HttpResponse`

### Generic Constraints

```proton
fn process<T: Numeric + Serializable>(input: T) -> T :: strict {
  return input;
}
```

Current built-in constraint names with special handling:

- `Numeric`
- `Serializable`

Contract names may also be used as constraints for struct types that implement them.

## Structs and Algebraic Data Types

```proton
struct Circle {
  radius: int,
}

type Result<T, E> {
  Ok(T),
  Err(E)
}
```

Variant constructors can be written as `Ok(value)` or `Result::Ok(value)` when the type is clear.

## Pattern Matching

Pattern matching is an expression.

```proton
fn unwrap_or_zero(result: Result<int, str>) -> int :: strict {
  return match result {
    Ok(value) => value,
    Err(error) => 0
  };
}
```

Supported patterns:

- wildcard: `_`
- identifier capture: `value`
- variant patterns: `Ok(value)` or `Err(error)`
- boolean patterns
- integer patterns
- string patterns

## Contracts

```proton
contract Drawable :: O(n) {
  fn draw(self: Circle) -> void :: strict;
}

impl Drawable for Circle {
  fn draw(self: Circle) -> void :: strict {
    return;
  }
}
```

## Meta Functions

`meta fn` declarations still run at compile time for top-level constants.

```proton
meta fn factorial(n: int) -> int :: strict {
  if n == 0 {
    return 1;
  }

  return n * factorial(n - 1);
}

const result: int = factorial(10);
```

## Systems Runtime Surface

Current built-in runtime paths:

- `core::mem::alloc`
- `core::mem::stack_alloc`
- `core::mem::heap_alloc`
- `core::mem::free`
- `core::net::http_get`
- `core::net::http_post`
- `core::net::socket_connect`
- `core::net::json`
- `core::meta::type_of`
- `core::debug::panic`
- `core::plugin::loaded`
- `warn`
- `log`
- `runtime`
- `system`

Example:

```proton
requires net;

fn main() -> int :: strict {
  let block: MemBlock = core::mem::alloc(128);
  let response: HttpResponse = core::net::http_get("https://example.internal");
  core::mem::free(block);
  return response.status;
}
```

## Plugins

Plugins are imported explicitly.

```proton
use plugin "crypto";
use plugin "git";

fn main() -> int :: strict {
  let digest: str = crypto.hash("hello");
  let diff: str = git.diff();
  return 0;
}
```

Current built-in plugin surface:

- `crypto.hash`
- `crypto.verify`
- `git.commit`
- `git.branch`
- `git.diff`

## Concurrency, Intent, Sandbox, Graphs, Channels

```proton
spawn audit {
  core::concurrent::yield();
}

sync {
  await audit;
}

intent optimize {
  core::math::abs(-4);
}

sandbox {
  core::io::print("isolated");
}

graph {
  node fetch -> node hash -> node persist;
}

channel events;
send events { user_logged_in };
```

`intent`, `sandbox`, `graph`, and `channel/send` compile today; graph and channel activity are tracked in the runtime metadata.

## Temporal Programming

Time is a first-class syntax surface through `timeline` blocks and duration literals.

```proton
timeline {
  at "startup" -> init();
  after 5s -> refresh_cache();
  every 10s -> monitor_runtime();
}
```

Supported duration suffixes:

- `ms`
- `s`
- `m`
- `h`

Current runtime behavior:

- `at "startup"` actions execute automatically before `main()`
- `after` and `every` actions are preserved as runtime metadata for host schedulers and tooling

## Self-Observation and Adaptive Execution

`observe` blocks expose tracked runtime values inside a function body, and `adapt` blocks let code branch on environment state.

```proton
adaptive fn handle_requests() -> int :: strict :: parallel {
  let mut profile: str = "balanced";

  adapt {
    if system.cpu < 4 {
      profile = "low_power";
    } else {
      profile = "high_performance";
    }
  }

  observe {
    track: execution_time, memory_usage;

    if execution_time > 100ms {
      warn("Slow function detected");
    }
  }

  return 0;
}
```

Built-in runtime values available today:

- `runtime.time`
- `runtime.uptime`
- `runtime.mode`
- `system.cpu`
- `system.memory`
- `system.profile`

## Behavior Injection

Behavior can be wrapped around a function without editing the function body directly.

```proton
inject into handle_requests {
  before {
    log("Starting request handling");
  }

  after {
    observe {
      track: execution_time;
      if execution_time > 100ms {
        warn("Slow function detected");
      }
    }
  }
}
```

The current implementation generates safe wrappers around the function body at compile time.

## Outcome-Oriented Programming

Top-level goals describe system intent, and local goal statements annotate hot paths.

```proton
goal {
  minimize latency;
  maximize throughput;
}

fn handle_requests() -> int :: strict {
  goal optimize_performance;
  return 0;
}
```

Goals currently feed runtime metadata and analyzer insights.

## Analyzer and Detector Blocks

Analyzer blocks configure the rule sets the CLI should emphasize.

```proton
analyze {
  target: main.ptn;
  rules: [
    performance,
    memory,
    security
  ];
}
```

Custom detectors define rule-based findings.

```proton
detector MemoryLeak {
  when alloc without free {
    warn("Possible memory leak detected");
  }
}
```

## Algorithms, Networks, Builds, Monitoring, Suggestions

These Phase 4 blocks are declarative today and feed the analyzer/inspection layer.

```proton
algorithm SortAlgo<T> {
  requires Comparable;

  fn run(data: Vec<T>) -> Vec<T> :: strict {
    return data;
  }
}

network cluster {
  node "auth" at "10.0.0.1";
  node "db" at "10.0.0.2";
  route auth -> db;
}

build {
  mode: optimized;
  analyze: true;
  detect: memory, performance;
}

monitor {
  track: cpu, memory;
  alert if memory > 80%;
}

suggest {
  if loop inefficient {
    recommend("Use parallel execution");
  }
}
```

## CLI

```bash
protonc check file.ptn
protonc analyze file.ptn
protonc build file.ptn --out-dir build --analyze
protonc run file.ptn
protonc inspect file.ptn --json

proton git status
proton ci init

protonpm search git
protonpm add web 0.1.0
protonpm list
protonpm publish my-lib 0.1.0 "Local Proton package"
```

## Current Boundaries

- `match` arms currently produce expressions, not statement blocks
- algorithms are parsed and analyzed, but not yet emitted as callable runtime namespaces
- network/build/monitor/suggest blocks are currently declarative metadata, not full autonomous subsystems
- the analyzer is rule-based today rather than ML-driven
