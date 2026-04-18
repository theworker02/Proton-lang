export interface SourceLocation {
  offset: number;
  line: number;
  column: number;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
}

export type ExecutionMode = "strict" | "unsafe" | "parallel" | "secure" | "gpu";
export type BindingKind = "let" | "const" | "core" | "link" | "ghost";

export interface ProgramNode {
  kind: "Program";
  modulePath: string[];
  uses: UseDeclarationNode[];
  plugins: PluginUseDeclarationNode[];
  permissions: RequiresDeclarationNode[];
  items: TopLevelItem[];
  span: SourceSpan;
}

export type TopLevelItem =
  | FunctionDeclarationNode
  | StructDeclarationNode
  | AlgebraicTypeDeclarationNode
  | ContractDeclarationNode
  | ImplDeclarationNode
  | ConstDeclarationNode
  | AnalyzeDeclarationNode
  | DetectorDeclarationNode
  | AlgorithmDeclarationNode
  | NetworkClusterDeclarationNode
  | ChannelDeclarationNode
  | BuildDeclarationNode
  | MonitorDeclarationNode
  | SuggestDeclarationNode
  | TimelineDeclarationNode
  | InjectionDeclarationNode
  | GoalDeclarationNode;

export interface UseDeclarationNode {
  kind: "UseDeclaration";
  path: string[];
  span: SourceSpan;
}

export interface PluginUseDeclarationNode {
  kind: "PluginUseDeclaration";
  plugin: string;
  span: SourceSpan;
}

export interface RequiresDeclarationNode {
  kind: "RequiresDeclaration";
  permissions: string[];
  span: SourceSpan;
}

export interface ProfileAnnotationNode {
  kind: "ProfileAnnotation";
  profile: string;
  span: SourceSpan;
}

export interface TypeParameterNode {
  kind: "TypeParameter";
  name: string;
  constraints: string[];
  span: SourceSpan;
}

export interface FunctionSignatureNode {
  kind: "FunctionSignature";
  name: string;
  typeParams: TypeParameterNode[];
  params: ParameterNode[];
  returnType: TypeNode;
  modes: ExecutionMode[];
  inline: boolean;
  gpu: boolean;
  adaptive: boolean;
  span: SourceSpan;
}

export interface FunctionDeclarationNode {
  kind: "FunctionDeclaration";
  name: string;
  typeParams: TypeParameterNode[];
  params: ParameterNode[];
  returnType: TypeNode;
  modes: ExecutionMode[];
  inline: boolean;
  gpu: boolean;
  adaptive: boolean;
  body?: BlockStatementNode;
  exposed: boolean;
  meta: boolean;
  profile?: ProfileAnnotationNode;
  span: SourceSpan;
}

export interface ParameterNode {
  kind: "Parameter";
  name: string;
  type: TypeNode;
  span: SourceSpan;
}

export interface StructDeclarationNode {
  kind: "StructDeclaration";
  name: string;
  typeParams: TypeParameterNode[];
  fields: StructFieldNode[];
  exposed: boolean;
  span: SourceSpan;
}

export interface StructFieldNode {
  kind: "StructField";
  name: string;
  type: TypeNode;
  span: SourceSpan;
}

export interface AlgebraicTypeDeclarationNode {
  kind: "AlgebraicTypeDeclaration";
  name: string;
  typeParams: TypeParameterNode[];
  variants: AlgebraicVariantNode[];
  exposed: boolean;
  span: SourceSpan;
}

export interface AlgebraicVariantNode {
  kind: "AlgebraicVariant";
  name: string;
  payloadType?: TypeNode;
  span: SourceSpan;
}

export interface ContractDeclarationNode {
  kind: "ContractDeclaration";
  name: string;
  performance?: string;
  methods: FunctionSignatureNode[];
  span: SourceSpan;
}

export interface ImplDeclarationNode {
  kind: "ImplDeclaration";
  contractName: string;
  targetType: string;
  methods: FunctionDeclarationNode[];
  span: SourceSpan;
}

export interface ConstDeclarationNode {
  kind: "ConstDeclaration";
  name: string;
  type: TypeNode;
  value: ExpressionNode;
  exposed: boolean;
  span: SourceSpan;
}

export interface AnalyzeDeclarationNode {
  kind: "AnalyzeDeclaration";
  target: string;
  rules: string[];
  span: SourceSpan;
}

export interface DetectorDeclarationNode {
  kind: "DetectorDeclaration";
  name: string;
  triggerTokens: string[];
  message: string;
  span: SourceSpan;
}

export interface AlgorithmDeclarationNode {
  kind: "AlgorithmDeclaration";
  name: string;
  typeParams: TypeParameterNode[];
  constraints: string[];
  methods: FunctionDeclarationNode[];
  span: SourceSpan;
}

export interface NetworkClusterDeclarationNode {
  kind: "NetworkClusterDeclaration";
  nodes: NetworkNodeNode[];
  routes: NetworkRouteNode[];
  span: SourceSpan;
}

export interface NetworkNodeNode {
  kind: "NetworkNode";
  name: string;
  address: string;
  span: SourceSpan;
}

export interface NetworkRouteNode {
  kind: "NetworkRoute";
  from: string;
  to: string;
  span: SourceSpan;
}

export interface ChannelDeclarationNode {
  kind: "ChannelDeclaration";
  name: string;
  span: SourceSpan;
}

export interface BuildDeclarationNode {
  kind: "BuildDeclaration";
  mode: string;
  analyze: boolean;
  detect: string[];
  span: SourceSpan;
}

export interface MonitorDeclarationNode {
  kind: "MonitorDeclaration";
  tracks: string[];
  alerts: string[];
  span: SourceSpan;
}

export interface SuggestRuleNode {
  kind: "SuggestRule";
  conditionTokens: string[];
  recommendation: string;
  span: SourceSpan;
}

export interface SuggestDeclarationNode {
  kind: "SuggestDeclaration";
  rules: SuggestRuleNode[];
  span: SourceSpan;
}

export interface TimelineDeclarationNode {
  kind: "TimelineDeclaration";
  entries: TimelineEntryNode[];
  span: SourceSpan;
}

export interface TimelineEntryNode {
  kind: "TimelineEntry";
  trigger: "at" | "after" | "every";
  moment: string | DurationLiteralNode;
  action: ExpressionNode;
  span: SourceSpan;
}

export interface InjectionDeclarationNode {
  kind: "InjectionDeclaration";
  target: string;
  beforeBlock?: BlockStatementNode;
  afterBlock?: BlockStatementNode;
  span: SourceSpan;
}

export interface GoalDirectiveNode {
  kind: "GoalDirective";
  action: string;
  subject: string;
  span: SourceSpan;
}

export interface GoalDeclarationNode {
  kind: "GoalDeclaration";
  directives: GoalDirectiveNode[];
  span: SourceSpan;
}

export interface BlockStatementNode {
  kind: "BlockStatement";
  statements: StatementNode[];
  span: SourceSpan;
}

export type StatementNode =
  | VariableStatementNode
  | AssignmentStatementNode
  | ReturnStatementNode
  | ExpressionStatementNode
  | IfStatementNode
  | SpawnStatementNode
  | SyncStatementNode
  | AwaitStatementNode
  | MutateStatementNode
  | IntentStatementNode
  | SandboxStatementNode
  | GraphStatementNode
  | SendStatementNode
  | ObserveStatementNode
  | AdaptStatementNode
  | GoalStatementNode
  | BlockStatementNode;

export interface VariableStatementNode {
  kind: "VariableStatement";
  binding: BindingKind;
  name: string;
  mutable: boolean;
  type: TypeNode;
  initializer: ExpressionNode;
  span: SourceSpan;
}

export interface AssignmentStatementNode {
  kind: "AssignmentStatement";
  target: AssignableExpressionNode;
  value: ExpressionNode;
  span: SourceSpan;
}

export interface ReturnStatementNode {
  kind: "ReturnStatement";
  value?: ExpressionNode;
  span: SourceSpan;
}

export interface ExpressionStatementNode {
  kind: "ExpressionStatement";
  expression: ExpressionNode;
  span: SourceSpan;
}

export interface IfStatementNode {
  kind: "IfStatement";
  condition: ExpressionNode;
  thenBlock: BlockStatementNode;
  elseBlock?: BlockStatementNode;
  span: SourceSpan;
}

export interface SpawnStatementNode {
  kind: "SpawnStatement";
  taskName: string;
  body: BlockStatementNode;
  span: SourceSpan;
}

export interface SyncStatementNode {
  kind: "SyncStatement";
  body: BlockStatementNode;
  span: SourceSpan;
}

export interface AwaitStatementNode {
  kind: "AwaitStatement";
  taskName: string;
  span: SourceSpan;
}

export interface MutateStatementNode {
  kind: "MutateStatement";
  target: ExpressionNode;
  body: BlockStatementNode;
  span: SourceSpan;
}

export interface IntentStatementNode {
  kind: "IntentStatement";
  intent: string;
  body: BlockStatementNode;
  span: SourceSpan;
}

export interface SandboxStatementNode {
  kind: "SandboxStatement";
  body: BlockStatementNode;
  span: SourceSpan;
}

export interface GraphStatementNode {
  kind: "GraphStatement";
  chains: GraphChainNode[];
  span: SourceSpan;
}

export interface GraphChainNode {
  kind: "GraphChain";
  nodes: string[];
  span: SourceSpan;
}

export interface SendStatementNode {
  kind: "SendStatement";
  channel: string;
  payloadTokens: string[];
  span: SourceSpan;
}

export interface ObserveStatementNode {
  kind: "ObserveStatement";
  tracks: string[];
  body: BlockStatementNode;
  span: SourceSpan;
}

export interface AdaptStatementNode {
  kind: "AdaptStatement";
  body: BlockStatementNode;
  span: SourceSpan;
}

export interface GoalStatementNode {
  kind: "GoalStatement";
  objective: string;
  span: SourceSpan;
}

export type ExpressionNode =
  | IntegerLiteralNode
  | FloatLiteralNode
  | DurationLiteralNode
  | StringLiteralNode
  | BooleanLiteralNode
  | IdentifierNode
  | PathExpressionNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | CallExpressionNode
  | FieldAccessExpressionNode
  | StructLiteralNode
  | GroupExpressionNode
  | ArrayLiteralNode
  | MatchExpressionNode;

export type AssignableExpressionNode =
  | IdentifierNode
  | FieldAccessExpressionNode
  | UnaryExpressionNode;

export interface IntegerLiteralNode {
  kind: "IntegerLiteral";
  value: number;
  raw: string;
  span: SourceSpan;
}

export interface FloatLiteralNode {
  kind: "FloatLiteral";
  value: number;
  raw: string;
  span: SourceSpan;
}

export interface DurationLiteralNode {
  kind: "DurationLiteral";
  value: number;
  unit: "ms" | "s" | "m" | "h";
  raw: string;
  span: SourceSpan;
}

export interface StringLiteralNode {
  kind: "StringLiteral";
  value: string;
  raw: string;
  span: SourceSpan;
}

export interface BooleanLiteralNode {
  kind: "BooleanLiteral";
  value: boolean;
  span: SourceSpan;
}

export interface IdentifierNode {
  kind: "Identifier";
  name: string;
  span: SourceSpan;
}

export interface PathExpressionNode {
  kind: "PathExpression";
  segments: string[];
  span: SourceSpan;
}

export interface BinaryExpressionNode {
  kind: "BinaryExpression";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
  span: SourceSpan;
}

export interface UnaryExpressionNode {
  kind: "UnaryExpression";
  operator: string;
  operand: ExpressionNode;
  span: SourceSpan;
}

export interface CallExpressionNode {
  kind: "CallExpression";
  callee: ExpressionNode;
  args: ExpressionNode[];
  span: SourceSpan;
}

export interface FieldAccessExpressionNode {
  kind: "FieldAccessExpression";
  object: ExpressionNode;
  field: string;
  span: SourceSpan;
}

export interface StructLiteralNode {
  kind: "StructLiteral";
  name: string;
  fields: StructLiteralFieldNode[];
  span: SourceSpan;
}

export interface StructLiteralFieldNode {
  kind: "StructLiteralField";
  name: string;
  value: ExpressionNode;
  span: SourceSpan;
}

export interface GroupExpressionNode {
  kind: "GroupExpression";
  expression: ExpressionNode;
  span: SourceSpan;
}

export interface ArrayLiteralNode {
  kind: "ArrayLiteral";
  elements: ExpressionNode[];
  span: SourceSpan;
}

export interface MatchExpressionNode {
  kind: "MatchExpression";
  value: ExpressionNode;
  arms: MatchArmNode[];
  span: SourceSpan;
}

export interface MatchArmNode {
  kind: "MatchArm";
  pattern: PatternNode;
  expression: ExpressionNode;
  span: SourceSpan;
}

export type PatternNode =
  | WildcardPatternNode
  | IdentifierPatternNode
  | VariantPatternNode
  | BooleanPatternNode
  | IntegerPatternNode
  | StringPatternNode;

export interface WildcardPatternNode {
  kind: "WildcardPattern";
  span: SourceSpan;
}

export interface IdentifierPatternNode {
  kind: "IdentifierPattern";
  name: string;
  span: SourceSpan;
}

export interface VariantPatternNode {
  kind: "VariantPattern";
  variant: string;
  binding?: string;
  span: SourceSpan;
}

export interface BooleanPatternNode {
  kind: "BooleanPattern";
  value: boolean;
  span: SourceSpan;
}

export interface IntegerPatternNode {
  kind: "IntegerPattern";
  value: number;
  raw: string;
  span: SourceSpan;
}

export interface StringPatternNode {
  kind: "StringPattern";
  value: string;
  span: SourceSpan;
}

export type TypeNode =
  | PrimitiveTypeNode
  | NamedTypeNode
  | PointerTypeNode
  | ReferenceTypeNode
  | GenericTypeNode;

export interface PrimitiveTypeNode {
  kind: "PrimitiveType";
  name: "int" | "i32" | "i64" | "f32" | "f64" | "bool" | "str" | "void";
  span: SourceSpan;
}

export interface NamedTypeNode {
  kind: "NamedType";
  name: string;
  span: SourceSpan;
}

export interface PointerTypeNode {
  kind: "PointerType";
  to: TypeNode;
  span: SourceSpan;
}

export interface ReferenceTypeNode {
  kind: "ReferenceType";
  to: TypeNode;
  span: SourceSpan;
}

export interface GenericTypeNode {
  kind: "GenericType";
  name: string;
  args: TypeNode[];
  span: SourceSpan;
}

export function spanFrom(start: SourceLocation, end: SourceLocation): SourceSpan {
  return { start, end };
}
