import { describe, expect, it } from 'vitest';
import { decodePart, encodePart, SHARE_PREFIX } from '../src/core/share.ts';

describe('share links', () => {
  it('encodes a part into a URL-safe hash and reads it back', async () => {
    const part = {
      id: 'my-led-blue',
      extends: 'led-red-5mm',
      name: 'LED blue 5 mm ±',
      shape: { color: '#3e63dd' },
    };
    const hash = await encodePart(part);
    expect(hash.startsWith(SHARE_PREFIX)).toBe(true);
    expect(hash.slice(SHARE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePart(hash)).toEqual(part);
  });

  it('rejects a hash that is not a share link', async () => {
    await expect(decodePart('#something-else')).rejects.toThrow(/not a share link/);
  });
});
