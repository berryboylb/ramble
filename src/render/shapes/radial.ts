import { CylinderGeometry, Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { geometry, material } from '../cache.ts';
import {
  addMarkings,
  type BuildContext,
  type Built,
  cylinder,
  FRONT,
  leg,
  mesh,
  TOP,
} from '../parts.ts';

// An upright can with both leads at the bottom, for example an electrolytic capacitor.
// The stripe faces +x, on the side of pin 2 (negative).

const STANDOFF = 0.5;

export function build(spec: ShapeOf<'radial'>, ctx: BuildContext): Built {
  const group = new Group();
  const { radius, height } = spec;
  const centre = STANDOFF + height / 2;
  const half = spec.pitch / 2;

  group.add(mesh(cylinder(radius, radius, height, 32), material(spec.color), [0, centre, 0]));
  group.add(
    mesh(cylinder(radius * 0.9, radius * 0.9, 0.1, 32), material('#c9ccd1', true), [
      0,
      STANDOFF + height,
      0,
    ]),
  );
  if (spec.stripe) {
    const r = radius * 1.01;
    const stripe = geometry(
      `stripe:${r}:${height}`,
      () => new CylinderGeometry(r, r, height * 0.98, 12, 1, true, Math.PI / 2 - 0.45, 0.9),
    );
    group.add(mesh(stripe, material(spec.stripe), [0, centre, 0]));
  }
  group.add(leg(-half, STANDOFF), leg(half, STANDOFF));

  addMarkings(group, ctx.markings, {
    top: TOP(STANDOFF + height + 0.1),
    front: FRONT(centre, radius),
  });
  return { object: group, pins: [new Vector3(-half, 0, 0), new Vector3(half, 0, 0)] };
}
