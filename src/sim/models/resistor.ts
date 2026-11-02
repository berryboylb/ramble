import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, type SimElement } from '../stamp.ts';

export function create(el: CompiledElement): SimElement {
  const [a, b] = el.nodes;
  const model = () => el.model as ModelOf<'resistor'>;
  const element: SimElement = {
    nonlinear: false,
    voltage: 0,
    current: 0,
    stamp(c) {
      conductance(c, a, b, 1 / model().resistance);
    },
    accept(c) {
      element.voltage = c.v[a] - c.v[b];
      element.current = element.voltage / model().resistance;
    },
  };
  return element;
}
