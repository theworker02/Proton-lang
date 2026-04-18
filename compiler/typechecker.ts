import type {
  AdaptStatementNode,
  AlgebraicTypeDeclarationNode,
  BindingKind,
  BlockStatementNode,
  CallExpressionNode,
  ConstDeclarationNode,
  ContractDeclarationNode,
  DurationLiteralNode,
  ExecutionMode,
  ExpressionNode,
  FieldAccessExpressionNode,
  FunctionDeclarationNode,
  FunctionSignatureNode,
  GenericTypeNode,
  GoalDeclarationNode,
  GraphStatementNode,
  InjectionDeclarationNode,
  ImplDeclarationNode,
  MatchArmNode,
  MatchExpressionNode,
  ObserveStatementNode,
  PatternNode,
  ProgramNode,
  StatementNode,
  StructDeclarationNode,
  TypeNode,
  TypeParameterNode,
  UseDeclarationNode,
  VariableStatementNode,
} from "./ast.ts";
import { ProtonError, diagnosticAt, type Diagnostic } from "./diagnostics.ts";

export type ProtonType =
  | { kind: "primitive"; name: "int" | "i32" | "i64" | "f32" | "f64" | "bool" | "str" | "void" }
  | { kind: "pointer"; to: ProtonType }
  | { kind: "reference"; to: ProtonType }
  | { kind: "vec"; element: ProtonType }
  | { kind: "struct"; name: string; args: ProtonType[] }
  | { kind: "adt"; name: string; args: ProtonType[] }
  | { kind: "plugin"; name: string }
  | { kind: "typeParam"; name: string };

export interface VariableSymbol {
  name: string;
  type: ProtonType;
  mutable: boolean;
  binding: BindingKind;
}

export interface FunctionSymbol {
  name: string;
  canonicalName: string;
  typeParams: TypeParameterSymbol[];
  params: ProtonType[];
  returnType: ProtonType;
  modes: ExecutionMode[];
  meta: boolean;
  exposed: boolean;
  inline: boolean;
  gpu: boolean;
  adaptive: boolean;
  builtin?:
    | "print"
    | "warn"
    | "log"
    | "sanitize"
    | "abs"
    | "link_count"
    | "yield"
    | "alloc"
    | "stack_alloc"
    | "heap_alloc"
    | "free"
    | "panic"
    | "json"
    | "http_get"
    | "http_post"
    | "socket_connect"
    | "type_of"
    | "plugin_loaded";
}

export interface TypeParameterSymbol {
  name: string;
  constraints: string[];
}

export interface StructSymbol {
  name: string;
  exposed: boolean;
  typeParams: TypeParameterSymbol[];
  fields: Map<string, ProtonType>;
  builtin?: boolean;
}

export interface AlgebraicVariantSymbol {
  name: string;
  payloadType?: ProtonType;
}

export interface AlgebraicTypeSymbol {
  name: string;
  exposed: boolean;
  typeParams: TypeParameterSymbol[];
  variants: Map<string, AlgebraicVariantSymbol>;
}

export interface ContractMethodSymbol {
  name: string;
  typeParams: TypeParameterSymbol[];
  params: ProtonType[];
  returnType: ProtonType;
  modes: ExecutionMode[];
  inline: boolean;
  gpu: boolean;
}

export interface ContractSymbol {
  name: string;
  performance?: string;
  methods: Map<string, ContractMethodSymbol>;
}

export interface ConstSymbol {
  name: string;
  canonicalName: string;
  type: ProtonType;
  exposed: boolean;
}

export interface ImportedSymbol {
  alias: string;
  canonicalName: string;
  kind: "function" | "const" | "struct" | "contract" | "type";
}

export interface PluginMethodSymbol {
  name: string;
  params: ProtonType[];
  returnType: ProtonType;
}

export interface PluginSymbol {
  name: string;
  methods: Map<string, PluginMethodSymbol>;
}

export interface ProgramSummary {
  modulePath: string[];
  permissions: string[];
  plugins: Array<{
    name: string;
    methods: Array<{ name: string; returnType: string; params: string[] }>;
  }>;
  functions: Array<{
    name: string;
    canonicalName: string;
    returnType: string;
    params: string[];
    typeParams: string[];
    modes: ExecutionMode[];
    meta: boolean;
    exposed: boolean;
    inline: boolean;
    gpu: boolean;
    adaptive: boolean;
  }>;
  timelines: Array<{
    trigger: string;
    moment: string;
    action: string;
  }>;
  goals: string[];
  injections: Array<{
    target: string;
    hasBefore: boolean;
    hasAfter: boolean;
  }>;
  structs: Array<{
    name: string;
    exposed: boolean;
    typeParams: string[];
    fields: Array<{ name: string; type: string }>;
  }>;
  algebraicTypes: Array<{
    name: string;
    exposed: boolean;
    typeParams: string[];
    variants: Array<{ name: string; payloadType?: string }>;
  }>;
  contracts: Array<{
    name: string;
    performance?: string;
    methods: Array<{ name: string; returnType: string; params: string[]; typeParams: string[] }>;
  }>;
  consts: Array<{
    name: string;
    canonicalName: string;
    type: string;
    exposed: boolean;
  }>;
  imports: Array<{
    alias: string;
    canonicalName: string;
    kind: "function" | "const" | "struct" | "contract" | "type";
  }>;
}

export interface TypeCheckResult {
  functionTypes: Map<string, FunctionSymbol>;
  structTypes: Map<string, StructSymbol>;
  algebraicTypes: Map<string, AlgebraicTypeSymbol>;
  contractTypes: Map<string, ContractSymbol>;
  constTypes: Map<string, ConstSymbol>;
  imports: Map<string, ImportedSymbol>;
  plugins: Map<string, PluginSymbol>;
  permissions: Set<string>;
  summary: ProgramSummary;
}

interface FunctionContext {
  returnType: ProtonType;
  modes: Set<ExecutionMode>;
  insideSpawn: boolean;
  allowAwait: boolean;
  sandboxed: boolean;
  typeParams: Map<string, TypeParameterSymbol>;
  mutateTarget?: { type: ProtonType; binding: BindingKind };
}

interface VariantLookup {
  owner: string;
  typeParams: TypeParameterSymbol[];
  payloadType?: ProtonType;
}

class Scope {
  private readonly values = new Map<string, VariableSymbol>();
  private readonly parent?: Scope;

  public constructor(parent?: Scope) {
    this.parent = parent;
  }

  public define(symbol: VariableSymbol): void {
    this.values.set(symbol.name, symbol);
  }

  public lookup(name: string): { symbol: VariableSymbol; depth: number } | undefined {
    const local = this.values.get(name);
    if (local) {
      return { symbol: local, depth: 0 };
    }
    const parent = this.parent?.lookup(name);
    if (!parent) {
      return undefined;
    }
    return { symbol: parent.symbol, depth: parent.depth + 1 };
  }
}

export class TypeChecker {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly functions = new Map<string, FunctionSymbol>();
  private readonly functionsByCanonicalName = new Map<string, FunctionSymbol>();
  private readonly structs = new Map<string, StructSymbol>();
  private readonly algebraicTypes = new Map<string, AlgebraicTypeSymbol>();
  private readonly contracts = new Map<string, ContractSymbol>();
  private readonly consts = new Map<string, ConstSymbol>();
  private readonly constsByCanonicalName = new Map<string, ConstSymbol>();
  private readonly imports = new Map<string, ImportedSymbol>();
  private readonly plugins = new Map<string, PluginSymbol>();
  private readonly variants = new Map<string, VariantLookup>();
  private readonly contractImpls = new Map<string, Set<string>>();
  private readonly permissions = new Set<string>();
  private readonly timelineSummaries: ProgramSummary["timelines"] = [];
  private readonly goalSummaries: string[] = [];
  private readonly injectionSummaries: ProgramSummary["injections"] = [];
  private program!: ProgramNode;
  private moduleKey = "";

  public check(program: ProgramNode): TypeCheckResult {
    this.program = program;
    this.moduleKey = program.modulePath.join("::");

    this.seedBuiltins();
    this.collectPermissions(program);
    this.collectStructs(program);
    this.collectAlgebraicTypes(program);
    this.collectContracts(program);
    this.collectFunctions(program);
    this.collectConsts(program);
    this.collectUses(program.uses);
    this.collectPlugins(program);
    this.collectPhaseFiveDeclarations(program);
    this.checkContractsAndImpls(program);
    this.checkConsts(program);
    this.checkFunctions(program);
    this.checkEntryPoint(program);

    if (this.diagnostics.length > 0) {
      throw new ProtonError("Type checking failed.", this.diagnostics);
    }

    return {
      functionTypes: this.functionsByCanonicalName,
      structTypes: this.structs,
      algebraicTypes: this.algebraicTypes,
      contractTypes: this.contracts,
      constTypes: this.constsByCanonicalName,
      imports: this.imports,
      plugins: this.plugins,
      permissions: this.permissions,
      summary: this.buildSummary(program),
    };
  }

  private seedBuiltins(): void {
    this.structs.set("MemBlock", {
      name: "MemBlock",
      exposed: true,
      typeParams: [],
      fields: new Map([
        ["size", { kind: "primitive", name: "int" }],
        ["region", { kind: "primitive", name: "str" }],
      ]),
      builtin: true,
    });
    this.structs.set("HttpResponse", {
      name: "HttpResponse",
      exposed: true,
      typeParams: [],
      fields: new Map([
        ["status", { kind: "primitive", name: "int" }],
        ["body", { kind: "primitive", name: "str" }],
      ]),
      builtin: true,
    });
    this.structs.set("RuntimeInfo", {
      name: "RuntimeInfo",
      exposed: true,
      typeParams: [],
      fields: new Map([
        ["time", { kind: "primitive", name: "int" }],
        ["uptime", { kind: "primitive", name: "int" }],
        ["mode", { kind: "primitive", name: "str" }],
      ]),
      builtin: true,
    });
    this.structs.set("SystemInfo", {
      name: "SystemInfo",
      exposed: true,
      typeParams: [],
      fields: new Map([
        ["cpu", { kind: "primitive", name: "int" }],
        ["memory", { kind: "primitive", name: "int" }],
        ["profile", { kind: "primitive", name: "str" }],
      ]),
      builtin: true,
    });

    const builtins: FunctionSymbol[] = [
      {
        name: "warn",
        canonicalName: "core::observe::warn",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "void" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "warn",
      },
      {
        name: "log",
        canonicalName: "core::observe::log",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "void" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "log",
      },
      {
        name: "print",
        canonicalName: "core::io::print",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "void" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "print",
      },
      {
        name: "print",
        canonicalName: "io::print",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "void" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "print",
      },
      {
        name: "sanitize",
        canonicalName: "sanitize",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "str" },
        modes: ["secure"],
        meta: false,
        exposed: true,
        inline: true,
        gpu: false,
        adaptive: false,
        builtin: "sanitize",
      },
      {
        name: "abs",
        canonicalName: "core::math::abs",
        typeParams: [],
        params: [{ kind: "primitive", name: "int" }],
        returnType: { kind: "primitive", name: "int" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: true,
        gpu: false,
        adaptive: false,
        builtin: "abs",
      },
      {
        name: "link_count",
        canonicalName: "core::mem::link_count",
        typeParams: [],
        params: [{ kind: "vec", element: { kind: "primitive", name: "int" } }],
        returnType: { kind: "primitive", name: "int" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: true,
        gpu: false,
        adaptive: false,
        builtin: "link_count",
      },
      {
        name: "yield",
        canonicalName: "core::concurrent::yield",
        typeParams: [],
        params: [],
        returnType: { kind: "primitive", name: "void" },
        modes: ["parallel"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "yield",
      },
      {
        name: "alloc",
        canonicalName: "core::mem::alloc",
        typeParams: [],
        params: [{ kind: "primitive", name: "int" }],
        returnType: { kind: "struct", name: "MemBlock", args: [] },
        modes: ["unsafe"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "alloc",
      },
      {
        name: "stack_alloc",
        canonicalName: "core::mem::stack_alloc",
        typeParams: [],
        params: [{ kind: "primitive", name: "int" }],
        returnType: { kind: "struct", name: "MemBlock", args: [] },
        modes: ["unsafe"],
        meta: false,
        exposed: true,
        inline: true,
        gpu: false,
        adaptive: false,
        builtin: "stack_alloc",
      },
      {
        name: "heap_alloc",
        canonicalName: "core::mem::heap_alloc",
        typeParams: [],
        params: [{ kind: "primitive", name: "int" }],
        returnType: { kind: "struct", name: "MemBlock", args: [] },
        modes: ["unsafe"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "heap_alloc",
      },
      {
        name: "free",
        canonicalName: "core::mem::free",
        typeParams: [],
        params: [{ kind: "struct", name: "MemBlock", args: [] }],
        returnType: { kind: "primitive", name: "void" },
        modes: ["unsafe"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "free",
      },
      {
        name: "panic",
        canonicalName: "core::debug::panic",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "void" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "panic",
      },
      {
        name: "json",
        canonicalName: "core::net::json",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "str" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: true,
        gpu: false,
        adaptive: false,
        builtin: "json",
      },
      {
        name: "http_get",
        canonicalName: "core::net::http_get",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "struct", name: "HttpResponse", args: [] },
        modes: ["parallel"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "http_get",
      },
      {
        name: "http_post",
        canonicalName: "core::net::http_post",
        typeParams: [],
        params: [
          { kind: "primitive", name: "str" },
          { kind: "primitive", name: "str" },
        ],
        returnType: { kind: "struct", name: "HttpResponse", args: [] },
        modes: ["parallel"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "http_post",
      },
      {
        name: "socket_connect",
        canonicalName: "core::net::socket_connect",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "bool" },
        modes: ["parallel"],
        meta: false,
        exposed: true,
        inline: false,
        gpu: false,
        adaptive: false,
        builtin: "socket_connect",
      },
      {
        name: "type_of",
        canonicalName: "core::meta::type_of",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "str" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: true,
        gpu: false,
        adaptive: false,
        builtin: "type_of",
      },
      {
        name: "plugin_loaded",
        canonicalName: "core::plugin::loaded",
        typeParams: [],
        params: [{ kind: "primitive", name: "str" }],
        returnType: { kind: "primitive", name: "bool" },
        modes: ["strict"],
        meta: false,
        exposed: true,
        inline: true,
        gpu: false,
        adaptive: false,
        builtin: "plugin_loaded",
      },
    ];

    for (const builtin of builtins) {
      this.functions.set(
        builtin.name === "print" && builtin.canonicalName !== "sanitize" ? builtin.canonicalName : builtin.name,
        builtin,
      );
      this.functionsByCanonicalName.set(builtin.canonicalName, builtin);
      if (builtin.canonicalName === "sanitize") {
        this.functions.set("sanitize", builtin);
      }
    }
  }

  private collectPermissions(program: ProgramNode): void {
    for (const declaration of program.permissions) {
      for (const permission of declaration.permissions) {
        this.permissions.add(permission);
      }
    }
  }

  private collectStructs(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind !== "StructDeclaration") {
        continue;
      }
      if (this.structs.has(item.name)) {
        this.diagnostics.push(diagnosticAt(`Struct '${item.name}' is already declared.`, item.span));
        continue;
      }

      const typeParams = this.typeParametersFromNodes(item.typeParams);
      const fields = new Map<string, ProtonType>();
      const paramMap = this.typeParameterMap(typeParams);
      for (const field of item.fields) {
        if (fields.has(field.name)) {
          this.diagnostics.push(
            diagnosticAt(`Field '${field.name}' is declared multiple times in struct '${item.name}'.`, field.span),
          );
          continue;
        }
        fields.set(field.name, this.resolveType(field.type, paramMap));
      }

      this.structs.set(item.name, {
        name: item.name,
        exposed: item.exposed,
        typeParams,
        fields,
      });
    }
  }

  private collectAlgebraicTypes(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind !== "AlgebraicTypeDeclaration") {
        continue;
      }
      if (this.algebraicTypes.has(item.name)) {
        this.diagnostics.push(diagnosticAt(`Type '${item.name}' is already declared.`, item.span));
        continue;
      }

      const typeParams = this.typeParametersFromNodes(item.typeParams);
      const variants = new Map<string, AlgebraicVariantSymbol>();
      const paramMap = this.typeParameterMap(typeParams);
      for (const variant of item.variants) {
        if (variants.has(variant.name) || this.variants.has(variant.name)) {
          this.diagnostics.push(
            diagnosticAt(`Variant '${variant.name}' is already declared. Variant names must be globally unique.`, variant.span),
          );
          continue;
        }
        const payloadType = variant.payloadType ? this.resolveType(variant.payloadType, paramMap) : undefined;
        variants.set(variant.name, {
          name: variant.name,
          payloadType,
        });
        this.variants.set(variant.name, {
          owner: item.name,
          typeParams,
          payloadType,
        });
      }

      this.algebraicTypes.set(item.name, {
        name: item.name,
        exposed: item.exposed,
        typeParams,
        variants,
      });
    }
  }

  private collectContracts(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind !== "ContractDeclaration") {
        continue;
      }
      if (this.contracts.has(item.name)) {
        this.diagnostics.push(diagnosticAt(`Contract '${item.name}' is already declared.`, item.span));
        continue;
      }
      const methods = new Map<string, ContractMethodSymbol>();
      for (const method of item.methods) {
        if (methods.has(method.name)) {
          this.diagnostics.push(
            diagnosticAt(`Contract '${item.name}' already defines method '${method.name}'.`, method.span),
          );
          continue;
        }
        const typeParams = this.typeParametersFromNodes(method.typeParams);
        const paramMap = this.typeParameterMap(typeParams);
        methods.set(method.name, {
          name: method.name,
          typeParams,
          params: method.params.map((param) => this.resolveType(param.type, paramMap)),
          returnType: this.resolveType(method.returnType, paramMap),
          modes: method.modes,
          inline: method.inline,
          gpu: method.gpu,
        });
      }
      this.contracts.set(item.name, {
        name: item.name,
        performance: item.performance,
        methods,
      });
    }
  }

  private collectFunctions(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind !== "FunctionDeclaration") {
        continue;
      }
      const canonicalName = this.canonicalizeLocal(item.name);
      const typeParams = this.typeParametersFromNodes(item.typeParams);
      const paramMap = this.typeParameterMap(typeParams);
      const symbol: FunctionSymbol = {
        name: item.name,
        canonicalName,
        typeParams,
        params: item.params.map((param) => this.resolveType(param.type, paramMap)),
        returnType: this.resolveType(item.returnType, paramMap),
        modes: item.modes,
        meta: item.meta,
        exposed: item.exposed,
        inline: item.inline,
        gpu: item.gpu,
        adaptive: item.adaptive,
      };
      if (this.functionsByCanonicalName.has(canonicalName)) {
        this.diagnostics.push(diagnosticAt(`Function '${item.name}' is already declared.`, item.span));
        continue;
      }
      this.functions.set(item.name, symbol);
      this.functionsByCanonicalName.set(canonicalName, symbol);
    }
  }

  private collectConsts(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind !== "ConstDeclaration") {
        continue;
      }
      const canonicalName = this.canonicalizeLocal(item.name);
      const symbol: ConstSymbol = {
        name: item.name,
        canonicalName,
        type: this.resolveType(item.type),
        exposed: item.exposed,
      };
      if (this.constsByCanonicalName.has(canonicalName)) {
        this.diagnostics.push(diagnosticAt(`Constant '${item.name}' is already declared.`, item.span));
        continue;
      }
      this.consts.set(item.name, symbol);
      this.constsByCanonicalName.set(canonicalName, symbol);
    }
  }

  private collectUses(uses: UseDeclarationNode[]): void {
    for (const use of uses) {
      const alias = use.path[use.path.length - 1]!;
      const canonicalName = use.path.join("::");
      const resolved = this.resolveImportTarget(canonicalName);
      if (!resolved) {
        this.diagnostics.push(
          diagnosticAt(`Cannot use '${use.path.join(".")}' because it is not exposed or not known.`, use.span),
        );
        continue;
      }
      if (this.imports.has(alias)) {
        this.diagnostics.push(diagnosticAt(`Import alias '${alias}' is already defined.`, use.span));
        continue;
      }
      this.imports.set(alias, {
        alias,
        canonicalName,
        kind: resolved,
      });
    }
  }

  private collectPlugins(program: ProgramNode): void {
    const registry = this.seedPlugins();
    for (const plugin of program.plugins) {
      const symbol = registry.get(plugin.plugin);
      if (!symbol) {
        this.diagnostics.push(diagnosticAt(`Unknown plugin '${plugin.plugin}'.`, plugin.span));
        continue;
      }
      if (this.plugins.has(plugin.plugin)) {
        this.diagnostics.push(diagnosticAt(`Plugin '${plugin.plugin}' is already imported.`, plugin.span));
        continue;
      }
      this.plugins.set(plugin.plugin, symbol);
    }
  }

  private collectPhaseFiveDeclarations(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind === "TimelineDeclaration") {
        for (const entry of item.entries) {
          this.timelineSummaries.push({
            trigger: entry.trigger,
            moment: typeof entry.moment === "string" ? entry.moment : entry.moment.raw,
            action: this.describeExpression(entry.action),
          });
        }
      } else if (item.kind === "GoalDeclaration") {
        for (const directive of item.directives) {
          this.goalSummaries.push(`${directive.action} ${directive.subject}`);
        }
      } else if (item.kind === "InjectionDeclaration") {
        this.injectionSummaries.push({
          target: item.target,
          hasBefore: Boolean(item.beforeBlock),
          hasAfter: Boolean(item.afterBlock),
        });
        if (!this.functions.has(item.target)) {
          this.diagnostics.push(diagnosticAt(`Injection target '${item.target}' is not a known function.`, item.span));
        }
      }
    }
  }

  private seedPlugins(): Map<string, PluginSymbol> {
    return new Map([
      [
        "crypto",
        {
          name: "crypto",
          methods: new Map([
            [
              "hash",
              {
                name: "hash",
                params: [{ kind: "primitive", name: "str" }],
                returnType: { kind: "primitive", name: "str" },
              },
            ],
            [
              "verify",
              {
                name: "verify",
                params: [
                  { kind: "primitive", name: "str" },
                  { kind: "primitive", name: "str" },
                ],
                returnType: { kind: "primitive", name: "bool" },
              },
            ],
          ]),
        },
      ],
      [
        "git",
        {
          name: "git",
          methods: new Map([
            [
              "commit",
              {
                name: "commit",
                params: [{ kind: "primitive", name: "str" }],
                returnType: { kind: "primitive", name: "bool" },
              },
            ],
            [
              "branch",
              {
                name: "branch",
                params: [{ kind: "primitive", name: "str" }],
                returnType: { kind: "primitive", name: "bool" },
              },
            ],
            [
              "diff",
              {
                name: "diff",
                params: [],
                returnType: { kind: "primitive", name: "str" },
              },
            ],
          ]),
        },
      ],
    ]);
  }

  private resolveImportTarget(canonicalName: string): ImportedSymbol["kind"] | undefined {
    const fn = this.functionsByCanonicalName.get(canonicalName);
    if (fn && (fn.exposed || fn.builtin)) {
      return "function";
    }
    const constant = this.constsByCanonicalName.get(canonicalName);
    if (constant && constant.exposed) {
      return "const";
    }
    const struct = this.structs.get(canonicalName.split("::").at(-1)!);
    if (struct && struct.exposed && (struct.builtin || this.canonicalizeLocal(struct.name) === canonicalName)) {
      return "struct";
    }
    const type = this.algebraicTypes.get(canonicalName.split("::").at(-1)!);
    if (type && type.exposed && this.canonicalizeLocal(type.name) === canonicalName) {
      return "type";
    }
    if (this.contracts.has(canonicalName.split("::").at(-1)!)) {
      return "contract";
    }
    return undefined;
  }

  private checkContractsAndImpls(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind !== "ImplDeclaration") {
        continue;
      }
      const contract = this.contracts.get(item.contractName);
      if (!contract) {
        this.diagnostics.push(diagnosticAt(`Unknown contract '${item.contractName}'.`, item.span));
        continue;
      }
      if (!this.structs.has(item.targetType)) {
        this.diagnostics.push(diagnosticAt(`Unknown struct '${item.targetType}' in impl.`, item.span));
        continue;
      }

      const implemented = new Map<string, FunctionDeclarationNode>();
      for (const method of item.methods) {
        implemented.set(method.name, method);
      }

      for (const [methodName, contractMethod] of contract.methods) {
        const implMethod = implemented.get(methodName);
        if (!implMethod) {
          this.diagnostics.push(
            diagnosticAt(`Impl for '${item.targetType}' is missing contract method '${methodName}'.`, item.span),
          );
          continue;
        }
        this.compareContractMethod(contractMethod, implMethod);
      }

      const targets = this.contractImpls.get(item.contractName) ?? new Set<string>();
      targets.add(item.targetType);
      this.contractImpls.set(item.contractName, targets);
    }
  }

  private compareContractMethod(contractMethod: ContractMethodSymbol, implMethod: FunctionDeclarationNode): void {
    if (contractMethod.params.length !== implMethod.params.length) {
      this.diagnostics.push(
        diagnosticAt(`Method '${implMethod.name}' does not satisfy contract parameter count.`, implMethod.span),
      );
      return;
    }

    const implTypeParams = this.typeParametersFromNodes(implMethod.typeParams);
    const implParamMap = this.typeParameterMap(implTypeParams);
    for (let index = 0; index < contractMethod.params.length; index += 1) {
      const actual = this.resolveType(implMethod.params[index]!.type, implParamMap);
      if (!this.isSameType(contractMethod.params[index]!, actual)) {
        this.diagnostics.push(
          diagnosticAt(
            `Method '${implMethod.name}' parameter ${index + 1} must be ${this.formatType(contractMethod.params[index]!)}, got ${this.formatType(actual)}.`,
            implMethod.params[index]!.span,
          ),
        );
      }
    }

    const actualReturn = this.resolveType(implMethod.returnType, implParamMap);
    if (!this.isSameType(contractMethod.returnType, actualReturn)) {
      this.diagnostics.push(
        diagnosticAt(`Method '${implMethod.name}' must return ${this.formatType(contractMethod.returnType)}.`, implMethod.returnType.span),
      );
    }
  }

  private checkConsts(program: ProgramNode): void {
    const rootScope = new Scope();
    for (const constant of this.consts.values()) {
      rootScope.define({
        name: constant.name,
        type: constant.type,
        mutable: false,
        binding: "const",
      });
    }

    for (const item of program.items) {
      if (item.kind !== "ConstDeclaration") {
        continue;
      }
      const declaredType = this.resolveType(item.type);
      const actualType = this.checkExpression(
        item.value,
        rootScope,
        {
          returnType: { kind: "primitive", name: "void" },
          modes: new Set(["strict"]),
          insideSpawn: false,
          allowAwait: false,
          sandboxed: false,
          typeParams: new Map(),
        },
        declaredType,
      );

      if (!this.isSameType(declaredType, actualType)) {
        this.diagnostics.push(
          diagnosticAt(`Constant '${item.name}' expects ${this.formatType(declaredType)}, got ${this.formatType(actualType)}.`, item.span),
        );
      }

      this.validateConstExpression(item.value);
    }
  }

  private checkFunctions(program: ProgramNode): void {
    for (const item of program.items) {
      if (item.kind === "FunctionDeclaration") {
        this.checkFunctionDeclaration(item, undefined);
      } else if (item.kind === "ImplDeclaration") {
        for (const method of item.methods) {
          this.checkFunctionDeclaration(method, item.targetType);
        }
      }
    }
  }

  private checkFunctionDeclaration(fn: FunctionDeclarationNode, implTargetType?: string): void {
    const signature =
      this.functions.get(fn.name) ??
      {
        name: fn.name,
        canonicalName: this.canonicalizeLocal(fn.name),
        typeParams: this.typeParametersFromNodes(fn.typeParams),
        params: fn.params.map((param) => this.resolveType(param.type)),
        returnType: this.resolveType(fn.returnType),
        modes: fn.modes,
        meta: fn.meta,
        exposed: fn.exposed,
        inline: fn.inline,
        gpu: fn.gpu,
        adaptive: fn.adaptive,
      };

    this.validateModes(fn, signature);

    if (!fn.body) {
      return;
    }

    const scope = new Scope();
    for (let index = 0; index < fn.params.length; index += 1) {
      scope.define({
        name: fn.params[index]!.name,
        type: signature.params[index]!,
        mutable: false,
        binding: "let",
      });
    }

    if (implTargetType) {
      scope.define({
        name: "self",
        type: { kind: "struct", name: implTargetType, args: [] },
        mutable: false,
        binding: "let",
      });
    }

    for (const constant of this.consts.values()) {
      scope.define({
        name: constant.name,
        type: constant.type,
        mutable: false,
        binding: "const",
      });
    }

    const context: FunctionContext = {
      returnType: signature.returnType,
      modes: new Set(signature.modes),
      insideSpawn: false,
      allowAwait: false,
      sandboxed: false,
      typeParams: this.typeParameterMap(signature.typeParams),
    };

    const returns = this.checkBlock(fn.body, scope, context);
    if (!returns && !(signature.returnType.kind === "primitive" && this.normalizePrimitive(signature.returnType.name) === "void")) {
      this.diagnostics.push(diagnosticAt(`Function '${fn.name}' must end with an explicit return.`, fn.span));
    }
  }

  private validateModes(fn: FunctionDeclarationNode, signature: FunctionSymbol): void {
    const seen = new Set<ExecutionMode>();
    for (const mode of fn.modes) {
      if (seen.has(mode)) {
        this.diagnostics.push(diagnosticAt(`Function '${fn.name}' declares duplicate mode '${mode}'.`, fn.span));
      }
      seen.add(mode);
    }

    if (signature.gpu && !seen.has("gpu")) {
      seen.add("gpu");
    }

    if (seen.has("secure") && seen.has("unsafe")) {
      this.diagnostics.push(diagnosticAt(`Function '${fn.name}' cannot be both secure and unsafe.`, fn.span));
    }

    if (seen.has("secure")) {
      for (const param of fn.params) {
        const type = this.resolveType(param.type, this.typeParameterMap(signature.typeParams));
        if (type.kind === "pointer" || type.kind === "reference") {
          this.diagnostics.push(
            diagnosticAt(`Secure function '${fn.name}' cannot accept raw pointer or reference parameters.`, param.span),
          );
        }
      }
      const returnType = this.resolveType(fn.returnType, this.typeParameterMap(signature.typeParams));
      if (returnType.kind === "pointer" || returnType.kind === "reference") {
        this.diagnostics.push(
          diagnosticAt(`Secure function '${fn.name}' cannot return a raw pointer or reference.`, fn.returnType.span),
        );
      }
    }
  }

  private checkBlock(block: BlockStatementNode, parentScope: Scope, context: FunctionContext): boolean {
    const scope = new Scope(parentScope);
    let alwaysReturns = false;

    for (const statement of block.statements) {
      const statementReturns = this.checkStatement(statement, scope, context);
      if (statementReturns) {
        alwaysReturns = true;
        break;
      }
    }

    return alwaysReturns;
  }

  private checkStatement(statement: StatementNode, scope: Scope, context: FunctionContext): boolean {
    switch (statement.kind) {
      case "VariableStatement":
        this.checkVariableStatement(statement, scope, context);
        return false;
      case "AssignmentStatement": {
        const targetType = this.checkAssignable(statement.target, scope, context);
        const valueType = this.checkExpression(statement.value, scope, context, targetType);
        if (!this.isSameType(targetType, valueType)) {
          this.diagnostics.push(diagnosticAt(`Cannot assign ${this.formatType(valueType)} to ${this.formatType(targetType)}.`, statement.span));
        }
        return false;
      }
      case "ReturnStatement":
        this.checkReturnStatement(statement, scope, context);
        return true;
      case "ExpressionStatement":
        this.checkExpression(statement.expression, scope, context);
        return false;
      case "IfStatement": {
        const conditionType = this.checkExpression(statement.condition, scope, context);
        if (!this.isSameType(conditionType, { kind: "primitive", name: "bool" })) {
          this.diagnostics.push(diagnosticAt("If conditions must evaluate to bool.", statement.condition.span));
        }
        const thenReturns = this.checkBlock(statement.thenBlock, scope, context);
        const elseReturns = statement.elseBlock ? this.checkBlock(statement.elseBlock, scope, context) : false;
        return thenReturns && elseReturns;
      }
      case "SpawnStatement":
        this.checkSpawnStatement(statement, scope, context);
        return false;
      case "SyncStatement":
        this.checkSyncStatement(statement, scope, context);
        return false;
      case "AwaitStatement":
        this.checkAwaitStatement(statement, context);
        return false;
      case "MutateStatement":
        this.checkMutateStatement(statement, scope, context);
        return false;
      case "IntentStatement":
        return this.checkBlock(statement.body, scope, context);
      case "ObserveStatement":
        return this.checkObserveStatement(statement, scope, context);
      case "AdaptStatement":
        return this.checkAdaptStatement(statement, scope, context);
      case "GoalStatement":
        this.goalSummaries.push(statement.objective);
        return false;
      case "SandboxStatement": {
        const sandboxContext: FunctionContext = {
          ...context,
          sandboxed: true,
        };
        return this.checkBlock(statement.body, scope, sandboxContext);
      }
      case "GraphStatement":
        this.checkGraphStatement(statement);
        return false;
      case "SendStatement":
        if (!this.permissions.has("net")) {
          this.diagnostics.push(diagnosticAt("Channel sends require `requires net;` at module scope.", statement.span));
        }
        return false;
      case "BlockStatement":
        return this.checkBlock(statement, scope, context);
      default:
        return false;
    }
  }

  private checkGraphStatement(statement: GraphStatementNode): void {
    for (const chain of statement.chains) {
      if (chain.nodes.length < 2) {
        this.diagnostics.push(diagnosticAt("Graph chains require at least two nodes.", chain.span));
      }
    }
  }

  private checkObserveStatement(statement: ObserveStatementNode, scope: Scope, context: FunctionContext): boolean {
    const observeScope = new Scope(scope);
    for (const track of statement.tracks) {
      observeScope.define({
        name: track,
        type: { kind: "primitive", name: "int" },
        mutable: false,
        binding: "let",
      });
    }
    return this.checkBlock(statement.body, observeScope, context);
  }

  private checkAdaptStatement(statement: AdaptStatementNode, scope: Scope, context: FunctionContext): boolean {
    const adaptScope = new Scope(scope);
    adaptScope.define({
      name: "system",
      type: { kind: "struct", name: "SystemInfo", args: [] },
      mutable: false,
      binding: "let",
    });
    return this.checkBlock(statement.body, adaptScope, context);
  }

  private checkVariableStatement(statement: VariableStatementNode, scope: Scope, context: FunctionContext): void {
    if (scope.lookup(statement.name)?.depth === 0) {
      this.diagnostics.push(diagnosticAt(`Variable '${statement.name}' is already defined in this scope.`, statement.span));
      return;
    }

    if ((statement.binding === "const" || statement.binding === "ghost" || statement.binding === "link") && statement.mutable) {
      this.diagnostics.push(diagnosticAt(`Binding '${statement.binding}' cannot be declared mutable.`, statement.span));
    }

    const declaredType = this.resolveType(statement.type, context.typeParams);
    const actualType = this.checkExpression(statement.initializer, scope, context, declaredType);
    if (!this.isSameType(declaredType, actualType)) {
      this.diagnostics.push(
        diagnosticAt(`Type mismatch for '${statement.name}': expected ${this.formatType(declaredType)}, got ${this.formatType(actualType)}.`, statement.span),
      );
    }

    if (statement.binding === "link" && !this.isLinkInitializer(statement.initializer, scope)) {
      this.diagnostics.push(diagnosticAt("Link bindings must be initialized from `.link()` or another link.", statement.initializer.span));
    }

    if (statement.binding === "ghost" && !this.isGhostInitializer(statement.initializer, scope)) {
      this.diagnostics.push(diagnosticAt("Ghost bindings must be initialized from `.ghost()` or another ghost.", statement.initializer.span));
    }

    scope.define({
      name: statement.name,
      type: declaredType,
      mutable: statement.mutable,
      binding: statement.binding,
    });
  }

  private checkReturnStatement(statement: Extract<StatementNode, { kind: "ReturnStatement" }>, scope: Scope, context: FunctionContext): void {
    if (!statement.value) {
      if (!(context.returnType.kind === "primitive" && this.normalizePrimitive(context.returnType.name) === "void")) {
        this.diagnostics.push(diagnosticAt(`Return statement requires a value of type ${this.formatType(context.returnType)}.`, statement.span));
      }
      return;
    }

    const actualType = this.checkExpression(statement.value, scope, context, context.returnType);
    if (!this.isSameType(actualType, context.returnType)) {
      this.diagnostics.push(
        diagnosticAt(`Return type mismatch: expected ${this.formatType(context.returnType)}, got ${this.formatType(actualType)}.`, statement.span),
      );
    }
  }

  private checkSpawnStatement(statement: Extract<StatementNode, { kind: "SpawnStatement" }>, scope: Scope, context: FunctionContext): void {
    if (scope.lookup(statement.taskName)?.depth === 0) {
      this.diagnostics.push(diagnosticAt(`Task '${statement.taskName}' is already defined in this scope.`, statement.span));
      return;
    }
    scope.define({
      name: statement.taskName,
      type: { kind: "primitive", name: "void" },
      mutable: false,
      binding: "const",
    });

    const spawnContext: FunctionContext = {
      ...context,
      insideSpawn: true,
      allowAwait: false,
      mutateTarget: undefined,
    };
    this.checkBlock(statement.body, scope, spawnContext);
  }

  private checkSyncStatement(statement: Extract<StatementNode, { kind: "SyncStatement" }>, scope: Scope, context: FunctionContext): void {
    const syncContext: FunctionContext = {
      ...context,
      allowAwait: true,
    };
    this.checkBlock(statement.body, scope, syncContext);
  }

  private checkAwaitStatement(statement: Extract<StatementNode, { kind: "AwaitStatement" }>, context: FunctionContext): void {
    if (!context.allowAwait) {
      this.diagnostics.push(diagnosticAt("`await` is only valid inside a `sync` block.", statement.span));
    }
  }

  private checkMutateStatement(statement: Extract<StatementNode, { kind: "MutateStatement" }>, scope: Scope, context: FunctionContext): void {
    const targetInfo = this.resolveMutationTarget(statement.target, scope, context);
    if (!targetInfo) {
      return;
    }
    if (targetInfo.binding !== "core" && targetInfo.binding !== "link") {
      this.diagnostics.push(diagnosticAt("Only core and link bindings may enter a mutate block.", statement.target.span));
    }
    if (targetInfo.binding === "ghost") {
      this.diagnostics.push(diagnosticAt("Ghost bindings are read-only and cannot be mutated.", statement.target.span));
    }
    if (targetInfo.type.kind !== "vec") {
      this.diagnostics.push(diagnosticAt("Mutate blocks currently require a Vec<T> target.", statement.target.span));
    }
    const mutateContext: FunctionContext = {
      ...context,
      mutateTarget: {
        type: targetInfo.type,
        binding: targetInfo.binding,
      },
    };
    this.checkBlock(statement.body, scope, mutateContext);
  }

  private resolveMutationTarget(expression: ExpressionNode, scope: Scope, context: FunctionContext): { type: ProtonType; binding: BindingKind } | undefined {
    if (expression.kind === "Identifier") {
      const variable = this.lookupVariable(expression.name, scope, context, expression.span);
      return variable ? { type: variable.symbol.type, binding: variable.symbol.binding } : undefined;
    }
    const type = this.checkExpression(expression, scope, context);
    return { type, binding: "let" };
  }

  private checkAssignable(expression: Extract<ExpressionNode, { kind: "Identifier" | "FieldAccessExpression" | "UnaryExpression" }>, scope: Scope, context: FunctionContext): ProtonType {
    if (expression.kind === "Identifier") {
      const variable = this.lookupVariable(expression.name, scope, context, expression.span);
      if (!variable) {
        return { kind: "primitive", name: "void" };
      }
      if (!variable.symbol.mutable) {
        this.diagnostics.push(diagnosticAt(`Cannot assign to immutable variable '${expression.name}'.`, expression.span));
      }
      return variable.symbol.type;
    }

    if (expression.kind === "FieldAccessExpression") {
      const objectType = this.checkExpression(expression.object, scope, context);
      if (objectType.kind !== "struct") {
        this.diagnostics.push(diagnosticAt("Field assignment requires a struct value.", expression.span));
        return { kind: "primitive", name: "void" };
      }
      const fieldType = this.getStructFieldType(objectType, expression.field);
      if (!fieldType) {
        this.diagnostics.push(diagnosticAt(`Struct '${objectType.name}' has no field '${expression.field}'.`, expression.span));
        return { kind: "primitive", name: "void" };
      }
      return fieldType;
    }

    const operandType = this.checkExpression(expression.operand, scope, context);
    if (operandType.kind !== "pointer" && operandType.kind !== "reference") {
      this.diagnostics.push(diagnosticAt("Only pointers and references can be dereferenced.", expression.span));
      return { kind: "primitive", name: "void" };
    }
    return operandType.to;
  }

  private checkExpression(expression: ExpressionNode, scope: Scope, context: FunctionContext, expectedType?: ProtonType): ProtonType {
    switch (expression.kind) {
      case "IntegerLiteral":
        return { kind: "primitive", name: "i32" };
      case "FloatLiteral":
        return { kind: "primitive", name: "f64" };
      case "DurationLiteral":
        return { kind: "primitive", name: "int" };
      case "StringLiteral":
        return { kind: "primitive", name: "str" };
      case "BooleanLiteral":
        return { kind: "primitive", name: "bool" };
      case "Identifier": {
        const variable = this.lookupVariable(expression.name, scope, context, expression.span, true);
        if (variable) {
          return variable.symbol.type;
        }
        if (this.plugins.has(expression.name)) {
          return { kind: "plugin", name: expression.name };
        }
        if (expression.name === "runtime") {
          return { kind: "struct", name: "RuntimeInfo", args: [] };
        }
        if (expression.name === "system") {
          return { kind: "struct", name: "SystemInfo", args: [] };
        }
        const imported = this.imports.get(expression.name);
        if (imported?.kind === "const") {
          return this.constsByCanonicalName.get(imported.canonicalName)?.type ?? { kind: "primitive", name: "void" };
        }
        const constant = this.consts.get(expression.name);
        if (constant) {
          return constant.type;
        }
        if (this.variants.has(expression.name) && expectedType?.kind === "adt") {
          return expectedType;
        }
        this.diagnostics.push(diagnosticAt(`Unknown variable '${expression.name}'.`, expression.span));
        return { kind: "primitive", name: "void" };
      }
      case "PathExpression": {
        if (expression.segments.length === 2 && this.algebraicTypes.has(expression.segments[0]!) && this.variants.has(expression.segments[1]!)) {
          return { kind: "adt", name: expression.segments[0]!, args: expectedType?.kind === "adt" && expectedType.name === expression.segments[0]! ? expectedType.args : [] };
        }
        const functionSymbol = this.functionsByCanonicalName.get(expression.segments.join("::"));
        if (functionSymbol) {
          return functionSymbol.returnType;
        }
        const constant = this.constsByCanonicalName.get(expression.segments.join("::"));
        if (constant) {
          return constant.type;
        }
        this.diagnostics.push(diagnosticAt(`Unknown path '${expression.segments.join("::")}'.`, expression.span));
        return { kind: "primitive", name: "void" };
      }
      case "GroupExpression":
        return this.checkExpression(expression.expression, scope, context, expectedType);
      case "UnaryExpression":
        return this.checkUnaryExpression(expression, scope, context, expectedType);
      case "BinaryExpression":
        return this.checkBinaryExpression(expression, scope, context);
      case "CallExpression":
        return this.checkCallExpression(expression, scope, context, expectedType);
      case "FieldAccessExpression":
        return this.checkFieldAccess(expression, scope, context);
      case "StructLiteral":
        return this.checkStructLiteral(expression, scope, context, expectedType);
      case "ArrayLiteral":
        return this.checkArrayLiteral(expression, scope, context, expectedType);
      case "MatchExpression":
        return this.checkMatchExpression(expression, scope, context, expectedType);
      default:
        return { kind: "primitive", name: "void" };
    }
  }

  private checkUnaryExpression(
    expression: Extract<ExpressionNode, { kind: "UnaryExpression" }>,
    scope: Scope,
    context: FunctionContext,
    expectedType?: ProtonType,
  ): ProtonType {
    if (context.modes.has("secure") && (expression.operator === "&" || expression.operator === "*")) {
      this.diagnostics.push(diagnosticAt("Secure functions cannot use raw pointer operators.", expression.span));
    }

    if (expression.operator === "&") {
      const operandType = this.checkExpression(expression.operand, scope, context);
      if (expectedType && (expectedType.kind === "pointer" || expectedType.kind === "reference")) {
        return expectedType;
      }
      return { kind: "pointer", to: operandType };
    }

    if (expression.operator === "*") {
      const operandType = this.checkExpression(expression.operand, scope, context);
      if (operandType.kind !== "pointer" && operandType.kind !== "reference") {
        this.diagnostics.push(diagnosticAt("Only pointers and references can be dereferenced.", expression.span));
        return { kind: "primitive", name: "void" };
      }
      return operandType.to;
    }

    if (expression.operator === "!") {
      const operandType = this.checkExpression(expression.operand, scope, context);
      if (!this.isSameType(operandType, { kind: "primitive", name: "bool" })) {
        this.diagnostics.push(diagnosticAt("Logical negation requires a bool operand.", expression.span));
      }
      return { kind: "primitive", name: "bool" };
    }

    const operandType = this.checkExpression(expression.operand, scope, context);
    if (!this.isNumeric(operandType)) {
      this.diagnostics.push(diagnosticAt("Unary minus requires a numeric operand.", expression.span));
      return { kind: "primitive", name: "void" };
    }
    return operandType;
  }

  private checkBinaryExpression(expression: Extract<ExpressionNode, { kind: "BinaryExpression" }>, scope: Scope, context: FunctionContext): ProtonType {
    const leftType = this.checkExpression(expression.left, scope, context);
    const rightType = this.checkExpression(expression.right, scope, context);

    if (["+", "-", "*", "/"].includes(expression.operator)) {
      if (!this.isNumeric(leftType) || !this.isNumeric(rightType)) {
        this.diagnostics.push(diagnosticAt(`Operator '${expression.operator}' requires numeric operands.`, expression.span));
        return { kind: "primitive", name: "void" };
      }
      if (!this.isSameType(leftType, rightType)) {
        this.diagnostics.push(
          diagnosticAt(
            `Operator '${expression.operator}' requires matching operand types, got ${this.formatType(leftType)} and ${this.formatType(rightType)}.`,
            expression.span,
          ),
        );
      }
      return leftType;
    }

    if (!this.isSameType(leftType, rightType)) {
      this.diagnostics.push(
        diagnosticAt(
          `Comparison requires matching operand types, got ${this.formatType(leftType)} and ${this.formatType(rightType)}.`,
          expression.span,
        ),
      );
    }
    return { kind: "primitive", name: "bool" };
  }

  private checkCallExpression(expression: CallExpressionNode, scope: Scope, context: FunctionContext, expectedType?: ProtonType): ProtonType {
    if (expression.callee.kind === "Identifier" && expression.callee.name === "push") {
      return this.checkPushCall(expression, scope, context);
    }

    if (expression.callee.kind === "FieldAccessExpression" && (expression.callee.field === "link" || expression.callee.field === "ghost")) {
      if (expression.args.length !== 0) {
        this.diagnostics.push(diagnosticAt(`Method '${expression.callee.field}' does not accept arguments.`, expression.span));
      }
      return this.checkExpression(expression.callee.object, scope, context);
    }

    const pluginCall = this.resolvePluginCall(expression);
    if (pluginCall) {
      return this.checkPluginCall(pluginCall.plugin, pluginCall.method, expression, scope, context);
    }

    const variantCall = this.resolveVariantCall(expression, expectedType);
    if (variantCall) {
      return this.checkVariantCall(variantCall.owner, variantCall.variant, expression, scope, context, expectedType);
    }

    const signature = this.resolveCallable(expression.callee);
    if (!signature) {
      this.diagnostics.push(diagnosticAt("Expression is not callable.", expression.span));
      return { kind: "primitive", name: "void" };
    }

    if (signature.builtin === "print" || signature.builtin === "warn" || signature.builtin === "log") {
      if (expression.args.length !== 1) {
        this.diagnostics.push(diagnosticAt(`\`${signature.name}\` expects exactly one argument.`, expression.span));
      } else {
        const argType = this.checkExpression(expression.args[0]!, scope, context);
        if (argType.kind === "primitive" && this.normalizePrimitive(argType.name) === "void") {
          this.diagnostics.push(diagnosticAt(`\`${signature.name}\` cannot print a void value.`, expression.args[0]!.span));
        }
      }
      return signature.returnType;
    }

    if (signature.builtin === "sanitize" || signature.builtin === "panic" || signature.builtin === "plugin_loaded") {
      if (expression.args.length !== signature.params.length) {
        this.diagnostics.push(diagnosticAt(`\`${signature.name}\` expects exactly ${signature.params.length} argument(s).`, expression.span));
      }
    }

    if (signature.builtin === "json") {
      if (expression.args.length !== 1) {
        this.diagnostics.push(diagnosticAt("`json` expects exactly one argument.", expression.span));
      } else {
        const argType = this.checkExpression(expression.args[0]!, scope, context);
        if (!this.isSerializable(argType)) {
          this.diagnostics.push(diagnosticAt("`json` requires a serializable value.", expression.args[0]!.span));
        }
      }
      return signature.returnType;
    }

    if (signature.builtin === "type_of") {
      if (expression.args.length !== 1) {
        this.diagnostics.push(diagnosticAt("`type_of` expects exactly one argument.", expression.span));
      } else {
        this.checkExpression(expression.args[0]!, scope, context);
      }
      return signature.returnType;
    }

    if (signature.builtin === "http_get" || signature.builtin === "http_post" || signature.builtin === "socket_connect") {
      if (!this.permissions.has("net")) {
        this.diagnostics.push(diagnosticAt("Networking APIs require `requires net;` at module scope.", expression.span));
      }
    }

    const inferred = new Map<string, ProtonType>();
    if (expression.args.length !== signature.params.length) {
      this.diagnostics.push(
        diagnosticAt(`Function '${signature.name}' expects ${signature.params.length} arguments, got ${expression.args.length}.`, expression.span),
      );
    }

    const limit = Math.min(expression.args.length, signature.params.length);
    for (let index = 0; index < limit; index += 1) {
      const actual = this.checkExpression(expression.args[index]!, scope, context, signature.params[index]!);
      this.inferTypeArguments(signature.params[index]!, actual, inferred);
      const expectedArgType = this.applySubstitution(signature.params[index]!, inferred);
      if (!this.isSameType(actual, expectedArgType)) {
        this.diagnostics.push(
          diagnosticAt(`Argument ${index + 1} for '${signature.name}' must be ${this.formatType(expectedArgType)}, got ${this.formatType(actual)}.`, expression.args[index]!.span),
        );
      }
    }

    for (const typeParam of signature.typeParams) {
      const actual = inferred.get(typeParam.name);
      if (!actual) {
        continue;
      }
      for (const constraint of typeParam.constraints) {
        if (!this.satisfiesConstraint(actual, constraint)) {
          this.diagnostics.push(
            diagnosticAt(`Type '${this.formatType(actual)}' does not satisfy constraint '${constraint}' for '${typeParam.name}'.`, expression.span),
          );
        }
      }
    }

    const returnType = this.applySubstitution(signature.returnType, inferred);
    if (expectedType && returnType.kind === "typeParam") {
      return expectedType;
    }
    return returnType;
  }

  private resolvePluginCall(expression: CallExpressionNode): { plugin: PluginSymbol; method: PluginMethodSymbol } | undefined {
    if (expression.callee.kind !== "FieldAccessExpression" || expression.callee.object.kind !== "Identifier") {
      return undefined;
    }
    const plugin = this.plugins.get(expression.callee.object.name);
    if (!plugin) {
      return undefined;
    }
    const method = plugin.methods.get(expression.callee.field);
    if (!method) {
      return undefined;
    }
    return { plugin, method };
  }

  private checkPluginCall(plugin: PluginSymbol, method: PluginMethodSymbol, expression: CallExpressionNode, scope: Scope, context: FunctionContext): ProtonType {
    if (expression.args.length !== method.params.length) {
      this.diagnostics.push(diagnosticAt(`Plugin method '${plugin.name}.${method.name}' expects ${method.params.length} arguments.`, expression.span));
    }
    const limit = Math.min(expression.args.length, method.params.length);
    for (let index = 0; index < limit; index += 1) {
      const actual = this.checkExpression(expression.args[index]!, scope, context, method.params[index]!);
      if (!this.isSameType(actual, method.params[index]!)) {
        this.diagnostics.push(
          diagnosticAt(`Argument ${index + 1} for '${plugin.name}.${method.name}' must be ${this.formatType(method.params[index]!)}, got ${this.formatType(actual)}.`, expression.args[index]!.span),
        );
      }
    }
    return method.returnType;
  }

  private resolveVariantCall(expression: CallExpressionNode, expectedType?: ProtonType): { owner: AlgebraicTypeSymbol; variant: AlgebraicVariantSymbol } | undefined {
    let variantName: string | undefined;
    let ownerName: string | undefined;

    if (expression.callee.kind === "Identifier") {
      variantName = expression.callee.name;
      ownerName = expectedType?.kind === "adt" ? expectedType.name : undefined;
    } else if (expression.callee.kind === "PathExpression" && expression.callee.segments.length === 2) {
      ownerName = expression.callee.segments[0]!;
      variantName = expression.callee.segments[1]!;
    }

    if (!variantName) {
      return undefined;
    }

    const variantLookup = this.variants.get(variantName);
    const resolvedOwner = ownerName ?? variantLookup?.owner;
    if (!resolvedOwner) {
      return undefined;
    }
    const owner = this.algebraicTypes.get(resolvedOwner);
    const variant = owner?.variants.get(variantName);
    return owner && variant ? { owner, variant } : undefined;
  }

  private checkVariantCall(
    owner: AlgebraicTypeSymbol,
    variant: AlgebraicVariantSymbol,
    expression: CallExpressionNode,
    scope: Scope,
    context: FunctionContext,
    expectedType?: ProtonType,
  ): ProtonType {
    const adtType = expectedType?.kind === "adt" && expectedType.name === owner.name
      ? expectedType
      : { kind: "adt", name: owner.name, args: owner.typeParams.map((param) => ({ kind: "typeParam", name: param.name })) };
    const mapping = this.buildNominalTypeMap(owner.typeParams, adtType.args);
    if (variant.payloadType) {
      if (expression.args.length !== 1) {
        this.diagnostics.push(diagnosticAt(`Variant '${variant.name}' expects a payload.`, expression.span));
      } else {
        const payloadType = this.applySubstitution(variant.payloadType, mapping);
        const actual = this.checkExpression(expression.args[0]!, scope, context, payloadType);
        this.inferTypeArguments(payloadType, actual, mapping);
        if (!this.isSameType(actual, this.applySubstitution(payloadType, mapping))) {
          this.diagnostics.push(
            diagnosticAt(`Variant '${variant.name}' payload must be ${this.formatType(this.applySubstitution(payloadType, mapping))}, got ${this.formatType(actual)}.`, expression.args[0]!.span),
          );
        }
      }
    } else if (expression.args.length !== 0) {
      this.diagnostics.push(diagnosticAt(`Variant '${variant.name}' does not accept a payload.`, expression.span));
    }
    return {
      kind: "adt",
      name: owner.name,
      args: owner.typeParams.map((param) => mapping.get(param.name) ?? { kind: "typeParam", name: param.name }),
    };
  }

  private checkPushCall(expression: CallExpressionNode, scope: Scope, context: FunctionContext): ProtonType {
    if (!context.mutateTarget || context.mutateTarget.type.kind !== "vec") {
      this.diagnostics.push(diagnosticAt("`push` may only be used inside mutate(Vec<T>) blocks.", expression.span));
      return { kind: "primitive", name: "void" };
    }
    if (context.mutateTarget.binding === "ghost") {
      this.diagnostics.push(diagnosticAt("Ghost bindings cannot be mutated.", expression.span));
    }
    if (expression.args.length !== 1) {
      this.diagnostics.push(diagnosticAt("`push` expects exactly one argument.", expression.span));
      return { kind: "primitive", name: "void" };
    }
    const actual = this.checkExpression(expression.args[0]!, scope, context, context.mutateTarget.type.element);
    if (!this.isSameType(actual, context.mutateTarget.type.element)) {
      this.diagnostics.push(diagnosticAt(`push expects ${this.formatType(context.mutateTarget.type.element)}, got ${this.formatType(actual)}.`, expression.args[0]!.span));
    }
    return { kind: "primitive", name: "void" };
  }

  private checkFieldAccess(expression: FieldAccessExpressionNode, scope: Scope, context: FunctionContext): ProtonType {
    const objectType = this.checkExpression(expression.object, scope, context);
    if (objectType.kind === "plugin") {
      const plugin = this.plugins.get(objectType.name);
      const method = plugin?.methods.get(expression.field);
      if (!method) {
        this.diagnostics.push(diagnosticAt(`Plugin '${objectType.name}' has no method '${expression.field}'.`, expression.span));
        return { kind: "primitive", name: "void" };
      }
      return method.returnType;
    }
    if (objectType.kind !== "struct") {
      this.diagnostics.push(diagnosticAt("Field access requires a struct value.", expression.span));
      return { kind: "primitive", name: "void" };
    }
    const fieldType = this.getStructFieldType(objectType, expression.field);
    if (!fieldType) {
      this.diagnostics.push(diagnosticAt(`Struct '${objectType.name}' has no field '${expression.field}'.`, expression.span));
      return { kind: "primitive", name: "void" };
    }
    return fieldType;
  }

  private checkStructLiteral(
    expression: Extract<ExpressionNode, { kind: "StructLiteral" }>,
    scope: Scope,
    context: FunctionContext,
    expectedType?: ProtonType,
  ): ProtonType {
    const structSymbol = this.structs.get(expression.name);
    if (!structSymbol) {
      this.diagnostics.push(diagnosticAt(`Unknown struct '${expression.name}'.`, expression.span));
      return { kind: "primitive", name: "void" };
    }
    const inferred = expectedType?.kind === "struct" && expectedType.name === expression.name
      ? this.buildNominalTypeMap(structSymbol.typeParams, expectedType.args)
      : new Map<string, ProtonType>();
    const seen = new Set<string>();
    for (const field of expression.fields) {
      const expectedFieldType = structSymbol.fields.get(field.name);
      if (!expectedFieldType) {
        this.diagnostics.push(diagnosticAt(`Struct '${expression.name}' has no field '${field.name}'.`, field.span));
        continue;
      }
      seen.add(field.name);
      const concreteFieldType = this.applySubstitution(expectedFieldType, inferred);
      const actual = this.checkExpression(field.value, scope, context, concreteFieldType);
      this.inferTypeArguments(expectedFieldType, actual, inferred);
      if (!this.isSameType(this.applySubstitution(expectedFieldType, inferred), actual)) {
        this.diagnostics.push(
          diagnosticAt(`Field '${field.name}' expects ${this.formatType(this.applySubstitution(expectedFieldType, inferred))}, got ${this.formatType(actual)}.`, field.span),
        );
      }
    }
    for (const fieldName of structSymbol.fields.keys()) {
      if (!seen.has(fieldName)) {
        this.diagnostics.push(diagnosticAt(`Missing field '${fieldName}' in struct literal '${expression.name}'.`, expression.span));
      }
    }
    return {
      kind: "struct",
      name: expression.name,
      args: structSymbol.typeParams.map((param) => inferred.get(param.name) ?? { kind: "typeParam", name: param.name }),
    };
  }

  private checkArrayLiteral(
    expression: Extract<ExpressionNode, { kind: "ArrayLiteral" }>,
    scope: Scope,
    context: FunctionContext,
    expectedType?: ProtonType,
  ): ProtonType {
    let elementType: ProtonType | undefined = expectedType?.kind === "vec" ? expectedType.element : undefined;
    for (const element of expression.elements) {
      const actual = this.checkExpression(element, scope, context, elementType);
      if (!elementType) {
        elementType = actual;
      } else if (!this.isSameType(elementType, actual)) {
        this.diagnostics.push(diagnosticAt(`Array literal elements must all be ${this.formatType(elementType)}, got ${this.formatType(actual)}.`, element.span));
      }
    }
    return { kind: "vec", element: elementType ?? { kind: "primitive", name: "void" } };
  }

  private checkMatchExpression(expression: MatchExpressionNode, scope: Scope, context: FunctionContext, expectedType?: ProtonType): ProtonType {
    const matchedType = this.checkExpression(expression.value, scope, context);
    let resultType: ProtonType | undefined = expectedType;
    const seenVariants = new Set<string>();
    let hasWildcard = false;

    for (const arm of expression.arms) {
      const armScope = new Scope(scope);
      this.checkPattern(arm, matchedType, armScope, context, seenVariants);
      if (arm.pattern.kind === "WildcardPattern" || arm.pattern.kind === "IdentifierPattern") {
        hasWildcard = true;
      }
      const actualType = this.checkExpression(arm.expression, armScope, context, resultType);
      if (!resultType) {
        resultType = actualType;
      } else if (!this.isSameType(resultType, actualType)) {
        this.diagnostics.push(diagnosticAt(`Match arms must all evaluate to ${this.formatType(resultType)}, got ${this.formatType(actualType)}.`, arm.span));
      }
    }

    if (matchedType.kind === "adt" && !hasWildcard) {
      const type = this.algebraicTypes.get(matchedType.name);
      if (type) {
        for (const variant of type.variants.keys()) {
          if (!seenVariants.has(variant)) {
            this.diagnostics.push(diagnosticAt(`Match expression is not exhaustive. Missing '${variant}'.`, expression.span));
          }
        }
      }
    }

    return resultType ?? { kind: "primitive", name: "void" };
  }

  private checkPattern(
    arm: MatchArmNode,
    matchedType: ProtonType,
    scope: Scope,
    context: FunctionContext,
    seenVariants: Set<string>,
  ): void {
    const pattern = arm.pattern;
    switch (pattern.kind) {
      case "WildcardPattern":
        return;
      case "IdentifierPattern":
        scope.define({
          name: pattern.name,
          type: matchedType,
          mutable: false,
          binding: "let",
        });
        return;
      case "BooleanPattern":
        if (!this.isSameType(matchedType, { kind: "primitive", name: "bool" })) {
          this.diagnostics.push(diagnosticAt("Boolean patterns require a bool match value.", pattern.span));
        }
        return;
      case "IntegerPattern":
        if (!this.isNumeric(matchedType)) {
          this.diagnostics.push(diagnosticAt("Integer patterns require a numeric match value.", pattern.span));
        }
        return;
      case "StringPattern":
        if (!this.isSameType(matchedType, { kind: "primitive", name: "str" })) {
          this.diagnostics.push(diagnosticAt("String patterns require a str match value.", pattern.span));
        }
        return;
      case "VariantPattern": {
        if (matchedType.kind !== "adt") {
          this.diagnostics.push(diagnosticAt(`Variant pattern '${pattern.variant}' requires an algebraic type value.`, pattern.span));
          return;
        }
        const type = this.algebraicTypes.get(matchedType.name);
        const variant = type?.variants.get(pattern.variant);
        if (!variant) {
          this.diagnostics.push(diagnosticAt(`Type '${matchedType.name}' has no variant '${pattern.variant}'.`, pattern.span));
          return;
        }
        seenVariants.add(pattern.variant);
        if (pattern.binding) {
          if (!variant.payloadType) {
            this.diagnostics.push(diagnosticAt(`Variant '${pattern.variant}' does not carry a payload.`, pattern.span));
            return;
          }
          const mapping = this.buildNominalTypeMap(type?.typeParams ?? [], matchedType.args);
          scope.define({
            name: pattern.binding,
            type: this.applySubstitution(variant.payloadType, mapping),
            mutable: false,
            binding: "let",
          });
        } else if (variant.payloadType) {
          this.diagnostics.push(diagnosticAt(`Variant '${pattern.variant}' requires a payload binding.`, pattern.span));
        }
        return;
      }
      default:
        return;
    }
  }

  private lookupVariable(name: string, scope: Scope, context: FunctionContext, span: StatementNode["span"], suppressErrors = false): { symbol: VariableSymbol; depth: number } | undefined {
    const value = scope.lookup(name);
    if (!value) {
      if (!suppressErrors) {
        this.diagnostics.push(diagnosticAt(`Unknown variable '${name}'.`, span));
      }
      return undefined;
    }

    if (context.insideSpawn && value.depth > 0 && value.symbol.binding !== "ghost" && value.symbol.binding !== "const") {
      this.diagnostics.push(diagnosticAt(`Spawned tasks may only capture ghost or const bindings. '${name}' is ${value.symbol.binding}.`, span));
    }
    return value;
  }

  private resolveCallable(expression: ExpressionNode): FunctionSymbol | undefined {
    if (expression.kind === "Identifier") {
      const imported = this.imports.get(expression.name);
      if (imported?.kind === "function") {
        return this.functionsByCanonicalName.get(imported.canonicalName);
      }
      return this.functions.get(expression.name);
    }
    if (expression.kind === "PathExpression") {
      return this.functionsByCanonicalName.get(expression.segments.join("::"));
    }
    return undefined;
  }

  private validateConstExpression(expression: ExpressionNode): void {
    switch (expression.kind) {
      case "IntegerLiteral":
      case "FloatLiteral":
      case "StringLiteral":
      case "BooleanLiteral":
      case "ArrayLiteral":
        for (const element of expression.kind === "ArrayLiteral" ? expression.elements : []) {
          this.validateConstExpression(element);
        }
        return;
      case "Identifier":
        if (!this.consts.has(expression.name)) {
          this.diagnostics.push(
            diagnosticAt(`Compile-time constants may only reference other constants. '${expression.name}' is not constant.`, expression.span),
          );
        }
        return;
      case "UnaryExpression":
        this.validateConstExpression(expression.operand);
        return;
      case "BinaryExpression":
        this.validateConstExpression(expression.left);
        this.validateConstExpression(expression.right);
        return;
      case "GroupExpression":
        this.validateConstExpression(expression.expression);
        return;
      case "MatchExpression":
        this.validateConstExpression(expression.value);
        for (const arm of expression.arms) {
          this.validateConstExpression(arm.expression);
        }
        return;
      case "CallExpression": {
        const callable = this.resolveCallable(expression.callee);
        if (!callable?.meta) {
          this.diagnostics.push(diagnosticAt("Compile-time constants may only call meta functions.", expression.span));
        }
        for (const arg of expression.args) {
          this.validateConstExpression(arg);
        }
        return;
      }
      default:
        this.diagnostics.push(diagnosticAt("This expression is not allowed in a compile-time constant.", expression.span));
    }
  }

  private isLinkInitializer(expression: ExpressionNode, scope: Scope): boolean {
    if (expression.kind === "CallExpression" && expression.callee.kind === "FieldAccessExpression" && expression.callee.field === "link") {
      return true;
    }
    if (expression.kind === "Identifier") {
      const variable = scope.lookup(expression.name);
      return variable?.symbol.binding === "link";
    }
    return false;
  }

  private isGhostInitializer(expression: ExpressionNode, scope: Scope): boolean {
    if (expression.kind === "CallExpression" && expression.callee.kind === "FieldAccessExpression" && expression.callee.field === "ghost") {
      return true;
    }
    if (expression.kind === "Identifier") {
      const variable = scope.lookup(expression.name);
      return variable?.symbol.binding === "ghost";
    }
    return false;
  }

  private checkEntryPoint(program: ProgramNode): void {
    const entryPoint = this.functions.get("main");
    if (!entryPoint) {
      this.diagnostics.push(diagnosticAt("Program must declare `fn main() -> int`.", program.span));
      return;
    }
    if (!this.isSameType(entryPoint.returnType, { kind: "primitive", name: "int" })) {
      this.diagnostics.push(diagnosticAt("`main` must return `int`.", program.span));
    }
  }

  private resolveType(typeNode: TypeNode, typeParams: Map<string, TypeParameterSymbol> = new Map()): ProtonType {
    if (typeNode.kind === "PrimitiveType") {
      return { kind: "primitive", name: typeNode.name };
    }
    if (typeNode.kind === "NamedType") {
      if (typeParams.has(typeNode.name)) {
        return { kind: "typeParam", name: typeNode.name };
      }
      if (this.algebraicTypes.has(typeNode.name)) {
        return { kind: "adt", name: typeNode.name, args: [] };
      }
      return { kind: "struct", name: typeNode.name, args: [] };
    }
    if (typeNode.kind === "PointerType") {
      return { kind: "pointer", to: this.resolveType(typeNode.to, typeParams) };
    }
    if (typeNode.kind === "ReferenceType") {
      return { kind: "reference", to: this.resolveType(typeNode.to, typeParams) };
    }
    return this.resolveGenericType(typeNode, typeParams);
  }

  private resolveGenericType(typeNode: GenericTypeNode, typeParams: Map<string, TypeParameterSymbol>): ProtonType {
    if (typeNode.name === "Vec" && typeNode.args.length === 1) {
      return { kind: "vec", element: this.resolveType(typeNode.args[0]!, typeParams) };
    }
    if (this.algebraicTypes.has(typeNode.name)) {
      return {
        kind: "adt",
        name: typeNode.name,
        args: typeNode.args.map((arg) => this.resolveType(arg, typeParams)),
      };
    }
    return {
      kind: "struct",
      name: typeNode.name,
      args: typeNode.args.map((arg) => this.resolveType(arg, typeParams)),
    };
  }

  private getStructFieldType(structType: Extract<ProtonType, { kind: "struct" }>, fieldName: string): ProtonType | undefined {
    const struct = this.structs.get(structType.name);
    if (!struct) {
      return undefined;
    }
    const rawFieldType = struct.fields.get(fieldName);
    if (!rawFieldType) {
      return undefined;
    }
    return this.applySubstitution(rawFieldType, this.buildNominalTypeMap(struct.typeParams, structType.args));
  }

  private inferTypeArguments(expected: ProtonType, actual: ProtonType, mapping: Map<string, ProtonType>): void {
    if (expected.kind === "typeParam") {
      const existing = mapping.get(expected.name);
      if (!existing) {
        mapping.set(expected.name, actual);
      }
      return;
    }
    if (expected.kind === "vec" && actual.kind === "vec") {
      this.inferTypeArguments(expected.element, actual.element, mapping);
      return;
    }
    if ((expected.kind === "pointer" || expected.kind === "reference") && expected.kind === actual.kind) {
      this.inferTypeArguments(expected.to, actual.to, mapping);
      return;
    }
    if ((expected.kind === "struct" || expected.kind === "adt") && expected.kind === actual.kind && expected.name === actual.name) {
      for (let index = 0; index < Math.min(expected.args.length, actual.args.length); index += 1) {
        this.inferTypeArguments(expected.args[index]!, actual.args[index]!, mapping);
      }
    }
  }

  private applySubstitution(type: ProtonType, mapping: Map<string, ProtonType>): ProtonType {
    if (type.kind === "typeParam") {
      return mapping.get(type.name) ?? type;
    }
    if (type.kind === "vec") {
      return { kind: "vec", element: this.applySubstitution(type.element, mapping) };
    }
    if (type.kind === "pointer") {
      return { kind: "pointer", to: this.applySubstitution(type.to, mapping) };
    }
    if (type.kind === "reference") {
      return { kind: "reference", to: this.applySubstitution(type.to, mapping) };
    }
    if (type.kind === "struct" || type.kind === "adt") {
      return {
        kind: type.kind,
        name: type.name,
        args: type.args.map((arg) => this.applySubstitution(arg, mapping)),
      };
    }
    return type;
  }

  private buildNominalTypeMap(typeParams: TypeParameterSymbol[], args: ProtonType[]): Map<string, ProtonType> {
    const mapping = new Map<string, ProtonType>();
    for (let index = 0; index < typeParams.length; index += 1) {
      const actual = args[index];
      if (actual) {
        mapping.set(typeParams[index]!.name, actual);
      }
    }
    return mapping;
  }

  private satisfiesConstraint(type: ProtonType, constraint: string): boolean {
    if (constraint === "Numeric") {
      return this.isNumeric(type);
    }
    if (constraint === "Serializable") {
      return this.isSerializable(type);
    }
    if (type.kind === "struct") {
      return this.contractImpls.get(constraint)?.has(type.name) ?? false;
    }
    return false;
  }

  private isSerializable(type: ProtonType): boolean {
    switch (type.kind) {
      case "primitive":
        return this.normalizePrimitive(type.name) !== "void";
      case "vec":
        return this.isSerializable(type.element);
      case "struct":
      case "adt":
        return true;
      default:
        return false;
    }
  }

  private isSameType(left: ProtonType, right: ProtonType): boolean {
    if (left.kind !== right.kind) {
      return false;
    }
    if (left.kind === "primitive" && right.kind === "primitive") {
      return this.normalizePrimitive(left.name) === this.normalizePrimitive(right.name);
    }
    if ((left.kind === "struct" || left.kind === "adt") && left.kind === right.kind) {
      return left.name === right.name && left.args.length === right.args.length && left.args.every((arg, index) => this.isSameType(arg, right.args[index]!));
    }
    if (left.kind === "vec" && right.kind === "vec") {
      return this.isSameType(left.element, right.element);
    }
    if ((left.kind === "pointer" || left.kind === "reference") && left.kind === right.kind) {
      return this.isSameType(left.to, right.to);
    }
    if (left.kind === "plugin" && right.kind === "plugin") {
      return left.name === right.name;
    }
    if (left.kind === "typeParam" && right.kind === "typeParam") {
      return left.name === right.name;
    }
    return false;
  }

  private normalizePrimitive(name: "int" | "i32" | "i64" | "f32" | "f64" | "bool" | "str" | "void"): string {
    return name === "int" ? "i32" : name;
  }

  private isNumeric(type: ProtonType): boolean {
    return type.kind === "primitive" && ["int", "i32", "i64", "f32", "f64"].includes(type.name);
  }

  private formatType(type: ProtonType): string {
    if (type.kind === "primitive") {
      return type.name;
    }
    if (type.kind === "vec") {
      return `Vec<${this.formatType(type.element)}>`;
    }
    if (type.kind === "pointer") {
      return `*${this.formatType(type.to)}`;
    }
    if (type.kind === "reference") {
      return `&${this.formatType(type.to)}`;
    }
    if (type.kind === "plugin") {
      return `plugin<${type.name}>`;
    }
    if (type.kind === "typeParam") {
      return type.name;
    }
    if (type.args.length === 0) {
      return type.name;
    }
    return `${type.name}<${type.args.map((arg) => this.formatType(arg)).join(", ")}>`;
  }

  private canonicalizeLocal(name: string): string {
    return `${this.moduleKey}::${name}`;
  }

  private typeParametersFromNodes(nodes: TypeParameterNode[]): TypeParameterSymbol[] {
    return nodes.map((node) => ({ name: node.name, constraints: [...node.constraints] }));
  }

  private typeParameterMap(typeParams: TypeParameterSymbol[]): Map<string, TypeParameterSymbol> {
    return new Map(typeParams.map((param) => [param.name, param]));
  }

  private buildSummary(program: ProgramNode): ProgramSummary {
    return {
      modulePath: program.modulePath,
      permissions: [...this.permissions],
      plugins: [...this.plugins.values()].map((plugin) => ({
        name: plugin.name,
        methods: [...plugin.methods.values()].map((method) => ({
          name: method.name,
          returnType: this.formatType(method.returnType),
          params: method.params.map((param) => this.formatType(param)),
        })),
      })),
      functions: [...this.functionsByCanonicalName.values()]
        .filter((symbol) => !symbol.builtin)
        .map((symbol) => ({
          name: symbol.name,
          canonicalName: symbol.canonicalName,
          returnType: this.formatType(symbol.returnType),
          params: symbol.params.map((param) => this.formatType(param)),
          typeParams: symbol.typeParams.map((param) =>
            param.constraints.length > 0 ? `${param.name}: ${param.constraints.join(" + ")}` : param.name
          ),
          modes: symbol.modes,
          meta: symbol.meta,
          exposed: symbol.exposed,
          inline: symbol.inline,
          gpu: symbol.gpu,
          adaptive: symbol.adaptive,
        })),
      timelines: this.timelineSummaries,
      goals: this.goalSummaries,
      injections: this.injectionSummaries,
      structs: [...this.structs.values()]
        .filter((symbol) => !symbol.builtin)
        .map((symbol) => ({
          name: symbol.name,
          exposed: symbol.exposed,
          typeParams: symbol.typeParams.map((param) => param.name),
          fields: [...symbol.fields.entries()].map(([name, type]) => ({
            name,
            type: this.formatType(type),
          })),
        })),
      algebraicTypes: [...this.algebraicTypes.values()].map((symbol) => ({
        name: symbol.name,
        exposed: symbol.exposed,
        typeParams: symbol.typeParams.map((param) =>
          param.constraints.length > 0 ? `${param.name}: ${param.constraints.join(" + ")}` : param.name
        ),
        variants: [...symbol.variants.values()].map((variant) => ({
          name: variant.name,
          payloadType: variant.payloadType ? this.formatType(variant.payloadType) : undefined,
        })),
      })),
      contracts: [...this.contracts.values()].map((contract) => ({
        name: contract.name,
        performance: contract.performance,
        methods: [...contract.methods.values()].map((method) => ({
          name: method.name,
          returnType: this.formatType(method.returnType),
          params: method.params.map((param) => this.formatType(param)),
          typeParams: method.typeParams.map((param) =>
            param.constraints.length > 0 ? `${param.name}: ${param.constraints.join(" + ")}` : param.name
          ),
        })),
      })),
      consts: [...this.constsByCanonicalName.values()].map((constant) => ({
        name: constant.name,
        canonicalName: constant.canonicalName,
        type: this.formatType(constant.type),
        exposed: constant.exposed,
      })),
      imports: [...this.imports.values()].map((imported) => ({
        alias: imported.alias,
        canonicalName: imported.canonicalName,
        kind: imported.kind,
      })),
    };
  }

  private describeExpression(expression: ExpressionNode): string {
    switch (expression.kind) {
      case "Identifier":
        return expression.name;
      case "PathExpression":
        return expression.segments.join("::");
      case "CallExpression":
        return `${this.describeExpression(expression.callee)}(...)`;
      case "FieldAccessExpression":
        return `${this.describeExpression(expression.object)}.${expression.field}`;
      case "StringLiteral":
        return JSON.stringify(expression.value);
      case "IntegerLiteral":
      case "FloatLiteral":
      case "DurationLiteral":
        return expression.raw;
      default:
        return expression.kind;
    }
  }
}
