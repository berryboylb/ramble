import type { CompiledElement } from '../core/types.ts';
import { formatSI } from '../core/units.ts';
import type { SimElement } from './stamp.ts';

/** Compares each element with its ratings. Returns 1 message per problem. */
export function ratingWarnings(circuit: CompiledElement[], elements: SimElement[]): string[] {
  const warnings: string[] = [];
  circuit.forEach((el, k) => {
    const { voltage, current } = elements[k];
    const power = Math.abs(voltage * current);
    const r = el.ratings ?? {};
    if (r.maxPower && power > r.maxPower) {
      warnings.push(
        `${el.label}: power ${formatSI(power, 'W')} is above its ${formatSI(r.maxPower, 'W')} rating.`,
      );
    }
    if (r.maxCurrent && Math.abs(current) > r.maxCurrent) {
      warnings.push(
        `${el.label}: current ${formatSI(Math.abs(current), 'A')} is above its ${formatSI(r.maxCurrent, 'A')} rating.`,
      );
    }
    if (r.maxVoltage && Math.abs(voltage) > r.maxVoltage) {
      warnings.push(
        `${el.label}: voltage ${formatSI(Math.abs(voltage), 'V')} is above its ${formatSI(r.maxVoltage, 'V')} rating.`,
      );
    }
    if (el.model.type === 'capacitor' && el.model.polarized && voltage < -0.3) {
      warnings.push(
        `${el.label} is connected backwards. A polarised capacitor can fail when reversed.`,
      );
    }
  });
  return warnings;
}
