import type { ModelSpec, ModelType } from './types.ts';

/** Terminal names for each model, in pin order. Shape builders return pins in this order. */
const TERMINALS: Record<Exclude<ModelType, 'none'>, string[]> = {
  resistor: ['a', 'b'],
  capacitor: ['+', '-'],
  inductor: ['a', 'b'],
  battery: ['+', '-'],
  acsource: ['+', '-'],
  diode: ['anode', 'cathode'],
  switch: ['a', 'b'],
  transformer: ['p1', 'p2', 's1', 's2'],
};

export function terminals(model: ModelSpec): string[] {
  return model.type === 'none' ? model.pins : TERMINALS[model.type];
}

export function isModelType(type: unknown): type is ModelType {
  return type === 'none' || (typeof type === 'string' && type in TERMINALS);
}
