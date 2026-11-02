import { CylinderGeometry, Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { geometry, material } from '../cache.ts';
import { addMarkings, type BuildContext, type Built, box, FRONT, leg, mesh } from '../parts.ts';

// A TO-92 package: a half-round body with the flat face toward +z and 3 legs.

const RADIUS = 2.3;
const HEIGHT = 4.5;
const BASE = 3;
const PITCH = 2.54;

export function build(spec: ShapeOf<'to92'>, ctx: BuildContext): Built {
  const group = new Group();
  const body = material(spec.color);
  const centre = BASE + HEIGHT / 2;
  const back = geometry(
    'to92',
    () => new CylinderGeometry(RADIUS, RADIUS, HEIGHT, 24, 1, false, Math.PI / 2, Math.PI),
  );
  group.add(mesh(back, body, [0, centre, 0]));
  group.add(mesh(box(RADIUS * 2, HEIGHT, 0.05), body, [0, centre, 0]));

  const pins = [-PITCH, 0, PITCH].map((x) => new Vector3(x, 0, 0));
  for (const p of pins) group.add(leg(p.x, BASE));

  addMarkings(group, ctx.markings, { front: FRONT(centre + 0.6, 0.03) });
  return { object: group, pins };
}
