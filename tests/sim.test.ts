import { describe, expect, it } from 'vitest';
import { compile, type CircuitPart } from '../src/core/netlist.ts';
import type { ModelSpec, PinRef } from '../src/core/types.ts';
import { Engine } from '../src/sim/engine.ts';
import { create as acsource } from '../src/sim/models/acsource.ts';
import { create as battery } from '../src/sim/models/battery.ts';
import { create as capacitor } from '../src/sim/models/capacitor.ts';
import { create as diode } from '../src/sim/models/diode.ts';
import { create as inductor } from '../src/sim/models/inductor.ts';
import { create as resistor } from '../src/sim/models/resistor.ts';
import { create as switchModel } from '../src/sim/models/switch.ts';
import { create as transformer } from '../src/sim/models/transformer.ts';
import { ratingWarnings } from '../src/sim/warnings.ts';

const factories = {
  acsource,
  battery,
  capacitor,
  diode,
  inductor,
  resistor,
  switch: switchModel,
  transformer,
};

function part(
  id: string,
  model: ModelSpec,
  pinCount = 2,
  ratings?: CircuitPart['ratings'],
): CircuitPart {
  return { id, label: id, model, pinCount, ratings };
}

const pin = (inst: string, p: number): PinRef => ({ inst, pin: p });
const wire = (a: PinRef, b: PinRef) => ({ a, b });

function run(parts: CircuitPart[], wires: { a: PinRef; b: PinRef }[], seconds: number) {
  const compiled = compile(parts, wires);
  const engine = new Engine(compiled, factories);
  const steps = Math.round(seconds / engine.dt);
  for (let i = 0; i < steps; i++) engine.step();
  const element = (id: string) => engine.elements[compiled.elementIndex.get(id)!];
  return { engine, compiled, element };
}

const nineVolt: ModelSpec = { type: 'battery', voltage: 9, internalResistance: 1e-3 };

describe('simulator', () => {
  it('splits 9 V in half across 2 equal resistors', () => {
    const { element } = run(
      [
        part('B1', nineVolt),
        part('R1', { type: 'resistor', resistance: 1000 }),
        part('R2', { type: 'resistor', resistance: 1000 }),
      ],
      [
        wire(pin('B1', 0), pin('R1', 0)),
        wire(pin('R1', 1), pin('R2', 0)),
        wire(pin('R2', 1), pin('B1', 1)),
      ],
      1e-4,
    );
    expect(element('R2').voltage).toBeCloseTo(4.5, 2);
    expect(element('R1').current).toBeCloseTo(4.5e-3, 5);
  });

  it('charges a capacitor to 63 % in 1 time constant', () => {
    const r = 1000;
    const c = 100e-6;
    const { element } = run(
      [
        part('B1', nineVolt),
        part('R1', { type: 'resistor', resistance: r }),
        part('C1', { type: 'capacitor', capacitance: c }),
      ],
      [
        wire(pin('B1', 0), pin('R1', 0)),
        wire(pin('R1', 1), pin('C1', 0)),
        wire(pin('C1', 1), pin('B1', 1)),
      ],
      r * c,
    );
    expect(element('C1').voltage).toBeCloseTo(9 * (1 - Math.exp(-1)), 1);
  });

  it('drives a red LED at about 2 V and 21 mA through 330 Ω', () => {
    const { element } = run(
      [
        part('B1', nineVolt),
        part('R1', { type: 'resistor', resistance: 330 }),
        part('D1', { type: 'diode', saturationCurrent: 1e-18, emission: 2 }),
      ],
      [
        wire(pin('B1', 0), pin('R1', 0)),
        wire(pin('R1', 1), pin('D1', 0)),
        wire(pin('D1', 1), pin('B1', 1)),
      ],
      1e-4,
    );
    expect(element('D1').voltage).toBeGreaterThan(1.9);
    expect(element('D1').voltage).toBeLessThan(2.1);
    expect(element('D1').current).toBeCloseTo((9 - element('D1').voltage) / 330, 4);
  });

  it('blocks current in a reversed diode', () => {
    const { element } = run(
      [
        part('B1', nineVolt),
        part('R1', { type: 'resistor', resistance: 330 }),
        part('D1', { type: 'diode', saturationCurrent: 2.52e-9, emission: 1.752 }),
      ],
      [
        wire(pin('B1', 0), pin('R1', 0)),
        wire(pin('R1', 1), pin('D1', 1)),
        wire(pin('D1', 0), pin('B1', 1)),
      ],
      1e-4,
    );
    expect(Math.abs(element('D1').current)).toBeLessThan(1e-8);
  });

  it('settles an inductor current at V / R', () => {
    const { element } = run(
      [
        part('B1', nineVolt),
        part('R1', { type: 'resistor', resistance: 100 }),
        part('L1', { type: 'inductor', inductance: 1e-3, resistance: 2 }),
      ],
      [
        wire(pin('B1', 0), pin('R1', 0)),
        wire(pin('R1', 1), pin('L1', 0)),
        wire(pin('L1', 1), pin('B1', 1)),
      ],
      1e-3,
    );
    expect(element('L1').current).toBeCloseTo(9 / 102, 4);
  });

  it('opens and closes a switch', () => {
    const { element, engine, compiled } = run(
      [
        part('B1', nineVolt),
        part('S1', { type: 'switch', closed: false }),
        part('R1', { type: 'resistor', resistance: 100 }),
      ],
      [
        wire(pin('B1', 0), pin('S1', 0)),
        wire(pin('S1', 1), pin('R1', 0)),
        wire(pin('R1', 1), pin('B1', 1)),
      ],
      1e-4,
    );
    expect(Math.abs(element('R1').current)).toBeLessThan(1e-6);
    compiled.elements[compiled.elementIndex.get('S1')!].model = { type: 'switch', closed: true };
    engine.step();
    expect(element('R1').current).toBeCloseTo(0.09, 3);
  });

  it('steps 12 V AC down to about 1.2 V with a 10:1 transformer', () => {
    const { engine, element } = run(
      [
        part('V1', { type: 'acsource', amplitude: 12, frequency: 50, internalResistance: 0.5 }),
        part(
          'T1',
          { type: 'transformer', primaryInductance: 10, turnsRatio: 0.1, coupling: 0.999 },
          4,
        ),
        part('R1', { type: 'resistor', resistance: 1000 }),
      ],
      [
        wire(pin('V1', 0), pin('T1', 0)),
        wire(pin('V1', 1), pin('T1', 1)),
        wire(pin('T1', 2), pin('R1', 0)),
        wire(pin('T1', 3), pin('R1', 1)),
      ],
      0.06,
    );
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      engine.step();
      peak = Math.max(peak, Math.abs(element('R1').voltage));
    }
    expect(peak).toBeGreaterThan(1.1);
    expect(peak).toBeLessThan(1.25);
  });

  it('keeps a floating part solvable', () => {
    const { element } = run(
      [
        part('B1', nineVolt),
        part('R1', { type: 'resistor', resistance: 1000 }),
        part('R2', { type: 'resistor', resistance: 1000 }),
      ],
      [wire(pin('B1', 0), pin('R1', 0)), wire(pin('R1', 1), pin('B1', 1))],
      1e-4,
    );
    expect(element('R1').voltage).toBeCloseTo(9, 2);
    expect(element('R2').voltage).toBe(0);
  });

  it('warns when a resistor goes over its power rating', () => {
    const { compiled, engine } = run(
      [
        part('B1', nineVolt),
        part('R1', { type: 'resistor', resistance: 100 }, 2, { maxPower: 0.25 }),
      ],
      [wire(pin('B1', 0), pin('R1', 0)), wire(pin('R1', 1), pin('B1', 1))],
      1e-4,
    );
    const warnings = ratingWarnings(compiled.elements, engine.elements);
    expect(warnings.some((w) => w.startsWith('R1: power'))).toBe(true);
  });
});
