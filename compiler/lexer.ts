import { spanFrom, type SourceLocation, type SourceSpan } from "./ast.ts";
import { ProtonError, diagnosticAt, type Diagnostic } from "./diagnostics.ts";

export type TokenKind =
  | "identifier"
  | "integer"
  | "float"
  | "string"
  | "keyword"
  | "symbol"
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  span: SourceSpan;
}

const KEYWORDS = new Set([
  "module",
  "use",
  "plugin",
  "requires",
  "analyze",
  "detector",
  "when",
  "without",
  "warn",
  "algorithm",
  "timeline",
  "after",
  "every",
  "observe",
  "adapt",
  "adaptive",
  "inject",
  "into",
  "before",
  "goal",
  "minimize",
  "maximize",
  "startup",
  "expose",
  "fn",
  "meta",
  "inline",
  "gpu",
  "let",
  "const",
  "mut",
  "core",
  "link",
  "ghost",
  "struct",
  "type",
  "contract",
  "impl",
  "for",
  "return",
  "if",
  "else",
  "match",
  "spawn",
  "sync",
  "await",
  "mutate",
  "intent",
  "sandbox",
  "graph",
  "node",
  "network",
  "cluster",
  "at",
  "route",
  "channel",
  "send",
  "build",
  "mode",
  "detect",
  "monitor",
  "track",
  "alert",
  "suggest",
  "recommend",
  "self",
  "true",
  "false",
  "strict",
  "unsafe",
  "parallel",
  "secure",
]);

const DOUBLE_SYMBOLS = new Set(["->", "=>", "::", "==", "!=", "<=", ">="]);
const SINGLE_SYMBOLS = new Set([
  ";",
  ":",
  ",",
  "{",
  "}",
  "(",
  ")",
  "=",
  "+",
  "-",
  "*",
  "/",
  "&",
  ".",
  "<",
  ">",
  "!",
  "@",
  "[",
  "]",
  "%",
]);

export class Lexer {
  private readonly source: string;
  private readonly diagnostics: Diagnostic[] = [];
  private offset = 0;
  private line = 1;
  private column = 1;

  public constructor(source: string) {
    this.source = source;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd()) {
        break;
      }

      const start = this.location();
      const current = this.peek();
      const nextTwo = current + this.peek(1);

      if (DOUBLE_SYMBOLS.has(nextTwo)) {
        this.advance();
        this.advance();
        tokens.push({ kind: "symbol", value: nextTwo, span: spanFrom(start, this.location()) });
        continue;
      }

      if (SINGLE_SYMBOLS.has(current)) {
        this.advance();
        tokens.push({ kind: "symbol", value: current, span: spanFrom(start, this.location()) });
        continue;
      }

      if (current === "\"") {
        tokens.push(this.readString());
        continue;
      }

      if (this.isDigit(current)) {
        tokens.push(this.readNumber());
        continue;
      }

      if (this.isIdentifierStart(current)) {
        tokens.push(this.readIdentifier());
        continue;
      }

      this.advance();
      this.diagnostics.push(
        diagnosticAt(`Unexpected character '${current}'.`, spanFrom(start, this.location())),
      );
    }

    const eofLocation = this.location();
    tokens.push({ kind: "eof", value: "", span: spanFrom(eofLocation, eofLocation) });

    if (this.diagnostics.length > 0) {
      throw new ProtonError("Lexing failed.", this.diagnostics);
    }

    return tokens;
  }

  private readString(): Token {
    const start = this.location();
    this.advance();
    let value = "";

    while (!this.isAtEnd() && this.peek() !== "\"") {
      const char = this.advance();
      if (char === "\\") {
        const escaped = this.advance();
        switch (escaped) {
          case "\"":
            value += "\"";
            break;
          case "\\":
            value += "\\";
            break;
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          default:
            value += escaped;
            break;
        }
      } else {
        value += char;
      }
    }

    if (this.isAtEnd()) {
      throw new ProtonError("Lexing failed.", [
        diagnosticAt("Unterminated string literal.", spanFrom(start, this.location())),
      ]);
    }

    this.advance();
    return {
      kind: "string",
      value,
      span: spanFrom(start, this.location()),
    };
  }

  private readNumber(): Token {
    const start = this.location();
    let raw = "";
    let hasDot = false;

    while (!this.isAtEnd()) {
      const char = this.peek();
      if (this.isDigit(char)) {
        raw += this.advance();
        continue;
      }
      if (char === "." && !hasDot && this.isDigit(this.peek(1))) {
        hasDot = true;
        raw += this.advance();
        continue;
      }
      break;
    }

    return {
      kind: hasDot ? "float" : "integer",
      value: raw,
      span: spanFrom(start, this.location()),
    };
  }

  private readIdentifier(): Token {
    const start = this.location();
    let value = "";

    while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
      value += this.advance();
    }

    return {
      kind: KEYWORDS.has(value) ? "keyword" : "identifier",
      value,
      span: spanFrom(start, this.location()),
    };
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const current = this.peek();
      const next = this.peek(1);

      if (current === "/" && next === "/") {
        while (!this.isAtEnd() && this.peek() !== "\n") {
          this.advance();
        }
        continue;
      }

      if (current === " " || current === "\t" || current === "\r" || current === "\n") {
        this.advance();
        continue;
      }

      break;
    }
  }

  private isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private peek(lookahead = 0): string {
    return this.source[this.offset + lookahead] ?? "\0";
  }

  private advance(): string {
    const char = this.source[this.offset] ?? "\0";
    this.offset += 1;
    if (char === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return char;
  }

  private location(): SourceLocation {
    return {
      offset: this.offset,
      line: this.line,
      column: this.column,
    };
  }

  private isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
  }

  private isIdentifierStart(char: string): boolean {
    return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
  }

  private isIdentifierPart(char: string): boolean {
    return this.isIdentifierStart(char) || this.isDigit(char);
  }
}
