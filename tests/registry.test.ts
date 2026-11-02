import { describe, expect, it } from 'vitest';
import { Registry, ValidationError } from '../src/core/registry.ts';
import type { PartInput } from '../src/core/types.ts';

const base: PartInput = {
  id: 'resistor-1k',
  name: 'Resistor 1 kΩ',
  category: 'passive',
  version: 1,
  symbol: 'resistor',
  shape: { kind: 'axial', bodyLength: 6.3, bodyRadius: 1.2, pitch: 10.16, color: '#d9c39a' },
  model: { type: 'resistor', resistance: 1000 },
  learn: { summary: 'A resistor limits current.', tips: ['Tip 1'] },
};

function registryWith(files: Record<string, PartInput>) {
  const fetched: string[] = [];
  const registry = new Registry(async (url) => {
    fetched.push(url);
    return structuredClone(files[url]);
  });
  registry.setEntries(Object.keys(files).map((id) => ({ id, name: id, symbol: '', url: id })));
  return { registry, fetched };
}

describe('registry', () => {
  it('fetches a part once and caches it', async () => {
    const { registry, fetched } = registryWith({ 'resistor-1k': base });
    await registry.load('resistor-1k');
    await registry.load('resistor-1k');
    expect(fetched).toEqual(['resistor-1k']);
  });

  it('merges a remix over its base part', async () => {
    const remix: PartInput = {
      id: 'resistor-220r',
      extends: 'resistor-1k',
      name: 'Resistor 220 Ω',
      model: { type: 'resistor', resistance: 220 },
    };
    const { registry } = registryWith({ 'resistor-1k': base, 'resistor-220r': remix });
    const part = await registry.load('resistor-220r');
    expect(part.model).toEqual({ type: 'resistor', resistance: 220 });
    expect(part.shape).toEqual(base.shape);
    expect(part.learn.summary).toBe(base.learn!.summary);
    expect('extends' in part).toBe(false);
  });

  it('rejects an extends cycle', async () => {
    const a: PartInput = { ...base, id: 'part-a', extends: 'part-b' };
    const b: PartInput = { id: 'part-b', extends: 'part-a' };
    const { registry } = registryWith({ 'part-a': a, 'part-b': b });
    await expect(registry.load('part-a')).rejects.toThrow(/cycle/);
  });

  it('rejects an invalid part with a list of problems', async () => {
    const { registry } = registryWith({});
    const bad = {
      ...base,
      id: 'bad-part',
      model: { type: 'resistor', resistance: -5 },
    } as PartInput;
    const error = await registry.upsert(bad).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).problems).toContain(
      'bad-part: "model.resistance" must be a positive number.',
    );
  });

  it('rejects a shape whose pin count does not match the model', async () => {
    const { registry } = registryWith({});
    const bad = { ...base, id: 'bad-pins', shape: { kind: 'to92', color: '#111' } } as PartInput;
    await expect(registry.upsert(bad)).rejects.toThrow(/3 pins, but the model needs 2/);
  });

  it('tells listeners about a change, and updates parts that extend the changed part', async () => {
    const remix: PartInput = {
      id: 'resistor-220r',
      extends: 'resistor-1k',
      model: { type: 'resistor', resistance: 220 },
    };
    const { registry } = registryWith({ 'resistor-1k': base, 'resistor-220r': remix });
    await registry.load('resistor-220r');
    const changed: string[] = [];
    registry.on((id) => changed.push(id));

    await registry.upsert({
      ...base,
      name: 'Resistor 1 kΩ, new name',
      shape: { ...base.shape, color: '#ffffff' },
    });
    expect(changed).toEqual(['resistor-1k', 'resistor-220r']);
    expect(registry.get('resistor-220r')!.shape).toMatchObject({ color: '#ffffff' });
  });

  it('removes a part, tells listeners, and lists dependants and bases', async () => {
    const remix: PartInput = {
      id: 'my-resistor',
      extends: 'resistor-1k',
      model: { type: 'resistor', resistance: 220 },
    };
    const { registry } = registryWith({ 'resistor-1k': base });
    await registry.upsert(remix);
    expect(registry.baseOf('my-resistor')).toBe('resistor-1k');
    expect(registry.dependants('resistor-1k')).toEqual(['my-resistor']);
    expect(registry.isCatalogPart('resistor-1k')).toBe(true);
    expect(registry.isCatalogPart('my-resistor')).toBe(false);

    const changes: string[] = [];
    registry.on((id, change) => changes.push(`${change}:${id}`));
    registry.remove('my-resistor');
    expect(changes).toEqual(['removed:my-resistor']);
    expect(registry.get('my-resistor')).toBeUndefined();
    // The base was fetched only to resolve the remix. It is not a loaded part.
    expect(registry.list()).toEqual([]);
  });

  it('resolves a draft without storing it', async () => {
    const { registry } = registryWith({ 'resistor-1k': base });
    const part = await registry.resolve({ id: 'my-draft', extends: 'resistor-1k' });
    expect(part.model).toEqual(base.model);
    expect(registry.get('my-draft')).toBeUndefined();
  });
});
