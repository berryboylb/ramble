import { Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { material } from '../cache.ts';
import { addMarkings, type BuildContext, type Built, box, leg, mesh, TOP } from '../parts.ts';

// An EI-core transformer. The primary winding (p1, p2) faces +z, the secondary (s1, s2) faces −z.

const BASE = 2;
const PIN_X = 5.08;

export function build(spec: ShapeOf<'transformer'>, ctx: BuildContext): Built {
  const group = new Group();
  const { width, height, depth } = spec;
  const core = material(spec.color, true);
  const yoke = height * 0.18;
  const legWidth = width * 0.16;
  const centre = BASE + height / 2;

  // The laminated core: 2 yokes, 2 outer legs and 1 centre leg.
  group.add(mesh(box(width, yoke, depth), core, [0, BASE + yoke / 2, 0]));
  group.add(mesh(box(width, yoke, depth), core, [0, BASE + height - yoke / 2, 0]));
  for (const side of [-1, 1]) {
    group.add(
      mesh(box(legWidth, height, depth), core, [(side * (width - legWidth)) / 2, centre, 0]),
    );
  }

  // The windings stick out at the front and back of the core.
  const coilWidth = width - 2 * legWidth - 0.4;
  const coilHeight = height - 2 * yoke - 0.2;
  const coilDepth = depth / 2 + 2;
  group.add(
    mesh(box(coilWidth, coilHeight, coilDepth), material('#b3412e'), [0, centre, coilDepth / 2]),
  );
  group.add(
    mesh(box(coilWidth, coilHeight, coilDepth), material('#d9a520'), [0, centre, -coilDepth / 2]),
  );

  const pinZ = depth / 2 + 1;
  const pins = [
    new Vector3(-PIN_X, 0, pinZ),
    new Vector3(PIN_X, 0, pinZ),
    new Vector3(-PIN_X, 0, -pinZ),
    new Vector3(PIN_X, 0, -pinZ),
  ];
  for (const p of pins) group.add(leg(p.x, BASE, p.z));

  addMarkings(group, ctx.markings, { top: TOP(BASE + height) });
  return { object: group, pins };
}
