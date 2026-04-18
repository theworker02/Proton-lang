import type {
  AssignableExpressionNode,
  AwaitStatementNode,
  BindingKind,
  BlockStatementNode,
  CallExpressionNode,
  ExpressionNode,
  FunctionDeclarationNode,
  GraphStatementNode,
  InjectionDeclarationNode,
  MatchArmNode,
  PatternNode,
  ProgramNode,
  StatementNode,
  TimelineDeclarationNode,
} from "./ast.ts";
import type { MetaValue } from "./meta.ts";
import type { ImportedSymbol, TypeCheckResult } from "./typechecker.ts";

export interface CodegenResult {
  javascript: string;
}

interface EmitContext {
  importedFunctions: Map<string, ImportedSymbol>;
  pluginNames: Set<string>;
  mutateTarget?: string;
  functionStartVar?: string;
}

export class CodeGenerator {
  private readonly importedFunctions = new Map<string, ImportedSymbol>();
  private readonly pluginNames = new Set<string>();

  public generate(program: ProgramNode, analysis: TypeCheckResult, constValues: Map<string, MetaValue>): CodegenResult {
    this.importedFunctions.clear();
    this.pluginNames.clear();
    for (const imported of analysis.imports.values()) {
      if (imported.kind === "function") {
        this.importedFunctions.set(imported.alias, imported);
      }
    }
    for (const plugin of analysis.plugins.keys()) {
      this.pluginNames.add(plugin);
    }
    const timelineDeclarations = program.items.filter((item): item is TimelineDeclarationNode => item.kind === "TimelineDeclaration");
    const injections = program.items.filter((item): item is InjectionDeclarationNode => item.kind === "InjectionDeclaration");
    const injectionsByTarget = new Map<string, InjectionDeclarationNode[]>();
    for (const injection of injections) {
      const list = injectionsByTarget.get(injection.target) ?? [];
      list.push(injection);
      injectionsByTarget.set(injection.target, list);
    }

    const lines: string[] = [];
    lines.push(`"use strict";`);
    lines.push(`// Proton module: ${program.modulePath.join(".")}`);
    lines.push(`const __permissions = new Set(${JSON.stringify([...analysis.permissions])});`);
    lines.push(`const __cell = (value) => ({ value });`);
    lines.push(`const __variant = (type, tag, value) => ({ __type: type, __tag: tag, __value: value });`);
    lines.push(`const __graph_log = [];`);
    lines.push(`const __channel_log = new Map();`);
    lines.push(`const __goal_log = [];`);
    lines.push(`const __timeline = [];`);
    lines.push(`const __startup_hooks = [];`);
    lines.push(`let __sandbox_depth = 0;`);
    lines.push(`const __type_of = (value) => {`);
    lines.push(`  if (value && typeof value === "object" && "__type" in value && "__tag" in value) {`);
    lines.push(`    return value.__type + "::" + value.__tag;`);
    lines.push(`  }`);
    lines.push(`  if (Array.isArray(value)) return "Vec";`);
    lines.push(`  if (value && typeof value === "object" && "region" in value && "size" in value) return "MemBlock";`);
    lines.push(`  if (value && typeof value === "object" && "status" in value && "body" in value) return "HttpResponse";`);
    lines.push(`  return typeof value;`);
    lines.push(`};`);
    lines.push(`const __display = (value) => {`);
    lines.push(`  if (value && typeof value === "object" && "value" in value && Object.keys(value).length === 1) {`);
    lines.push(`    return __display(value.value);`);
    lines.push(`  }`);
    lines.push(`  if (value && typeof value === "object" && "__type" in value && "__tag" in value) {`);
    lines.push(`    return value.__value === undefined ? value.__tag : { [value.__tag]: __display(value.__value) };`);
    lines.push(`  }`);
    lines.push(`  if (Array.isArray(value)) {`);
    lines.push(`    return value.map(__display);`);
    lines.push(`  }`);
    lines.push(`  if (value && typeof value === "object") {`);
    lines.push(`    const out = {};`);
    lines.push(`    for (const [key, field] of Object.entries(value)) {`);
    lines.push(`      out[key] = __display(field);`);
    lines.push(`    }`);
    lines.push(`    return out;`);
    lines.push(`  }`);
    lines.push(`  return value;`);
    lines.push(`};`);
    lines.push(`const __assert_permission = (permission) => {`);
    lines.push(`  if (!__permissions.has(permission)) {`);
    lines.push(`    throw new Error("Missing Proton permission: " + permission);`);
    lines.push(`  }`);
    lines.push(`};`);
    lines.push(`const __plugins = {`);
    lines.push(`  crypto: {`);
    lines.push(`    hash: (value) => "sha256:" + String(value),`);
    lines.push(`    verify: (value, digest) => ("sha256:" + String(value)) === digest,`);
    lines.push(`  },`);
    lines.push(`  git: {`);
    lines.push(`    commit: (message) => globalThis.__proton_host?.git?.commit?.(String(message)) ?? false,`);
    lines.push(`    branch: (name) => globalThis.__proton_host?.git?.branch?.(String(name)) ?? false,`);
    lines.push(`    diff: () => globalThis.__proton_host?.git?.diff?.() ?? "",`);
    lines.push(`  },`);
    lines.push(`};`);
    lines.push(`const __runtime = {`);
    lines.push(`  runtime: {`);
    lines.push(`    startedAt: Date.now(),`);
    lines.push(`    mode: "balanced",`);
    lines.push(`    info() {`);
    lines.push(`      return { time: __cell(Date.now() - this.startedAt), uptime: __cell(Date.now() - this.startedAt), mode: __cell(this.mode) };`);
    lines.push(`    },`);
    lines.push(`    setMode(mode) { this.mode = String(mode); return this.mode; },`);
    lines.push(`  },`);
    lines.push(`  system: {`);
    lines.push(`    info() {`);
    lines.push(`      const cores = 8;`);
    lines.push(`      const memory = 16384;`);
    lines.push(`      const profile = cores < 4 ? "low_power" : "high_performance";`);
    lines.push(`      return { cpu: __cell(cores), memory: __cell(memory), profile: __cell(profile) };`);
    lines.push(`    },`);
    lines.push(`  },`);
    lines.push(`  observe: {`);
    lines.push(`    memory_usage: () => 128,`);
    lines.push(`  },`);
    lines.push(`  graph: (chains) => { __graph_log.push(...chains); return undefined; },`);
    lines.push(`  channels: {`);
    lines.push(`    send: (name, payload) => {`);
    lines.push(`      const queue = __channel_log.get(name) ?? [];`);
    lines.push(`      queue.push(payload);`);
    lines.push(`      __channel_log.set(name, queue);`);
    lines.push(`      return undefined;`);
    lines.push(`    },`);
    lines.push(`  },`);
    lines.push(`  core: {`);
    lines.push(`    io: { print: (value) => console.log(__display(value)) },`);
    lines.push(`    math: { abs: (value) => Math.abs(value) },`);
    lines.push(`    mem: {`);
    lines.push(`      link_count: () => 1,`);
    lines.push(`      alloc: (size) => ({ size, region: "heap", storage: new Array(Number(size)).fill(0) }),`);
    lines.push(`      stack_alloc: (size) => ({ size, region: "stack", storage: new Array(Number(size)).fill(0) }),`);
    lines.push(`      heap_alloc: (size) => ({ size, region: "heap", storage: new Array(Number(size)).fill(0) }),`);
    lines.push(`      free: (block) => { if (block && typeof block === "object") { block.storage = []; } return undefined; },`);
    lines.push(`    },`);
    lines.push(`    concurrent: { yield: () => undefined },`);
    lines.push(`    debug: { panic: (message) => { throw new Error(String(message)); } },`);
    lines.push(`    net: {`);
    lines.push(`      json: (value) => JSON.stringify(__display(value)),`);
    lines.push(`      http_get: (url) => { __assert_permission("net"); return { status: __cell(200), body: __cell("GET " + String(url)) }; },`);
    lines.push(`      http_post: (url, body) => { __assert_permission("net"); return { status: __cell(200), body: __cell("POST " + String(url) + " " + String(body)) }; },`);
    lines.push(`      socket_connect: (endpoint) => { __assert_permission("net"); return String(endpoint).length > 0; },`);
    lines.push(`    },`);
    lines.push(`    meta: { type_of: (value) => __type_of(__display(value)) },`);
    lines.push(`    plugin: { loaded: (name) => Boolean(__plugins[String(name)]) },`);
    lines.push(`  },`);
    lines.push(`  io: { print: (value) => console.log(__display(value)) },`);
    lines.push(`  sanitize: (value) => String(value).replace(/[<>]/g, ""),`);
    lines.push(`  warn: (value) => console.warn(__display(value)),`);
    lines.push(`  log: (value) => console.log(__display(value)),`);
    lines.push(`};`);
    lines.push("");

    for (const timeline of timelineDeclarations) {
      for (const entry of timeline.entries) {
        const moment = typeof entry.moment === "string" ? JSON.stringify(entry.moment) : this.emitDuration(entry.moment);
        const serializedMoment = typeof entry.moment === "string" ? JSON.stringify(entry.moment) : JSON.stringify(entry.moment.raw);
        lines.push(`__timeline.push({ trigger: ${JSON.stringify(entry.trigger)}, moment: ${serializedMoment}, action: ${JSON.stringify(this.emitValue(entry.action, { importedFunctions: this.importedFunctions, pluginNames: this.pluginNames }))} });`);
        if (entry.trigger === "at" && typeof entry.moment === "string" && entry.moment === "startup") {
          lines.push(`__startup_hooks.push(() => ${this.emitValue(entry.action, { importedFunctions: this.importedFunctions, pluginNames: this.pluginNames })});`);
        } else {
          void moment;
        }
      }
    }

    for (const item of program.items) {
      if (item.kind === "GoalDeclaration") {
        for (const directive of item.directives) {
          lines.push(`__goal_log.push(${JSON.stringify(`${directive.action} ${directive.subject}`)});`);
        }
      }
    }

    for (const item of program.items) {
      if (item.kind === "ConstDeclaration") {
        const value = constValues.get(item.name);
        if (value !== undefined) {
          lines.push(`const ${item.name} = __cell(${this.emitMetaValue(value)});`);
        } else {
          lines.push(`const ${item.name} = __cell(${this.emitValue(item.value, { importedFunctions: this.importedFunctions, pluginNames: this.pluginNames })});`);
        }
      }
    }

    if (program.items.some((item) => item.kind === "ConstDeclaration")) {
      lines.push("");
    }

    for (const item of program.items) {
      if (item.kind !== "FunctionDeclaration" || !item.body) {
        continue;
      }
      if (item.profile) {
        lines.push(`// @profile(${item.profile.profile})`);
      }
      if (item.inline) {
        lines.push(`// inline`);
      }
      if (item.gpu) {
        lines.push(`// gpu`);
      }
      if (item.typeParams.length > 0) {
        lines.push(`// generics: ${item.typeParams.map((param) => param.name).join(", ")}`);
      }
      if (item.modes.length > 0) {
        lines.push(`// modes: ${item.modes.join(", ")}`);
      }
      if (item.adaptive) {
        lines.push(`// adaptive`);
      }
      lines.push(`function ${item.name}(${item.params.map((param) => `__arg_${param.name}`).join(", ")}) {`);
      lines.push(`  const __fn_start = Date.now();`);
      for (const param of item.params) {
        lines.push(`  const ${param.name} = __cell(__arg_${param.name});`);
      }
      const targetInjections = injectionsByTarget.get(item.name) ?? [];
      if (item.params.length > 0 && item.body.statements.length > 0) {
        lines.push("");
      }
      for (const injection of targetInjections) {
        if (injection.beforeBlock) {
          for (const line of this.emitBlock(injection.beforeBlock, { importedFunctions: this.importedFunctions, pluginNames: this.pluginNames, functionStartVar: "__fn_start" })) {
            lines.push(`  ${line}`);
          }
        }
      }
      if (targetInjections.some((injection) => injection.afterBlock)) {
        lines.push(`  try {`);
        for (const line of this.emitBlock(item.body, { importedFunctions: this.importedFunctions, pluginNames: this.pluginNames, functionStartVar: "__fn_start" })) {
          lines.push(`    ${line}`);
        }
        lines.push(`  } finally {`);
        for (const injection of targetInjections) {
          if (injection.afterBlock) {
            for (const line of this.emitBlock(injection.afterBlock, { importedFunctions: this.importedFunctions, pluginNames: this.pluginNames, functionStartVar: "__fn_start" })) {
              lines.push(`    ${line}`);
            }
          }
        }
        lines.push(`  }`);
      } else {
        for (const line of this.emitBlock(item.body, { importedFunctions: this.importedFunctions, pluginNames: this.pluginNames, functionStartVar: "__fn_start" })) {
          lines.push(`  ${line}`);
        }
      }
      lines.push(`}`);
      lines.push("");
    }

    const exportNames = program.items
      .filter((item): item is FunctionDeclarationNode => item.kind === "FunctionDeclaration" && Boolean(item.body))
      .map((item) => item.name)
      .join(", ");
    const exportList = exportNames.split(", ").filter(Boolean);
    if (exportList.includes("main") && timelineDeclarations.length > 0) {
      lines.push(`function __proton_main_entry() {`);
      lines.push(`  for (const hook of __startup_hooks) { hook(); }`);
      lines.push(`  return main();`);
      lines.push(`}`);
      lines.push(`globalThis.__proton_exports = { ${exportList.map((name) => (name === "main" ? `main: __proton_main_entry` : name)).join(", ")} };`);
    } else {
      lines.push(`globalThis.__proton_exports = { ${exportNames} };`);
    }
    lines.push(`globalThis.__proton_graph = __graph_log;`);
    lines.push(`globalThis.__proton_channels = __channel_log;`);
    lines.push(`globalThis.__proton_goals = __goal_log;`);
    lines.push(`globalThis.__proton_timeline = __timeline;`);

    return {
      javascript: lines.join("\n"),
    };
  }

  private emitBlock(block: BlockStatementNode, context: EmitContext): string[] {
    const lines: string[] = [];
    for (const statement of block.statements) {
      lines.push(...this.emitStatement(statement, context));
    }
    return lines;
  }

  private emitStatement(statement: StatementNode, context: EmitContext): string[] {
    switch (statement.kind) {
      case "VariableStatement":
        if (statement.binding === "link" || statement.binding === "ghost") {
          return [`const ${statement.name} = ${this.emitBindingAlias(statement.initializer, context)};`];
        }
        return [`const ${statement.name} = __cell(${this.emitValue(statement.initializer, context)});`];
      case "AssignmentStatement":
        return [`${this.emitCell(statement.target, context)}.value = ${this.emitValue(statement.value, context)};`];
      case "ReturnStatement":
        return [statement.value ? `return ${this.emitValue(statement.value, context)};` : "return;"];
      case "ExpressionStatement":
        return [`${this.emitValue(statement.expression, context)};`];
      case "IfStatement": {
        const lines = [`if (${this.emitValue(statement.condition, context)}) {`];
        for (const line of this.emitBlock(statement.thenBlock, context)) {
          lines.push(`  ${line}`);
        }
        if (statement.elseBlock) {
          lines.push(`} else {`);
          for (const line of this.emitBlock(statement.elseBlock, context)) {
            lines.push(`  ${line}`);
          }
        }
        lines.push(`}`);
        return lines;
      }
      case "SpawnStatement": {
        const lines = [`const ${statement.taskName} = () => {`];
        for (const line of this.emitBlock(statement.body, context)) {
          lines.push(`  ${line}`);
        }
        lines.push(`};`);
        return lines;
      }
      case "SyncStatement": {
        const lines = [`{`];
        for (const line of this.emitBlock(statement.body, context)) {
          lines.push(`  ${line}`);
        }
        lines.push(`}`);
        return lines;
      }
      case "AwaitStatement":
        return this.emitAwaitStatement(statement);
      case "MutateStatement": {
        const target = this.emitMutationReceiver(statement.target, context);
        const lines = [`{`, `  const __mut_target = ${target};`];
        for (const line of this.emitBlock(statement.body, { ...context, mutateTarget: "__mut_target" })) {
          lines.push(`  ${line}`);
        }
        lines.push(`}`);
        return lines;
      }
      case "IntentStatement": {
        const lines = [`// intent ${statement.intent}`, `{`];
        for (const line of this.emitBlock(statement.body, context)) {
          lines.push(`  ${line}`);
        }
        lines.push(`}`);
        return lines;
      }
      case "SandboxStatement": {
        const lines = [`__sandbox_depth += 1;`, `try {`];
        for (const line of this.emitBlock(statement.body, context)) {
          lines.push(`  ${line}`);
        }
        lines.push(`} finally {`);
        lines.push(`  __sandbox_depth -= 1;`);
        lines.push(`}`);
        return lines;
      }
      case "GraphStatement":
        return [this.emitGraphStatement(statement)];
      case "SendStatement":
        return [`__runtime.channels.send(${JSON.stringify(statement.channel)}, ${JSON.stringify(statement.payloadTokens.join(" "))});`];
      case "ObserveStatement": {
        const lines = [`{`];
        for (const track of statement.tracks) {
          const value = track === "execution_time"
            ? `Date.now() - (${context.functionStartVar ?? "Date.now()"})`
            : track === "memory_usage"
              ? `__runtime.observe.memory_usage()`
              : `0`;
          lines.push(`  const ${track} = __cell(${value});`);
        }
        for (const line of this.emitBlock(statement.body, context)) {
          lines.push(`  ${line}`);
        }
        lines.push(`}`);
        return lines;
      }
      case "AdaptStatement": {
        const lines = [`{`, `  const system = __runtime.system.info();`];
        for (const line of this.emitBlock(statement.body, context)) {
          lines.push(`  ${line}`);
        }
        lines.push(`}`);
        return lines;
      }
      case "GoalStatement":
        return [`__goal_log.push(${JSON.stringify(statement.objective)});`];
      case "BlockStatement": {
        const lines = [`{`];
        for (const line of this.emitBlock(statement, context)) {
          lines.push(`  ${line}`);
        }
        lines.push(`}`);
        return lines;
      }
      default:
        return [];
    }
  }

  private emitAwaitStatement(statement: AwaitStatementNode): string[] {
    return [`${statement.taskName}();`];
  }

  private emitGraphStatement(statement: GraphStatementNode): string {
    const chains = statement.chains.map((chain) => `[${chain.nodes.map((node) => JSON.stringify(node)).join(", ")}]`).join(", ");
    return `__runtime.graph([${chains}]);`;
  }

  private emitBindingAlias(initializer: ExpressionNode, context: EmitContext): string {
    if (initializer.kind === "CallExpression") {
      if (initializer.callee.kind === "FieldAccessExpression" && (initializer.callee.field === "link" || initializer.callee.field === "ghost")) {
        return this.emitCell(initializer.callee.object as AssignableExpressionNode, context);
      }
    }
    if (initializer.kind === "Identifier" && !context.pluginNames.has(initializer.name)) {
      return initializer.name;
    }
    return this.emitValue(initializer, context);
  }

  private emitMutationReceiver(expression: ExpressionNode, context: EmitContext): string {
    if (expression.kind === "Identifier") {
      return `${expression.name}.value`;
    }
    return this.emitValue(expression, context);
  }

  private emitValue(expression: ExpressionNode, context: EmitContext): string {
    switch (expression.kind) {
      case "IntegerLiteral":
      case "FloatLiteral":
        return expression.raw;
      case "DurationLiteral":
        return String(this.durationToMilliseconds(expression));
      case "StringLiteral":
        return JSON.stringify(expression.value);
      case "BooleanLiteral":
        return expression.value ? "true" : "false";
      case "Identifier": {
        if (context.pluginNames.has(expression.name)) {
          return `__plugins.${expression.name}`;
        }
        if (expression.name === "runtime") {
          return `__runtime.runtime.info()`;
        }
        if (expression.name === "system") {
          return `__runtime.system.info()`;
        }
        const imported = context.importedFunctions.get(expression.name);
        if (imported) {
          return this.emitRuntimePath(imported.canonicalName);
        }
        return `${expression.name}.value`;
      }
      case "PathExpression":
        return this.emitRuntimePath(expression.segments.join("::"));
      case "GroupExpression":
        return `(${this.emitValue(expression.expression, context)})`;
      case "UnaryExpression":
        if (expression.operator === "&") {
          return this.emitCell(expression.operand as AssignableExpressionNode, context);
        }
        if (expression.operator === "*") {
          return `${this.emitValue(expression.operand, context)}.value`;
        }
        return `(${expression.operator}${this.emitValue(expression.operand, context)})`;
      case "BinaryExpression":
        return `(${this.emitValue(expression.left, context)} ${expression.operator} ${this.emitValue(expression.right, context)})`;
      case "CallExpression":
        return this.emitCall(expression, context);
      case "FieldAccessExpression":
        if (expression.object.kind === "Identifier" && context.pluginNames.has(expression.object.name)) {
          return `__plugins.${expression.object.name}.${expression.field}`;
        }
        return `${this.emitCell(expression, context)}.value`;
      case "StructLiteral":
        return `{ ${expression.fields.map((field) => `${field.name}: __cell(${this.emitValue(field.value, context)})`).join(", ")} }`;
      case "ArrayLiteral":
        return `[${expression.elements.map((element) => this.emitValue(element, context)).join(", ")}]`;
      case "MatchExpression":
        return this.emitMatchExpression(expression, context);
      default:
        return "undefined";
    }
  }

  private emitCall(expression: CallExpressionNode, context: EmitContext): string {
    if (expression.callee.kind === "Identifier" && expression.callee.name === "push" && context.mutateTarget) {
      return `${context.mutateTarget}.push(${expression.args.map((arg) => this.emitValue(arg, context)).join(", ")})`;
    }

    if (expression.callee.kind === "FieldAccessExpression" && (expression.callee.field === "link" || expression.callee.field === "ghost")) {
      return this.emitCell(expression.callee.object as AssignableExpressionNode, context);
    }

    if (expression.callee.kind === "FieldAccessExpression" && expression.callee.object.kind === "Identifier" && context.pluginNames.has(expression.callee.object.name)) {
      return `__plugins.${expression.callee.object.name}.${expression.callee.field}(${expression.args.map((arg) => this.emitValue(arg, context)).join(", ")})`;
    }

    if (this.isVariantConstructor(expression.callee)) {
      const variant = this.getVariantConstructor(expression.callee)!;
      const value = expression.args.length > 0 ? this.emitValue(expression.args[0]!, context) : "undefined";
      return `__variant(${JSON.stringify(variant.owner)}, ${JSON.stringify(variant.tag)}, ${value})`;
    }

    const callee =
      expression.callee.kind === "Identifier" && context.importedFunctions.get(expression.callee.name)
        ? this.emitRuntimePath(context.importedFunctions.get(expression.callee.name)!.canonicalName)
        : expression.callee.kind === "Identifier" && this.isBuiltinIdentifier(expression.callee.name)
          ? this.emitRuntimePath(expression.callee.name)
        : expression.callee.kind === "Identifier"
          ? expression.callee.name
          : expression.callee.kind === "PathExpression"
            ? this.emitRuntimePath(expression.callee.segments.join("::"))
            : this.emitValue(expression.callee, context);

    if (callee === "__runtime.core.meta.type_of") {
      return `${callee}(${expression.args.map((arg) => this.emitValue(arg, context)).join(", ")})`;
    }

    return `${callee}(${expression.args.map((arg) => this.emitValue(arg, context)).join(", ")})`;
  }

  private emitMatchExpression(expression: Extract<ExpressionNode, { kind: "MatchExpression" }>, context: EmitContext): string {
    const lines: string[] = [];
    lines.push(`(() => {`);
    lines.push(`  const __match_value = ${this.emitValue(expression.value, context)};`);
    expression.arms.forEach((arm, index) => {
      const armContext = { ...context };
      const condition = this.emitPatternCondition(arm.pattern, "__match_value");
      const bindings = this.emitPatternBindings(arm.pattern, "__match_value");
      lines.push(`${index === 0 ? "  if" : "  else if"} (${condition}) {`);
      for (const binding of bindings) {
        lines.push(`    ${binding}`);
      }
      lines.push(`    return ${this.emitValue(arm.expression, armContext)};`);
      lines.push(`  }`);
    });
    lines.push(`  throw new Error("Non-exhaustive match");`);
    lines.push(`})()`);
    return lines.join("\n");
  }

  private emitPatternCondition(pattern: PatternNode, valueRef: string): string {
    switch (pattern.kind) {
      case "WildcardPattern":
      case "IdentifierPattern":
        return "true";
      case "BooleanPattern":
        return `${valueRef} === ${pattern.value ? "true" : "false"}`;
      case "IntegerPattern":
        return `${valueRef} === ${pattern.raw}`;
      case "StringPattern":
        return `${valueRef} === ${JSON.stringify(pattern.value)}`;
      case "VariantPattern":
        return `${valueRef} && ${valueRef}.__tag === ${JSON.stringify(pattern.variant)}`;
      default:
        return "false";
    }
  }

  private emitPatternBindings(pattern: PatternNode, valueRef: string): string[] {
    switch (pattern.kind) {
      case "IdentifierPattern":
        return [`const ${pattern.name} = __cell(${valueRef});`];
      case "VariantPattern":
        return pattern.binding ? [`const ${pattern.binding} = __cell(${valueRef}.__value);`] : [];
      default:
        return [];
    }
  }

  private emitCell(expression: AssignableExpressionNode, context: EmitContext): string {
    switch (expression.kind) {
      case "Identifier":
        return expression.name;
      case "FieldAccessExpression":
        if (expression.object.kind === "Identifier" && context.pluginNames.has(expression.object.name)) {
          return `__plugins.${expression.object.name}.${expression.field}`;
        }
        return `${this.emitValue(expression.object, context)}.${expression.field}`;
      case "UnaryExpression":
        return this.emitValue(expression.operand, context);
      default:
        return "undefined";
    }
  }

  private emitRuntimePath(canonicalName: string): string {
    const mapping: Record<string, string> = {
      "core::io::print": "__runtime.core.io.print",
      "io::print": "__runtime.io.print",
      "warn": "__runtime.warn",
      "log": "__runtime.log",
      "core::observe::warn": "__runtime.warn",
      "core::observe::log": "__runtime.log",
      "sanitize": "__runtime.sanitize",
      "core::math::abs": "__runtime.core.math.abs",
      "core::mem::link_count": "__runtime.core.mem.link_count",
      "core::mem::alloc": "__runtime.core.mem.alloc",
      "core::mem::stack_alloc": "__runtime.core.mem.stack_alloc",
      "core::mem::heap_alloc": "__runtime.core.mem.heap_alloc",
      "core::mem::free": "__runtime.core.mem.free",
      "core::concurrent::yield": "__runtime.core.concurrent.yield",
      "core::debug::panic": "__runtime.core.debug.panic",
      "core::net::json": "__runtime.core.net.json",
      "core::net::http_get": "__runtime.core.net.http_get",
      "core::net::http_post": "__runtime.core.net.http_post",
      "core::net::socket_connect": "__runtime.core.net.socket_connect",
      "core::meta::type_of": "__runtime.core.meta.type_of",
      "core::plugin::loaded": "__runtime.core.plugin.loaded",
    };
    return mapping[canonicalName] ?? canonicalName.split("::").join("_");
  }

  private isBuiltinIdentifier(name: string): boolean {
    return name === "warn" || name === "log" || name === "sanitize";
  }

  private isVariantConstructor(expression: ExpressionNode): boolean {
    if (expression.kind === "Identifier") {
      return /^[A-Z]/.test(expression.name);
    }
    return expression.kind === "PathExpression" && expression.segments.length === 2;
  }

  private getVariantConstructor(expression: ExpressionNode): { owner: string; tag: string } | undefined {
    if (expression.kind === "Identifier") {
      return { owner: "Unknown", tag: expression.name };
    }
    if (expression.kind === "PathExpression" && expression.segments.length === 2) {
      return {
        owner: expression.segments[0]!,
        tag: expression.segments[1]!,
      };
    }
    return undefined;
  }

  private emitMetaValue(value: MetaValue): string {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.emitMetaValue(entry)).join(", ")}]`;
    }
    if (typeof value === "string") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private emitDuration(duration: { value: number; unit: "ms" | "s" | "m" | "h" }): string {
    return String(this.durationToMilliseconds(duration));
  }

  private durationToMilliseconds(duration: { value: number; unit: "ms" | "s" | "m" | "h" }): number {
    switch (duration.unit) {
      case "ms":
        return duration.value;
      case "s":
        return duration.value * 1000;
      case "m":
        return duration.value * 60_000;
      case "h":
        return duration.value * 3_600_000;
      default:
        return duration.value;
    }
  }
}
