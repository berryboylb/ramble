import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, currentSource, type SimElement } from '../stamp.ts';

// Norton equivalent: a current source V/r in parallel with the internal conductance 1/r.
// A short circuit stays solvable and gives the real short-circuit current.
export function create(el: CompiledElement): SimElement {
  const [plus, minus] = el.nodes;
  const model = () => el.model as ModelOf<'battery'>;
  const element: SimElement = {
    nonlinear: false,
    voltage: 0,
    current: 0,
    stamp(c) {
      const { voltage, internalResistance } = model();
      conductance(c, plus, minus, 1 / internalResistance);
      currentSource(c, minus, plus, voltage / internalResistance);
    },
    accept(c) {
      const { voltage, internalResistance } = model();
      element.voltage = c.v[plus] - c.v[minus];
      // Negative while the battery supplies power.
      element.current = (element.voltage - voltage) / internalResistance;
    },
  };
  return element;
}
