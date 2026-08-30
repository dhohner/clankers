import { LITERAL, UNQUOTED, substitutionEnd } from "./tokenizer.ts";
import type { ShellToken, Word } from "./types.ts";

function hasProcessSubstitution(word: Word): boolean {
  for (let i = 0; i < word.text.length; i += 1) {
    const char = word.text[i];
    if ((char === "<" || char === ">") && word.text[i + 1] === "(" && word.quoting[i] === UNQUOTED) return true;
  }
  return false;
}

/**
 * Reports whether the shell reading this word expands part of it away. A `$` or backtick inside single
 * quotes, or escaped, survives as itself; anywhere else it is replaced before the text is used, so text that
 * a nested shell or `eval` parses afterwards is not the text written here. An unquoted `<(` or `>(` is a
 * process substitution, replaced by the path of a pipe.
 */
export function expandsBeforeUse(word: Word): boolean {
  for (let i = 0; i < word.text.length; i += 1) {
    const char = word.text[i] ?? "";
    if ((char === "$" || char === "`") && word.quoting[i] !== LITERAL) return true;
  }
  return hasProcessSubstitution(word);
}

const REWRITES_COMMAND_WORD = /[$`{}]/;

/** Whether the shell rewrites `word` before resolving it as a command name. */
export function rewritesCommandWord(word: Word): boolean {
  return REWRITES_COMMAND_WORD.test(word.text) || hasProcessSubstitution(word);
}

const MAX_ARITHMETIC_NESTING = 64;

export type SubstitutionScan = { contents: string[]; nestingLimitExceeded: boolean };

/**
 * Finds command lists iteratively so adversarial arithmetic nesting cannot exhaust the JavaScript call stack.
 * The limit also bounds repeated delimiter scans; exceeding it makes the caller fail closed.
 */
export function scanSubstitutions(word: Word): SubstitutionScan {
  const contents: string[] = [];
  const arithmeticEnds: number[] = [];
  const { text, quoting } = word;
  for (let i = 0; i < text.length; i += 1) {
    while (arithmeticEnds.length > 0 && i >= (arithmeticEnds.at(-1) ?? 0)) arithmeticEnds.pop();

    const char = text[i];
    if (quoting[i] === LITERAL) continue;
    if (char === "`") {
      const end = text.indexOf("`", i + 1);
      const stop = end < 0 ? text.length : end;
      contents.push(text.slice(i + 1, stop));
      i = stop;
      continue;
    }
    if (text[i + 1] !== "(") continue;
    const command = char === "$";
    const process = (char === "<" || char === ">") && quoting[i] === UNQUOTED;
    if (!command && !process) continue;
    const end = substitutionEnd(text, i);
    if (command && text[i + 2] === "(" && text[end - 1] === ")") {
      arithmeticEnds.push(end);
      if (arithmeticEnds.length > MAX_ARITHMETIC_NESTING) {
        return { contents, nestingLimitExceeded: true };
      }
      i += 2;
      continue;
    }
    contents.push(text.slice(i + 2, end));
    i = end;
  }
  return { contents, nestingLimitExceeded: false };
}

/**
 * The text of every command list the shell runs while expanding `word`: `$( ... )`, backticks, and the
 * process substitutions `<( ... )` and `>( ... )`. A quoted one is literal and skipped. An arithmetic expansion
 * `$(( ... ))` runs no command of its own, so only the substitutions inside it are listed.
 */
export function substitutionContents(word: Word): string[] {
  return scanSubstitutions(word).contents;
}

// Number forms bash arithmetic accepts that contain letters: hexadecimal and `base#digits`.
const ARITHMETIC_NUMBER = /0[xX][0-9a-fA-F]+|[0-9]+#[0-9a-zA-Z@_]+/g;
// The `[[ ... ]]` operators whose operands bash evaluates as arithmetic expressions.
const ARITHMETIC_TEST_OPERATORS = new Set(["-eq", "-ne", "-lt", "-le", "-gt", "-ge"]);
const INTEGER = /^[+-]?[0-9]+$/;

/**
 * Whether bash can read a value this text does not show while evaluating `expression`. Arithmetic evaluates
 * a named variable's value as an expression of its own, recursively, and expands the subscript of an array
 * reference on the way, so `x='a[$(rm -rf build)]'; echo $((x))` runs `rm` although this text never names
 * it. A nested arithmetic expansion is checked the same way, and a command substitution or backtick inside
 * arithmetic supplies source that bash evaluates again, so it fails closed whatever it runs.
 */
function arithmeticReadsVariable(expression: string): boolean {
  let stripped = "";
  const arithmeticEnds: number[] = [];
  for (let i = 0; i < expression.length; i += 1) {
    while (arithmeticEnds.length > 0 && i >= (arithmeticEnds.at(-1) ?? 0)) arithmeticEnds.pop();

    const char = expression[i] ?? "";
    if (char === "`") return true;
    if (char === "$" && expression[i + 1] === "(") {
      const end = substitutionEnd(expression, i);
      if (expression[i + 2] !== "(" || expression[end - 1] !== ")") return true;
      arithmeticEnds.push(end);
      if (arithmeticEnds.length > MAX_ARITHMETIC_NESTING) return true;
      i += 2;
      continue;
    }
    stripped += char;
  }
  return /[A-Za-z_$]/.test(stripped.replace(ARITHMETIC_NUMBER, ""));
}

/**
 * Whether the shell evaluates, while expanding `word`, an arithmetic expression whose value this text does not
 * show: an arithmetic expansion that names a variable, or a `[[ ... ]]` arithmetic comparison whose operand is
 * not an integer literal. Either reads a value that may carry a substitution of its own.
 */
export function evaluatesUnreadableArithmetic(word: ShellToken): boolean {
  const { text, quoting } = word;
  for (let i = 0; i < text.length; i += 1) {
    if (quoting[i] === LITERAL) continue;
    if (text.startsWith("$((", i)) {
      const end = substitutionEnd(text, i);
      if (text[end - 1] !== ")") continue;
      if (arithmeticReadsVariable(text.slice(i + 3, end - 1))) return true;
      i = end;
      continue;
    }
  }
  if (!word.testExpression) return false;
  // Quotes are gone from the text, so a quoted operand holding a space splits here; every piece that is not an
  // integer fails closed, which is the safe direction.
  const operands = text.slice(2, -2).split(/\s+/);
  return operands.some(
    (operand, index) =>
      ARITHMETIC_TEST_OPERATORS.has(operand) &&
      !(INTEGER.test(operands[index - 1] ?? "") && INTEGER.test(operands[index + 1] ?? "")),
  );
}

/**
 * Whether the host can look `word` up as the path this text spells. An expansion, a tilde, a glob, or a brace
 * is replaced by the shell first, so the entry the command reaches is not the one the host would inspect.
 */
export function namesOnePathLiterally(word: ShellToken): boolean {
  return word.text !== "" && !expandsBeforeUse(word) && !/^~|[*?[{}]/.test(word.text);
}
