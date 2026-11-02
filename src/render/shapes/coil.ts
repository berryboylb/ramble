import { Curve, Group, TubeGeometry, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { geometry, material } from '../cache.ts';
import { addMarkings, type BuildContext, type Built, cylinder, leg, mesh, TOP } from '../parts.ts';

// A drum inductor: a ferrite core with a copper winding around it.

const BASE = 0.5;

class Helix extends Curve<Vector3> {
  constructor(
    private readonly radius: number,
    private readonly length: number,
    private readonly turns: number,
    private readonly start: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    const angle = t * this.turns * Math.PI * 2;
    return target.set(
      this.radius * Math.cos(angle),
      this.start + t * this.length,
      this.radius * Math.sin(angle),
    );
  }
}

export function build(spec: ShapeOf<'coil'>, ctx: BuildContext): Built {
  const group = new Group();
  const { radius, length, turns } = spec;
  const core = radius * 0.8;
  const flange = 0.6;
  const wireRadius = Math.min(0.25, (length - 2 * flange) / turns / 2.2);
  const half = spec.pitch / 2;
  const coreMaterial = material(spec.color);

  group.add(mesh(cylinder(core, core, length), coreMaterial, [0, BASE + length / 2, 0]));
  for (const y of [BASE + flange / 2, BASE + length - flange / 2]) {
    group.add(mesh(cylinder(radius, radius, flange, 32), coreMaterial, [0, y, 0]));
  }

  const winding = geometry(`helix:${core}:${length}:${turns}:${wireRadius}`, () => {
    const helix = new Helix(
      core + wireRadius,
      length - 2 * flange - 2 * wireRadius,
      turns,
      BASE + flange + wireRadius,
    );
    return new TubeGeometry(helix, Math.ceil(turns * 24), wireRadius, 6, false);
  });
  group.add(mesh(winding, material(spec.wire, true)));
  group.add(leg(-half, BASE), leg(half, BASE));

  addMarkings(group, ctx.markings, { top: TOP(BASE + length) });
  return { object: group, pins: [new Vector3(-half, 0, 0), new Vector3(half, 0, 0)] };
}
