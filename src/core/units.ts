const PREFIXES: [number, string][] = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

/** Formats a value with an SI prefix, for example 0.0121 A → "12.1 mA". */
export function formatSI(value: number, unit: string): string {
  if (!Number.isFinite(value)) return `– ${unit}`;
  const size = Math.abs(value);
  if (size === 0) return `0 ${unit}`;
  // Below the smallest prefix, use exponent notation, for example an LED saturation current of 1e-18 A.
  if (size < 1e-12) return `${Number(value.toPrecision(3)).toExponential()} ${unit}`;
  const [scale, prefix] = PREFIXES.find(([s]) => size >= s) ?? PREFIXES[PREFIXES.length - 1];
  return `${Number((value / scale).toPrecision(3))} ${prefix}${unit}`;
}

const SUFFIX: Record<string, number> = {
  G: 1e9,
  M: 1e6,
  k: 1e3,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  n: 1e-9,
  p: 1e-12,
};

/** Reads a value such as "4.7k", "100n" or "0.25". Returns NaN for bad input. */
export function parseSI(text: string): number {
  const match = /^\s*(-?\d*\.?\d+(?:e-?\d+)?)\s*([GMkmuµnp]?)/.exec(text);
  if (!match) return NaN;
  return Number(match[1]) * (match[2] ? SUFFIX[match[2]] : 1);
}
