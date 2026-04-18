#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

interface RegistryEntry {
  name: string;
  version: string;
  description: string;
}

interface Manifest {
  dependencies: Record<string, string>;
}

function printUsage(): void {
  console.error("Usage:");
  console.error("  protonpm search <query>");
  console.error("  protonpm add <package> [version]");
  console.error("  protonpm list");
  console.error("  protonpm publish <package> <version> <description>");
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  switch (command) {
    case "search":
      await searchRegistry(rest[0] ?? "");
      return;
    case "add":
      await addDependency(rest[0], rest[1] ?? "latest");
      return;
    case "list":
      await listDependencies();
      return;
    case "publish":
      await publishPackage(rest[0], rest[1], rest.slice(2).join(" "));
      return;
    default:
      printUsage();
      process.exitCode = 1;
  }
}

async function searchRegistry(query: string): Promise<void> {
  const registry = await readRegistry();
  const matches = registry.filter((entry) => entry.name.includes(query) || entry.description.includes(query));
  if (matches.length === 0) {
    console.log("no packages found");
    return;
  }
  for (const entry of matches) {
    console.log(`${entry.name}@${entry.version} - ${entry.description}`);
  }
}

async function addDependency(name?: string, version = "latest"): Promise<void> {
  if (!name) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const manifestPath = path.join(process.cwd(), "protonpm.json");
  const manifest = await readManifest(manifestPath);
  manifest.dependencies[name] = version;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`added ${name}@${version}`);
}

async function listDependencies(): Promise<void> {
  const manifestPath = path.join(process.cwd(), "protonpm.json");
  const manifest = await readManifest(manifestPath);
  const entries = Object.entries(manifest.dependencies);
  if (entries.length === 0) {
    console.log("no dependencies");
    return;
  }
  for (const [name, version] of entries) {
    console.log(`${name}@${version}`);
  }
}

async function publishPackage(name?: string, version?: string, description?: string): Promise<void> {
  if (!name || !version || !description) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const registryPath = path.join(process.cwd(), "registry", "proton-registry.json");
  await mkdir(path.dirname(registryPath), { recursive: true });
  const registry = await readRegistry(registryPath);
  registry.push({ name, version, description });
  await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");
  console.log(`published ${name}@${version}`);
}

async function readRegistry(registryPath = path.join(process.cwd(), "registry", "proton-registry.json")): Promise<RegistryEntry[]> {
  try {
    return JSON.parse(await readFile(registryPath, "utf8")) as RegistryEntry[];
  } catch {
    return [
      { name: "web", version: "0.1.0", description: "HTTP and service helpers for Proton" },
      { name: "crypto", version: "0.1.0", description: "Hashing and signature helpers" },
      { name: "git-hooks", version: "0.1.0", description: "Git-aware detectors and CI presets" },
    ];
  }
}

async function readManifest(manifestPath: string): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  } catch {
    return { dependencies: {} };
  }
}

await main();
