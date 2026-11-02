import { describe, expect, it } from 'vitest';
import { formatSI, parseSI } from '../src/core/units.ts';

describe('units', () => {
  it('formats values with an SI prefix', () => {
    expect(formatSI(0.0121, 'A')).toBe('12.1 mA');
    expect(formatSI(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatSI(1e-7, 'F')).toBe('100 nF');
    expect(formatSI(0, 'V')).toBe('0 V');
  });

  it('keeps values below 1 pico, so they do not show as 0', () => {
    expect(formatSI(1e-18, 'A')).toBe('1e-18 A');
    expect(formatSI(6e-21, '')).toBe('6e-21 ');
  });

  it('reads back what it formats', () => {
    for (const value of [1e-18, 2.52e-9, 1e-7, 0.25, 1000, 4.7e6]) {
      expect(parseSI(formatSI(value, '').trim())).toBeCloseTo(value, 20);
    }
    expect(parseSI('4.7k')).toBe(4700);
    expect(parseSI('100u')).toBeCloseTo(1e-4, 12);
    expect(parseSI('abc')).toBeNaN();
  });
});
