import {
  BoxGeometry,
  CurvePath,
  CylinderGeometry,
  type BufferGeometry,
  type Group,
  LineCurve3,
  type Material,
  Mesh,
  type MeshStandardMaterial,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { Face, Marking, ModelSpec, Vec3 } from '../core/types.ts';
import { geometry, material } from './cache.ts';
import { textMesh } from './markings.ts';

// Helpers that every shape builder shares.

export const LEAD_COLOR = '#c9ccd1';
export const LEAD_RADIUS = 0.25;
/** Leads go through the 1.6 mm board and end below it. */
export const LEAD_END = -3;
const DEG = Math.PI / 180;

export interface BuildContext {
  model: ModelSpec;
  markings: Marking[];
}

export interface Built {
  object: Group;
  /** Pin positions in part space, in the order of the model terminals. */
  pins: Vector3[];
  /** A material of this part only. The workbench sets its glow from the current (LEDs). */
  glow?: MeshStandardMaterial;
}

/** Where a marking on a face goes. Rotation in radians. */
export interface Anchor {
  position: Vec3;
  rotation: Vec3;
}

export function mesh(
  geo: BufferGeometry,
  mat: Material,
  position: Vec3 = [0, 0, 0],
  rotation?: Vec3,
): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(...position);
  if (rotation) m.rotation.set(...rotation);
  return m;
}

export const cylinder = (top: number, bottom: number, height: number, segments = 24) =>
  geometry(
    `cyl:${top}:${bottom}:${height}:${segments}`,
    () => new CylinderGeometry(top, bottom, height, segments),
  );

export const box = (w: number, h: number, d: number) =>
  geometry(`box:${w}:${h}:${d}`, () => new BoxGeometry(w, h, d));

export const sphere = (r: number) => geometry(`sphere:${r}`, () => new SphereGeometry(r, 20, 12));

/** A polyline with rounded corners, for bent leads. */
function roundedPath(points: Vector3[], radius: number): CurvePath<Vector3> {
  const path = new CurvePath<Vector3>();
  let start = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i];
    const before = corner
      .clone()
      .sub(points[i - 1])
      .normalize();
    const after = points[i + 1].clone().sub(corner).normalize();
    const a = corner.clone().addScaledVector(before, -radius);
    const b = corner.clone().addScaledVector(after, radius);
    path.add(new LineCurve3(start, a));
    path.add(new QuadraticBezierCurve3(a, corner, b));
    start = b;
  }
  path.add(new LineCurve3(start, points[points.length - 1]));
  return path;
}

/** A metal lead along the given points. */
export function lead(points: Vec3[], radius = LEAD_RADIUS): Mesh {
  const geo = geometry(`lead:${radius}:${JSON.stringify(points)}`, () => {
    const vectors = points.map((p) => new Vector3(...p));
    return new TubeGeometry(roundedPath(vectors, 0.8), points.length * 8, radius, 6, false);
  });
  return new Mesh(geo, material(LEAD_COLOR, true));
}

/** A straight vertical lead from height `top` down through the board. */
export function leg(x: number, top: number, z = 0): Mesh {
  return mesh(cylinder(LEAD_RADIUS, LEAD_RADIUS, top - LEAD_END, 6), material(LEAD_COLOR, true), [
    x,
    (top + LEAD_END) / 2,
    z,
  ]);
}

/** Adds the part's markings. A marking with a position uses it. Otherwise it goes on its face anchor. */
export function addMarkings(
  group: Group,
  markings: Marking[],
  anchors: Partial<Record<Face, Anchor>>,
): void {
  for (const m of markings) {
    const text = textMesh(m.text, m.height ?? 1, m.color ?? '#e6e9ee');
    if (m.position) {
      text.position.set(...m.position);
      const [x, y, z] = m.rotation ?? [0, 0, 0];
      text.rotation.set(x * DEG, y * DEG, z * DEG);
    } else {
      const anchor = anchors[m.face ?? 'top'];
      if (!anchor) continue;
      text.position.set(...anchor.position);
      text.rotation.set(...anchor.rotation);
    }
    group.add(text);
  }
}

export const TOP = (y: number, x = 0, z = 0): Anchor => ({
  position: [x, y + 0.02, z],
  rotation: [-Math.PI / 2, 0, 0],
});
export const FRONT = (y: number, z: number, x = 0): Anchor => ({
  position: [x, y, z + 0.02],
  rotation: [0, 0, 0],
});
export const DEGREES = DEG;
