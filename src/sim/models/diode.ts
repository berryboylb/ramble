import type { CompiledElement, ModelOf } from '../../core/types.ts';
import { conductance, currentSource, GMIN, type SimElement } from '../stamp.ts';

/** Thermal voltage at 300 K. */
const VT = 0.025852;

/**
 * Limits the change of the junction voltage between Newton iterations (SPICE "pnjlim").
 * Without this, exp() overflows and Newton does not converge.
 */
function limitJunction(next: number, previous: number, nvt: number, critical: number): number {
  if (next > critical && Math.abs(next - previous) > 2 * nvt) {
    if (previous > 0) {
      const arg = 1 + (next - previous) / nvt;
      return arg > 0 ? previous + nvt * Math.log(arg) : critical;
    }
    return nvt * Math.log(next / nvt);
  }
  return next;
}

// Shockley diode: I = Is × (exp(V / (n × Vt)) − 1). LEDs use the same model with other values.
export function create(el: CompiledElement): SimElement {
  const [anode, cathode] = el.nodes;
  const model = () => el.model as ModelOf<'diode'>;
  let junction = 0;

  const currentAt = (v: number) => {
    const { saturationCurrent, emission } = model();
    return saturationCurrent * (Math.exp(Math.min(v / (emission * VT), 80)) - 1);
  };

  const element: SimElement = {
    nonlinear: true,
    voltage: 0,
    current: 0,
    stamp(c) {
      const { saturationCurrent, emission } = model();
      const nvt = emission * VT;
      const critical = nvt * Math.log(nvt / (Math.SQRT2 * saturationCurrent));
      junction = limitJunction(c.v[anode] - c.v[cathode], junction, nvt, critical);

      const e = Math.exp(Math.min(junction / nvt, 80));
      const id = saturationCurrent * (e - 1);
      const gd = (saturationCurrent / nvt) * e + GMIN;
      conductance(c, anode, cathode, gd);
      currentSource(c, anode, cathode, id - gd * junction);
    },
    accept(c) {
      element.voltage = c.v[anode] - c.v[cathode];
      element.current = currentAt(element.voltage);
      junction = element.voltage;
    },
  };
  return element;
}
