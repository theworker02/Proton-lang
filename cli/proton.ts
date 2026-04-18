#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

function printUsage(): void {
  console.error("Usage:");
  console.error("  proton git <git-args...>");
  console.error("  proton ci init");
}

async function main(): Promise<void> {
  const [, , command, subcommand, ...rest] = process.argv;

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === "git") {
    const result = spawnSync("git", [subcommand ?? "", ...rest].filter(Boolean), {
      stdio: "inherit",
      shell: false,
    });
    process.exitCode = result.status ?? 1;
    return;
  }

  if (command === "ci" && subcommand === "init") {
    const workflowDir = path.join(process.cwd(), ".github", "workflows");
    await mkdir(workflowDir, { recursive: true });
    const workflowPath = path.join(workflowDir, "proton-ci.yml");
    const yaml = `name: Proton CI
on:
  push:
  pull_request:

jobs:
  analyze-build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 25
      - run: npm install
      - run: node ./cli/protonc.ts analyze examples/main.ptn
      - run: node ./cli/protonc.ts check examples/main.ptn
      - run: npm test
`;
    await writeFile(workflowPath, yaml, "utf8");
    console.log(`ci ok: ${workflowPath}`);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

await main();
