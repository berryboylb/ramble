import { Group, Vector3 } from 'three';
import type { Primitive, ShapeOf } from '../../core/types.ts';
import { material } from '../cache.ts';
import {
  addMarkings,
  box,
  type BuildContext,
  type Built,
  cylinder,
  DEGREES,
  mesh,
  sphere,
} from '../parts.ts';

// A part drawn from basic solids. Users can make a new part with this before a builder exists for it.

function geometryOf(p: Primitive) {
  const [a, b, c] = p.size;
  if (p.type === 'box') return box(a, b, c);
  if (p.type === 'cylinder') return cylinder(a, b, c);
  return sphere(a);
}

export function build(spec: ShapeOf<'custom'>, ctx: BuildContext): Built {
  const group = new Group();
  for (const p of spec.primitives) {
    const [x, y, z] = p.rotation ?? [0, 0, 0];
    group.add(
      mesh(geometryOf(p), material(p.color, p.metal), p.position, [
        x * DEGREES,
        y * DEGREES,
        z * DEGREES,
      ]),
    );
  }
  addMarkings(group, ctx.markings, {});
  return { object: group, pins: spec.pins.map((p) => new Vector3(...p)) };
}
