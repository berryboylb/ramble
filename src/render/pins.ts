import { Mesh, MeshStandardMaterial, SphereGeometry, type Vector3 } from 'three';

// Pin markers. They draw on top of part bodies. Many pins are under the body (LED, DIP, TO-92),
// and the user must still see and click them.

const PIN_GEOMETRY = new SphereGeometry(0.6, 12, 8);
const PIN_RENDER_ORDER = 10;

const pinMaterial = (color: string) =>
  new MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.4,
    depthTest: false,
    transparent: true,
  });

export const PIN_MATERIAL = pinMaterial('#d4af37');
export const PIN_HOVER = pinMaterial('#4cc38a');

export function pinMarker(position: Vector3): Mesh {
  const pin = new Mesh(PIN_GEOMETRY, PIN_MATERIAL);
  pin.position.copy(position);
  pin.renderOrder = PIN_RENDER_ORDER;
  return pin;
}
