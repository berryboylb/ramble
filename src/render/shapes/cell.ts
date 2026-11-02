import { Group, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { material } from '../cache.ts';
import { addMarkings, type BuildContext, type Built, cylinder, mesh, TOP } from '../parts.ts';

// A round cell (AA style) lying along x. The positive bump is at the +x end.

export function build(spec: ShapeOf<'cell'>, ctx: BuildContext): Built {
  const group = new Group();
  const { length, radius } = spec;
  const along: [number, number, number] = [0, 0, Math.PI / 2];
  const metal = material('#c9ccd1', true);

  group.add(
    mesh(cylinder(radius, radius, length - 1, 32), material(spec.color), [0, radius, 0], along),
  );
  group.add(
    mesh(
      cylinder(radius * 0.95, radius * 0.95, 0.5, 32),
      metal,
      [-length / 2 + 0.25, radius, 0],
      along,
    ),
  );
  group.add(
    mesh(cylinder(radius * 0.35, radius * 0.35, 1, 16), metal, [length / 2, radius, 0], along),
  );

  addMarkings(group, ctx.markings, { top: TOP(radius * 2) });
  return {
    object: group,
    pins: [new Vector3(length / 2 + 0.5, radius, 0), new Vector3(-length / 2, radius, 0)],
  };
}
