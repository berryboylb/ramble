import { describe, expect, it } from 'vitest';
import { compile } from '../src/core/netlist.ts';

const resistor = { type: 'resistor', resistance: 100 } as const;

describe('netlist', () => {
  it('joins wired pins into 1 node and makes the battery negative pin ground', () => {
    const compiled = compile(
      [
        { id: 'R1', label: 'R1', model: resistor, pinCount: 2 },
        {
          id: 'B1',
          label: 'B1',
          model: { type: 'battery', voltage: 9, internalResistance: 1 },
          pinCount: 2,
        },
      ],
      [
        { a: { inst: 'B1', pin: 0 }, b: { inst: 'R1', pin: 0 } },
        { a: { inst: 'R1', pin: 1 }, b: { inst: 'B1', pin: 1 } },
      ],
    );
    expect(compiled.nodeCount).toBe(2);
    expect(compiled.pinNodes.get('B1:1')).toBe(0);
    expect(compiled.pinNodes.get('R1:1')).toBe(0);
    expect(compiled.pinNodes.get('R1:0')).toBe(compiled.pinNodes.get('B1:0'));
  });

  it('gives each unconnected pin its own node', () => {
    const compiled = compile([{ id: 'R1', label: 'R1', model: resistor, pinCount: 2 }], []);
    expect(compiled.nodeCount).toBe(2);
    expect(compiled.elements[0].nodes).toEqual([0, 1]);
  });

  it('keeps pins of parts with no model, but makes no element for them', () => {
    const compiled = compile(
      [{ id: 'U1', label: 'U1', model: { type: 'none', pins: ['A', 'B', 'C'] }, pinCount: 3 }],
      [],
    );
    expect(compiled.elements).toEqual([]);
    expect(compiled.pinNodes.size).toBe(3);
  });
});
