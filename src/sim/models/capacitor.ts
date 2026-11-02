import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, currentSource, type SimElement } from '../stamp.ts';

// Backward Euler companion model: a conductance C/dt in parallel with a current source.
export function create(el: CompiledElement): SimElement {
  const [a, b] = el.nodes;
  const model = () => el.model as ModelOf<'capacitor'>;
  let previousVoltage = 0;
  const element: SimElement = {
    nonlinear: false,
    voltage: 0,
    current: 0,
    stamp(c) {
      const g = model().capacitance / c.dt;
      conductance(c, a, b, g);
      currentSource(c, b, a, g * previousVoltage);
    },
    accept(c) {
      const v = c.v[a] - c.v[b];
      element.current = (model().capacitance / c.dt) * (v - previousVoltage);
      element.voltage = v;
      previousVoltage = v;
    },
  };
  return element;
}
