import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, currentSource, transconductance, type SimElement } from '../stamp.ts';

// 2 coupled windings. With the inductance matrix L = [[L1, M], [M, L2]],
// backward Euler gives i = iPrevious + dt × L⁻¹ × v for both windings.
export function create(el: CompiledElement): SimElement {
  const [p1, p2, s1, s2] = el.nodes;
  const model = () => el.model as ModelOf<'transformer'>;
  let primaryCurrent = 0;
  let secondaryCurrent = 0;

  const gains = (dt: number) => {
    const { primaryInductance: l1, turnsRatio, coupling } = model();
    const l2 = l1 * turnsRatio * turnsRatio;
    const m = coupling * Math.sqrt(l1 * l2);
    const det = l1 * l2 - m * m;
    return { g11: (dt * l2) / det, g12: (-dt * m) / det, g22: (dt * l1) / det };
  };

  const element: SimElement = {
    nonlinear: false,
    voltage: 0,
    current: 0,
    stamp(c) {
      const { g11, g12, g22 } = gains(c.dt);
      conductance(c, p1, p2, g11);
      transconductance(c, p1, p2, s1, s2, g12);
      currentSource(c, p1, p2, primaryCurrent);
      conductance(c, s1, s2, g22);
      transconductance(c, s1, s2, p1, p2, g12);
      currentSource(c, s1, s2, secondaryCurrent);
    },
    accept(c) {
      const { g11, g12, g22 } = gains(c.dt);
      const v1 = c.v[p1] - c.v[p2];
      const v2 = c.v[s1] - c.v[s2];
      primaryCurrent += g11 * v1 + g12 * v2;
      secondaryCurrent += g12 * v1 + g22 * v2;
      element.voltage = v1;
      element.current = primaryCurrent;
    },
  };
  return element;
}
