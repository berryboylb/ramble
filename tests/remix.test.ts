import { describe, expect, it } from 'vitest';
import { resolvePart } from '../src/core/resolve.ts';
import type { PartDef } from '../src/core/types.ts';
import { diff, remixOf } from '../src/editor/remix.ts';

const base: PartDef = {
  id: 'resistor-1k',
  name: 'Resistor 1 kΩ',
  category: 'passive',
  version: 1,
  symbol: 'resistor',
  shape: { kind: 'axial', bodyLength: 6.3, bodyRadius: 1.2, pitch: 10.16, color: '#d9c39a' },
  model: { type: 'resistor', resistance: 1000 },
  learn: { summary: 'A resistor limits current.', tips: ['Tip 1', 'Tip 2'] },
};

describe('remix', () => {
  it('finds only the changed fields', () => {
    expect(diff({ a: 1, b: { c: 2, d: 3 } }, { a: 1, b: { c: 2, d: 4 } })).toEqual({ b: { d: 4 } });
    expect(diff({ list: [1, 2] }, { list: [1, 2] })).toEqual({});
    expect(diff({ list: [1, 2] }, { list: [1, 3] })).toEqual({ list: [1, 3] });
  });

  it('stores a remix as its changes, and the remix resolves back to the full part', () => {
    const part: PartDef = {
      ...structuredClone(base),
      id: 'my-resistor-4k7',
      name: 'Resistor 4.7 kΩ',
      model: { type: 'resistor', resistance: 4700 },
    };
    part.shape = { ...base.shape, color: '#3e63dd' } as PartDef['shape'];
    const remix = remixOf(part, base);
    expect(remix).toEqual({
      id: 'my-resistor-4k7',
      extends: 'resistor-1k',
      name: 'Resistor 4.7 kΩ',
      shape: { kind: 'axial', color: '#3e63dd' },
      model: { type: 'resistor', resistance: 4700 },
    });
    expect(resolvePart(remix, (id) => (id === base.id ? base : undefined))).toEqual(part);
  });

  it('stores the full part when the shape kind changes', () => {
    const part: PartDef = {
      ...structuredClone(base),
      id: 'my-box',
      shape: { kind: 'to92', color: '#111111' },
    };
    const saved = remixOf(part, base);
    expect(saved).toEqual(part);
    expect('extends' in saved).toBe(false);
  });
});
