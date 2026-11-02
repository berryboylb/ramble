// Field labels and units, shared by the inspector and the part editor.

export const UNITS: Record<string, string> = {
  resistance: 'Ω',
  capacitance: 'F',
  inductance: 'H',
  voltage: 'V',
  internalResistance: 'Ω',
  amplitude: 'V',
  frequency: 'Hz',
  saturationCurrent: 'A',
  primaryInductance: 'H',
  maxPower: 'W',
  maxVoltage: 'V',
  maxCurrent: 'A',
};

/** "internalResistance" → "Internal resistance". */
export const labelOf = (key: string) =>
  key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`).replace(/^./, (c) => c.toUpperCase());

/** A label with its unit, for example "Resistance (Ω)". */
export const fieldLabel = (key: string) => `${labelOf(key)}${UNITS[key] ? ` (${UNITS[key]})` : ''}`;
