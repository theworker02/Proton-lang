import {
  spanFrom,
  type AdaptStatementNode,
  type AlgorithmDeclarationNode,
  type AlgebraicTypeDeclarationNode,
  type AlgebraicVariantNode,
  type AnalyzeDeclarationNode,
  type ArrayLiteralNode,
  type AssignableExpressionNode,
  type AssignmentStatementNode,
  type AwaitStatementNode,
  type BinaryExpressionNode,
  type BindingKind,
  type BlockStatementNode,
  type BooleanLiteralNode,
  type BooleanPatternNode,
  type CallExpressionNode,
  type BuildDeclarationNode,
  type ChannelDeclarationNode,
  type ConstDeclarationNode,
  type ContractDeclarationNode,
  type DetectorDeclarationNode,
  type DurationLiteralNode,
  type ExecutionMode,
  type ExpressionNode,
  type ExpressionStatementNode,
  type FieldAccessExpressionNode,
  type FloatLiteralNode,
  type FunctionDeclarationNode,
  type FunctionSignatureNode,
  type GenericTypeNode,
  type GoalDeclarationNode,
  type GoalDirectiveNode,
  type GoalStatementNode,
  type GraphChainNode,
  type GraphStatementNode,
  type GroupExpressionNode,
  type IdentifierNode,
  type IdentifierPatternNode,
  type InjectionDeclarationNode,
  type IfStatementNode,
  type ImplDeclarationNode,
  type IntegerLiteralNode,
  type IntegerPatternNode,
  type IntentStatementNode,
  type MatchArmNode,
  type MatchExpressionNode,
  type MonitorDeclarationNode,
  type MutateStatementNode,
  type NetworkClusterDeclarationNode,
  type NetworkNodeNode,
  type NetworkRouteNode,
  type ObserveStatementNode,
  type ParameterNode,
  type PathExpressionNode,
  type PatternNode,
  type PluginUseDeclarationNode,
  type PointerTypeNode,
  type PrimitiveTypeNode,
  type ProfileAnnotationNode,
  type ProgramNode,
  type ReferenceTypeNode,
  type RequiresDeclarationNode,
  type ReturnStatementNode,
  type SandboxStatementNode,
  type SendStatementNode,
  type SourceLocation,
  type SpawnStatementNode,
  type StatementNode,
  type StringLiteralNode,
  type StringPatternNode,
  type StructDeclarationNode,
  type StructFieldNode,
  type StructLiteralFieldNode,
  type StructLiteralNode,
  type SuggestDeclarationNode,
  type SuggestRuleNode,
  type SyncStatementNode,
  type TimelineDeclarationNode,
  type TimelineEntryNode,
  type TopLevelItem,
  type TypeNode,
  type TypeParameterNode,
  type UnaryExpressionNode,
  type UseDeclarationNode,
  type VariableStatementNode,
  type VariantPatternNode,
  type WildcardPatternNode,
} from "./ast.ts";
import { ProtonError, diagnosticAt } from "./diagnostics.ts";
import type { Token } from "./lexer.ts";

const PRECEDENCE: Record<string, number> = {
  "==": 1,
  "!=": 1,
  "<": 2,
  ">": 2,
  "<=": 2,
  ">=": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
};

const PRIMITIVE_TYPES = new Set(["int", "i32", "i64", "f32", "f64", "bool", "str", "void"]);
const EXECUTION_MODES = new Set<ExecutionMode>(["strict", "unsafe", "parallel", "secure", "gpu"]);

interface ParsedModifiers {
  profile?: ProfileAnnotationNode;
  meta: boolean;
  exposed: boolean;
  inline: boolean;
  gpu: boolean;
  adaptive: boolean;
}

export class Parser {
  private readonly tokens: Token[];
  private index = 0;

  public constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parseProgram(): ProgramNode {
    const moduleToken = this.expectKeyword("module");
    const modulePath = this.parseQualifiedName(["."]);
    this.expectSymbol(";");

    const uses: UseDeclarationNode[] = [];
    const plugins: PluginUseDeclarationNode[] = [];
    const permissions: RequiresDeclarationNode[] = [];

    while (true) {
      if (this.matchKeyword("use")) {
        const useToken = this.previous();
        if (this.matchKeyword("plugin")) {
          const pluginName = this.expectString();
          const semicolon = this.expectSymbol(";");
          plugins.push({
            kind: "PluginUseDeclaration",
            plugin: pluginName.value,
            span: spanFrom(useToken.span.start, semicolon.span.end),
          });
          continue;
        }

        const path = this.parseQualifiedName([".", "::"]);
        const semicolon = this.expectSymbol(";");
        uses.push({
          kind: "UseDeclaration",
          path,
          span: spanFrom(useToken.span.start, semicolon.span.end),
        });
        continue;
      }

      if (this.matchKeyword("requires")) {
        const start = this.previous().span.start;
        const entries: string[] = [];
        do {
          entries.push(this.expectNameSegment().value);
        } while (this.matchSymbol(","));
        const semicolon = this.expectSymbol(";");
        permissions.push({
          kind: "RequiresDeclaration",
          permissions: entries,
          span: spanFrom(start, semicolon.span.end),
        });
        continue;
      }

      break;
    }

    const items: TopLevelItem[] = [];
    while (!this.isAtEnd()) {
      items.push(this.parseTopLevelItem());
    }

    return {
      kind: "Program",
      modulePath,
      uses,
      plugins,
      permissions,
      items,
      span: spanFrom(moduleToken.span.start, this.previous().span.end),
    };
  }

  private parseTopLevelItem(): TopLevelItem {
    const modifiers = this.parseTopLevelModifiers();

    if (this.matchKeyword("fn")) {
      return this.parseFunction(modifiers);
    }
    if (this.matchKeyword("struct")) {
      return this.parseStruct(modifiers.exposed);
    }
    if (this.matchKeyword("type")) {
      return this.parseAlgebraicType(modifiers.exposed);
    }
    if (this.matchKeyword("contract")) {
      return this.parseContract();
    }
    if (this.matchKeyword("impl")) {
      return this.parseImpl();
    }
    if (this.matchKeyword("const")) {
      return this.parseConstDeclaration(modifiers.exposed);
    }
    if (this.matchKeyword("analyze")) {
      return this.parseAnalyzeDeclaration();
    }
    if (this.matchKeyword("detector")) {
      return this.parseDetectorDeclaration();
    }
    if (this.matchKeyword("algorithm")) {
      return this.parseAlgorithmDeclaration();
    }
    if (this.matchKeyword("network")) {
      return this.parseNetworkClusterDeclaration();
    }
    if (this.matchKeyword("channel")) {
      return this.parseChannelDeclaration();
    }
    if (this.matchKeyword("build")) {
      return this.parseBuildDeclaration();
    }
    if (this.matchKeyword("monitor")) {
      return this.parseMonitorDeclaration();
    }
    if (this.matchKeyword("suggest")) {
      return this.parseSuggestDeclaration();
    }
    if (this.matchKeyword("timeline")) {
      return this.parseTimelineDeclaration();
    }
    if (this.matchKeyword("inject")) {
      return this.parseInjectionDeclaration();
    }
    if (this.matchKeyword("goal")) {
      return this.parseGoalDeclaration();
    }

    throw this.errorAtCurrent("Expected top-level declaration.");
  }

  private parseTopLevelModifiers(): ParsedModifiers {
    let profile: ProfileAnnotationNode | undefined;
    let meta = false;
    let exposed = false;
    let inline = false;
    let gpu = false;
    let adaptive = false;

    let advanced = true;
    while (advanced) {
      advanced = false;
      if (this.matchSymbol("@")) {
        profile = this.parseProfileAnnotation();
        advanced = true;
      } else if (this.matchKeyword("meta")) {
        meta = true;
        advanced = true;
      } else if (this.matchKeyword("expose")) {
        exposed = true;
        advanced = true;
      } else if (this.matchKeyword("inline")) {
        inline = true;
        advanced = true;
      } else if (this.matchKeyword("gpu")) {
        gpu = true;
        advanced = true;
      } else if (this.matchKeyword("adaptive")) {
        adaptive = true;
        advanced = true;
      }
    }

    return { profile, meta, exposed, inline, gpu, adaptive };
  }

  private parseProfileAnnotation(): ProfileAnnotationNode {
    const start = this.previous().span.start;
    const name = this.expectIdentifier();
    if (name.value !== "profile") {
      throw new ProtonError("Parsing failed.", [
        diagnosticAt("Only `@profile(...)` annotations are supported.", name.span),
      ]);
    }
    this.expectSymbol("(");
    const profile = this.expectNameSegment();
    const close = this.expectSymbol(")");
    return {
      kind: "ProfileAnnotation",
      profile: profile.value,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseFunction(modifiers: ParsedModifiers): FunctionDeclarationNode {
    const fnToken = this.previous();
    const signature = this.parseFunctionSignature(fnToken.span.start, modifiers.inline, modifiers.gpu, modifiers.adaptive);

    if (this.matchSymbol(";")) {
      return {
        kind: "FunctionDeclaration",
        name: signature.name,
        typeParams: signature.typeParams,
        params: signature.params,
        returnType: signature.returnType,
        modes: signature.modes,
        inline: signature.inline,
        gpu: signature.gpu,
        adaptive: signature.adaptive,
        body: undefined,
        exposed: modifiers.exposed,
        meta: modifiers.meta,
        profile: modifiers.profile,
        span: spanFrom(fnToken.span.start, this.previous().span.end),
      };
    }

    const body = this.parseBlock();
    return {
      kind: "FunctionDeclaration",
      name: signature.name,
      typeParams: signature.typeParams,
      params: signature.params,
      returnType: signature.returnType,
      modes: signature.modes,
      inline: signature.inline,
      gpu: signature.gpu,
      adaptive: signature.adaptive,
      body,
      exposed: modifiers.exposed,
      meta: modifiers.meta,
      profile: modifiers.profile,
      span: spanFrom(fnToken.span.start, body.span.end),
    };
  }

  private parseFunctionSignature(start: SourceLocation, inline: boolean, gpu: boolean, adaptive: boolean): FunctionSignatureNode {
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParameters();
    this.expectSymbol("(");
    const params: ParameterNode[] = [];
    if (!this.checkSymbol(")")) {
      do {
        const paramName = this.expectBindingIdentifier();
        this.expectSymbol(":");
        const paramType = this.parseType();
        params.push({
          kind: "Parameter",
          name: paramName.value,
          type: paramType,
          span: spanFrom(paramName.span.start, paramType.span.end),
        });
      } while (this.matchSymbol(","));
    }
    this.expectSymbol(")");
    this.expectSymbol("->");
    const returnType = this.parseType();
    const modes: ExecutionMode[] = [];
    while (this.matchSymbol("::")) {
      const modeToken = this.expectOneOf(["identifier", "keyword"]);
      if (!EXECUTION_MODES.has(modeToken.value as ExecutionMode)) {
        throw new ProtonError("Parsing failed.", [
          diagnosticAt(`Unknown execution mode '${modeToken.value}'.`, modeToken.span),
        ]);
      }
      modes.push(modeToken.value as ExecutionMode);
    }
    if (gpu && !modes.includes("gpu")) {
      modes.push("gpu");
    }

    return {
      kind: "FunctionSignature",
      name: name.value,
      typeParams,
      params,
      returnType,
      modes,
      inline,
      gpu,
      adaptive,
      span: spanFrom(start, this.previous().span.end),
    };
  }

  private parseTypeParameters(): TypeParameterNode[] {
    if (!this.matchSymbol("<")) {
      return [];
    }

    const params: TypeParameterNode[] = [];
    do {
      const name = this.expectIdentifier();
      const constraints: string[] = [];
      if (this.matchSymbol(":")) {
        do {
          constraints.push(this.expectNameSegment().value);
        } while (this.matchSymbol("+"));
      }
      params.push({
        kind: "TypeParameter",
        name: name.value,
        constraints,
        span: spanFrom(name.span.start, this.previous().span.end),
      });
    } while (this.matchSymbol(","));
    this.expectSymbol(">");
    return params;
  }

  private parseStruct(exposed: boolean): StructDeclarationNode {
    const structToken = this.previous();
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParameters();
    this.expectSymbol("{");
    const fields: StructFieldNode[] = [];
    while (!this.checkSymbol("}")) {
      const fieldName = this.expectIdentifier();
      this.expectSymbol(":");
      const fieldType = this.parseType();
      fields.push({
        kind: "StructField",
        name: fieldName.value,
        type: fieldType,
        span: spanFrom(fieldName.span.start, fieldType.span.end),
      });
      if (!this.matchSymbol(",")) {
        break;
      }
    }
    const closing = this.expectSymbol("}");
    this.matchSymbol(";");
    return {
      kind: "StructDeclaration",
      name: name.value,
      typeParams,
      fields,
      exposed,
      span: spanFrom(structToken.span.start, closing.span.end),
    };
  }

  private parseAlgebraicType(exposed: boolean): AlgebraicTypeDeclarationNode {
    const typeToken = this.previous();
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParameters();
    this.expectSymbol("{");
    const variants: AlgebraicVariantNode[] = [];
    while (!this.checkSymbol("}")) {
      const variantName = this.expectIdentifier();
      let payloadType: TypeNode | undefined;
      if (this.matchSymbol("(")) {
        payloadType = this.parseType();
        this.expectSymbol(")");
      }
      variants.push({
        kind: "AlgebraicVariant",
        name: variantName.value,
        payloadType,
        span: spanFrom(variantName.span.start, this.previous().span.end),
      });
      if (!this.matchSymbol(",")) {
        break;
      }
    }
    const closing = this.expectSymbol("}");
    this.matchSymbol(";");
    return {
      kind: "AlgebraicTypeDeclaration",
      name: name.value,
      typeParams,
      variants,
      exposed,
      span: spanFrom(typeToken.span.start, closing.span.end),
    };
  }

  private parseContract(): ContractDeclarationNode {
    const contractToken = this.previous();
    const name = this.expectIdentifier();
    let performance: string | undefined;

    if (this.matchSymbol("::")) {
      const parts: string[] = [];
      while (!this.checkSymbol("{")) {
        parts.push(this.advance().value);
      }
      performance = parts.join("");
    }

    this.expectSymbol("{");
    const methods: FunctionSignatureNode[] = [];
    while (!this.checkSymbol("}")) {
      const modifiers = this.parseTopLevelModifiers();
      this.expectKeyword("fn");
      methods.push(this.parseFunctionSignature(this.previous().span.start, modifiers.inline, modifiers.gpu, modifiers.adaptive));
      this.expectSymbol(";");
    }
    const closing = this.expectSymbol("}");
    return {
      kind: "ContractDeclaration",
      name: name.value,
      performance,
      methods,
      span: spanFrom(contractToken.span.start, closing.span.end),
    };
  }

  private parseImpl(): ImplDeclarationNode {
    const implToken = this.previous();
    const contractName = this.expectIdentifier();
    this.expectKeyword("for");
    const targetType = this.expectIdentifier();
    this.expectSymbol("{");
    const methods: FunctionDeclarationNode[] = [];
    while (!this.checkSymbol("}")) {
      const modifiers = this.parseTopLevelModifiers();
      this.expectKeyword("fn");
      methods.push(this.parseFunction(modifiers));
    }
    const closing = this.expectSymbol("}");
    return {
      kind: "ImplDeclaration",
      contractName: contractName.value,
      targetType: targetType.value,
      methods,
      span: spanFrom(implToken.span.start, closing.span.end),
    };
  }

  private parseConstDeclaration(exposed: boolean): ConstDeclarationNode {
    const constToken = this.previous();
    const name = this.expectIdentifier();
    this.expectSymbol(":");
    const declaredType = this.parseType();
    this.expectSymbol("=");
    const value = this.parseExpression();
    const semicolon = this.expectSymbol(";");
    return {
      kind: "ConstDeclaration",
      name: name.value,
      type: declaredType,
      value,
      exposed,
      span: spanFrom(constToken.span.start, semicolon.span.end),
    };
  }

  private parseAnalyzeDeclaration(): AnalyzeDeclarationNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    const targetLabel = this.expectNameSegment();
    if (targetLabel.value !== "target") {
      throw new ProtonError("Parsing failed.", [diagnosticAt("Expected `target:` inside analyze block.", targetLabel.span)]);
    }
    this.expectSymbol(":");
    const target = this.expectNameSegment();
    this.expectSymbol(".");
    const extension = this.expectNameSegment();
    this.expectSymbol(";");
    const rulesLabel = this.expectNameSegment();
    if (rulesLabel.value !== "rules") {
      throw new ProtonError("Parsing failed.", [diagnosticAt("Expected `rules:` inside analyze block.", rulesLabel.span)]);
    }
    this.expectSymbol(":");
    this.expectSymbol("[");
    const rules: string[] = [];
    if (!this.checkSymbol("]")) {
      do {
        rules.push(this.expectNameSegment().value);
      } while (this.matchSymbol(","));
    }
    this.expectSymbol("]");
    this.expectSymbol(";");
    const close = this.expectSymbol("}");
    return {
      kind: "AnalyzeDeclaration",
      target: `${target.value}.${extension.value}`,
      rules,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseDetectorDeclaration(): DetectorDeclarationNode {
    const start = this.previous().span.start;
    const name = this.expectIdentifier();
    this.expectSymbol("{");
    this.expectKeyword("when");
    const triggerTokens: string[] = [];
    while (!this.checkSymbol("{")) {
      triggerTokens.push(this.advance().value);
    }
    this.expectSymbol("{");
    this.expectKeyword("warn");
    this.expectSymbol("(");
    const message = this.expectString();
    this.expectSymbol(")");
    this.expectSymbol(";");
    this.expectSymbol("}");
    const close = this.expectSymbol("}");
    return {
      kind: "DetectorDeclaration",
      name: name.value,
      triggerTokens,
      message: message.value,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseAlgorithmDeclaration(): AlgorithmDeclarationNode {
    const start = this.previous().span.start;
    const name = this.expectIdentifier();
    const typeParams = this.parseTypeParameters();
    this.expectSymbol("{");
    const constraints: string[] = [];
    if (this.matchKeyword("requires")) {
      do {
        constraints.push(this.expectNameSegment().value);
      } while (this.matchSymbol(","));
      this.expectSymbol(";");
    }
    const methods: FunctionDeclarationNode[] = [];
    while (!this.checkSymbol("}")) {
      const modifiers = this.parseTopLevelModifiers();
      this.expectKeyword("fn");
      methods.push(this.parseFunction(modifiers));
    }
    const close = this.expectSymbol("}");
    return {
      kind: "AlgorithmDeclaration",
      name: name.value,
      typeParams,
      constraints,
      methods,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseNetworkClusterDeclaration(): NetworkClusterDeclarationNode {
    const start = this.previous().span.start;
    this.expectKeyword("cluster");
    this.expectSymbol("{");
    const nodes: NetworkNodeNode[] = [];
    const routes: NetworkRouteNode[] = [];
    while (!this.checkSymbol("}")) {
      if (this.matchKeyword("node")) {
        const nodeStart = this.previous().span.start;
        const name = this.expectString();
        this.expectKeyword("at");
        const address = this.expectString();
        const semicolon = this.expectSymbol(";");
        nodes.push({
          kind: "NetworkNode",
          name: name.value,
          address: address.value,
          span: spanFrom(nodeStart, semicolon.span.end),
        });
        continue;
      }
      if (this.matchKeyword("route")) {
        const routeStart = this.previous().span.start;
        const from = this.expectIdentifier();
        this.expectSymbol("->");
        const to = this.expectIdentifier();
        const semicolon = this.expectSymbol(";");
        routes.push({
          kind: "NetworkRoute",
          from: from.value,
          to: to.value,
          span: spanFrom(routeStart, semicolon.span.end),
        });
        continue;
      }
      throw this.errorAtCurrent("Expected `node` or `route` in network cluster.");
    }
    const close = this.expectSymbol("}");
    return {
      kind: "NetworkClusterDeclaration",
      nodes,
      routes,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseChannelDeclaration(): ChannelDeclarationNode {
    const start = this.previous().span.start;
    const name = this.expectIdentifier();
    const semicolon = this.expectSymbol(";");
    return {
      kind: "ChannelDeclaration",
      name: name.value,
      span: spanFrom(start, semicolon.span.end),
    };
  }

  private parseBuildDeclaration(): BuildDeclarationNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    this.expectKeyword("mode");
    this.expectSymbol(":");
    const mode = this.expectNameSegment();
    this.expectSymbol(";");
    this.expectKeyword("analyze");
    this.expectSymbol(":");
    const analyze = this.expectOneOf(["identifier", "keyword"]);
    this.expectSymbol(";");
    this.expectKeyword("detect");
    this.expectSymbol(":");
    const detect: string[] = [];
    do {
      detect.push(this.expectNameSegment().value);
    } while (this.matchSymbol(","));
    this.expectSymbol(";");
    const close = this.expectSymbol("}");
    return {
      kind: "BuildDeclaration",
      mode: mode.value,
      analyze: analyze.value === "true",
      detect,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseMonitorDeclaration(): MonitorDeclarationNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    this.expectKeyword("track");
    this.expectSymbol(":");
    const tracks: string[] = [];
    do {
      tracks.push(this.expectNameSegment().value);
    } while (this.matchSymbol(","));
    this.expectSymbol(";");
    const alerts: string[] = [];
    while (!this.checkSymbol("}")) {
      this.expectKeyword("alert");
      const tokens: string[] = [];
      while (!this.checkSymbol(";")) {
        tokens.push(this.advance().value);
      }
      this.expectSymbol(";");
      alerts.push(tokens.join(" "));
    }
    const close = this.expectSymbol("}");
    return {
      kind: "MonitorDeclaration",
      tracks,
      alerts,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseSuggestDeclaration(): SuggestDeclarationNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    const rules: SuggestRuleNode[] = [];
    while (!this.checkSymbol("}")) {
      const ruleStart = this.expectKeyword("if").span.start;
      const conditionTokens: string[] = [];
      while (!this.checkSymbol("{")) {
        conditionTokens.push(this.advance().value);
      }
      this.expectSymbol("{");
      this.expectKeyword("recommend");
      this.expectSymbol("(");
      const recommendation = this.expectString();
      this.expectSymbol(")");
      this.expectSymbol(";");
      const innerClose = this.expectSymbol("}");
      rules.push({
        kind: "SuggestRule",
        conditionTokens,
        recommendation: recommendation.value,
        span: spanFrom(ruleStart, innerClose.span.end),
      });
    }
    const close = this.expectSymbol("}");
    return {
      kind: "SuggestDeclaration",
      rules,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseTimelineDeclaration(): TimelineDeclarationNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    const entries: TimelineEntryNode[] = [];
    while (!this.checkSymbol("}")) {
      const triggerToken = this.expectOneOf(["identifier", "keyword"]);
      if (triggerToken.value !== "at" && triggerToken.value !== "after" && triggerToken.value !== "every") {
        throw new ProtonError("Parsing failed.", [diagnosticAt("Timeline entries must start with `at`, `after`, or `every`.", triggerToken.span)]);
      }
      let moment: string | DurationLiteralNode;
      if (triggerToken.value === "at") {
        const timePoint = this.expectString();
        moment = timePoint.value;
      } else {
        moment = this.parseDurationLiteral();
      }
      this.expectSymbol("->");
      const action = this.parseExpression();
      const semicolon = this.expectSymbol(";");
      entries.push({
        kind: "TimelineEntry",
        trigger: triggerToken.value as TimelineEntryNode["trigger"],
        moment,
        action,
        span: spanFrom(triggerToken.span.start, semicolon.span.end),
      });
    }
    const close = this.expectSymbol("}");
    return {
      kind: "TimelineDeclaration",
      entries,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseInjectionDeclaration(): InjectionDeclarationNode {
    const start = this.previous().span.start;
    this.expectKeyword("into");
    const target = this.expectIdentifier();
    this.expectSymbol("{");
    let beforeBlock: BlockStatementNode | undefined;
    let afterBlock: BlockStatementNode | undefined;
    while (!this.checkSymbol("}")) {
      if (this.matchKeyword("before")) {
        beforeBlock = this.parseBlock();
        continue;
      }
      if (this.matchKeyword("after")) {
        afterBlock = this.parseBlock();
        continue;
      }
      throw this.errorAtCurrent("Expected `before` or `after` inside injection block.");
    }
    const close = this.expectSymbol("}");
    return {
      kind: "InjectionDeclaration",
      target: target.value,
      beforeBlock,
      afterBlock,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseGoalDeclaration(): GoalDeclarationNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    const directives: GoalDirectiveNode[] = [];
    while (!this.checkSymbol("}")) {
      const action = this.expectNameSegment();
      const subject = this.expectNameSegment();
      const semicolon = this.expectSymbol(";");
      directives.push({
        kind: "GoalDirective",
        action: action.value,
        subject: subject.value,
        span: spanFrom(action.span.start, semicolon.span.end),
      });
    }
    const close = this.expectSymbol("}");
    return {
      kind: "GoalDeclaration",
      directives,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseBlock(): BlockStatementNode {
    const open = this.expectSymbol("{");
    const statements: StatementNode[] = [];
    while (!this.checkSymbol("}")) {
      statements.push(this.parseStatement());
    }
    const close = this.expectSymbol("}");
    return {
      kind: "BlockStatement",
      statements,
      span: spanFrom(open.span.start, close.span.end),
    };
  }

  private parseStatement(): StatementNode {
    if (this.matchKeyword("let")) {
      return this.parseVariableStatement("let");
    }
    if (this.matchKeyword("const")) {
      return this.parseVariableStatement("const");
    }
    if (this.matchBindingKeyword("core")) {
      return this.parseVariableStatement("core");
    }
    if (this.matchBindingKeyword("link")) {
      return this.parseVariableStatement("link");
    }
    if (this.matchBindingKeyword("ghost")) {
      return this.parseVariableStatement("ghost");
    }
    if (this.matchKeyword("return")) {
      return this.parseReturnStatement();
    }
    if (this.matchKeyword("if")) {
      return this.parseIfStatement();
    }
    if (this.matchKeyword("spawn")) {
      return this.parseSpawnStatement();
    }
    if (this.matchKeyword("sync")) {
      return this.parseSyncStatement();
    }
    if (this.matchKeyword("await")) {
      return this.parseAwaitStatement();
    }
    if (this.matchKeyword("mutate")) {
      return this.parseMutateStatement();
    }
    if (this.matchKeyword("intent")) {
      return this.parseIntentStatement();
    }
    if (this.matchKeyword("sandbox")) {
      return this.parseSandboxStatement();
    }
    if (this.matchKeyword("graph")) {
      return this.parseGraphStatement();
    }
    if (this.matchKeyword("send")) {
      return this.parseSendStatement();
    }
    if (this.matchKeyword("observe")) {
      return this.parseObserveStatement();
    }
    if (this.matchKeyword("adapt")) {
      return this.parseAdaptStatement();
    }
    if (this.matchKeyword("goal")) {
      return this.parseGoalStatement();
    }
    if (this.checkSymbol("{")) {
      return this.parseBlock();
    }

    const expr = this.parseExpression();
    if (this.matchSymbol("=")) {
      const value = this.parseExpression();
      const semicolon = this.expectSymbol(";");
      if (!this.isAssignable(expr)) {
        throw new ProtonError("Parsing failed.", [
          diagnosticAt("Left-hand side of assignment is not assignable.", expr.span),
        ]);
      }
      const assignment: AssignmentStatementNode = {
        kind: "AssignmentStatement",
        target: expr,
        value,
        span: spanFrom(expr.span.start, semicolon.span.end),
      };
      return assignment;
    }

    const semicolon = this.expectSymbol(";");
    const expressionStatement: ExpressionStatementNode = {
      kind: "ExpressionStatement",
      expression: expr,
      span: spanFrom(expr.span.start, semicolon.span.end),
    };
    return expressionStatement;
  }

  private parseVariableStatement(binding: BindingKind): VariableStatementNode {
    const startToken = this.previous();
    const mutable = this.matchKeyword("mut");
    const name = this.expectIdentifier();
    this.expectSymbol(":");
    const declaredType = this.parseType();
    this.expectSymbol("=");
    const initializer = this.parseExpression();
    const semicolon = this.expectSymbol(";");

    return {
      kind: "VariableStatement",
      binding,
      name: name.value,
      mutable,
      type: declaredType,
      initializer,
      span: spanFrom(startToken.span.start, semicolon.span.end),
    };
  }

  private parseReturnStatement(): ReturnStatementNode {
    const start = this.previous().span.start;
    if (this.checkSymbol(";")) {
      const semicolon = this.expectSymbol(";");
      return {
        kind: "ReturnStatement",
        span: spanFrom(start, semicolon.span.end),
      };
    }
    const value = this.parseExpression();
    const semicolon = this.expectSymbol(";");
    return {
      kind: "ReturnStatement",
      value,
      span: spanFrom(start, semicolon.span.end),
    };
  }

  private parseIfStatement(): IfStatementNode {
    const start = this.previous().span.start;
    const condition = this.parseExpression();
    const thenBlock = this.parseBlock();
    let elseBlock: BlockStatementNode | undefined;
    if (this.matchKeyword("else")) {
      elseBlock = this.parseBlock();
    }
    return {
      kind: "IfStatement",
      condition,
      thenBlock,
      elseBlock,
      span: spanFrom(start, (elseBlock ?? thenBlock).span.end),
    };
  }

  private parseSpawnStatement(): SpawnStatementNode {
    const start = this.previous().span.start;
    const name = this.expectIdentifier();
    const body = this.parseBlock();
    return {
      kind: "SpawnStatement",
      taskName: name.value,
      body,
      span: spanFrom(start, body.span.end),
    };
  }

  private parseSyncStatement(): SyncStatementNode {
    const start = this.previous().span.start;
    const body = this.parseBlock();
    return {
      kind: "SyncStatement",
      body,
      span: spanFrom(start, body.span.end),
    };
  }

  private parseAwaitStatement(): AwaitStatementNode {
    const start = this.previous().span.start;
    const taskName = this.expectIdentifier();
    const semicolon = this.expectSymbol(";");
    return {
      kind: "AwaitStatement",
      taskName: taskName.value,
      span: spanFrom(start, semicolon.span.end),
    };
  }

  private parseMutateStatement(): MutateStatementNode {
    const start = this.previous().span.start;
    this.expectSymbol("(");
    const target = this.parseExpression();
    this.expectSymbol(")");
    const body = this.parseBlock();
    return {
      kind: "MutateStatement",
      target,
      body,
      span: spanFrom(start, body.span.end),
    };
  }

  private parseIntentStatement(): IntentStatementNode {
    const start = this.previous().span.start;
    const intent = this.expectNameSegment();
    const body = this.parseBlock();
    return {
      kind: "IntentStatement",
      intent: intent.value,
      body,
      span: spanFrom(start, body.span.end),
    };
  }

  private parseSandboxStatement(): SandboxStatementNode {
    const start = this.previous().span.start;
    const body = this.parseBlock();
    return {
      kind: "SandboxStatement",
      body,
      span: spanFrom(start, body.span.end),
    };
  }

  private parseGraphStatement(): GraphStatementNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    const chains: GraphChainNode[] = [];
    while (!this.checkSymbol("}")) {
      const chainStart = this.expectKeyword("node");
      const nodes = [this.expectIdentifier().value];
      while (this.matchSymbol("->")) {
        this.expectKeyword("node");
        nodes.push(this.expectIdentifier().value);
      }
      const semicolon = this.expectSymbol(";");
      chains.push({
        kind: "GraphChain",
        nodes,
        span: spanFrom(chainStart.span.start, semicolon.span.end),
      });
    }
    const close = this.expectSymbol("}");
    return {
      kind: "GraphStatement",
      chains,
      span: spanFrom(start, close.span.end),
    };
  }

  private parseSendStatement(): SendStatementNode {
    const start = this.previous().span.start;
    const channel = this.expectIdentifier();
    this.expectSymbol("{");
    const payloadTokens: string[] = [];
    while (!this.checkSymbol("}")) {
      payloadTokens.push(this.advance().value);
    }
    this.expectSymbol("}");
    const semicolon = this.expectSymbol(";");
    return {
      kind: "SendStatement",
      channel: channel.value,
      payloadTokens,
      span: spanFrom(start, semicolon.span.end),
    };
  }

  private parseObserveStatement(): ObserveStatementNode {
    const start = this.previous().span.start;
    this.expectSymbol("{");
    const trackLabel = this.expectNameSegment();
    if (trackLabel.value !== "track") {
      throw new ProtonError("Parsing failed.", [diagnosticAt("Expected `track:` inside observe block.", trackLabel.span)]);
    }
    this.expectSymbol(":");
    const tracks: string[] = [];
    do {
      tracks.push(this.expectNameSegment().value);
    } while (this.matchSymbol(","));
    this.expectSymbol(";");
    const statements: StatementNode[] = [];
    while (!this.checkSymbol("}")) {
      statements.push(this.parseStatement());
    }
    const close = this.expectSymbol("}");
    return {
      kind: "ObserveStatement",
      tracks,
      body: {
        kind: "BlockStatement",
        statements,
        span: spanFrom(trackLabel.span.end, close.span.end),
      },
      span: spanFrom(start, close.span.end),
    };
  }

  private parseAdaptStatement(): AdaptStatementNode {
    const start = this.previous().span.start;
    const body = this.parseBlock();
    return {
      kind: "AdaptStatement",
      body,
      span: spanFrom(start, body.span.end),
    };
  }

  private parseGoalStatement(): GoalStatementNode {
    const start = this.previous().span.start;
    const objective = this.expectNameSegment();
    const semicolon = this.expectSymbol(";");
    return {
      kind: "GoalStatement",
      objective: objective.value,
      span: spanFrom(start, semicolon.span.end),
    };
  }

  private parseType(): TypeNode {
    if (this.matchSymbol("*")) {
      const start = this.previous().span.start;
      const inner = this.parseType();
      const node: PointerTypeNode = {
        kind: "PointerType",
        to: inner,
        span: spanFrom(start, inner.span.end),
      };
      return node;
    }

    if (this.matchSymbol("&")) {
      const start = this.previous().span.start;
      const inner = this.parseType();
      const node: ReferenceTypeNode = {
        kind: "ReferenceType",
        to: inner,
        span: spanFrom(start, inner.span.end),
      };
      return node;
    }

    const token = this.expectOneOf(["identifier", "keyword"]);
    if (PRIMITIVE_TYPES.has(token.value)) {
      const primitive: PrimitiveTypeNode = {
        kind: "PrimitiveType",
        name: token.value as PrimitiveTypeNode["name"],
        span: token.span,
      };
      return primitive;
    }

    if (this.matchSymbol("<")) {
      const args: TypeNode[] = [];
      do {
        args.push(this.parseType());
      } while (this.matchSymbol(","));
      const close = this.expectSymbol(">");
      const generic: GenericTypeNode = {
        kind: "GenericType",
        name: token.value,
        args,
        span: spanFrom(token.span.start, close.span.end),
      };
      return generic;
    }

    return {
      kind: "NamedType",
      name: token.value,
      span: token.span,
    };
  }

  private parseExpression(precedence = 0): ExpressionNode {
    let left = this.parsePrefix();

    while (true) {
      if (this.matchSymbol("(")) {
        left = this.finishCall(left);
        continue;
      }
      if (this.matchSymbol(".")) {
        const field = this.expectNameSegment();
        left = {
          kind: "FieldAccessExpression",
          object: left,
          field: field.value,
          span: spanFrom(left.span.start, field.span.end),
        };
        continue;
      }

      const operator = this.current();
      if (operator.kind !== "symbol") {
        break;
      }
      const operatorPrecedence = PRECEDENCE[operator.value];
      if (operatorPrecedence === undefined || operatorPrecedence <= precedence) {
        break;
      }

      this.advance();
      const right = this.parseExpression(operatorPrecedence);
      const binary: BinaryExpressionNode = {
        kind: "BinaryExpression",
        operator: operator.value,
        left,
        right,
        span: spanFrom(left.span.start, right.span.end),
      };
      left = binary;
    }

    return left;
  }

  private parsePrefix(): ExpressionNode {
    const token = this.advance();

    if (token.kind === "integer") {
      if (this.current().kind === "identifier" || this.current().kind === "keyword") {
        const unitToken = this.current();
        if (this.isDurationUnit(unitToken.value)) {
          this.advance();
          const durationNode: DurationLiteralNode = {
            kind: "DurationLiteral",
            value: Number.parseInt(token.value, 10),
            unit: unitToken.value as DurationLiteralNode["unit"],
            raw: `${token.value}${unitToken.value}`,
            span: spanFrom(token.span.start, unitToken.span.end),
          };
          return durationNode;
        }
      }
      const integerNode: IntegerLiteralNode = {
        kind: "IntegerLiteral",
        value: Number.parseInt(token.value, 10),
        raw: token.value,
        span: token.span,
      };
      return integerNode;
    }

    if (token.kind === "float") {
      const floatNode: FloatLiteralNode = {
        kind: "FloatLiteral",
        value: Number.parseFloat(token.value),
        raw: token.value,
        span: token.span,
      };
      return floatNode;
    }

    if (token.kind === "string") {
      const stringNode: StringLiteralNode = {
        kind: "StringLiteral",
        value: token.value,
        raw: token.value,
        span: token.span,
      };
      return stringNode;
    }

    if (token.kind === "keyword" && (token.value === "true" || token.value === "false")) {
      const booleanNode: BooleanLiteralNode = {
        kind: "BooleanLiteral",
        value: token.value === "true",
        span: token.span,
      };
      return booleanNode;
    }

    if (token.kind === "keyword" && token.value === "match") {
      return this.parseMatchExpression(token.span.start);
    }

    if (token.kind === "symbol" && ["-", "!", "&", "*"].includes(token.value)) {
      const operand = this.parseExpression(5);
      const unary: UnaryExpressionNode = {
        kind: "UnaryExpression",
        operator: token.value,
        operand,
        span: spanFrom(token.span.start, operand.span.end),
      };
      return unary;
    }

    if (token.kind === "symbol" && token.value === "(") {
      const expression = this.parseExpression();
      const close = this.expectSymbol(")");
      const group: GroupExpressionNode = {
        kind: "GroupExpression",
        expression,
        span: spanFrom(token.span.start, close.span.end),
      };
      return group;
    }

    if (token.kind === "symbol" && token.value === "[") {
      const elements: ExpressionNode[] = [];
      if (!this.checkSymbol("]")) {
        do {
          elements.push(this.parseExpression());
        } while (this.matchSymbol(","));
      }
      const close = this.expectSymbol("]");
      const arrayLiteral: ArrayLiteralNode = {
        kind: "ArrayLiteral",
        elements,
        span: spanFrom(token.span.start, close.span.end),
      };
      return arrayLiteral;
    }

    if (token.kind === "identifier" || token.kind === "keyword") {
      const segments = [token.value];
      while (this.matchSymbol("::")) {
        segments.push(this.expectNameSegment().value);
      }

      if (segments.length === 1 && this.checkSymbol("{")) {
        return this.parseStructLiteral(token.value, token.span.start);
      }

      if (segments.length === 1) {
        const identifier: IdentifierNode = {
          kind: "Identifier",
          name: token.value,
          span: token.span,
        };
        return identifier;
      }

      const path: PathExpressionNode = {
        kind: "PathExpression",
        segments,
        span: spanFrom(token.span.start, this.previous().span.end),
      };
      return path;
    }

    throw new ProtonError("Parsing failed.", [
      diagnosticAt(`Unexpected token '${token.value}'.`, token.span),
    ]);
  }

  private parseMatchExpression(start: SourceLocation): MatchExpressionNode {
    const value = this.parseExpression();
    this.expectSymbol("{");
    const arms: MatchArmNode[] = [];
    while (!this.checkSymbol("}")) {
      const pattern = this.parsePattern();
      this.expectSymbol("=>");
      const expression = this.parseExpression();
      const armEnd = this.matchSymbol(",") ? this.previous().span.end : expression.span.end;
      arms.push({
        kind: "MatchArm",
        pattern,
        expression,
        span: spanFrom(pattern.span.start, armEnd),
      });
    }
    const close = this.expectSymbol("}");
    return {
      kind: "MatchExpression",
      value,
      arms,
      span: spanFrom(start, close.span.end),
    };
  }

  private parsePattern(): PatternNode {
    const token = this.advance();

    if (token.kind === "symbol" && token.value === "_") {
      const wildcard: WildcardPatternNode = {
        kind: "WildcardPattern",
        span: token.span,
      };
      return wildcard;
    }

    if (token.kind === "integer") {
      const integerPattern: IntegerPatternNode = {
        kind: "IntegerPattern",
        value: Number.parseInt(token.value, 10),
        raw: token.value,
        span: token.span,
      };
      return integerPattern;
    }

    if (token.kind === "string") {
      const stringPattern: StringPatternNode = {
        kind: "StringPattern",
        value: token.value,
        span: token.span,
      };
      return stringPattern;
    }

    if (token.kind === "keyword" && (token.value === "true" || token.value === "false")) {
      const booleanPattern: BooleanPatternNode = {
        kind: "BooleanPattern",
        value: token.value === "true",
        span: token.span,
      };
      return booleanPattern;
    }

    if (token.kind === "identifier" || token.kind === "keyword") {
      if (token.value === "_") {
        return {
          kind: "WildcardPattern",
          span: token.span,
        };
      }

      const isVariant = token.value[0] === token.value[0]?.toUpperCase();
      if (this.matchSymbol("(")) {
        const binding = this.expectBindingIdentifier();
        const close = this.expectSymbol(")");
        const variantPattern: VariantPatternNode = {
          kind: "VariantPattern",
          variant: token.value,
          binding: binding.value,
          span: spanFrom(token.span.start, close.span.end),
        };
        return variantPattern;
      }

      if (isVariant) {
        return {
          kind: "VariantPattern",
          variant: token.value,
          span: token.span,
        };
      }

      const identifierPattern: IdentifierPatternNode = {
        kind: "IdentifierPattern",
        name: token.value,
        span: token.span,
      };
      return identifierPattern;
    }

    throw new ProtonError("Parsing failed.", [
      diagnosticAt(`Unexpected pattern token '${token.value}'.`, token.span),
    ]);
  }

  private parseStructLiteral(name: string, start: SourceLocation): StructLiteralNode {
    this.expectSymbol("{");
    const fields: StructLiteralFieldNode[] = [];
    while (!this.checkSymbol("}")) {
      const fieldName = this.expectIdentifier();
      this.expectSymbol(":");
      const value = this.parseExpression();
      fields.push({
        kind: "StructLiteralField",
        name: fieldName.value,
        value,
        span: spanFrom(fieldName.span.start, value.span.end),
      });
      if (!this.matchSymbol(",")) {
        break;
      }
    }
    const close = this.expectSymbol("}");
    return {
      kind: "StructLiteral",
      name,
      fields,
      span: spanFrom(start, close.span.end),
    };
  }

  private finishCall(callee: ExpressionNode): CallExpressionNode {
    const args: ExpressionNode[] = [];
    if (!this.checkSymbol(")")) {
      do {
        args.push(this.parseExpression());
      } while (this.matchSymbol(","));
    }
    const close = this.expectSymbol(")");
    return {
      kind: "CallExpression",
      callee,
      args,
      span: spanFrom(callee.span.start, close.span.end),
    };
  }

  private parseQualifiedName(separators: string[]): string[] {
    const parts = [this.expectNameSegment().value];
    while (separators.some((separator) => this.checkSymbol(separator))) {
      this.advance();
      parts.push(this.expectNameSegment().value);
    }
    return parts;
  }

  private isAssignable(expression: ExpressionNode): expression is AssignableExpressionNode {
    if (expression.kind === "Identifier" || expression.kind === "FieldAccessExpression") {
      return true;
    }
    return expression.kind === "UnaryExpression" && expression.operator === "*";
  }

  private expectKeyword(value: string): Token {
    const token = this.advance();
    if (token.kind === "keyword" && token.value === value) {
      return token;
    }
    throw new ProtonError("Parsing failed.", [
      diagnosticAt(`Expected keyword '${value}'.`, token.span),
    ]);
  }

  private expectSymbol(value: string): Token {
    const token = this.advance();
    if (token.kind === "symbol" && token.value === value) {
      return token;
    }
    throw new ProtonError("Parsing failed.", [
      diagnosticAt(`Expected symbol '${value}'.`, token.span),
    ]);
  }

  private expectIdentifier(): Token {
    const token = this.advance();
    if (token.kind === "identifier") {
      return token;
    }
    throw new ProtonError("Parsing failed.", [
      diagnosticAt("Expected identifier.", token.span),
    ]);
  }

  private expectBindingIdentifier(): Token {
    const token = this.advance();
    if (token.kind === "identifier" || (token.kind === "keyword" && token.value === "self")) {
      return token;
    }
    throw new ProtonError("Parsing failed.", [
      diagnosticAt("Expected binding identifier.", token.span),
    ]);
  }

  private expectString(): Token {
    const token = this.advance();
    if (token.kind === "string") {
      return token;
    }
    throw new ProtonError("Parsing failed.", [
      diagnosticAt("Expected string literal.", token.span),
    ]);
  }

  private expectNameSegment(): Token {
    const token = this.advance();
    if (token.kind === "identifier" || token.kind === "keyword") {
      return token;
    }
    throw new ProtonError("Parsing failed.", [
      diagnosticAt("Expected name segment.", token.span),
    ]);
  }

  private expectOneOf(kinds: Token["kind"][]): Token {
    const token = this.advance();
    if (kinds.includes(token.kind)) {
      return token;
    }
    throw new ProtonError("Parsing failed.", [
      diagnosticAt(`Expected one of: ${kinds.join(", ")}.`, token.span),
    ]);
  }

  private matchKeyword(value: string): boolean {
    if (this.current().kind === "keyword" && this.current().value === value) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchSymbol(value: string): boolean {
    if (this.current().kind === "symbol" && this.current().value === value) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkSymbol(value: string): boolean {
    return this.current().kind === "symbol" && this.current().value === value;
  }

  private matchBindingKeyword(value: string): boolean {
    if (this.current().kind !== "keyword" || this.current().value !== value) {
      return false;
    }
    if (this.tokens[this.index + 1]?.kind === "symbol" && this.tokens[this.index + 1]?.value === "::") {
      return false;
    }
    this.advance();
    return true;
  }

  private isAtEnd(): boolean {
    return this.current().kind === "eof";
  }

  private parseDurationLiteral(): DurationLiteralNode {
    const number = this.expectOneOf(["integer"]);
    const unit = this.expectNameSegment();
    if (!this.isDurationUnit(unit.value)) {
      throw new ProtonError("Parsing failed.", [diagnosticAt("Expected a duration unit like ms, s, m, or h.", unit.span)]);
    }
    return {
      kind: "DurationLiteral",
      value: Number.parseInt(number.value, 10),
      unit: unit.value as DurationLiteralNode["unit"],
      raw: `${number.value}${unit.value}`,
      span: spanFrom(number.span.start, unit.span.end),
    };
  }

  private isDurationUnit(value: string): value is DurationLiteralNode["unit"] {
    return value === "ms" || value === "s" || value === "m" || value === "h";
  }

  private current(): Token {
    return this.tokens[this.index]!;
  }

  private previous(): Token {
    return this.tokens[this.index - 1]!;
  }

  private advance(): Token {
    const token = this.tokens[this.index]!;
    this.index += 1;
    return token;
  }

  private errorAtCurrent(message: string): ProtonError {
    return new ProtonError("Parsing failed.", [diagnosticAt(message, this.current().span)]);
  }
}
