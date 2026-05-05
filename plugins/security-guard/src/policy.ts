import { BLOCK_REASON, type BlockDecision } from "./types.ts";
export { BLOCK_REASON } from "./types.ts";

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

export function isBlockedText(value: string): boolean {
  if (!value) return false;
  return matches(value);
}

export function evaluateText(value: string): BlockDecision {
  if (!isBlockedText(value)) return { blocked: false };
  return { blocked: true, reason: BLOCK_REASON };
}
