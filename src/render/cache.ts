import { type BufferGeometry, MeshStandardMaterial } from 'three';

const geometries = new Map<string, BufferGeometry>();
const materials = new Map<string, MeshStandardMaterial>();

/** Returns a shared geometry. Parts with the same dimensions use the same GPU buffers. */
export function geometry<T extends BufferGeometry>(key: string, make: () => T): T {
  let shared = geometries.get(key) as T | undefined;
  if (!shared) {
    shared = make();
    geometries.set(key, shared);
  }
  return shared;
}

/** Returns a shared material for a colour. */
export function material(color: string, metal = false, opacity = 1): MeshStandardMaterial {
  const key = `${color}|${metal}|${opacity}`;
  let shared = materials.get(key);
  if (!shared) {
    shared = new MeshStandardMaterial({
      color,
      metalness: metal ? 0.85 : 0,
      roughness: metal ? 0.35 : 0.55,
      transparent: opacity < 1,
      opacity,
    });
    materials.set(key, shared);
  }
  return shared;
}
