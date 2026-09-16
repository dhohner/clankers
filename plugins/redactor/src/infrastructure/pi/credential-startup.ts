import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CredentialSources } from "../../application/credential-sources.ts";
import type { Selection } from "../../domain/credential-selection.ts";
import { SelectionFile } from "../node/selection-file.ts";
import { availability, describeFailure, noticeLevel } from "./credential-command.ts";

export interface CredentialStartupOptions {
  projectConfigPath: (cwd: string) => string;
}

const APPROVAL_TITLE = "Add credential from project configuration?";

/**
 * Load user selections at every session start, then offer project proposals one at a time.
 * A proposal needs the interactive terminal and an explicit yes; trust alone, RPC, print, and JSON add nothing.
 * An explicit no is remembered for the process, so later sessions do not ask again; a cancelled dialog is not.
 * Pi keeps this extension instance across session replacements, so an approval outlives the session that gave it
 * and lasts until the process exits; persisting a proposal stays a user command.
 */
export function registerCredentialStartup(
  pi: ExtensionAPI,
  sources: CredentialSources,
  options: CredentialStartupOptions,
): void {
  pi.on("session_start", async (_event, ctx) => {
    for (const problem of sources.load().problems) ctx.ui.notify(`redactor: ${problem}`, "error");
    if (!ctx.isProjectTrusted()) return;
    const proposals = readProposals(sources, options.projectConfigPath(ctx.cwd), ctx);
    if (proposals.length === 0) return;
    if (ctx.mode !== "tui") {
      ctx.ui.notify(
        `redactor: the project configuration proposes ${proposals.length} credential selection(s); approval requires the interactive terminal, so none were added`,
        "info",
      );
      return;
    }
    for (const proposal of proposals) await offerProposal(sources, proposal, ctx);
  });
}

function readProposals(sources: CredentialSources, path: string, ctx: ExtensionContext): Selection[] {
  try {
    return sources.proposalsFrom(new SelectionFile(path));
  } catch {
    ctx.ui.notify("redactor: the project credential configuration is invalid and was ignored", "warning");
    return [];
  }
}

/**
 * The dialog shows only a name and label that passed the text checks; the variable is read after approval, when
 * `approve` also refuses a label that contains its value.
 */
async function offerProposal(sources: CredentialSources, proposal: Selection, ctx: ExtensionContext): Promise<void> {
  try {
    sources.assertNameAndLabel(proposal.name, proposal.label);
  } catch (error) {
    ctx.ui.notify(`${describeFailure(error)}; the project proposal was not offered`, "error");
    return;
  }
  const approved = await ctx.ui.confirm(
    APPROVAL_TITLE,
    [
      `${proposal.name} (${proposal.label})`,
      "",
      "Approving loads this variable's value from the running Pi process and keeps it active until Pi exits, including in later sessions of this process.",
      `Run /redactor add ${proposal.name} ${proposal.label} to keep it in your user configuration.`,
    ].join("\n"),
    { signal: ctx.signal },
  );
  if (approved === false) sources.decline(proposal.name);
  if (approved !== true) return;
  try {
    const binding = sources.approve(proposal);
    const status = binding.state === "active" ? "active until Pi exits" : availability(binding);
    ctx.ui.notify(
      `redactor: added ${proposal.name} (${proposal.label}) from the project; ${status}`,
      noticeLevel(binding),
    );
  } catch (error) {
    ctx.ui.notify(describeFailure(error), "error");
  }
}
