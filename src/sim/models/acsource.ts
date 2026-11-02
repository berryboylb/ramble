import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, currentSource, type SimElement } from '../stamp.ts';

// A sine source with internal resistance, as a Norton equivalent.
export function create(el: CompiledElement): SimElement {
  const [plus, minus] = el.nodes;
  const model = () => el.model as ModelOf<'acsource'>;
  const sourceVoltage = (time: number) => {
    const { amplitude, frequency } = model();
    return amplitude * Math.sin(2 * Math.PI * frequency * time);
  };
  const element: SimElement = {
    nonlinear: false,
    voltage: 0,
    current: 0,
    stamp(c) {
      const r = model().internalResistance;
      conductance(c, plus, minus, 1 / r);
      currentSource(c, minus, plus, sourceVoltage(c.time) / r);
    },
    accept(c) {
      element.voltage = c.v[plus] - c.v[minus];
      element.current = (element.voltage - sourceVoltage(c.time)) / model().internalResistance;
    },
  };
  return element;
}
