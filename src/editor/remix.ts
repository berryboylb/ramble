import { isObject, type Json } from '../core/resolve.ts';
import type { PartDef, PartInput } from '../core/types.ts';

// Editor only (tier 6): how a remix stores only its changes.

/**
 * Returns only the parts of `next` that differ from `base`, so a remix stores its changes only.
 * Objects compare key by key. Arrays and plain values compare as a whole.
 */
export function diff(base: Json, next: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(next)) {
    const before = base[key];
    if (isObject(value) && isObject(before)) {
      const inner = diff(before, value);
      if (Object.keys(inner).length > 0) out[key] = inner;
    } else if (JSON.stringify(value) !== JSON.stringify(before)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * The smallest remix of `base` that resolves to `part`.
 * With a new shape kind or model type, a merge would mix the fields of 2 kinds.
 * Then the result is the full part with no `extends`.
 */
export function remixOf(part: PartDef, base: PartDef): PartInput {
  if (part.shape.kind !== base.shape.kind || part.model.type !== base.model.type) return part;
  const changes = diff(base as unknown as Json, part as unknown as Json);
  // Keep the discriminant fields, so the remix file is readable on its own.
  if (changes.model) (changes.model as Json).type = part.model.type;
  if (changes.shape) (changes.shape as Json).kind = part.shape.kind;
  return { ...changes, id: part.id, extends: base.id } as PartInput;
}
