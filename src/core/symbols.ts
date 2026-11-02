// Schematic symbols for the library list, as SVG path data in a 40 × 20 view box.
// The catalog plugin puts the path into each category file, so the list shows before any 3D code loads.
// The app uses the same table for custom parts and for the symbol list in the editor.

export const SYMBOLS: Record<string, string> = {
  resistor: 'M0 10h8l2-5 4 10 4-10 4 10 4-10 4 10 2-5h8',
  capacitor: 'M0 10h17M17 3v14M23 3v14M23 10h17',
  'capacitor-polarized': 'M0 10h17M17 3v14M23 3q-3 7 0 14M23 10h17M11 4h4M13 2v4',
  inductor: 'M0 10h8a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0h8',
  transformer:
    'M2 2h6v2a2 2 0 0 1 0 4a2 2 0 0 1 0 4a2 2 0 0 1 0 4v2h-6M38 2h-6v2a2 2 0 0 0 0 4a2 2 0 0 0 0 4a2 2 0 0 0 0 4v2h6M18 2v16M22 2v16',
  diode: 'M0 10h14M14 4v12l12-6zM26 4v12M26 10h14',
  led: 'M0 10h14M14 4v12l12-6zM26 4v12M26 10h14M24 4l5-4m-2 0h2v2M29 6l5-4m-2 0h2v2',
  battery: 'M0 10h16M16 3v14M20 6v8M24 3v14M28 6v8M28 10h12',
  ac: 'M0 10h12M28 10h12M28 10a8 8 0 0 1-16 0a8 8 0 0 1 16 0M15 10q2.5-5 5 0t5 0',
  switch: 'M0 10h12M28 10h12M12 10l14-7',
  ic: 'M8 2h24v16h-24zM8 6h-6M8 10h-6M8 14h-6M32 6h6M32 10h6M32 14h6',
  npn: 'M2 10h12M14 4v12M14 8l10-6M14 12l10 6M20 16l4 2-1-4',
};
