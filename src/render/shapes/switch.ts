import { Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { material } from '../cache.ts';
import { addMarkings, type BuildContext, type Built, box, leg, mesh, TOP } from '../parts.ts';

// A slide switch. The knob moves to +x when the switch is closed.

const BASE = 0.4;

export function build(spec: ShapeOf<'switch'>, ctx: BuildContext): Built {
  const group = new Group();
  const { length, width, height } = spec;
  const half = spec.pitch / 2;
  const closed = ctx.model.type === 'switch' && ctx.model.closed;

  group.add(
    mesh(box(length, height, width), material(spec.color, true), [0, BASE + height / 2, 0]),
  );
  group.add(
    mesh(box(length * 0.7, 0.3, width * 0.5), material('#1d2127'), [0, BASE + height + 0.15, 0]),
  );
  const knobX = (closed ? 1 : -1) * length * 0.18;
  group.add(
    mesh(box(length * 0.28, 2, width * 0.4), material('#1d2127'), [knobX, BASE + height + 1, 0]),
  );
  group.add(leg(-half, BASE), leg(half, BASE));

  addMarkings(group, ctx.markings, { top: TOP(BASE + height + 0.3) });
  return { object: group, pins: [new Vector3(-half, 0, 0), new Vector3(half, 0, 0)] };
}
