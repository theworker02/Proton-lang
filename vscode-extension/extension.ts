import * as path from "node:path";
import * as vscode from "vscode";
import { spawn } from "node:child_process";

const KEYWORD_HOVERS = new Map<string, string>([
  ["core", "Atomic Ownership owner binding. `core` is the primary owner of a value."],
  ["link", "Atomic Ownership shared binding. `link` provides controlled shared access to a `core` value."],
  ["ghost", "Atomic Ownership read-only shadow binding. `ghost` values may be observed but not mutated."],
  ["contract", "Defines a strict interface contract. Proton validates required methods and signatures in each `impl`."],
  ["meta", "Marks a function for compile-time evaluation. Top-level constants may call `meta fn` functions."],
  ["spawn", "Starts a compiler-managed task block. Spawned tasks may only capture `ghost` or `const` bindings from outer scopes."],
  ["sync", "Creates a synchronization block where `await` is allowed."],
  ["await", "Waits for a spawned task inside a `sync` block."],
  ["mutate", "Opens an explicit mutation block over a `core` or `link` Vec<T> binding."],
  ["strict", "Full safety mode. Used as a function execution mode."],
  ["unsafe", "Manual control mode. Used as a function execution mode."],
  ["parallel", "Concurrency-oriented execution mode."],
  ["secure", "Security-focused execution mode. Raw pointer inputs and outputs are rejected."],
  ["expose", "Marks a declaration as visible outside its defining module."],
  ["use", "Imports an exposed symbol into the local module scope."],
]);

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("proton");
  const refreshTimers = new Map<string, NodeJS.Timeout>();
  context.subscriptions.push(collection);

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId !== "proton" || document.isUntitled) {
      return;
    }

    runCliWithInput(context.extensionPath, ["check-stdin", document.fileName], document.getText()).then(({ code, stderr }) => {
      if (code === 0) {
        collection.delete(document.uri);
        return;
      }

      const diagnostics = stderr
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseDiagnostic(line, document))
        .filter((value): value is vscode.Diagnostic => value !== undefined);

      if (diagnostics.length > 0) {
        collection.set(document.uri, diagnostics);
        return;
      }

      const fallbackRange = new vscode.Range(0, 0, 0, Math.max(document.lineAt(0).text.length, 1));
      collection.set(document.uri, [
        new vscode.Diagnostic(fallbackRange, stderr.trim() || "Proton check failed.", vscode.DiagnosticSeverity.Error),
      ]);
    });
  };

  const scheduleRefresh = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const existing = refreshTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      refreshTimers.delete(key);
      refresh(document);
    }, 250);
    refreshTimers.set(key, timer);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidSaveTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleRefresh(event.document)),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        refresh(editor.document);
      }
    }),
    vscode.languages.registerHoverProvider("proton", {
      provideHover: async (document, position) => {
        const range = document.getWordRangeAtPosition(position, /[@A-Za-z_][A-Za-z0-9_]*/);
        if (!range) {
          return undefined;
        }

        const word = document.getText(range).replace(/^@/, "");
        if (KEYWORD_HOVERS.has(word)) {
          return new vscode.Hover(KEYWORD_HOVERS.get(word)!);
        }

        const summary = await inspectDocument(context.extensionPath, document.fileName, document.getText());
        return hoverFromSummary(word, summary);
      },
    }),
  );

  if (vscode.window.activeTextEditor) {
    refresh(vscode.window.activeTextEditor.document);
  }
}

export function deactivate(): void {}

function parseDiagnostic(line: string, document: vscode.TextDocument): vscode.Diagnostic | undefined {
  const match = /:(\d+):(\d+) error: (.+)$/.exec(line);
  if (!match) {
    return undefined;
  }

  const lineNumber = Number.parseInt(match[1]!, 10) - 1;
  const columnNumber = Number.parseInt(match[2]!, 10) - 1;
  const safeLine = Math.min(Math.max(lineNumber, 0), Math.max(document.lineCount - 1, 0));
  const safeColumn = Math.max(columnNumber, 0);
  const lineText = document.lineAt(safeLine).text;
  const range = new vscode.Range(safeLine, safeColumn, safeLine, Math.min(safeColumn + 1, Math.max(lineText.length, 1)));
  return new vscode.Diagnostic(range, match[3]!, vscode.DiagnosticSeverity.Error);
}

async function inspectDocument(extensionPath: string, fileName: string, source: string): Promise<any | undefined> {
  const result = await runCliWithInput(extensionPath, ["inspect-stdin", fileName, "--json"], source);
  if (result.code !== 0) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

function hoverFromSummary(word: string, inspection: any): vscode.Hover | undefined {
  if (!inspection?.summary) {
    return undefined;
  }

  const fn = inspection.summary.functions?.find((entry: any) => entry.name === word);
  if (fn) {
    return new vscode.Hover([
      new vscode.MarkdownString(`\`\`\`proton\nfn ${fn.name}(${fn.params.join(", ")}) -> ${fn.returnType}\n\`\`\``),
      `Modes: ${fn.modes.length > 0 ? fn.modes.join(", ") : "none"}`,
      fn.meta ? "Compile-time callable via `meta fn`." : "Runtime function.",
    ]);
  }

  const constant = inspection.summary.consts?.find((entry: any) => entry.name === word);
  if (constant) {
    const value = inspection.constValues?.[word];
    return new vscode.Hover([
      new vscode.MarkdownString(`\`\`\`proton\nconst ${constant.name}: ${constant.type}\n\`\`\``),
      value !== undefined ? `Value: \`${JSON.stringify(value)}\`` : "Compile-time constant.",
    ]);
  }

  const struct = inspection.summary.structs?.find((entry: any) => entry.name === word);
  if (struct) {
    const fields = struct.fields.map((field: any) => `- ${field.name}: ${field.type}`).join("\n");
    return new vscode.Hover(new vscode.MarkdownString(`**struct ${struct.name}**\n${fields}`));
  }

  const contract = inspection.summary.contracts?.find((entry: any) => entry.name === word);
  if (contract) {
    const methods = contract.methods.map((method: any) => `- ${method.name}(${method.params.join(", ")}) -> ${method.returnType}`).join("\n");
    return new vscode.Hover(new vscode.MarkdownString(`**contract ${contract.name}**\n${methods}`));
  }

  return undefined;
}

async function runCliWithInput(extensionPath: string, args: string[], input: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const cliPath = path.join(extensionPath, "..", "cli", "protonc.ts");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: path.join(extensionPath, ".."),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
