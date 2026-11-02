import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, type SimElement } from '../stamp.ts';

const CLOSED = 1e3; // 1 mΩ
const OPEN = 1e-9; // 1 GΩ

export function create(el: CompiledElement): SimElement {
  const [a, b] = el.nodes;
  const g = () => ((el.model as ModelOf<'switch'>).closed ? CLOSED : OPEN);
  const element: SimElement = {
    nonlinear: false,
    voltage: 0,
    current: 0,
    stamp(c) {
      conductance(c, a, b, g());
    },
    accept(c) {
      element.voltage = c.v[a] - c.v[b];
      element.current = element.voltage * g();
    },
  };
  return element;
}
