import type {
  BinaryExpressionNode,
  BlockStatementNode,
  ConstDeclarationNode,
  ExpressionNode,
  FunctionDeclarationNode,
  ProgramNode,
  StatementNode,
  UnaryExpressionNode,
  VariableStatementNode,
} from "./ast.ts";
import { ProtonError, diagnosticAt } from "./diagnostics.ts";
import type { TypeCheckResult } from "./typechecker.ts";

export type MetaValue = number | string | boolean | MetaValue[];

interface MetaEnvironment {
  locals: Map<string, MetaValue>;
}

class ReturnSignal {
  public readonly value: MetaValue | undefined;

  public constructor(value: MetaValue | undefined) {
    this.value = value;
  }
}

export class MetaEvaluator {
  private readonly program: ProgramNode;
  private readonly analysis: TypeCheckResult;
  private readonly functions = new Map<string, FunctionDeclarationNode>();
  private readonly consts = new Map<string, ConstDeclarationNode>();
  private readonly constCache = new Map<string, MetaValue>();
  private readonly constStack = new Set<string>();

  public constructor(program: ProgramNode, analysis: TypeCheckResult) {
    this.program = program;
    this.analysis = analysis;

    for (const item of program.items) {
      if (item.kind === "FunctionDeclaration" && item.meta && item.body) {
        this.functions.set(item.name, item);
      }
      if (item.kind === "ConstDeclaration") {
        this.consts.set(item.name, item);
      }
    }
  }

  public evaluateTopLevelConsts(): Map<string, MetaValue> {
    const values = new Map<string, MetaValue>();
    for (const item of this.program.items) {
      if (item.kind !== "ConstDeclaration") {
        continue;
      }
      values.set(item.name, this.evaluateConst(item.name));
    }
    return values;
  }

  private evaluateConst(name: string): MetaValue {
    if (this.constCache.has(name)) {
      return this.constCache.get(name)!;
    }
    if (this.constStack.has(name)) {
      throw new ProtonError("Compile-time evaluation failed.", [
        diagnosticAt(`Recursive constant dependency detected for '${name}'.`, this.program.span),
      ]);
    }
    const declaration = this.consts.get(name);
    if (!declaration) {
      throw new ProtonError("Compile-time evaluation failed.", [
        diagnosticAt(`Unknown constant '${name}'.`, this.program.span),
      ]);
    }
    this.constStack.add(name);
    const value = this.evaluateExpression(declaration.value, { locals: new Map() });
    this.constStack.delete(name);
    this.constCache.set(name, value);
    return value;
  }

  private evaluateExpression(expression: ExpressionNode, env: MetaEnvironment): MetaValue {
    switch (expression.kind) {
      case "IntegerLiteral":
      case "FloatLiteral":
        return expression.value;
      case "StringLiteral":
        return expression.value;
      case "BooleanLiteral":
        return expression.value;
      case "Identifier":
        if (env.locals.has(expression.name)) {
          return env.locals.get(expression.name)!;
        }
        return this.evaluateConst(expression.name);
      case "ArrayLiteral":
        return expression.elements.map((element) => this.evaluateExpression(element, env));
      case "GroupExpression":
        return this.evaluateExpression(expression.expression, env);
      case "UnaryExpression":
        return this.evaluateUnary(expression, env);
      case "BinaryExpression":
        return this.evaluateBinary(expression, env);
      case "CallExpression":
        return this.evaluateCall(expression, env);
      default:
        throw new ProtonError("Compile-time evaluation failed.", [
          diagnosticAt("Expression is not supported during compile-time evaluation.", expression.span),
        ]);
    }
  }

  private evaluateUnary(expression: UnaryExpressionNode, env: MetaEnvironment): MetaValue {
    const operand = this.evaluateExpression(expression.operand, env);
    switch (expression.operator) {
      case "-":
        return -Number(operand);
      case "!":
        return !Boolean(operand);
      default:
        throw new ProtonError("Compile-time evaluation failed.", [
          diagnosticAt(`Unsupported unary operator '${expression.operator}' in meta evaluation.`, expression.span),
        ]);
    }
  }

  private evaluateBinary(expression: BinaryExpressionNode, env: MetaEnvironment): MetaValue {
    const left = this.evaluateExpression(expression.left, env);
    const right = this.evaluateExpression(expression.right, env);
    switch (expression.operator) {
      case "+":
        return Number(left) + Number(right);
      case "-":
        return Number(left) - Number(right);
      case "*":
        return Number(left) * Number(right);
      case "/":
        return Number(left) / Number(right);
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "<":
        return Number(left) < Number(right);
      case "<=":
        return Number(left) <= Number(right);
      case ">":
        return Number(left) > Number(right);
      case ">=":
        return Number(left) >= Number(right);
      default:
        throw new ProtonError("Compile-time evaluation failed.", [
          diagnosticAt(`Unsupported binary operator '${expression.operator}' in meta evaluation.`, expression.span),
        ]);
    }
  }

  private evaluateCall(expression: Extract<ExpressionNode, { kind: "CallExpression" }>, env: MetaEnvironment): MetaValue {
    if (expression.callee.kind !== "Identifier") {
      throw new ProtonError("Compile-time evaluation failed.", [
        diagnosticAt("Meta evaluation only supports direct function calls.", expression.span),
      ]);
    }

    const fn = this.functions.get(expression.callee.name);
    if (!fn?.body) {
      throw new ProtonError("Compile-time evaluation failed.", [
        diagnosticAt(`Unknown meta function '${expression.callee.name}'.`, expression.span),
      ]);
    }

    const locals = new Map<string, MetaValue>();
    for (let index = 0; index < fn.params.length; index += 1) {
      locals.set(fn.params[index]!.name, this.evaluateExpression(expression.args[index]!, env));
    }
    return this.executeBlock(fn.body, { locals });
  }

  private executeBlock(block: BlockStatementNode, env: MetaEnvironment): MetaValue {
    const frame: MetaEnvironment = {
      locals: new Map(env.locals),
    };

    for (const statement of block.statements) {
      const maybeReturn = this.executeStatement(statement, frame);
      if (maybeReturn instanceof ReturnSignal) {
        return maybeReturn.value ?? 0;
      }
    }

    return 0;
  }

  private executeStatement(statement: StatementNode, env: MetaEnvironment): ReturnSignal | void {
    switch (statement.kind) {
      case "VariableStatement":
        env.locals.set(statement.name, this.evaluateExpression(statement.initializer, env));
        return;
      case "AssignmentStatement": {
        if (statement.target.kind !== "Identifier") {
          throw new ProtonError("Compile-time evaluation failed.", [
            diagnosticAt("Meta evaluation only supports simple identifier assignment.", statement.span),
          ]);
        }
        env.locals.set(statement.target.name, this.evaluateExpression(statement.value, env));
        return;
      }
      case "ReturnStatement":
        return new ReturnSignal(statement.value ? this.evaluateExpression(statement.value, env) : undefined);
      case "ExpressionStatement":
        this.evaluateExpression(statement.expression, env);
        return;
      case "IfStatement": {
        const condition = this.evaluateExpression(statement.condition, env);
        if (Boolean(condition)) {
          return this.executeNestedBlock(statement.thenBlock, env);
        }
        if (statement.elseBlock) {
          return this.executeNestedBlock(statement.elseBlock, env);
        }
        return;
      }
      case "BlockStatement":
        return this.executeNestedBlock(statement, env);
      default:
        throw new ProtonError("Compile-time evaluation failed.", [
          diagnosticAt("Statement is not supported in meta evaluation.", statement.span),
        ]);
    }
  }

  private executeNestedBlock(block: BlockStatementNode, env: MetaEnvironment): ReturnSignal | void {
    const nested: MetaEnvironment = {
      locals: new Map(env.locals),
    };
    for (const statement of block.statements) {
      const maybeReturn = this.executeStatement(statement, nested);
      if (maybeReturn instanceof ReturnSignal) {
        return maybeReturn;
      }
    }
    return;
  }
}
