import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(rootDir, "vscode-extension", "extension.ts");
const outputPath = path.join(rootDir, "vscode-extension", "extension.js");

const source = await readFile(sourcePath, "utf8");
const compiled = transpileExtension(source);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, compiled, "utf8");

console.log(`built ${path.relative(rootDir, outputPath)}`);

function transpileExtension(input) {
  let code = input.replace(/\r\n/g, "\n");

  code = code.replace(/^import \* as (\w+) from "([^"]+)";$/gm, 'const $1 = require("$2");');
  code = code.replace(/^import \{ ([^}]+) \} from "([^"]+)";$/gm, 'const { $1 } = require("$2");');
  code = code.replace(/new Map<[^>]+>\(/g, "new Map(");
  code = code.replace(/([)\]\w])!([,;\)\]])/g, "$1$2");

  code = code.replace(
    /export function activate\(context: vscode\.ExtensionContext\): void \{/,
    "function activate(context) {",
  );
  code = code.replace(/export function deactivate\(\): void \{\}/, "function deactivate() {}");

  code = code.replace(/const refresh = \(document: vscode\.TextDocument\): void => \{/g, "const refresh = (document) => {");
  code = code.replace(/const scheduleRefresh = \(document: vscode\.TextDocument\): void => \{/g, "const scheduleRefresh = (document) => {");
  code = code.replace(/function parseDiagnostic\(line: string, document: vscode\.TextDocument\): vscode\.Diagnostic \| undefined \{/g, "function parseDiagnostic(line, document) {");
  code = code.replace(/async function inspectDocument\(extensionPath: string, fileName: string, source: string\): Promise<any \| undefined> \{/g, "async function inspectDocument(extensionPath, fileName, source) {");
  code = code.replace(/async function runCliWithInput\(extensionPath: string, args: string\[\], input: string\): Promise<\{ code: number \| null; stdout: string; stderr: string \}> \{/g, "async function runCliWithInput(extensionPath, args, input) {");
  code = code.replace(/\((\w+): any\)/g, "($1)");
  code = code.replace(/\.filter\(\(value\): value is vscode\.Diagnostic => value !== undefined\)/g, ".filter(Boolean)");
  code = code.replace(/function hoverFromSummary\(word: string, inspection: any\): vscode\.Hover \| undefined \{/g, "function hoverFromSummary(word, inspection) {");

  code = code.replace(/let stderr = "";\n/g, 'let stderr = "";\n');
  code = code.replace(/let stdout = "";\n/g, 'let stdout = "";\n');

  code += "\nmodule.exports = { activate, deactivate };\n";
  return `"use strict";\n\n${code}`;
}
