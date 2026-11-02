import { Color, Group, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import type { ShapeOf } from '../../core/types.ts';
import { geometry } from '../cache.ts';
import { type Built, cylinder, leg, mesh } from '../parts.ts';

// A 5 mm style LED: epoxy body, dome and flange. Pin 1 is the anode, pin 2 the cathode.
// The material belongs to this part only, so the workbench can make it glow.

const BASE = 1;

export function build(spec: ShapeOf<'led'>): Built {
  const group = new Group();
  const r = spec.radius;
  const bodyHeight = r * 1.6;
  const half = spec.pitch / 2;
  const glow = new MeshStandardMaterial({
    color: spec.color,
    emissive: new Color(spec.color),
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.8,
    roughness: 0.2,
  });

  group.add(mesh(cylinder(r * 1.15, r * 1.15, 1, 32), glow, [0, BASE + 0.5, 0]));
  group.add(mesh(cylinder(r, r, bodyHeight, 32), glow, [0, BASE + 1 + bodyHeight / 2, 0]));
  const dome = geometry(
    `dome:${r}`,
    () => new SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  );
  group.add(mesh(dome, glow, [0, BASE + 1 + bodyHeight, 0]));
  group.add(leg(-half, BASE), leg(half, BASE));

  return { object: group, pins: [new Vector3(-half, 0, 0), new Vector3(half, 0, 0)], glow };
}
