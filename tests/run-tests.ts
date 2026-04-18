import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { analyzeProgram } from "../compiler/analyzer.ts";
import { createBackendServer } from "../backend/server.ts";
import { compileSource, formatFailure, inspectSource, runJavaScript } from "../compiler/compiler.ts";

interface TestCase {
  name: string;
  run: () => Promise<void> | void;
}

function normalizeLogs(entries: unknown[][]): string[] {
  return entries.map((args) =>
    args
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
      .join(" "),
  );
}

const cases: TestCase[] = [
  {
    name: "Phase 2 program compiles, evaluates meta consts, and runs",
    async run() {
      const source = await readFile(new URL("../examples/main.ptn", import.meta.url), "utf8");
      const { javascript, constValues } = compileSource("examples/main.ptn", source);

      assert.equal(constValues.get("table_size"), 720);

      const captured: unknown[][] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured.push(args);
      };

      try {
        const result = runJavaScript(javascript);
        assert.equal(result.exitCode, 0);
      } finally {
        console.log = originalLog;
      }

      assert.deepEqual(normalizeLogs(captured), ["[1,2,3,4]", "720", "[1,2,3,4]", "9"]);
    },
  },
  {
    name: "inspect exposes functions, contracts, imports, and constants",
    async run() {
      const source = await readFile(new URL("../examples/main.ptn", import.meta.url), "utf8");
      const inspected = inspectSource("examples/main.ptn", source);

      assert.equal(inspected.summary.modulePath.join("."), "demo.main");
      assert.ok(inspected.summary.functions.some((fn) => fn.name === "factorial" && fn.meta));
      assert.ok(inspected.summary.contracts.some((contract) => contract.name === "Drawable"));
      assert.ok(inspected.summary.imports.some((imported) => imported.alias === "print"));
      assert.equal(inspected.constValues.table_size, 720);
    },
  },
  {
    name: "type mismatches fail during compilation",
    async run() {
      const source = await readFile(new URL("../examples/invalid_type.ptn", import.meta.url), "utf8");
      assert.throws(() => compileSource("examples/invalid_type.ptn", source), (error: unknown) => {
        const rendered = formatFailure("examples/invalid_type.ptn", error);
        assert.match(rendered, /Type mismatch for 'x'/);
        return true;
      });
    },
  },
  {
    name: "ghost mutation is rejected",
    async run() {
      const source = await readFile(new URL("../examples/invalid_ghost_mutation.ptn", import.meta.url), "utf8");
      assert.throws(() => compileSource("examples/invalid_ghost_mutation.ptn", source), (error: unknown) => {
        const rendered = formatFailure("examples/invalid_ghost_mutation.ptn", error);
        assert.match(rendered, /Ghost bindings are read-only/);
        return true;
      });
    },
  },
  {
    name: "secure functions reject raw pointers",
    async run() {
      const source = await readFile(new URL("../examples/invalid_secure_pointer.ptn", import.meta.url), "utf8");
      assert.throws(() => compileSource("examples/invalid_secure_pointer.ptn", source), (error: unknown) => {
        const rendered = formatFailure("examples/invalid_secure_pointer.ptn", error);
        assert.match(rendered, /Secure function 'read' cannot accept raw pointer or reference parameters/);
        return true;
      });
    },
  },
  {
    name: "spawn blocks reject non-ghost captures",
    async run() {
      const source = await readFile(new URL("../examples/invalid_spawn_capture.ptn", import.meta.url), "utf8");
      assert.throws(() => compileSource("examples/invalid_spawn_capture.ptn", source), (error: unknown) => {
        const rendered = formatFailure("examples/invalid_spawn_capture.ptn", error);
        assert.match(rendered, /Spawned tasks may only capture ghost or const bindings/);
        return true;
      });
    },
  },
  {
    name: "Phase 4 program compiles and runs with plugins, networking, and channels",
    async run() {
      const source = await readFile(new URL("../examples/phase4.ptn", import.meta.url), "utf8");
      const { javascript } = compileSource("examples/phase4.ptn", source);

      const captured: unknown[][] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured.push(args);
      };

      try {
        const result = runJavaScript(javascript);
        assert.equal(result.exitCode, 0);
      } finally {
        console.log = originalLog;
      }

      const normalized = normalizeLogs(captured);
      assert.equal(normalized.length, 2);
      assert.equal(normalized[1], "GET https://example.internal/users");
    },
  },
  {
    name: "analyzer reports custom memory leak detector findings",
    async run() {
      const source = await readFile(new URL("../examples/analysis_memory.ptn", import.meta.url), "utf8");
      const artifacts = compileSource("examples/analysis_memory.ptn", source);
      const report = analyzeProgram(artifacts.program, artifacts.analysis, "examples/analysis_memory.ptn");

      assert.ok(report.issues.some((issue) => issue.category === "memory" && issue.message.includes("Possible memory leak")));
      assert.ok(report.issues.some((issue) => issue.category === "detector" && issue.message.includes("MemoryLeak")));
    },
  },
  {
    name: "Phase 5 program exposes timelines, goals, and adaptive runtime metadata",
    async run() {
      const source = await readFile(new URL("../examples/phase5.ptn", import.meta.url), "utf8");
      const { javascript, program, analysis } = compileSource("examples/phase5.ptn", source);
      const inspected = inspectSource("examples/phase5.ptn", source);
      const report = analyzeProgram(program, analysis, "examples/phase5.ptn");

      assert.ok(inspected.summary.functions.some((fn) => fn.name === "handle_requests" && fn.adaptive));
      assert.equal(inspected.summary.timelines.length, 3);
      assert.ok(inspected.summary.goals.includes("minimize latency"));
      assert.ok(inspected.summary.injections.some((injection) => injection.target === "handle_requests" && injection.hasBefore && injection.hasAfter));
      assert.ok(report.issues.some((issue) => issue.message.includes("latency and throughput")));

      const capturedLogs: unknown[][] = [];
      const capturedWarnings: unknown[][] = [];
      const context = {
        console: {
          log: (...args: unknown[]) => {
            capturedLogs.push(args);
          },
          warn: (...args: unknown[]) => {
            capturedWarnings.push(args);
          },
          error: (..._args: unknown[]) => {},
        },
        globalThis: {} as Record<string, unknown>,
        __proton_host: {},
      };
      context.globalThis = context;

      vm.createContext(context);
      const script = new vm.Script(javascript, { filename: "generated-phase5.js" });
      script.runInContext(context);

      const exports = context.__proton_exports as Record<string, (() => unknown)> | undefined;
      const main = exports?.main;
      assert.equal(typeof main, "function");
      assert.equal(main?.(), 0);

      const normalizedLogs = normalizeLogs(capturedLogs);
      const normalizedWarnings = normalizeLogs(capturedWarnings);
      const goals = context.__proton_goals as string[];
      const timeline = context.__proton_timeline as Array<{ trigger: string; moment: string }>;

      assert.ok(normalizedLogs.includes("startup"));
      assert.ok(normalizedLogs.includes("Starting request handling"));
      assert.ok(normalizedLogs.includes("high_performance"));
      assert.ok(normalizedWarnings.includes("Memory threshold exceeded"));
      assert.ok(goals.includes("minimize latency"));
      assert.ok(goals.includes("maximize throughput"));
      assert.ok(goals.includes("optimize_performance"));
      assert.deepEqual(Array.from(timeline, (entry) => entry.trigger), ["at", "after", "every"]);
    },
  },
  {
    name: "backend API exposes health, examples, inspect, and run endpoints",
    async run() {
      const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
      const server = createBackendServer({ rootDir });
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });

      const address = server.address();
      assert.ok(address && typeof address === "object");
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const healthResponse = await fetch(`${baseUrl}/health`);
        assert.equal(healthResponse.status, 200);
        const health = await healthResponse.json();
        assert.equal(health.ok, true);

        const examplesResponse = await fetch(`${baseUrl}/api/examples`);
        assert.equal(examplesResponse.status, 200);
        const examples = await examplesResponse.json();
        assert.ok(examples.examples.some((entry: { file: string }) => entry.file === "phase5.ptn"));

        const inspectResponse = await fetch(`${baseUrl}/api/inspect`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filePath: "examples/phase5.ptn" }),
        });
        assert.equal(inspectResponse.status, 200);
        const inspected = await inspectResponse.json();
        assert.ok(inspected.result.summary.functions.some((fn: { name: string; adaptive: boolean }) => fn.name === "handle_requests" && fn.adaptive));

        const runResponse = await fetch(`${baseUrl}/api/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filePath: "examples/phase5.ptn" }),
        });
        assert.equal(runResponse.status, 200);
        const run = await runResponse.json();
        assert.equal(run.result.execution.exitCode, 0);
        assert.ok(run.result.execution.logs.includes("startup"));
        assert.ok(run.result.execution.logs.includes("high_performance"));
        assert.ok(run.result.execution.warnings.includes("Memory threshold exceeded"));
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    },
  },
];

let failures = 0;

for (const testCase of cases) {
  try {
    await testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${cases.length} tests`);
}
