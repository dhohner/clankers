import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CreateFlowUi } from "./create-flow.ts";
import type { StatusTheme } from "./status.ts";

export type NotifyLevel = "info" | "warning" | "error";

export type StyleAutocompleteItem = {
  value: string;
  label: string;
  description?: string;
};

/** The Pi context members used by this plugin. */
export type StyleExtensionContext = {
  hasUI: boolean;
  cwd: string;
  isProjectTrusted(): boolean;
  ui: CreateFlowUi & {
    notify(message: string, type?: NotifyLevel): void;
    setStatus(key: string, text: string | undefined): void;
    readonly theme: StatusTheme;
  };
};

/** The Pi registration surface used by this plugin and implemented by its test harness. */
export type StyleExtensionApi = {
  registerFlag(name: string, options: { description?: string; type: "boolean" | "string" }): void;
  getFlag(name: string): boolean | string | undefined;
  registerCommand(
    name: string,
    options: {
      description?: string;
      getArgumentCompletions?: (
        argumentPrefix: string,
      ) => StyleAutocompleteItem[] | null | Promise<StyleAutocompleteItem[] | null>;
      handler: (args: string, ctx: StyleExtensionContext) => Promise<void>;
    },
  ): void;
  registerShortcut(
    shortcut: string,
    options: { description?: string; handler: (ctx: StyleExtensionContext) => Promise<void> | void },
  ): void;
  on(
    event: "session_start",
    handler: (event: { type: "session_start" }, ctx: StyleExtensionContext) => Promise<void> | void,
  ): void;
  on(
    event: "before_agent_start",
    handler: (
      event: { systemPrompt: string },
      ctx: StyleExtensionContext,
    ) => Promise<{ systemPrompt?: string } | undefined>,
  ): void;
};

/** Compilation fails if the host no longer supplies a required member. */
type AssertAssignable<Source extends Target, Target> = Source;

type _PiApiIsCompatible = AssertAssignable<ExtensionAPI, StyleExtensionApi>;

type _PiContextIsCompatible = AssertAssignable<ExtensionContext, StyleExtensionContext>;
