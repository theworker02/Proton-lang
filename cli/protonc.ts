#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { analyzeProgram } from "../compiler/analyzer.ts";
import { compileFile, compileSource, formatFailure, inspectFile, inspectSource, runJavaScript } from "../compiler/compiler.ts";

function printUsage(): void {
  console.error("Usage:");
  console.error("  protonc check <file.ptn>");
  console.error("  protonc check-stdin <virtual-file.ptn>");
  console.error("  protonc analyze <file.ptn>");
  console.error("  protonc build <file.ptn> [--out-dir <directory>]");
  console.error("  protonc run <file.ptn>");
  console.error("  protonc inspect <file.ptn> [--json]");
  console.error("  protonc inspect-stdin <virtual-file.ptn> [--json]");
}

async function main(): Promise<void> {
  const [, , command, sourcePath, ...rest] = process.argv;
  if (!command || !sourcePath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    switch (command) {
      case "check": {
        await compileFile(sourcePath);
        console.log(`check ok: ${sourcePath}`);
        return;
      }
      case "check-stdin": {
        const source = await readStdin();
        compileSource(sourcePath, source);
        console.log(`check ok: ${sourcePath}`);
        return;
      }
      case "analyze": {
        const artifacts = await compileFile(sourcePath);
        const report = analyzeProgram(artifacts.program, artifacts.analysis, sourcePath);
        console.log(`analyze ok: ${sourcePath}`);
        console.log(`rules: ${report.activeRules.join(", ")}`);
        if (report.configuredTargets.length > 0) {
          console.log(`targets: ${report.configuredTargets.join(", ")}`);
        }
        if (report.issues.length === 0) {
          console.log("issues: none");
          return;
        }
        for (const issue of report.issues) {
          console.log(`${issue.severity.toUpperCase()} [${issue.category}] ${issue.location} ${issue.message}`);
        }
        return;
      }
      case "build": {
        const outDir = readOutDir(rest) ?? path.dirname(sourcePath);
        const artifacts = await compileFile(sourcePath);
        const shouldAnalyze = rest.includes("--analyze") || artifacts.program.items.some((item) => item.kind === "BuildDeclaration" && item.analyze);
        if (shouldAnalyze) {
          const report = analyzeProgram(artifacts.program, artifacts.analysis, sourcePath);
          for (const issue of report.issues) {
            console.warn(`${issue.severity.toUpperCase()} [${issue.category}] ${issue.location} ${issue.message}`);
          }
        }
        await mkdir(outDir, { recursive: true });
        const outputPath = path.join(outDir, `${path.basename(sourcePath, ".ptn")}.js`);
        await writeFile(outputPath, artifacts.javascript, "utf8");
        console.log(`build ok: ${outputPath}`);
        return;
      }
      case "run": {
        const artifacts = await compileFile(sourcePath);
        const result = runJavaScript(artifacts.javascript);
        process.exitCode = result.exitCode;
        return;
      }
      case "inspect": {
        const inspected = await inspectFile(sourcePath);
        if (rest.includes("--json")) {
          console.log(JSON.stringify(inspected, null, 2));
        } else {
          console.log(`module ${inspected.summary.modulePath.join(".")}`);
          if (inspected.summary.permissions.length > 0) {
            console.log(`requires ${inspected.summary.permissions.join(", ")}`);
          }
          for (const plugin of inspected.summary.plugins) {
            console.log(`plugin ${plugin.name}`);
          }
          for (const constant of inspected.summary.consts) {
            console.log(`const ${constant.name}: ${constant.type}`);
          }
          for (const fn of inspected.summary.functions) {
            console.log(`fn ${fn.name}(${fn.params.join(", ")}) -> ${fn.returnType}`);
          }
          for (const type of inspected.summary.algebraicTypes) {
            console.log(`type ${type.name}`);
          }
        }
        return;
      }
      case "inspect-stdin": {
        const source = await readStdin();
        const inspected = inspectSource(sourcePath, source);
        if (rest.includes("--json")) {
          console.log(JSON.stringify(inspected, null, 2));
        } else {
          console.log(`module ${inspected.summary.modulePath.join(".")}`);
        }
        return;
      }
      default:
        printUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(formatFailure(sourcePath, error));
    process.exitCode = 1;
  }
}

function readOutDir(args: string[]): string | undefined {
  const index = args.indexOf("--out-dir");
  return index === -1 ? undefined : args[index + 1];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

await main();
