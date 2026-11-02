import { Group, LatheGeometry, Vector2, Vector3 } from 'three';
import type { ModelOf, ShapeOf } from '../../core/types.ts';
import { geometry, material } from '../cache.ts';
import {
  addMarkings,
  type BuildContext,
  type Built,
  cylinder,
  FRONT,
  lead,
  LEAD_END,
  mesh,
  TOP,
} from '../parts.ts';

// Resistors, diodes and other parts with a lead at each end of a horizontal body.

const DIGIT_COLORS = [
  '#111',
  '#7b3f12',
  '#d0302b',
  '#f07a1a',
  '#f2d21b',
  '#2f9e44',
  '#1c5fd4',
  '#7b3fd4',
  '#8a8f98',
  '#f5f5f5',
];
const GOLD = '#c9a227';
const SILVER = '#b9bec6';

/** 4-band colour code: 2 digits, multiplier, gold tolerance (5 %). */
export function resistorBands(ohms: number): string[] {
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exponent);
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    exponent += 1;
  }
  const multiplier =
    exponent >= 0 ? DIGIT_COLORS[Math.min(exponent, 9)] : exponent === -1 ? GOLD : SILVER;
  return [DIGIT_COLORS[Math.floor(digits / 10)], DIGIT_COLORS[digits % 10], multiplier, GOLD];
}

/** A "dog bone" body: wider at the ends, as on a real carbon-film resistor. */
function boneBody(length: number, radius: number) {
  return geometry(`bone:${length}:${radius}`, () => {
    const h = length / 2;
    const profile = [
      [0, -h],
      [radius * 0.9, -h],
      [radius, -h + length * 0.08],
      [radius, -h + length * 0.22],
      [radius * 0.86, -h + length * 0.3],
      [radius * 0.86, h - length * 0.3],
      [radius, h - length * 0.22],
      [radius, h - length * 0.08],
      [radius * 0.9, h],
      [0, h],
    ].map(([x, y]) => new Vector2(x, y));
    return new LatheGeometry(profile, 24);
  });
}

export function build(spec: ShapeOf<'axial'>, ctx: BuildContext): Built {
  const group = new Group();
  const { bodyLength: length, bodyRadius: radius } = spec;
  const y = radius + 1.2;
  const half = Math.max(spec.pitch / 2, length / 2 + 1);
  const along: [number, number, number] = [0, 0, Math.PI / 2];

  const body =
    spec.profile === 'bone' ? boneBody(length, radius) : cylinder(radius, radius, length);
  group.add(mesh(body, material(spec.color, false, spec.opacity ?? 1), [0, y, 0], along));

  if (spec.bands === 'resistor' && ctx.model.type === 'resistor') {
    const bands = resistorBands((ctx.model as ModelOf<'resistor'>).resistance);
    const offsets = [-0.2, -0.1, 0, 0.3];
    bands.forEach((color, i) => {
      const r = (i === 3 ? radius : radius * 0.86) * 1.03;
      group.add(
        mesh(cylinder(r, r, length * 0.06), material(color), [offsets[i] * length, y, 0], along),
      );
    });
  }
  if (spec.stripe) {
    const r = radius * 1.03;
    group.add(
      mesh(cylinder(r, r, length * 0.14), material(spec.stripe), [length * 0.36, y, 0], along),
    );
  }

  for (const side of [-1, 1]) {
    group.add(
      lead([
        [(side * length) / 2, y, 0],
        [side * half, y, 0],
        [side * half, LEAD_END, 0],
      ]),
    );
  }

  addMarkings(group, ctx.markings, {
    top: TOP(y + radius),
    front: FRONT(y, radius),
    side: FRONT(y, radius),
  });
  return { object: group, pins: [new Vector3(-half, 0, 0), new Vector3(half, 0, 0)] };
}
