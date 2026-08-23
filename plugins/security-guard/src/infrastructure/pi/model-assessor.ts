import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  parseSafetyAssessment,
  SAFETY_EVALUATION_BLOCK_PREFIX,
  SAFETY_EVALUATION_CANCELLED_REASON,
  type SafetyEvaluation,
} from "../../policy/assessment/assessment-codec.ts";
import { EVALUATOR_SYSTEM_PROMPT, evaluatorInput } from "../../policy/assessment/assessment-prompt.ts";

export const SAFETY_EVALUATOR_PROVIDERS = ["openai", "openai-codex", "github-copilot"] as const;
export const SAFETY_EVALUATOR_PROVIDER = SAFETY_EVALUATOR_PROVIDERS[0];
export const SAFETY_EVALUATOR_MODEL_ID = "gpt-5.6-luna";
export const SAFETY_EVALUATION_WORKING_MESSAGE = "Evaluating command safety...";
export const SAFETY_EVALUATION_TIMEOUT_MS = 60_000;

export type SafetyEvaluatorRegistry = Pick<ModelRegistry, "find" | "hasConfiguredAuth" | "complete">;

export type SafetyEvaluationRequest = {
  command: string;
  workingDirectory: string;
  registry: SafetyEvaluatorRegistry;
  signal?: AbortSignal;
};

function blocked(detail: string): SafetyEvaluation {
  return { ok: false, reason: `${SAFETY_EVALUATION_BLOCK_PREFIX}: ${detail}.` };
}

function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) return "unknown error";
  return compact.length > 200 ? `${compact.slice(0, 200)}...` : compact;
}

type EvaluatorModel = NonNullable<ReturnType<SafetyEvaluatorRegistry["find"]>>;
type EvaluatorModelSelection = { ok: true; model: EvaluatorModel } | { ok: false; detail: string };

function selectEvaluatorModel(registry: SafetyEvaluatorRegistry): EvaluatorModelSelection {
  const failures: string[] = [];

  for (const provider of SAFETY_EVALUATOR_PROVIDERS) {
    let model: ReturnType<SafetyEvaluatorRegistry["find"]>;
    try {
      model = registry.find(provider, SAFETY_EVALUATOR_MODEL_ID);
    } catch (error) {
      failures.push(`${provider}: the model lookup failed (${describeError(error)})`);
      continue;
    }
    if (!model) {
      failures.push(`${provider}: the model is not available`);
      continue;
    }

    let hasAuth: boolean;
    try {
      hasAuth = registry.hasConfiguredAuth(model);
    } catch (error) {
      failures.push(`${provider}: the authentication check failed (${describeError(error)})`);
      continue;
    }
    if (!hasAuth) {
      failures.push(`${provider}: no authentication is configured`);
      continue;
    }
    return { ok: true, model };
  }

  return { ok: false, detail: `no provider can serve ${SAFETY_EVALUATOR_MODEL_ID} - ${failures.join("; ")}` };
}

type EvaluatorResponse = Awaited<ReturnType<ModelRegistry["complete"]>>;

function responseText(response: EvaluatorResponse): string | undefined {
  const content = response.content ?? [];
  if (content.some((item) => item.type === "toolCall")) return undefined;
  const text = content
    .filter((item): item is Extract<(typeof content)[number], { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
  return text === "" ? undefined : text;
}

/** Calls the fixed Pi evaluator model once and converts every adapter failure into a closed result. */
export async function evaluateCommandSafety(request: SafetyEvaluationRequest): Promise<SafetyEvaluation> {
  const { command, workingDirectory, registry, signal } = request;
  const selection = selectEvaluatorModel(registry);
  if (!selection.ok) return blocked(selection.detail);

  let response: EvaluatorResponse;
  try {
    response = await registry.complete(
      selection.model,
      {
        systemPrompt: EVALUATOR_SYSTEM_PROMPT,
        messages: [{ role: "user", content: evaluatorInput(command, workingDirectory), timestamp: Date.now() }],
      },
      { reasoningEffort: "high", timeoutMs: SAFETY_EVALUATION_TIMEOUT_MS, signal },
    );
  } catch (error) {
    if (signal?.aborted) return { ok: false, reason: SAFETY_EVALUATION_CANCELLED_REASON };
    return blocked(`the safety evaluation request failed (${describeError(error)})`);
  }

  if (response.stopReason === "aborted") return { ok: false, reason: SAFETY_EVALUATION_CANCELLED_REASON };
  if (response.stopReason !== "stop") {
    const detail = response.errorMessage ? describeError(response.errorMessage) : `stop reason "${response.stopReason}"`;
    return blocked(`the safety evaluation did not complete (${detail})`);
  }

  const text = responseText(response);
  if (text === undefined) return blocked("the evaluator returned no usable text output");
  const assessment = parseSafetyAssessment(text);
  return assessment ? { ok: true, assessment } : blocked("the evaluator response was not a valid assessment");
}
