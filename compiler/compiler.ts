import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import type { ProgramNode } from "./ast.ts";
import { CodeGenerator } from "./codegen.ts";
import { formatDiagnostic, ProtonError } from "./diagnostics.ts";
import { Lexer } from "./lexer.ts";
import { MetaEvaluator, type MetaValue } from "./meta.ts";
import { Parser } from "./parser.ts";
import { TypeChecker, type ProgramSummary, type TypeCheckResult } from "./typechecker.ts";

export interface CompileArtifacts {
  program: ProgramNode;
  javascript: string;
  analysis: TypeCheckResult;
  constValues: Map<string, MetaValue>;
}

export interface ExecutionResult {
  exitCode: number;
  logs?: string[];
  warnings?: string[];
  errors?: string[];
  goals?: string[];
  timeline?: Array<Record<string, unknown>>;
  graph?: unknown[];
  channels?: Array<{ name: string; messages: unknown[] }>;
}

export interface InspectArtifacts {
  summary: ProgramSummary;
  constValues: Record<string, MetaValue>;
}

export interface RunJavaScriptOptions {
  captureConsole?: boolean;
  host?: {
    git?: {
      commit?(message: string): boolean;
      branch?(name: string): boolean;
      diff?(): string;
    };
  };
}

export async function compileFile(sourcePath: string): Promise<CompileArtifacts> {
  const source = await readFile(sourcePath, "utf8");
  return compileSource(sourcePath, source);
}

export function compileSource(_sourcePath: string, source: string): CompileArtifacts {
  const tokens = new Lexer(source).tokenize();
  const program = new Parser(tokens).parseProgram();
  const analysis = new TypeChecker().check(program);
  const constValues = new MetaEvaluator(program, analysis).evaluateTopLevelConsts();
  const { javascript } = new CodeGenerator().generate(program, analysis, constValues);
  return { program, javascript, analysis, constValues };
}

export async function inspectFile(sourcePath: string): Promise<InspectArtifacts> {
  const source = await readFile(sourcePath, "utf8");
  return inspectSource(sourcePath, source);
}

export function inspectSource(sourcePath: string, source: string): InspectArtifacts {
  const { analysis, constValues } = compileSource(sourcePath, source);
  return {
    summary: analysis.summary,
    constValues: Object.fromEntries(constValues.entries()),
  };
}

export function runJavaScript(javascript: string): ExecutionResult {
  return runJavaScriptDetailed(javascript);
}

export function runJavaScriptDetailed(javascript: string, options: RunJavaScriptOptions = {}): ExecutionResult {
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const captureConsole = options.captureConsole ?? false;
  const context = {
    console: captureConsole
      ? {
          log: (...args: unknown[]) => {
            logs.push(formatConsoleArgs(args));
          },
          warn: (...args: unknown[]) => {
            warnings.push(formatConsoleArgs(args));
          },
          error: (...args: unknown[]) => {
            errors.push(formatConsoleArgs(args));
          },
        }
      : console,
    globalThis: {} as Record<string, unknown>,
    __proton_host: {
      git: {
        ...createDefaultGitHost(),
        ...(options.host?.git ?? {}),
      },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  const script = new vm.Script(javascript, { filename: "generated-proton.js" });
  script.runInContext(context);
  const exports = context.__proton_exports as Record<string, (...args: unknown[]) => unknown> | undefined;
  const main = exports?.main;
  if (typeof main !== "function") {
    throw new Error("Generated program does not export a main function.");
  }
  const result = main();
  return {
    exitCode: typeof result === "number" ? result : 0,
    logs: captureConsole ? logs : undefined,
    warnings: captureConsole ? warnings : undefined,
    errors: captureConsole ? errors : undefined,
    goals: normalizeArray(context.__proton_goals),
    timeline: normalizeTimeline(context.__proton_timeline),
    graph: normalizeArray(context.__proton_graph),
    channels: normalizeChannels(context.__proton_channels),
  };
}

export function formatFailure(sourcePath: string, error: unknown): string {
  if (error instanceof ProtonError) {
    return error.diagnostics.map((diagnostic) => formatDiagnostic(sourcePath, diagnostic)).join("\n");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function createDefaultGitHost(): Required<NonNullable<NonNullable<RunJavaScriptOptions["host"]>["git"]>> {
  return {
    commit(message: string): boolean {
      try {
        execFileSync("git", ["commit", "-m", message], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
    branch(name: string): boolean {
      try {
        execFileSync("git", ["checkout", "-b", name], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
    diff(): string {
      try {
        return execFileSync("git", ["diff"], { encoding: "utf8" });
      } catch {
        return "";
      }
    },
  };
}

function formatConsoleArgs(args: unknown[]): string {
  return args.map((arg) => serializeConsoleValue(arg)).join(" ");
}

function serializeConsoleValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return String(value);
  }
  try {
    return JSON.stringify(normalizeValue(value));
  } catch {
    return String(value);
  }
}

function normalizeArray(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((entry) => normalizeValue(entry));
}

function normalizeTimeline(value: unknown): Array<Record<string, unknown>> | undefined {
  const timeline = normalizeArray(value);
  if (!timeline) {
    return undefined;
  }
  return timeline.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
}

function normalizeChannels(value: unknown): Array<{ name: string; messages: unknown[] }> | undefined {
  if (!isMapLike(value)) {
    return undefined;
  }
  const entries = value as Map<unknown, unknown>;
  return Array.from(entries.entries(), ([name, messages]) => ({
    name: String(name),
    messages: Array.isArray(messages) ? messages.map((message) => normalizeValue(message)) : [],
  }));
}

function isMapLike(value: unknown): value is Map<unknown, unknown> {
  return Object.prototype.toString.call(value) === "[object Map]";
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }
  if (isMapLike(value)) {
    return Array.from(value.entries(), ([key, entry]) => [String(key), normalizeValue(entry)]);
  }
  if (value && typeof value === "object") {
    const record: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      record[key] = normalizeValue(entry);
    }
    return record;
  }
  return value;
}
