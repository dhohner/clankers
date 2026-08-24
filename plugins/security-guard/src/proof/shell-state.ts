import { escalatesPrivilege, isAssignment, isTrustedCommandWord, simpleCommandAt } from "../shell/command-parser.ts";
import { DOUBLE, LITERAL, UNQUOTED, shellTokens, sliceWord } from "../shell/tokenizer.ts";
import type { ShellToken, Word } from "../shell/types.ts";
import { proven, unprovable, type ProofResult, type ShellState, type ShellVariable } from "./types.ts";

const SUBSTITUTION = /\$\(([\s\S]*)\)|`([^`]*)`/;

// mktemp options that leave the created directory under the temporary root. `-p`/`--tmpdir` name a parent and
// `-u` creates nothing, so both are absent; so is every unknown option, which could do either.
const MKTEMP_FLAG_OPTIONS = new Set(["-d", "--directory", "-q", "--quiet"]);
// `--suffix SUFFIX` takes a value that is neither a template nor a parent directory; GNU rejects a slash in
// it. `-t` is absent: BSD concatenates its prefix onto the temporary root without rejecting `/` or `..`, so
// `mktemp -d -t ../escape` creates outside the root, and GNU's `-t` takes no value at all.
const MKTEMP_VALUE_OPTIONS = new Set(["--suffix"]);

/**
 * The command words of `word` when it is exactly a substitution that runs `mktemp -d` and can only create
 * inside the temporary root, or undefined otherwise. The executable must be a system one, every option must be
 * known, and no template operand may name a path; anything else could create elsewhere, create nothing, or
 * fail. The returned words, wrappers included, still resolve through the host's PATH, so the caller must
 * verify them the way it verifies any other command word before trusting the directory.
 */
export function mktempDirectoryCommandWords(word: Word): ShellToken[] | undefined {
  // A single-quoted or escaped delimiter makes bash assign the text itself instead of running mktemp.
  if (word.quoting.includes(LITERAL)) return undefined;

  const text = word.text;
  const match = SUBSTITUTION.exec(text);
  if (!match || match[0] !== text) return undefined;
  const tokens = shellTokens(match[1] ?? match[2] ?? "");
  if (tokens.some((token) => token.sep)) return undefined;
  // A command-local assignment can move the temporary root (TMPDIR) or resolve `mktemp` to another binary (PATH).
  if (tokens.some((token) => isAssignment(token))) return undefined;

  const command = simpleCommandAt(tokens, 0);
  if (command.kind === "unresolved") return undefined;
  const { name, argTexts, commandWords, statefulWrapper } = command;
  if (statefulWrapper || name !== "mktemp" || !commandWords.every(isTrustedCommandWord)) return undefined;
  if (escalatesPrivilege(commandWords)) return undefined;
  // An option value is never inspected as a path, so a substitution or expansion in one would run unseen.
  if (argTexts.some((arg) => /[$`]/.test(arg))) return undefined;

  let createsDirectory = false;
  for (let i = 0; i < argTexts.length; i += 1) {
    const arg = argTexts[i] ?? "";
    if (arg.startsWith("--")) {
      if (MKTEMP_VALUE_OPTIONS.has(arg)) {
        i += 1;
        continue;
      }
      if (!MKTEMP_FLAG_OPTIONS.has(arg)) return undefined;
      if (arg === "--directory") createsDirectory = true;
      continue;
    }
    // A bare operand is a template, which may name a path outside the temporary root.
    if (arg === "-" || !arg.startsWith("-")) return undefined;

    for (let position = 1; position < arg.length; position += 1) {
      const option = `-${arg[position]}`;
      if (MKTEMP_VALUE_OPTIONS.has(option)) {
        // An inline value would make the rest of the word the template rather than a prefix.
        if (position + 1 < arg.length) return undefined;
        i += 1;
        continue;
      }
      if (!MKTEMP_FLAG_OPTIONS.has(option)) return undefined;
      if (option === "-d") createsDirectory = true;
    }
  }
  return createsDirectory ? commandWords : undefined;
}

function createsMktempDirectory(word: Word): boolean {
  return mktempDirectoryCommandWords(word) !== undefined;
}

const EXPANSION = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

// Expands `$NAME` and `${NAME}` from assignments seen earlier in the same call. Anything still dynamic after
// expansion, or a mktemp directory used anywhere but as the leading prefix, cannot be proven.
/**
 * Whether an unquoted brace expansion rewrites this word. `${NAME}` is parameter expansion, which the caller
 * resolves; a bare `{a,b}` turns one word into several, and the path checked here into none of them.
 */
function hasBraceExpansion(word: Word): boolean {
  for (let i = 0; i < word.text.length; i += 1) {
    const char = word.text[i];
    if ((char !== "{" && char !== "}") || word.quoting[i] !== UNQUOTED) continue;
    // Only an unquoted `$` opens a parameter expansion; after `"$"` the braces are an ordinary expansion.
    if (char === "{" && word.text[i - 1] === "$" && word.quoting[i - 1] === UNQUOTED) continue;
    const parameter = /\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.exec(word.text.slice(0, i + 1));
    if (char === "}" && parameter && word.quoting[i + 1 - parameter[0].length] === UNQUOTED) continue;
    return true;
  }
  return false;
}

function expandWordValue(word: Word, state: ShellState): ShellVariable | undefined {
  // The substitution runs here, so errexit as it stands now decides whether a failed mktemp can leave the
  // value empty for the rest of the call.
  if (createsMktempDirectory(word)) return { path: "", insideMktempDirectory: true, mktempGuarded: state.errexit };
  if (hasBraceExpansion(word)) return undefined;

  let insideMktempDirectory = false;
  let mktempGuarded = false;
  let unprovableExpansion = false;
  const path = word.text.replace(EXPANSION, (whole: string, braced: string, bare: string, offset: number) => {
    // A single-quoted or backslash-escaped `$` is literal; the leftover `$` fails the check below. So is a
    // `$` quoted apart from the name after it, as in `"$"a` or `$"{a}"`, which bash leaves as written.
    const marks = word.quoting.slice(offset, offset + whole.length);
    if (marks[0] === LITERAL || [...marks].some((mark) => mark !== marks[0])) return whole;

    const variable = state.variables.get(braced ?? bare);
    if (!variable) {
      unprovableExpansion = true;
      return "";
    }
    // An unquoted expansion is split on whitespace, so one checked word would become several operands.
    if (word.quoting[offset] === UNQUOTED && /\s/.test(variable.path)) {
      unprovableExpansion = true;
      return "";
    }
    if (variable.insideMktempDirectory) {
      // The created path is only known to bash, so an unquoted expansion could split on whitespace in it.
      if (offset !== 0 || word.quoting[offset] !== DOUBLE) unprovableExpansion = true;
      insideMktempDirectory = true;
      mktempGuarded = variable.mktempGuarded;
    }
    return variable.path;
  });
  if (unprovableExpansion || /[$`]/.test(path) || path.startsWith("~")) return undefined;
  // Without errexit a failed `mktemp -d` leaves the variable empty and bash passes the suffix on its own, as
  // an absolute path from the filesystem root. Only an empty suffix is harmless then, because every command
  // rejects an empty operand.
  if (insideMktempDirectory && path !== "" && !mktempGuarded) return undefined;
  return { path, insideMktempDirectory, mktempGuarded };
}

/**
 * The single assignment a command is, or undefined when it is anything else. `viaExport` marks the
 * `export NAME=value` form: the exit status of that command is the builtin's, not the substitution's, so
 * `set -e` does not end the call when the substitution inside it fails.
 */
export function assignmentAt(
  words: readonly ShellToken[],
): { name: string; value: ShellToken; viaExport: boolean } | undefined {
  let i = 0;
  const viaExport = words[i]?.text === "export";
  if (viaExport) i += 1;
  const word = words[i];
  if (!word || words.length !== i + 1 || !isAssignment(word)) return undefined;
  return {
    name: word.text.slice(0, word.text.indexOf("=")),
    value: sliceWord(word, word.text.indexOf("=") + 1),
    viaExport,
  };
}

export function expandWord(word: Word, state: ShellState): ProofResult<ShellVariable> {
  const value = expandWordValue(word, state);
  return value ? proven(value) : unprovable("word expansion cannot be proven");
}
