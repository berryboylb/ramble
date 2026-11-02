import { Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { material } from '../cache.ts';
import {
  addMarkings,
  type BuildContext,
  type Built,
  cylinder,
  FRONT,
  lead,
  LEAD_END,
  mesh,
} from '../parts.ts';

// A standing disc with 2 leads, for example a ceramic capacitor.

export function build(spec: ShapeOf<'disc'>, ctx: BuildContext): Built {
  const group = new Group();
  const { radius, thickness } = spec;
  const centre = radius + 2;
  const half = spec.pitch / 2;
  const inner = Math.min(half, radius * 0.5);

  group.add(
    mesh(
      cylinder(radius, radius, thickness, 32),
      material(spec.color),
      [0, centre, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  for (const side of [-1, 1]) {
    group.add(
      lead([
        [side * inner, centre - radius * 0.5, 0],
        [side * inner, 1.2, 0],
        [side * half, 0.4, 0],
        [side * half, LEAD_END, 0],
      ]),
    );
  }

  addMarkings(group, ctx.markings, { front: FRONT(centre, thickness / 2) });
  return { object: group, pins: [new Vector3(-half, 0, 0), new Vector3(half, 0, 0)] };
}
