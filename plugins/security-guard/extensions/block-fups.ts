import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const BLOCK_REASON =
  "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history.";

type ToolCallEvent = {
  toolName?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
};

type UserBashEvent = {
  command?: string;
};

const BLOCKED_PATTERNS = [
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

function getToolInput(event: ToolCallEvent): Record<string, unknown> {
  return event.input ?? event.args ?? {};
}

function getString(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") return value;
  }

  return "";
}

function matches(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function isBlockedText(value: string): boolean {
  if (!value) return false;

  return matches(value, BLOCKED_PATTERNS);
}

export default function securityGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    const toolEvent = event as ToolCallEvent;
    const toolName = toolEvent.toolName ?? "";
    const input = getToolInput(toolEvent);

    if (toolName === "bash") {
      const command = getString(input, ["command"]);
      if (isBlockedText(command)) {
        return { block: true, reason: BLOCK_REASON };
      }
    }

    if (toolName === "read") {
      const path = getString(input, ["path", "file", "filePath"]);
      if (isBlockedText(path)) {
        return { block: true, reason: BLOCK_REASON };
      }
    }

    return undefined;
  });

  pi.on("user_bash", async (event) => {
    const userBashEvent = event as UserBashEvent;
    const command = userBashEvent.command ?? "";
    if (!isBlockedText(command)) return undefined;

    return {
      result: {
        output: BLOCK_REASON,
        exitCode: 2,
        cancelled: false,
        truncated: false,
      },
    };
  });
}
