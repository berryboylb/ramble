import type { PartDef, PartInput } from './types.ts';

export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merges `over` onto `base`. Objects merge key by key. Arrays and plain values replace. */
export function deepMerge(base: Json, over: Json): Json {
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = isObject(value) && isObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * Resolves the `extends` chain of a part. The result has no `extends` field.
 * Throws when a base part is missing or the chain has a cycle.
 */
export function resolvePart(
  input: PartInput,
  getInput: (id: string) => PartInput | undefined,
): PartDef {
  const chain: PartInput[] = [input];
  const seen = new Set([input.id]);
  let base = input.extends;
  while (base) {
    if (seen.has(base)) throw new Error(`${input.id}: "extends" makes a cycle through "${base}".`);
    seen.add(base);
    const next = getInput(base);
    if (!next) throw new Error(`${input.id}: base part "${base}" does not exist.`);
    chain.unshift(next);
    base = next.extends;
  }
  let merged: Json = {};
  for (const part of chain) merged = deepMerge(merged, part as Json);
  merged.id = input.id;
  delete merged.extends;
  return merged as unknown as PartDef;
}
