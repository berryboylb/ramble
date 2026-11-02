import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, currentSource, type SimElement } from '../stamp.ts';

// Backward Euler companion model of L in series with its winding resistance R:
// i = v / (L/dt + R) + (L/dt) / (L/dt + R) × iPrevious
export function create(el: CompiledElement): SimElement {
  const [a, b] = el.nodes;
  const model = () => el.model as ModelOf<'inductor'>;
  let previousCurrent = 0;
  const coefficients = (dt: number) => {
    const { inductance, resistance = 0 } = model();
    const g = 1 / (inductance / dt + resistance);
    return { g, k: (inductance / dt) * g };
  };
  const element: SimElement = {
    nonlinear: false,
    voltage: 0,
    current: 0,
    stamp(c) {
      const { g, k } = coefficients(c.dt);
      conductance(c, a, b, g);
      currentSource(c, a, b, k * previousCurrent);
    },
    accept(c) {
      const { g, k } = coefficients(c.dt);
      element.voltage = c.v[a] - c.v[b];
      element.current = g * element.voltage + k * previousCurrent;
      previousCurrent = element.current;
    },
  };
  return element;
}
