import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CatalogCategory, CatalogIndex, PartDef } from '../src/core/types.ts';
import { buildCatalog, PARTS_DIR } from '../tools/vite-plugin-catalog.ts';

describe('catalog', () => {
  const built = buildCatalog(PARTS_DIR, 'build');
  const read = <T>(url: string) => JSON.parse(built.files.get(url.replace('/catalog/', ''))!) as T;

  it('has no errors in the built-in parts', () => {
    expect(built.errors).toEqual([]);
  });

  it('lists every part in a category file, with a schematic symbol', () => {
    const index = read<CatalogIndex>('/catalog/index.json');
    const entries = index.categories.flatMap((c) => read<CatalogCategory>(c.url).parts);
    expect(entries).toHaveLength(16);
    for (const entry of entries) expect(entry.symbol).toMatch(/^M/);
  });

  it('puts content hashes in the file names of the build', () => {
    const names = [...built.files.keys()].filter((name) => name !== 'index.json');
    for (const name of names) expect(name).toMatch(/\.[0-9a-f]{10}\.json$/);
  });

  it('resolves remixes, so a part file needs no other file', () => {
    const index = read<CatalogIndex>('/catalog/index.json');
    const passive = read<CatalogCategory>(index.categories.find((c) => c.id === 'passive')!.url);
    const remix = read<PartDef & { extends?: string }>(
      passive.parts.find((p) => p.id === 'resistor-220r')!.url,
    );
    expect(remix.extends).toBeUndefined();
    expect(remix.model).toEqual({ type: 'resistor', resistance: 220 });
    expect(remix.learn.summary).toMatch(/limits the current/);
  });

  it('reports a bad part file and keeps the good ones', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ramble-catalog-'));
    try {
      writeFileSync(path.join(dir, 'wrong-name.json'), JSON.stringify({ id: 'other-name' }));
      const result = buildCatalog(dir, 'dev');
      expect(result.errors.some((e) => e.includes('the file name must be "other-name.json"'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('rejects a built-in part whose id uses the custom prefix', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ramble-catalog-'));
    try {
      const part = JSON.parse(readFileSync(path.join(PARTS_DIR, 'resistor-1k.json'), 'utf8'));
      writeFileSync(
        path.join(dir, 'my-resistor.json'),
        JSON.stringify({ ...part, id: 'my-resistor' }),
      );
      const result = buildCatalog(dir, 'dev');
      expect(result.errors.some((e) => e.includes('must not start with "my-"'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
