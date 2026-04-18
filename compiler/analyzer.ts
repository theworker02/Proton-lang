import type {
  AdaptStatementNode,
  AlgorithmDeclarationNode,
  AnalyzeDeclarationNode,
  BlockStatementNode,
  CallExpressionNode,
  DetectorDeclarationNode,
  ExpressionNode,
  FunctionDeclarationNode,
  GoalDeclarationNode,
  InjectionDeclarationNode,
  ObserveStatementNode,
  ProgramNode,
  StatementNode,
  TimelineDeclarationNode,
  TopLevelItem,
} from "./ast.ts";
import type { TypeCheckResult } from "./typechecker.ts";

export interface AnalysisIssue {
  severity: "info" | "warning" | "error";
  category: "performance" | "memory" | "security" | "detector" | "system";
  message: string;
  location: string;
}

export interface AnalysisReport {
  configuredTargets: string[];
  activeRules: string[];
  issues: AnalysisIssue[];
}

interface AnalysisFactBag {
  facts: Set<string>;
  issues: AnalysisIssue[];
}

export function analyzeProgram(program: ProgramNode, _analysis: TypeCheckResult, sourcePath: string): AnalysisReport {
  const analyzeBlocks = program.items.filter((item): item is AnalyzeDeclarationNode => item.kind === "AnalyzeDeclaration");
  const detectors = program.items.filter((item): item is DetectorDeclarationNode => item.kind === "DetectorDeclaration");
  const activeRules = new Set<string>();
  const configuredTargets: string[] = [];
  for (const block of analyzeBlocks) {
    configuredTargets.push(block.target);
    for (const rule of block.rules) {
      activeRules.add(rule);
    }
  }
  if (activeRules.size === 0) {
    activeRules.add("performance");
    activeRules.add("memory");
    activeRules.add("security");
  }

  const bag: AnalysisFactBag = {
    facts: new Set(),
    issues: [],
  };

  for (const item of program.items) {
    if (item.kind === "FunctionDeclaration") {
      analyzeFunctionLike(item, bag, sourcePath, item.name);
      if (activeRules.has("security") && item.modes.includes("unsafe")) {
        bag.facts.add("unsafe operation");
        bag.issues.push({
          severity: "warning",
          category: "security",
          message: `Function '${item.name}' opts into unsafe execution.`,
          location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
        });
      }
      if (activeRules.has("performance") && item.gpu && !item.modes.includes("parallel")) {
        bag.issues.push({
          severity: "info",
          category: "performance",
          message: `GPU function '${item.name}' may benefit from an explicit ::parallel mode for scheduling clarity.`,
          location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
        });
      }
    } else if (item.kind === "AlgorithmDeclaration") {
      analyzeAlgorithm(item, bag, sourcePath);
    } else if (item.kind === "NetworkClusterDeclaration") {
      bag.facts.add("network cluster");
      if (item.nodes.length > 0 && item.routes.length === 0) {
        bag.issues.push({
          severity: "warning",
          category: "system",
          message: "Network cluster defines nodes but no routes.",
          location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
        });
      }
    } else if (item.kind === "BuildDeclaration") {
      if (item.analyze && item.detect.length === 0) {
        bag.issues.push({
          severity: "info",
          category: "performance",
          message: "Build block enables analysis without any explicit detectors.",
          location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
        });
      }
    } else if (item.kind === "MonitorDeclaration") {
      if (item.tracks.length === 0) {
        bag.issues.push({
          severity: "warning",
          category: "system",
          message: "Monitor block does not track any runtime metrics.",
          location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
        });
      }
    } else if (item.kind === "SuggestDeclaration") {
      for (const rule of item.rules) {
        if (rule.conditionTokens.join(" ") === "loop inefficient") {
          bag.facts.add("loop inefficient");
        }
      }
    } else if (item.kind === "TimelineDeclaration") {
      analyzeTimeline(item, bag, sourcePath);
    } else if (item.kind === "InjectionDeclaration") {
      analyzeInjection(item, bag, sourcePath);
    } else if (item.kind === "GoalDeclaration") {
      analyzeGoalDeclaration(item, bag, sourcePath);
    }
  }

  for (const detector of detectors) {
    const trigger = detector.triggerTokens.join(" ");
    if (bag.facts.has(trigger)) {
      bag.issues.push({
        severity: "warning",
        category: "detector",
        message: `${detector.name}: ${detector.message}`,
        location: formatLocation(sourcePath, detector.span.start.line, detector.span.start.column),
      });
    }
  }

  return {
    configuredTargets,
    activeRules: [...activeRules],
    issues: bag.issues,
  };
}

function analyzeAlgorithm(item: AlgorithmDeclarationNode, bag: AnalysisFactBag, sourcePath: string): void {
  if (item.methods.length === 0) {
    bag.issues.push({
      severity: "warning",
      category: "performance",
      message: `Algorithm '${item.name}' declares no executable methods.`,
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }
  for (const method of item.methods) {
    analyzeFunctionLike(method, bag, sourcePath, `${item.name}.${method.name}`);
  }
}

function analyzeFunctionLike(item: FunctionDeclarationNode, bag: AnalysisFactBag, sourcePath: string, displayName: string): void {
  if (!item.body) {
    return;
  }

  const allocations = new Set<string>();
  let hasAdaptBlock = false;
  let hasObservation = false;
  walkBlock(item.body, (statement) => {
    if (statement.kind === "VariableStatement" && statement.initializer.kind === "CallExpression") {
      const callee = callName(statement.initializer);
      if (callee === "alloc" || callee === "core::mem::alloc" || callee === "heap_alloc" || callee === "stack_alloc") {
        allocations.add(statement.name);
      }
    }
    if (statement.kind === "ExpressionStatement" && statement.expression.kind === "CallExpression") {
      const callee = callName(statement.expression);
      if (callee === "free" || callee === "core::mem::free") {
        const freed = statement.expression.args[0];
        if (freed?.kind === "Identifier") {
          allocations.delete(freed.name);
        }
      }
    }
    if (statement.kind === "SendStatement" && statement.payloadTokens.length === 0) {
      bag.issues.push({
        severity: "warning",
        category: "system",
        message: `Channel send on '${statement.channel}' has an empty payload.`,
        location: formatLocation(sourcePath, statement.span.start.line, statement.span.start.column),
      });
    }
    if (statement.kind === "AdaptStatement") {
      hasAdaptBlock = true;
      bag.facts.add("adaptive execution path");
    }
    if (statement.kind === "ObserveStatement") {
      hasObservation = true;
      analyzeObserveStatement(statement, bag, sourcePath);
    }
  });

  for (const leaked of allocations) {
    bag.facts.add("alloc without free");
    bag.issues.push({
      severity: "warning",
      category: "memory",
      message: `Possible memory leak in '${displayName}': '${leaked}' is allocated without a matching free.`,
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }

  if (!item.inline && item.body.statements.length > 6) {
    bag.facts.add("loop inefficient");
    bag.issues.push({
      severity: "info",
      category: "performance",
      message: `Function '${displayName}' is large enough that an inline or intent block review may improve hot-path performance.`,
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }

  if (item.adaptive && !hasAdaptBlock) {
    bag.issues.push({
      severity: "warning",
      category: "system",
      message: `Adaptive function '${displayName}' does not declare an adapt block.`,
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }

  if (item.adaptive && hasObservation) {
    bag.issues.push({
      severity: "info",
      category: "performance",
      message: `Adaptive function '${displayName}' pairs observation with adaptation, which is a strong fit for Proton's runtime-aware model.`,
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }
}

function walkBlock(block: BlockStatementNode, visit: (statement: StatementNode) => void): void {
  for (const statement of block.statements) {
    visit(statement);
    switch (statement.kind) {
      case "IfStatement":
        walkBlock(statement.thenBlock, visit);
        if (statement.elseBlock) {
          walkBlock(statement.elseBlock, visit);
        }
        break;
      case "SpawnStatement":
      case "SyncStatement":
      case "IntentStatement":
      case "SandboxStatement":
      case "BlockStatement":
        walkBlock(statement.body ?? statement, visit);
        break;
      case "MutateStatement":
        walkBlock(statement.body, visit);
        break;
      case "ObserveStatement":
      case "AdaptStatement":
        walkBlock(statement.body, visit);
        break;
      default:
        break;
    }
  }
}

function analyzeTimeline(item: TimelineDeclarationNode, bag: AnalysisFactBag, sourcePath: string): void {
  const hasStartupHook = item.entries.some((entry) => entry.trigger === "at" && entry.moment === "startup");
  if (!hasStartupHook) {
    bag.issues.push({
      severity: "info",
      category: "system",
      message: "Timeline declaration has no startup hook; only startup entries execute automatically in the current runtime.",
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }

  for (const entry of item.entries) {
    if ((entry.trigger === "after" || entry.trigger === "every") && typeof entry.moment !== "string" && entry.moment.unit === "ms" && entry.moment.value < 250) {
      bag.issues.push({
        severity: "warning",
        category: "performance",
        message: `Timeline '${entry.trigger} ${entry.moment.raw}' may schedule too aggressively for a systems workload.`,
        location: formatLocation(sourcePath, entry.span.start.line, entry.span.start.column),
      });
    }
  }
}

function analyzeInjection(item: InjectionDeclarationNode, bag: AnalysisFactBag, sourcePath: string): void {
  if (!item.beforeBlock && !item.afterBlock) {
    bag.issues.push({
      severity: "warning",
      category: "system",
      message: `Injection target '${item.target}' defines no before/after behavior.`,
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }
}

function analyzeGoalDeclaration(item: GoalDeclarationNode, bag: AnalysisFactBag, sourcePath: string): void {
  const directives = new Set(item.directives.map((directive) => `${directive.action} ${directive.subject}`));
  if (directives.has("minimize latency") && directives.has("maximize throughput")) {
    bag.issues.push({
      severity: "info",
      category: "performance",
      message: "Goal declaration balances latency and throughput, enabling outcome-oriented optimization review.",
      location: formatLocation(sourcePath, item.span.start.line, item.span.start.column),
    });
  }
}

function analyzeObserveStatement(statement: ObserveStatementNode, bag: AnalysisFactBag, sourcePath: string): void {
  if (statement.tracks.length === 0) {
    bag.issues.push({
      severity: "warning",
      category: "system",
      message: "Observe block declares no tracked metrics.",
      location: formatLocation(sourcePath, statement.span.start.line, statement.span.start.column),
    });
    return;
  }

  if (!statement.tracks.includes("execution_time") && !statement.tracks.includes("memory_usage")) {
    bag.issues.push({
      severity: "info",
      category: "system",
      message: "Observe block does not track execution_time or memory_usage, so adaptive feedback may be limited.",
      location: formatLocation(sourcePath, statement.span.start.line, statement.span.start.column),
    });
  }
}

function callName(expression: CallExpressionNode): string | undefined {
  if (expression.callee.kind === "Identifier") {
    return expression.callee.name;
  }
  if (expression.callee.kind === "PathExpression") {
    return expression.callee.segments.join("::");
  }
  return undefined;
}

function formatLocation(sourcePath: string, line: number, column: number): string {
  return `${sourcePath}:${line}:${column}`;
}
