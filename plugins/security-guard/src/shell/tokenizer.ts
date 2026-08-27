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
// Reserved words after which bash reads another command name, so `if [[ ...` and `! [[ ...` keep `[[` in
// command position. `time` is one of them too; the registry models it as a wrapper. `coproc` is absent: bash
// added it in 4.0, and bash 3.2, which macOS ships as `/bin/bash`, runs it as an ordinary command word, so
// `coproc [[ x || rm -rf build ]]` runs `rm` there.
const COMMAND_INTRODUCERS: ReadonlySet<string> = new Set([
  "!",
  "do",
  "elif",
  "else",
  "if",
  "then",
  "time",
  "until",
  "while",
]);

// The only word bash reads after the reserved word `time` while still expecting a command name, so
// `time -p [[ ... ]]` keeps `[[` reserved. Bash 4.4 and later also accept `--` there, but bash 3.2, which
// macOS ships as `/bin/bash`, runs it as the command word, so `--` stays a command word here.
const TIME_OPTION = "-p";

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

/**
 * Whether the shell runs a command of its own while expanding `word`. Quoting decides: a single-quoted or
 * escaped opening is literal text, and `<(` and `>(` are literal inside double quotes as well, so
 * `rm -rf build '<(printf x)'` deletes a file named after the substitution rather than running one. The
 * arithmetic expansion `$((` runs no command, but it opens with `$(` and is reported here, which leaves the
 * expression to a caller that can read it.
 */
export function runsSubstitution(word: Word): boolean {
  const { text, quoting } = word;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoting[i] === LITERAL) continue;
    if (char === "`") return true;
    if (text[i + 1] !== "(") continue;
    if (char === "$") return true;
    if ((char === "<" || char === ">") && quoting[i] === UNQUOTED) return true;
  }
  return false;
}

export type UnsupportedShellSyntax =
  | "ansi-c-quoting"
  | "arithmetic"
  | "function-definition"
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
    if (quote === '"') {
      if (char === '"') {
        quote = "";
        continue;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "`") {
      const end = value.indexOf("`", index + 1);
      if (end < 0) return "unterminated-backtick";
      index = end;
      continue;
    }
    // `$[ ... ]` is the deprecated arithmetic expansion, still live in bash 3.2 and readable inside double
    // quotes. It reads a variable's value as an expression the same way `$(( ... ))` does; rather than model a
    // second spelling of it, the policy refuses the whole call.
    if (char === "$" && next === "[") return "arithmetic";
    if (quote === "") {
      if (char === "$" && (next === "'" || next === '"')) return "ansi-c-quoting";
      // `((` outside a substitution is the arithmetic command, whose expression the policy cannot read; the
      // arithmetic expansion `$((` is a substitution and is accepted below.
      if (char === "(" && next === "(" && substitutionDepth === 0) return "arithmetic";
      if (char === ";" && next === "&") return "unsupported-control-operator";
    }
    // Process substitution is literal text inside double quotes; `$(` and `${` are not.
    const opensSubstitution =
      (char === "$" && (next === "(" || next === "{")) ||
      (quote === "" && (char === "<" || char === ">") && next === "(");
    if (opensSubstitution) {
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

/**
 * The index of the delimiter that closes the substitution opening at `start` (`$(`, `${`, `<(`, or `>(`), or
 * the last index of `value` when nothing closes it. A quoted or escaped delimiter is data, not the end of the
 * substitution: `$(echo ")" ; rm -rf /)` runs `rm` in a substitution that ends at the last parenthesis, not
 * the quoted one.
 */
export function substitutionEnd(value: string, start: number): number {
  const open = value[start + 1] ?? "";
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  let quote = "";
  for (let i = start + 1; i < value.length; i += 1) {
    const char = value[i] ?? "";
    if (quote === "'") {
      if (char === "'") quote = "";
      continue;
    }
    if (char === "\\" && i + 1 < value.length) {
      i += 1;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close && (depth -= 1) === 0) return i;
  }
  return value.length - 1;
}

/**
 * The index of the `]` closing the array subscript that opens at `open`, or -1 when nothing closes it. Bash
 * allows a subscript to hold another one, as in `arr[a[0]]`, so the brackets are counted rather than searched.
 */
export function subscriptEnd(value: string, open: number): number {
  let depth = 0;
  for (let i = open; i < value.length; i += 1) {
    const char = value[i];
    if (char === "[") depth += 1;
    else if (char === "]" && (depth -= 1) === 0) return i;
  }
  return -1;
}

/** Whether the character at `i` ends a word: nothing, whitespace, or an operator. */
function endsWord(value: string, i: number): boolean {
  const char = value[i];
  return char === undefined || /\s/.test(char) || OPERATORS.some((candidate) => value.startsWith(candidate, i));
}

/** Tokenizes the deliberately accepted shell grammar or identifies syntax the security policy cannot model. */
export function tokenizeShell(value: string): ShellTokenization {
  const unsupported = unsupportedShellSyntax(value);
  return unsupported ? { kind: "unsupported", reason: unsupported } : { kind: "tokens", tokens: shellTokens(value) };
}

/** Tokenizes accepted shell words for low-level helpers that already fail closed on unknown constructs. */
export function shellTokens(value: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  const pendingHeredocs: Array<{ delimiter: string; expands: boolean; stripTabs: boolean; owner: number }> = [];
  let heredocTarget: { stripTabs: boolean } | undefined;
  let text = "";
  let quoting = "";
  let quote = "";
  // True while reading a `[[ ... ]]` test expression, which is one word: the shell splits nothing inside it,
  // and `&&`, `||`, and `<` there compare rather than separate or redirect.
  let testExpression = false;
  // The index just past the last substitution read into the current word, so the `)` that closed it can be
  // told from one that closes a `[[ ... ]]` group.
  let substitutionTail = -1;

  const append = (chunk: string, mark: string) => {
    text += chunk;
    quoting += mark.repeat(chunk.length);
  };

  // True where a command name would stand: at the start, and after every control operator.
  let atCommandStart = true;
  // True right after the reserved word `time`, the one reserved word bash follows with an option of its own.
  let timedPipeline = false;
  // Index of the first token of the current command, redirections included; matches `simpleCommandExtents`.
  let commandStart = 0;

  const push = () => {
    if (!text) return;
    tokens.push({ text, quoting, sep: false, redirect: false, ...(testExpression ? { testExpression } : {}) });
    testExpression = false;
    if (heredocTarget) {
      pendingHeredocs.push({
        delimiter: text,
        expands: !/[^ ]/.test(quoting),
        stripTabs: heredocTarget.stripTabs,
        owner: commandStart,
      });
      heredocTarget = undefined;
    }
    // Only a word read in command position is reserved: `echo if` prints `if`.
    const unquoted = !/[^ ]/.test(quoting);
    const introduces = unquoted && (COMMAND_INTRODUCERS.has(text) || (timedPipeline && text === TIME_OPTION));
    timedPipeline = atCommandStart && unquoted && text === "time";
    atCommandStart = atCommandStart && introduces;
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
          tokens.push({ ...body, sep: true, redirect: false, heredoc: true, heredocOwner: heredoc.owner });
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
        tokens.push({ ...body, sep: true, redirect: false, heredoc: true, heredocOwner: heredoc.owner });
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
      // Command substitution, arithmetic expansion, and braced expansion stay part of the word; the commands
      // inside the first two are inspected separately by isDestructiveText.
      const end = substitutionEnd(value, i);
      append(value.slice(i, end + 1), mark);
      substitutionTail = end + 1;
      i = end;
      continue;
    }

    if (char === "`") {
      const end = value.indexOf("`", i + 1);
      const stop = end < 0 ? value.length : end;
      append(value.slice(i, stop + 1), mark);
      substitutionTail = stop + 1;
      i = stop;
      continue;
    }

    if (quote === DOUBLE) {
      append(char, DOUBLE);
      continue;
    }

    // Process substitution is a word expansion: `diff <(a) b` keeps `<(a)` in its word, and the operator scan
    // below never sees the `<`. Inside double quotes it is literal text and was appended above.
    if ((char === "<" || char === ">") && value[i + 1] === "(") {
      const end = substitutionEnd(value, i);
      append(value.slice(i, end + 1), UNQUOTED);
      substitutionTail = end + 1;
      i = end;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (testExpression) {
      // Bash ends the expression only at a `]]` that starts a word of its own. Unquoted whitespace starts one,
      // and so does the `)` that closes a group: `[[ (-f a)]]` ends there. The `)` that closes a substitution
      // belongs to its word, so `[[ -n $(c)]]` does not end, and neither does `[[ -f a]]`; bash rejects both
      // as syntax errors it runs nothing of, which is also what leaving the rest inside this word models.
      const previous = text.at(-1);
      const startsWord =
        quoting.at(-1) === UNQUOTED &&
        previous !== undefined &&
        (/\s/.test(previous) || (previous === ")" && i !== substitutionTail));
      if (value.startsWith("]]", i) && startsWord && endsWord(value, i + 2)) {
        append("]]", UNQUOTED);
        i += 1;
        push();
        continue;
      }
      append(char, UNQUOTED);
      continue;
    }

    // `[[` is reserved only where a command name would stand and only as a word of its own, like `{`.
    if (char === "[" && value.startsWith("[[", i) && text === "" && atCommandStart && endsWord(value, i + 2)) {
      testExpression = true;
      append("[[", UNQUOTED);
      i += 1;
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
      i += operator.length - 1;
      if (operator === "\n" && pendingHeredocs.length > 0) i = consumeHeredocs(i + 1) - 1;
      timedPipeline = false;
      if (!redirect) {
        atCommandStart = true;
        commandStart = tokens.length;
      }
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
