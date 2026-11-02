import { isModelType, terminals } from './models.ts';
import type { Category, ModelSpec, ModelType, ShapeKind, ShapeSpec } from './types.ts';

export const CATEGORIES: Record<Category, string> = {
  passive: 'Passive',
  semiconductor: 'Semiconductors',
  source: 'Sources',
  control: 'Controls',
  ic: 'Integrated circuits',
};

/** Positive numeric fields that each shape kind needs. */
const SHAPE_FIELDS: Record<ShapeKind, string[]> = {
  axial: ['bodyLength', 'bodyRadius', 'pitch'],
  radial: ['radius', 'height', 'pitch'],
  disc: ['radius', 'thickness', 'pitch'],
  coil: ['radius', 'length', 'turns', 'pitch'],
  led: ['radius', 'pitch'],
  transformer: ['width', 'height', 'depth'],
  battery: ['length', 'width', 'height'],
  cell: ['length', 'radius'],
  switch: ['length', 'width', 'height', 'pitch'],
  dip: ['pins'],
  to92: [],
  custom: [],
};

/** Positive numeric fields that each model type needs. */
const MODEL_FIELDS: Record<ModelType, string[]> = {
  resistor: ['resistance'],
  capacitor: ['capacitance'],
  inductor: ['inductance'],
  battery: ['voltage', 'internalResistance'],
  acsource: ['amplitude', 'frequency', 'internalResistance'],
  diode: ['saturationCurrent', 'emission'],
  switch: [],
  transformer: ['primaryInductance', 'turnsRatio', 'coupling'],
  none: [],
};

const FIXED_PIN_COUNT: Partial<Record<ShapeKind, number>> = { transformer: 4, to92: 3 };

export function shapePinCount(shape: ShapeSpec): number {
  if (shape.kind === 'dip') return shape.pins;
  if (shape.kind === 'custom') return shape.pins.length;
  return FIXED_PIN_COUNT[shape.kind] ?? 2;
}

const isPositive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isVec3 = (value: unknown) =>
  Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));
const isText = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/** Returns a list of problems. An empty list means the part is valid. */
export function validate(part: unknown): string[] {
  const errors: string[] = [];
  if (typeof part !== 'object' || part === null) return ['The part must be a JSON object.'];
  const p = part as Record<string, unknown>;
  const at = typeof p.id === 'string' ? p.id : '(no id)';
  const fail = (message: string) => errors.push(`${at}: ${message}`);

  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(p.id)) {
    fail('"id" must be 2 to 64 lowercase letters, digits or hyphens.');
  }
  if (!isText(p.name, 80)) fail('"name" must be text of 1 to 80 characters.');
  if (typeof p.category !== 'string' || !(p.category in CATEGORIES)) {
    fail(`"category" must be one of: ${Object.keys(CATEGORIES).join(', ')}.`);
  }
  if (!Number.isInteger(p.version)) fail('"version" must be a whole number.');
  if (!isText(p.symbol, 40)) fail('"symbol" must name a schematic symbol.');

  const learn = p.learn as Record<string, unknown> | undefined;
  if (!learn || !isText(learn.summary, 400))
    fail('"learn.summary" must be text of 1 to 400 characters.');
  if (
    learn?.tips !== undefined &&
    !(Array.isArray(learn.tips) && learn.tips.every((t) => isText(t, 300)))
  ) {
    fail('"learn.tips" must be a list of texts.');
  }

  const shape = p.shape as Record<string, unknown> | undefined;
  const shapeOk = !!shape && typeof shape.kind === 'string' && shape.kind in SHAPE_FIELDS;
  if (!shapeOk) {
    fail(`"shape.kind" must be one of: ${Object.keys(SHAPE_FIELDS).join(', ')}.`);
  } else {
    for (const field of SHAPE_FIELDS[shape.kind as ShapeKind]) {
      if (!isPositive(shape[field])) fail(`"shape.${field}" must be a positive number.`);
    }
    if (
      shape.kind === 'dip' &&
      (!Number.isInteger(shape.pins) || (shape.pins as number) % 2 !== 0)
    ) {
      fail('"shape.pins" must be an even whole number.');
    }
    if (shape.kind === 'custom') {
      const primitives = shape.primitives;
      if (!Array.isArray(primitives) || primitives.length === 0) {
        fail('"shape.primitives" must be a list of at least 1 primitive.');
      } else {
        primitives.forEach((item: Record<string, unknown>, i) => {
          if (!['box', 'cylinder', 'sphere'].includes(item?.type as string)) {
            fail(`"shape.primitives[${i}].type" must be box, cylinder or sphere.`);
          }
          if (!isVec3(item?.size) || !isVec3(item?.position)) {
            fail(`"shape.primitives[${i}]" needs "size" and "position" as 3 numbers each.`);
          }
        });
      }
      if (!Array.isArray(shape.pins) || !shape.pins.every(isVec3)) {
        fail('"shape.pins" must be a list of positions with 3 numbers each.');
      }
    }
  }

  const model = p.model as Record<string, unknown> | undefined;
  const modelOk = !!model && isModelType(model.type);
  if (!modelOk) {
    fail('"model.type" is not a known model.');
  } else {
    for (const field of MODEL_FIELDS[model.type as ModelType]) {
      if (!isPositive(model[field])) fail(`"model.${field}" must be a positive number.`);
    }
    if (model.type === 'transformer' && (model.coupling as number) > 0.9999) {
      fail('"model.coupling" must be 0.9999 or less.');
    }
    if (
      model.type === 'none' &&
      !(Array.isArray(model.pins) && model.pins.every((n) => isText(n, 12)))
    ) {
      fail('"model.pins" must be a list of pin names.');
    }
  }

  if (shapeOk && modelOk && errors.length === 0) {
    const pinCount = shapePinCount(shape as ShapeSpec);
    const terminalCount = terminals(model as ModelSpec).length;
    if (pinCount !== terminalCount) {
      fail(`the shape has ${pinCount} pins, but the model needs ${terminalCount}.`);
    }
  }

  if (p.markings !== undefined) {
    const ok = Array.isArray(p.markings) && p.markings.every((m) => isText(m?.text, 24));
    if (!ok) fail('"markings" must be a list of { "text": ... } with 1 to 24 characters each.');
  }
  return errors;
}
