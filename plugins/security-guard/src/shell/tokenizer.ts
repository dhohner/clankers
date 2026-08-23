import type { ShellToken, Word } from "./types.ts";

// Quote marks used in `Word.quoting`. A LITERAL character never expands (single quote or backslash), a
// DOUBLE one expands but is not split into several words, an UNQUOTED one does both.
export const LITERAL = "'";
export const DOUBLE = '"';
export const UNQUOTED = " ";

const CONTROL_OPERATORS = [";;", "&&", "||", "|&", ";", "&", "|", "(", ")", "{", "}", "\n"] as const;
const REDIRECT_OPERATORS = ["&>>", "&>", "<<<", "<<-", "<<", "<&", "<>", ">>", ">|", ">&", ">", "<"] as const;
// Longest first, so `&&` is not read as `&` and `>>` not as `>`.
const OPERATORS: readonly string[] = [...CONTROL_OPERATORS, ...REDIRECT_OPERATORS].sort((a, b) => b.length - a.length);
const REDIRECT_OPERATOR_SET: ReadonlySet<string> = new Set(REDIRECT_OPERATORS);
// Only a list separator leaves the next command certain to run in this shell. After `&&`, `||`, `|`, or `&`,
// and inside `(...)` or `{...}`, the command may be skipped or may run in a subshell.
export const SEQUENTIAL_CONTROLS: ReadonlySet<string> = new Set([";", ";;", "\n"]);

/**
 * Whether the character at `i` is a word of its own, in the position where a command name would stand:
 * nothing before it in this word, a separator or the end after it, and no word yet in this command. Bash
 * reads `{` and `}` as reserved words only there; `echo A } B` prints `A } B`.
 */
function standsAlone(value: string, i: number, text: string, atCommandStart: boolean): boolean {
  if (text !== "" || !atCommandStart) return false;
  const next = value[i + 1];
  if (next === undefined || /\s/.test(next)) return true;
  return OPERATORS.some((candidate) => value.startsWith(candidate, i + 1));
}

export type UnsupportedShellSyntax =
  | "ansi-c-quoting"
  | "arithmetic"
  | "function-definition"
  | "process-substitution"
  | "test-expression"
  | "unsupported-control-operator"
  | "unterminated-backtick"
  | "unterminated-quote"
  | "unterminated-substitution";

export type ShellTokenization =
  | { kind: "tokens"; tokens: ShellToken[] }
  | { kind: "unsupported"; reason: UnsupportedShellSyntax };

function unsupportedShellSyntax(value: string): UnsupportedShellSyntax | undefined {
  let quote = "";
  let substitutionDepth = 0;
  let unquoted = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    const next = value[index + 1] ?? "";
    unquoted += quote === "" ? char : " ";
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = "";
      continue;
    }
    if (quote === "\"") {
      if (char === "\"") {
        quote = "";
        continue;
      }
    } else if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "`") {
      const end = value.indexOf("`", index + 1);
      if (end < 0) return "unterminated-backtick";
      index = end;
      continue;
    }
    if (quote === "") {
      if (char === "$" && (next === "'" || next === "\"")) return "ansi-c-quoting";
      if ((char === "<" || char === ">") && next === "(") return "process-substitution";
      if (char === "$" && value.startsWith("$((", index)) return "arithmetic";
      if (char === "(" && next === "(" && substitutionDepth === 0) return "arithmetic";
      if (char === "[" && next === "[") return "test-expression";
      if (char === ";" && next === "&") return "unsupported-control-operator";
    }
    if (char === "$" && (next === "(" || next === "{")) {
      substitutionDepth += 1;
      index += 1;
      continue;
    }
    if (substitutionDepth > 0 && (char === "(" || char === "{")) substitutionDepth += 1;
    if (substitutionDepth > 0 && (char === ")" || char === "}")) substitutionDepth -= 1;
  }

  if (quote !== "") return "unterminated-quote";
  if (substitutionDepth !== 0) return "unterminated-substitution";
  if (/(^|[;&|(){}\n]\s*|\s)(function\s+[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\))\s*\{/.test(unquoted)) {
    return "function-definition";
  }
  return undefined;
}

/** Tokenizes the deliberately accepted shell grammar or identifies syntax the security policy cannot model. */
export function tokenizeShell(value: string): ShellTokenization {
  const unsupported = unsupportedShellSyntax(value);
  return unsupported ? { kind: "unsupported", reason: unsupported } : { kind: "tokens", tokens: shellTokens(value) };
}

/** Tokenizes accepted shell words for low-level helpers that already fail closed on unknown constructs. */
export function shellTokens(value: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  const pendingHeredocs: Array<{ delimiter: string; expands: boolean; stripTabs: boolean }> = [];
  let heredocTarget: { stripTabs: boolean } | undefined;
  let text = "";
  let quoting = "";
  let quote = "";

  const append = (chunk: string, mark: string) => {
    text += chunk;
    quoting += mark.repeat(chunk.length);
  };

  // True where a command name would stand: at the start, and after every control operator.
  let atCommandStart = true;

  const push = () => {
    if (!text) return;
    tokens.push({ text, quoting, sep: false, redirect: false });
    if (heredocTarget) {
      pendingHeredocs.push({
        delimiter: text,
        expands: !/[^ ]/.test(quoting),
        stripTabs: heredocTarget.stripTabs,
      });
      heredocTarget = undefined;
    }
    atCommandStart = false;
    text = "";
    quoting = "";
  };

  const heredocWord = (body: string, expands: boolean): Word => {
    if (!expands) return { text: body, quoting: LITERAL.repeat(body.length) };
    let bodyText = "";
    let bodyQuoting = "";
    for (let position = 0; position < body.length; position += 1) {
      const char = body[position] ?? "";
      const next = body[position + 1] ?? "";
      if (char === "\\" && "\\$`\n".includes(next)) {
        position += 1;
        if (next !== "\n") {
          bodyText += next;
          bodyQuoting += LITERAL;
        }
        continue;
      }
      bodyText += char;
      bodyQuoting += UNQUOTED;
    }
    return { text: bodyText, quoting: bodyQuoting };
  };

  const consumeHeredocs = (start: number): number => {
    let cursor = start;
    for (const heredoc of pendingHeredocs) {
      const bodyStart = cursor;
      let terminated = false;
      while (cursor <= value.length) {
        const newline = value.indexOf("\n", cursor);
        const lineEnd = newline < 0 ? value.length : newline;
        const line = value.slice(cursor, lineEnd).replace(/\r$/, "");
        const comparable = heredoc.stripTabs ? line.replace(/^\t+/, "") : line;
        if (comparable === heredoc.delimiter) {
          const body = heredocWord(value.slice(bodyStart, cursor), heredoc.expands);
          tokens.push({ ...body, sep: true, redirect: false, heredoc: true });
          cursor = newline < 0 ? value.length : newline + 1;
          terminated = true;
          break;
        }
        if (newline < 0) {
          cursor = value.length;
          break;
        }
        cursor = newline + 1;
      }
      if (!terminated) {
        const body = heredocWord(value.slice(bodyStart), heredoc.expands);
        tokens.push({ ...body, sep: true, redirect: false, heredoc: true });
        break;
      }
    }
    pendingHeredocs.length = 0;
    return cursor;
  };

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i] ?? "";

    // A `#` that starts a word begins a comment; the newline that ends it still separates commands.
    if (quote === "" && text === "" && char === "#") {
      const end = value.indexOf("\n", i);
      if (end < 0) break;
      i = end - 1;
      continue;
    }

    if (quote === LITERAL) {
      if (char === "'") quote = "";
      else append(char, LITERAL);
      continue;
    }

    if (quote === DOUBLE && char === '"') {
      quote = "";
      continue;
    }

    const mark = quote || UNQUOTED;

    if (char === "\\" && i + 1 < value.length) {
      const next = value[i + 1] ?? "";
      // Inside double quotes a backslash escapes only these characters; elsewhere it escapes any one.
      if (quote !== DOUBLE || '"\\$`\n'.includes(next)) {
        i += 1;
        // A backslash before a newline is a line continuation: both characters disappear.
        if (next !== "\n") append(next, LITERAL);
        continue;
      }
    }

    if (char === "$" && (value[i + 1] === "(" || value[i + 1] === "{")) {
      // Command substitution and braced expansion stay part of the word; the former's inner commands are
      // inspected separately by isDestructiveText.
      const open = value[i + 1] ?? "";
      const close = open === "(" ? ")" : "}";
      let depth = 0;
      let inner_quote = "";
      append(char, mark);
      for (i += 1; i < value.length; i += 1) {
        const inner = value[i] ?? "";
        append(inner, mark);
        // A quoted or escaped delimiter is data, not the end of the substitution: `$(echo ")" ; rm -rf /)`
        // runs `rm` in a substitution that ends at the last parenthesis, not the quoted one.
        if (inner_quote === "'") {
          if (inner === "'") inner_quote = "";
          continue;
        }
        if (inner === "\\" && i + 1 < value.length) {
          i += 1;
          append(value[i] ?? "", mark);
          continue;
        }
        if (inner_quote === '"') {
          if (inner === '"') inner_quote = "";
          continue;
        }
        if (inner === "'" || inner === '"') {
          inner_quote = inner;
          continue;
        }
        if (inner === open) depth += 1;
        else if (inner === close && (depth -= 1) === 0) break;
      }
      continue;
    }

    if (char === "`") {
      const end = value.indexOf("`", i + 1);
      const stop = end < 0 ? value.length : end;
      append(value.slice(i, stop + 1), mark);
      i = stop;
      continue;
    }

    if (quote === DOUBLE) {
      append(char, DOUBLE);
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char !== "\n" && /\s/.test(char)) {
      push();
      continue;
    }

    const operator = OPERATORS.find((candidate) => value.startsWith(candidate, i));
    if (operator) {
      // `{` and `}` group commands only when each stands alone as a word. Touching a word on either side
      // they are brace expansion, which rewrites the word: `r{m,} -rf build` runs `rm`.
      if ((operator === "{" || operator === "}") && !standsAlone(value, i, text, atCommandStart)) {
        append(char, UNQUOTED);
        continue;
      }
      const redirect = REDIRECT_OPERATOR_SET.has(operator);
      // An unquoted digit run touching a redirection is the file descriptor, not a word.
      if (redirect && /^[0-9]+$/.test(text) && !/[^ ]/.test(quoting)) {
        text = "";
        quoting = "";
      }
      push();
      tokens.push({ text: operator, quoting: "", sep: true, redirect });
      if (operator === "<<" || operator === "<<-") heredocTarget = { stripTabs: operator === "<<-" };
      if (!redirect) atCommandStart = true;
      i += operator.length - 1;
      if (operator === "\n" && pendingHeredocs.length > 0) i = consumeHeredocs(i + 1) - 1;
      continue;
    }

    append(char, UNQUOTED);
  }

  push();
  return tokens;
}

export function sliceWord(word: Word, start: number): ShellToken {
  return { text: word.text.slice(start), quoting: word.quoting.slice(start), sep: false, redirect: false };
}

export function isUnquoted(word: Word, end: number): boolean {
  return !/[^ ]/.test(word.quoting.slice(0, end));
}

