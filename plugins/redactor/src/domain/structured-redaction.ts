/** Treat unexpected runtime values as data so they cannot bypass redaction. */
export type Shape =
  | { readonly kind: "data" }
  | { readonly kind: "identifier" }
  | { readonly kind: "object"; readonly fields: Readonly<Record<string, Shape>>; readonly rest: RestShape }
  | { readonly kind: "array"; readonly items: Shape }
  | {
      readonly kind: "variants";
      readonly by: string;
      readonly options: Readonly<Record<string, Shape>>;
      readonly fallback: Shape;
    }
  | { readonly kind: "oneOf"; readonly alternatives: readonly Shape[] }
  | { readonly kind: "lazy"; readonly resolve: () => Shape };

export interface RestShape {
  readonly names: "keep" | "redact";
  readonly shape: Shape;
}

export const data: Shape = { kind: "data" };

/**
 * Preserve primitive protocol values that receivers use to route or pair data.
 * These include roles, block types, call ids, tool names, and schema keywords.
 * Treat structures in these positions as data.
 */
export const identifier: Shape = { kind: "identifier" };

const DATA_REST: RestShape = { names: "redact", shape: data };

export function object(fields: Readonly<Record<string, Shape>>, rest: RestShape = DATA_REST): Shape {
  return { kind: "object", fields, rest };
}

export function array(items: Shape): Shape {
  return { kind: "array", items };
}

export function variants(by: string, options: Readonly<Record<string, Shape>>, fallback: Shape = data): Shape {
  return { kind: "variants", by, options, fallback };
}

export function oneOf(...alternatives: readonly Shape[]): Shape {
  return { kind: "oneOf", alternatives };
}

export function lazy(resolve: () => Shape): Shape {
  return { kind: "lazy", resolve };
}

export type ValueRedactor = <V>(value: V) => V;

export function redactByShape<T>(value: T, shape: Shape, redactValue: ValueRedactor): T {
  return visit(value, shape, redactValue, new Set()) as T;
}

function visit(value: unknown, shape: Shape, redactValue: ValueRedactor, ancestors: Set<object>): unknown {
  switch (shape.kind) {
    case "data":
      return redactValue(value);
    case "identifier":
      return isPrimitive(value) ? value : redactValue(value);
    case "lazy":
      return visit(value, shape.resolve(), redactValue, ancestors);
    case "oneOf": {
      const alternative = shape.alternatives.find((candidate) => fits(value, candidate));
      return alternative ? visit(value, alternative, redactValue, ancestors) : redactValue(value);
    }
    case "array":
      if (!Array.isArray(value)) return redactValue(value);
      return withAncestor(value, ancestors, () =>
        value.map((item) => visit(item, shape.items, redactValue, ancestors)),
      );
    case "variants": {
      if (!isPlainObject(value)) return redactValue(value);
      const discriminant = value[shape.by];
      const option = typeof discriminant === "string" ? shape.options[discriminant] : undefined;
      if (!option) return visit(value, shape.fallback, redactValue, ancestors);
      return visit(value, withIdentifier(option, shape.by), redactValue, ancestors);
    }
    case "object":
      if (!isPlainObject(value)) return redactValue(value);
      return withAncestor(value, ancestors, () => visitObject(value, shape, redactValue, ancestors));
  }
}

function visitObject(
  value: Record<string, unknown>,
  shape: Extract<Shape, { kind: "object" }>,
  redactValue: ValueRedactor,
  ancestors: Set<object>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const known = Object.hasOwn(shape.fields, key);
    const itemShape = known ? shape.fields[key]! : shape.rest.shape;
    const name = known || shape.rest.names === "keep" ? key : redactValue(key);
    if (Object.hasOwn(copy, name)) throw new Error("redacting property names produced a duplicate name");
    // Use `defineProperty` so names such as `__proto__` remain own properties.
    Object.defineProperty(copy, name, {
      value: visit(item, itemShape, redactValue, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

/** Preserve an undeclared variant discriminant because it selects the protocol shape. */
function withIdentifier(option: Shape, by: string): Shape {
  if (option.kind !== "object" || Object.hasOwn(option.fields, by)) return option;
  return { ...option, fields: { ...option.fields, [by]: identifier } };
}

function fits(value: unknown, shape: Shape): boolean {
  switch (shape.kind) {
    case "data":
      return true;
    case "identifier":
      return isPrimitive(value);
    case "array":
      return Array.isArray(value);
    case "object":
    case "variants":
      return isPlainObject(value);
    case "oneOf":
      return shape.alternatives.some((alternative) => fits(value, alternative));
    case "lazy":
      return fits(value, shape.resolve());
  }
}

function withAncestor<T>(value: object, ancestors: Set<object>, run: () => T): T {
  if (ancestors.has(value)) throw new Error("structure contains a cycle");
  ancestors.add(value);
  try {
    return run();
  } finally {
    ancestors.delete(value);
  }
}

function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
