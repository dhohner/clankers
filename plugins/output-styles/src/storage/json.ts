export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

/** JSON.parse guarantees JSON values; the root must additionally be an object. */
export function parseJsonObject(content: string): JsonObject {
  const parsed: unknown = JSON.parse(content);

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the root at the JSON input boundary.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("settings file does not hold a JSON object");
  }

  // SAFETY: JSON.parse produced only JSON values, and the root above is a non-null object, excluding arrays.
  return parsed as JsonObject;
}
