import type { SourceLocation, SourceSpan } from "./ast.ts";

export interface Diagnostic {
  message: string;
  span: SourceSpan;
  severity: "error";
}

export class ProtonError extends Error {
  public readonly diagnostics: Diagnostic[];

  public constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = "ProtonError";
    this.diagnostics = diagnostics;
  }
}

export function diagnosticAt(message: string, span: SourceSpan): Diagnostic {
  return {
    message,
    span,
    severity: "error",
  };
}

export function formatLocation(location: SourceLocation): string {
  return `${location.line}:${location.column}`;
}

export function formatDiagnostic(sourcePath: string, diagnostic: Diagnostic): string {
  return `${sourcePath}:${formatLocation(diagnostic.span.start)} error: ${diagnostic.message}`;
}
