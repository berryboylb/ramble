import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { geometry } from './cache.ts';

// Text on parts is drawn on a 2D canvas with a system font. No font file is downloaded.
const TEXT_PX = 128;
const materials = new Map<string, MeshBasicMaterial>();
let anisotropy = 1;

export function setAnisotropy(value: number): void {
  anisotropy = value;
}

function textMaterial(
  text: string,
  color: string,
): { material: MeshBasicMaterial; aspect: number } {
  const key = `${text}|${color}`;
  let shared = materials.get(key);
  if (!shared) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = `600 ${TEXT_PX * 0.8}px system-ui, sans-serif`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width + TEXT_PX * 0.2);
    canvas.height = TEXT_PX;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, TEXT_PX / 2);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = anisotropy;
    shared = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    materials.set(key, shared);
  }
  const image = shared.map!.image as HTMLCanvasElement;
  return { material: shared, aspect: image.width / image.height };
}

/** A flat text plane facing +z. `height` is the text height in millimetres. */
export function textMesh(text: string, height: number, color: string): Mesh {
  const { material, aspect } = textMaterial(text, color);
  const width = Number((height * aspect).toFixed(2));
  const plane = geometry(`plane:${width}:${height}`, () => new PlaneGeometry(width, height));
  return new Mesh(plane, material);
}
