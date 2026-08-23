export const SAFETY_EVALUATION_BLOCK_PREFIX =
  "Destructive command blocked because its safety assessment is unavailable";
export const SAFETY_EVALUATION_CANCELLED_REASON = `${SAFETY_EVALUATION_BLOCK_PREFIX}: the safety evaluation was cancelled.`;
export const MAX_ASSESSMENT_FIELD_LENGTH = 500;

export type SafetyVerdict = "safe" | "unsafe" | "uncertain";

export type SafetyAssessment = {
  verdict: SafetyVerdict;
  intent: string;
  reason: string;
};

export type SafetyEvaluation = { ok: true; assessment: SafetyAssessment } | { ok: false; reason: string };

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;

function parseFlatStringRecord(text: string): Map<string, string> | undefined {
  let position = 0;

  const skipWhitespace = () => {
    while (position < text.length && /[ \t\r\n]/.test(text[position]!)) position += 1;
  };

  const parseString = (): string | undefined => {
    if (text[position] !== '"') return undefined;
    const start = position;
    position += 1;
    while (position < text.length) {
      const char = text[position];
      if (char === "\\") {
        position += 2;
        continue;
      }
      position += 1;
      if (char === '"') {
        try {
          const decoded: unknown = JSON.parse(text.slice(start, position));
          return typeof decoded === "string" ? decoded : undefined;
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  };

  skipWhitespace();
  if (text[position] !== "{") return undefined;
  position += 1;

  const record = new Map<string, string>();
  skipWhitespace();
  if (text[position] === "}") {
    position += 1;
  } else {
    for (;;) {
      skipWhitespace();
      const key = parseString();
      if (key === undefined || record.has(key)) return undefined;
      skipWhitespace();
      if (text[position] !== ":") return undefined;
      position += 1;
      skipWhitespace();
      const value = parseString();
      if (value === undefined) return undefined;
      record.set(key, value);
      skipWhitespace();
      if (text[position] === ",") {
        position += 1;
        continue;
      }
      if (text[position] === "}") {
        position += 1;
        break;
      }
      return undefined;
    }
  }

  skipWhitespace();
  return position === text.length ? record : undefined;
}

function validatedField(record: Map<string, string>, key: string): string | undefined {
  const value = record.get(key)?.trim();
  if (!value || value.length > MAX_ASSESSMENT_FIELD_LENGTH || CONTROL_CHARACTERS.test(value)) return undefined;
  return value;
}

/** Strictly decodes the evaluator's bounded, flat JSON response for safe dialog rendering. */
export function parseSafetyAssessment(text: string): SafetyAssessment | undefined {
  const record = parseFlatStringRecord(text);
  if (!record || record.size !== 3 || !record.has("verdict") || !record.has("intent") || !record.has("reason")) {
    return undefined;
  }

  const verdict = record.get("verdict");
  if (verdict !== "safe" && verdict !== "unsafe" && verdict !== "uncertain") return undefined;

  const intent = validatedField(record, "intent");
  const reason = validatedField(record, "reason");
  if (intent === undefined || reason === undefined) return undefined;
  return { verdict, intent, reason };
}

export function formatSafetyAssessment(assessment: SafetyAssessment): string {
  return `Verdict: ${assessment.verdict}\nIntent: ${assessment.intent}\nReason: ${assessment.reason}`;
}
