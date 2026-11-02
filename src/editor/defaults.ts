import type { ModelSpec, ModelType, PartDef, ShapeKind, ShapeSpec } from '../core/types.ts';

// Start values when the user picks a new shape kind or model type in the editor.

export const SHAPE_DEFAULTS: Record<ShapeKind, ShapeSpec> = {
  axial: { kind: 'axial', bodyLength: 6.3, bodyRadius: 1.2, pitch: 10.16, color: '#d9c39a' },
  radial: { kind: 'radial', radius: 3, height: 8, pitch: 2.54, color: '#1f3f7a' },
  disc: { kind: 'disc', radius: 2.5, thickness: 1.2, pitch: 5.08, color: '#d98c3a' },
  coil: {
    kind: 'coil',
    radius: 3,
    length: 6,
    turns: 12,
    pitch: 5.08,
    color: '#3a3a3a',
    wire: '#b87333',
  },
  led: { kind: 'led', radius: 2.5, pitch: 2.54, color: '#ff3030' },
  transformer: { kind: 'transformer', width: 22, height: 18, depth: 14, color: '#4a4f57' },
  battery: { kind: 'battery', length: 48.5, width: 26.5, height: 17.5, color: '#2b2b2b' },
  cell: { kind: 'cell', length: 50.5, radius: 7.25, color: '#2a6fdb' },
  switch: { kind: 'switch', length: 8.6, width: 4.4, height: 3.6, pitch: 5.08, color: '#9aa0a8' },
  dip: { kind: 'dip', pins: 8, color: '#1a1a1a' },
  to92: { kind: 'to92', color: '#1a1a1a' },
  custom: {
    kind: 'custom',
    primitives: [{ type: 'box', size: [8, 4, 4], position: [0, 3, 0], color: '#4a6fa5' }],
    pins: [
      [-5.08, 0, 0],
      [5.08, 0, 0],
    ],
  },
};

export const MODEL_DEFAULTS: Record<ModelType, ModelSpec> = {
  resistor: { type: 'resistor', resistance: 1000 },
  capacitor: { type: 'capacitor', capacitance: 1e-6 },
  inductor: { type: 'inductor', inductance: 1e-3, resistance: 1 },
  battery: { type: 'battery', voltage: 9, internalResistance: 1 },
  acsource: { type: 'acsource', amplitude: 5, frequency: 50, internalResistance: 1 },
  diode: { type: 'diode', saturationCurrent: 2.52e-9, emission: 1.752 },
  switch: { type: 'switch', closed: false },
  transformer: { type: 'transformer', primaryInductance: 10, turnsRatio: 0.1, coupling: 0.999 },
  none: { type: 'none', pins: ['1', '2'] },
};

/** The start of a new part: a box with 2 pins that acts as a resistor. */
export function newPart(id: string): PartDef {
  return {
    id,
    name: 'My part',
    category: 'passive',
    version: 1,
    symbol: 'resistor',
    shape: structuredClone(SHAPE_DEFAULTS.custom),
    model: structuredClone(MODEL_DEFAULTS.resistor),
    learn: { summary: 'Describe what this part does.' },
  };
}
