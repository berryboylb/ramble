import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { orbit, viewOrientation } from '../src/render/controls.ts';

const forward = (q: ReturnType<typeof viewOrientation>) => new Vector3(0, 0, -1).applyQuaternion(q);

describe('orbit camera', () => {
  it('goes over the top with no jump or flip', () => {
    let q = viewOrientation('front');
    let previous = forward(q);
    const step = Math.PI / 90; // 2° per step
    for (let i = 0; i < 270; i++) {
      q = orbit(q, 0, step);
      const next = forward(q);
      // Every step turns the view by 2°, also at the poles.
      expect(previous.angleTo(next)).toBeCloseTo(step, 5);
      previous = next;
    }
    // 540° of pitch from the front view ends upside down, looking the other way.
    expect(new Vector3(0, 1, 0).applyQuaternion(q).y).toBeLessThan(0);
  });

  it('keeps the horizon level after only yaw', () => {
    let q = viewOrientation('iso');
    for (let i = 0; i < 100; i++) q = orbit(q, 0.1, 0);
    const right = new Vector3(1, 0, 0).applyQuaternion(q);
    expect(right.y).toBeCloseTo(0, 6);
  });

  it('turns the same way on screen when the camera is upside down', () => {
    const upright = viewOrientation('front');
    const upsideDown = orbit(upright, 0, Math.PI);
    const turn = (q: typeof upright) => forward(orbit(q, 0.2, 0)).sub(forward(q));
    const screenRight = (q: typeof upright) => new Vector3(1, 0, 0).applyQuaternion(q);
    expect(Math.sign(turn(upright).dot(screenRight(upright)))).toBe(
      Math.sign(turn(upsideDown).dot(screenRight(upsideDown))),
    );
  });
});
