import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeProgram, type AnalysisReport } from "../compiler/analyzer.ts";
import {
  compileSource,
  formatFailure,
  inspectSource,
  runJavaScriptDetailed,
  type CompileArtifacts,
  type ExecutionResult,
  type InspectArtifacts,
} from "../compiler/compiler.ts";

export interface BackendContext {
  rootDir?: string;
}

export interface SourceRequest {
  filePath?: string;
  source?: string;
  sourcePath?: string;
}

export interface CheckResponse {
  sourcePath: string;
  summary: CompileArtifacts["analysis"]["summary"];
}

export interface BuildResponse {
  sourcePath: string;
  javascript: string;
  summary: CompileArtifacts["analysis"]["summary"];
  constValues: Record<string, unknown>;
}

export interface InspectResponse extends InspectArtifacts {
  sourcePath: string;
}

export interface AnalyzeResponse {
  sourcePath: string;
  report: AnalysisReport;
  summary: CompileArtifacts["analysis"]["summary"];
}

export interface RunResponse {
  sourcePath: string;
  summary: CompileArtifacts["analysis"]["summary"];
  execution: ExecutionResult;
}

export interface ExampleSummary {
  file: string;
  path: string;
}

export class BackendRequestError extends Error {
  public readonly statusCode: number;

  public constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const defaultRootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function listExamples(context: BackendContext = {}): Promise<ExampleSummary[]> {
  const rootDir = context.rootDir ?? defaultRootDir;
  const exampleDir = path.join(rootDir, "examples");
  const files = await readdir(exampleDir, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ptn"))
    .map((entry) => ({
      file: entry.name,
      path: path.posix.join("examples", entry.name),
    }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

export async function checkSource(request: SourceRequest, context: BackendContext = {}): Promise<CheckResponse> {
  const loaded = await loadSourceRequest(request, context);
  const artifacts = compileWithContext(loaded);
  return {
    sourcePath: loaded.sourcePath,
    summary: artifacts.analysis.summary,
  };
}

export async function buildSource(request: SourceRequest, context: BackendContext = {}): Promise<BuildResponse> {
  const loaded = await loadSourceRequest(request, context);
  const artifacts = compileWithContext(loaded);
  return {
    sourcePath: loaded.sourcePath,
    javascript: artifacts.javascript,
    summary: artifacts.analysis.summary,
    constValues: Object.fromEntries(artifacts.constValues.entries()),
  };
}

export async function inspectBackendSource(request: SourceRequest, context: BackendContext = {}): Promise<InspectResponse> {
  const loaded = await loadSourceRequest(request, context);
  const inspected = inspectSource(loaded.sourcePath, loaded.source);
  return {
    sourcePath: loaded.sourcePath,
    summary: inspected.summary,
    constValues: inspected.constValues,
  };
}

export async function analyzeSource(request: SourceRequest, context: BackendContext = {}): Promise<AnalyzeResponse> {
  const loaded = await loadSourceRequest(request, context);
  const artifacts = compileWithContext(loaded);
  return {
    sourcePath: loaded.sourcePath,
    report: analyzeProgram(artifacts.program, artifacts.analysis, loaded.sourcePath),
    summary: artifacts.analysis.summary,
  };
}

export async function runSource(request: SourceRequest, context: BackendContext = {}): Promise<RunResponse> {
  const loaded = await loadSourceRequest(request, context);
  const artifacts = compileWithContext(loaded);
  return {
    sourcePath: loaded.sourcePath,
    summary: artifacts.analysis.summary,
    execution: runJavaScriptDetailed(artifacts.javascript, { captureConsole: true }),
  };
}

export function formatBackendFailure(sourcePath: string, error: unknown): string {
  if (error instanceof BackendRequestError) {
    return error.message;
  }
  return formatFailure(sourcePath, error);
}

async function loadSourceRequest(request: SourceRequest, context: BackendContext): Promise<{ sourcePath: string; source: string }> {
  const rootDir = context.rootDir ?? defaultRootDir;
  if (request.filePath) {
    const resolvedPath = resolveWorkspacePath(rootDir, request.filePath);
    const source = await readFile(resolvedPath, "utf8");
    return {
      sourcePath: normalizeRepoRelativePath(rootDir, resolvedPath),
      source,
    };
  }
  if (typeof request.source === "string") {
    return {
      sourcePath: request.sourcePath?.trim() || "inline.ptn",
      source: request.source,
    };
  }
  throw new BackendRequestError(400, "Request must include either `filePath` or `source`.");
}

function compileWithContext(loaded: { sourcePath: string; source: string }): CompileArtifacts {
  return compileSource(loaded.sourcePath, loaded.source);
}

function resolveWorkspacePath(rootDir: string, requestedPath: string): string {
  const absolutePath = path.resolve(rootDir, requestedPath);
  const normalizedRoot = path.resolve(rootDir);
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new BackendRequestError(400, `Path '${requestedPath}' is outside the Proton workspace.`);
  }
  return absolutePath;
}

function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join(path.posix.sep);
}
