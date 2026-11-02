import { Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { material } from '../cache.ts';
import { addMarkings, type BuildContext, type Built, box, cylinder, mesh, TOP } from '../parts.ts';

// A rectangular battery (9 V style) lying flat. The snap terminals are on top near the +x end.

export function build(spec: ShapeOf<'battery'>, ctx: BuildContext): Built {
  const group = new Group();
  const { length, width, height } = spec;
  const metal = material('#c9ccd1', true);
  const capLength = 4;
  const terminalX = length / 2 - capLength / 2;
  const terminalTop = height + 2.5;

  group.add(
    mesh(box(length - capLength, height, width), material(spec.color), [
      -capLength / 2,
      height / 2,
      0,
    ]),
  );
  group.add(mesh(box(capLength, height, width), metal, [terminalX, height / 2, 0]));
  // Positive is the small round snap. Negative is the larger hexagonal snap.
  group.add(mesh(cylinder(2.6, 2.6, 2.5, 24), metal, [terminalX, height + 1.25, -width / 4]));
  group.add(mesh(cylinder(3.6, 3.6, 2.5, 6), metal, [terminalX, height + 1.25, width / 4]));

  addMarkings(group, ctx.markings, { top: TOP(height, -capLength) });
  return {
    object: group,
    pins: [
      new Vector3(terminalX, terminalTop, -width / 4),
      new Vector3(terminalX, terminalTop, width / 4),
    ],
  };
}
