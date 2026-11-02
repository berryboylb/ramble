import { Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { material } from '../cache.ts';
import {
  addMarkings,
  type BuildContext,
  type Built,
  box,
  cylinder,
  lead,
  LEAD_END,
  mesh,
  TOP,
} from '../parts.ts';

// A dual in-line package (DIP). Pin 1 is at the front left, next to the notch.
// Pins count anticlockwise, seen from the top.

const PITCH = 2.54;
const ROW = 3.81;
const BASE = 0.8;
const BODY_HEIGHT = 3.3;

export function build(spec: ShapeOf<'dip'>, ctx: BuildContext): Built {
  const group = new Group();
  const perSide = spec.pins / 2;
  const length = perSide * PITCH;
  const top = BASE + BODY_HEIGHT;
  const dark = material('#2a2e35');

  group.add(
    mesh(box(length, BODY_HEIGHT, 6.35), material(spec.color), [0, BASE + BODY_HEIGHT / 2, 0]),
  );
  group.add(mesh(cylinder(0.8, 0.8, 0.04, 16), dark, [-length / 2, top + 0.01, 0]));
  group.add(mesh(cylinder(0.4, 0.4, 0.04, 12), dark, [-length / 2 + 1.2, top + 0.01, 2]));

  const pins: Vector3[] = [];
  const firstX = -((perSide - 1) / 2) * PITCH;
  for (let i = 0; i < perSide; i++) pins.push(new Vector3(firstX + i * PITCH, 0, ROW));
  for (let i = perSide - 1; i >= 0; i--) pins.push(new Vector3(firstX + i * PITCH, 0, -ROW));
  for (const p of pins) {
    const side = Math.sign(p.z);
    group.add(
      lead(
        [
          [p.x, BASE + 1, side * 3.1],
          [p.x, BASE + 1, p.z],
          [p.x, LEAD_END, p.z],
        ],
        0.22,
      ),
    );
  }

  addMarkings(group, ctx.markings, { top: TOP(top, 0.6) });
  return { object: group, pins };
}
