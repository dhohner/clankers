import { BLOCK_REASON, type BlockDecision } from "./types.ts";
export { BLOCK_REASON, DESTRUCTIVE_APPROVAL_REASON } from "./types.ts";

export const BLOCKED_PATTERNS: readonly RegExp[] = [
  // Environment dump commands.
  /(^|[^A-Za-z0-9_./-])(\/usr\/bin\/|\/bin\/)?printenv([\s;|&<>"')]|$)/,
  /(^|[;&|({"']\s*)(\/usr\/bin\/|\/bin\/)?env(\s+(-[A-Za-z0-9]+|--[A-Za-z0-9-]+))*\s*([;|&)>"']|$)/,
  /(^|[;&|({"']\s*)export(\s+-p)?\s*([;|&)>"']|$)/,
  /(^|[;&|({"']\s*)declare\s+-[A-Za-z0-9]*x[A-Za-z0-9]*\s*([;|&)>"']|$)/,
  /(^|[;&|({"']\s*)set\s*([;|&)>"']|$)/,

  // Dotenv files frequently carry API keys. Keep example/template files usable.
  /(^|[\s;|&<>"'({])([^\s;|&<>"'()]*\/)?\.env(\.(local|development|production|staging|test))?([\s;|&<>"')}]|$)/,

  // Private keys, shell history, and common credential files.
  /(^|[\s;|&<>"'({])(~|\$HOME)?\/?\.ssh\/(id_[A-Za-z0-9_-]+|[^\s;|&<>"'()]+\.pem)([\s;|&<>"')}]|$)/,
  /(^|[\s;|&<>"'({])([^\s;|&<>"'()]+\/)?[^\s;|&<>"'()]+\.pem([\s;|&<>"')}]|$)/,
  /(^|[\s;|&<>"'({])(~|\$HOME)?\/?\.(bash_history|zsh_history|python_history|psql_history|mysql_history|git-credentials|netrc)([\s;|&<>"')}]|$)/,
  /(^|[\s;|&<>"'({])(~|\$HOME)?\/?\.(aws\/credentials|kube\/config|docker\/config\.json|npmrc)([\s;|&<>"')}]|$)/,
  /(^|[\s;|&<>"'({])(~|\$HOME)?\/?\.config\/gcloud\/(application_default_credentials\.json|credentials\.db)([\s;|&<>"')}]|$)/,
  /(^|[\s;|&<>"'({])(~|\$HOME)?\/?\.azure\/[^\s;|&<>"'()]+([\s;|&<>"')}]|$)/,

  // CLI commands whose primary output is a credential or auth material.
  /(^|[;&|({"']\s*)security\s+(find-generic-password|find-internet-password|dump-keychain)(\s|$)/,
  /(^|[;&|({"']\s*)gh\s+auth\s+token(\s|$)/,
  /(^|[;&|({"']\s*)gcloud\s+auth\s+print-(access-token|identity-token)(\s|$)/,
  /(^|[;&|({"']\s*)aws\s+configure\s+export-credentials(\s|$)/,
  /(^|[;&|({"']\s*)az\s+account\s+get-access-token(\s|$)/,
  /(^|[;&|({"']\s*)op\s+(read|item\s+get)(\s|$)/,
  /(^|[;&|({"']\s*)npm\s+token\s+(list|create)(\s|$)/,
];

export function matches(value: string, patterns: readonly RegExp[] = BLOCKED_PATTERNS): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

type ShellToken = { text: string; sep: boolean };

const ALWAYS_APPROVE_COMMANDS = new Set(["rm", "truncate", "dd", "mkfs"]);
const WRAPPERS = new Set(["command", "nice", "nohup", "sudo", "time"]);

// ponytail: shell-ish tokenizer, replace with a real parser if this becomes a hard sandbox boundary.
function shellTokens(value: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let text = "";

  const push = () => {
    if (text) tokens.push({ text, sep: false });
    text = "";
  };

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (!char) continue;

    if (/\s/.test(char)) {
      push();
      if (char === "\n") tokens.push({ text: char, sep: true });
      continue;
    }

    if (";&|(){}".includes(char)) {
      push();
      tokens.push({ text: char, sep: true });
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      for (i += 1; i < value.length && value[i] !== quote; i += 1) {
        if (quote === '"' && value[i] === "\\" && i + 1 < value.length) i += 1;
        text += value[i] ?? "";
      }
      continue;
    }

    if (char === "\\" && i + 1 < value.length) {
      i += 1;
      text += value[i] ?? "";
      continue;
    }

    text += char;
  }

  push();
  return tokens;
}

function commandName(token: string): string {
  return token.split("/").at(-1) ?? token;
}

function isAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function skipOptions(tokens: readonly ShellToken[], index: number): number {
  while (index < tokens.length && !tokens[index]?.sep && tokens[index]?.text.startsWith("-")) index += 1;
  return index;
}

function gitIsDestructive(args: readonly string[]): boolean {
  if (args[0] === "reset") return args.includes("--hard");
  if (args[0] === "clean") return args.some((arg) => /^-[A-Za-z]*f/.test(arg)) && args.some((arg) => /^-[A-Za-z]*d/.test(arg));
  if (args[0] === "push") return args.some((arg) => arg === "--force" || arg === "--force-with-lease");
  return false;
}

function hasRiskyPath(args: readonly string[]): boolean {
  return args.some((arg) => arg.startsWith("/") || /[*?[]/.test(arg) || /(^|\/)\.env(\.|$)|(^|\/)\.(ssh|aws|kube)(\/|$)/.test(arg));
}

function hasRecursiveOption(args: readonly string[]): boolean {
  return args.some((arg) => arg === "-R" || arg === "--recursive" || /^-[A-Za-z]*R/.test(arg));
}

function filteredArgs(args: readonly string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-"));
}

function commandNeedsApproval(name: string, args: readonly string[]): boolean {
  if (ALWAYS_APPROVE_COMMANDS.has(name)) return true;
  if (name === "mv") return args.some((arg) => /^-[A-Za-z]*f/.test(arg)) || filteredArgs(args).length !== 2 || hasRiskyPath(args);
  if (name === "chmod") return hasRecursiveOption(args) || /^(777|666|[augo]*\+w)$/.test(filteredArgs(args)[0] ?? "") || hasRiskyPath(args);
  if (name === "chown") return hasRecursiveOption(args) || /^(root|0)(:|$)/.test(filteredArgs(args)[0] ?? "") || hasRiskyPath(args);
  return false;
}

function commandAt(tokens: readonly ShellToken[], start: number): boolean {
  let i = start;
  while (isAssignment(tokens[i]?.text ?? "")) i += 1;

  while (i < tokens.length) {
    const name = commandName(tokens[i]?.text ?? "");
    if (name === "env") {
      i = skipOptions(tokens, i + 1);
      while (isAssignment(tokens[i]?.text ?? "")) i += 1;
      continue;
    }
    if (!WRAPPERS.has(name)) break;
    i = skipOptions(tokens, i + 1);
  }

  const name = commandName(tokens[i]?.text ?? "");

  const args: string[] = [];
  for (let j = i + 1; j < tokens.length && !tokens[j]?.sep; j += 1) args.push(tokens[j]?.text ?? "");

  if (commandNeedsApproval(name, args)) return true;
  if (name === "git") return gitIsDestructive(args);
  if (["bash", "sh", "zsh"].includes(name)) {
    const c = args.findIndex((arg) => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg));
    return c >= 0 && isDestructiveText(args[c + 1] ?? "");
  }
  if (name === "xargs") return commandAt(tokens, skipOptions(tokens, i + 1));
  if (name === "find") {
    return args.some((arg, offset) => ["-exec", "-execdir"].includes(arg) && commandAt(tokens, i + offset + 2));
  }

  return false;
}

export function isBlockedText(value: string): boolean {
  if (!value) return false;
  return matches(value);
}

export function isDestructiveText(value: string): boolean {
  if (!value) return false;
  const tokens = shellTokens(value);
  return tokens.some((token, index) => !token.sep && (index === 0 || tokens[index - 1]?.sep) && commandAt(tokens, index));
}

export function evaluateText(value: string): BlockDecision {
  if (!isBlockedText(value)) return { blocked: false };
  return { blocked: true, reason: BLOCK_REASON };
}
