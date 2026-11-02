// Shared data types. Part files, the registry, the 3D builders and the simulator all use these.

export type Vec3 = [number, number, number];

export type Category = 'passive' | 'semiconductor' | 'source' | 'control' | 'ic';

export type Face = 'top' | 'front' | 'side';

/** Text printed on a part body. `rotation` is in degrees. */
export interface Marking {
  text: string;
  face?: Face;
  height?: number;
  color?: string;
  position?: Vec3;
  rotation?: Vec3;
}

/** A basic solid for the `custom` shape. `rotation` is in degrees. */
export interface Primitive {
  type: 'box' | 'cylinder' | 'sphere';
  /** box: width, height, depth. cylinder: top radius, bottom radius, height. sphere: radius. */
  size: Vec3;
  position: Vec3;
  rotation?: Vec3;
  color: string;
  metal?: boolean;
}

/** Geometry in millimetres. The board surface is y = 0. */
export type ShapeSpec =
  | {
      kind: 'axial';
      bodyLength: number;
      bodyRadius: number;
      pitch: number;
      color: string;
      profile?: 'bone' | 'straight';
      bands?: 'resistor';
      stripe?: string;
      opacity?: number;
    }
  | {
      kind: 'radial';
      radius: number;
      height: number;
      pitch: number;
      color: string;
      stripe?: string;
    }
  | { kind: 'disc'; radius: number; thickness: number; pitch: number; color: string }
  | {
      kind: 'coil';
      radius: number;
      length: number;
      turns: number;
      pitch: number;
      color: string;
      wire: string;
    }
  | { kind: 'led'; radius: number; pitch: number; color: string }
  | { kind: 'transformer'; width: number; height: number; depth: number; color: string }
  | { kind: 'battery'; length: number; width: number; height: number; color: string }
  | { kind: 'cell'; length: number; radius: number; color: string }
  | { kind: 'switch'; length: number; width: number; height: number; pitch: number; color: string }
  | { kind: 'dip'; pins: number; color: string }
  | { kind: 'to92'; color: string }
  | { kind: 'custom'; primitives: Primitive[]; pins: Vec3[] };

export type ShapeKind = ShapeSpec['kind'];
export type ShapeOf<K extends ShapeKind> = Extract<ShapeSpec, { kind: K }>;

/** Electrical values in SI units: ohm, farad, henry, volt, ampere, hertz. */
export type ModelSpec =
  | { type: 'resistor'; resistance: number }
  | { type: 'capacitor'; capacitance: number; polarized?: boolean }
  | { type: 'inductor'; inductance: number; resistance?: number }
  | { type: 'battery'; voltage: number; internalResistance: number }
  | { type: 'acsource'; amplitude: number; frequency: number; internalResistance: number }
  | { type: 'diode'; saturationCurrent: number; emission: number }
  | { type: 'switch'; closed: boolean }
  | { type: 'transformer'; primaryInductance: number; turnsRatio: number; coupling: number }
  | { type: 'none'; pins: string[] };

export type ModelType = ModelSpec['type'];
export type ModelOf<T extends ModelType> = Extract<ModelSpec, { type: T }>;

export interface Ratings {
  maxPower?: number;
  maxVoltage?: number;
  maxCurrent?: number;
}

export interface Learn {
  summary: string;
  formula?: string;
  tips?: string[];
}

/** A fully resolved part definition. */
export interface PartDef {
  id: string;
  name: string;
  category: Category;
  version: number;
  symbol: string;
  shape: ShapeSpec;
  model: ModelSpec;
  ratings?: Ratings;
  markings?: Marking[];
  learn: Learn;
}

type DeepPartial<T> = T extends unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** A part as written in a file. With `extends`, it holds only the fields that differ from the base. */
export type PartInput = DeepPartial<PartDef> & { id: string; extends?: string };

// Catalog files served to the browser.

export interface CatalogEntry {
  id: string;
  name: string;
  /** SVG path data for the schematic symbol, in a 40 × 20 view box. */
  symbol: string;
  url: string;
}

export interface CatalogCategory {
  id: Category;
  name: string;
  parts: CatalogEntry[];
}

export interface CatalogIndex {
  version: 1;
  categories: { id: Category; name: string; url: string }[];
}

/**
 * DOM events between the page shell (boot.ts, tier 0) and the 3D app (app.ts, tier 2).
 * The 2 sides share no code, so the shell stays inside its 2 KB budget.
 */
export interface ShellEvents {
  /** Shell → app: the catalog entries. Sent when the catalog loads and after `ramble:ready`. */
  'ramble:catalog': CatalogEntry[];
  /** Shell → app: the user chose a part to place. */
  'ramble:pick': string;
  /** Shell → app: a part file changed (dev server only). */
  'ramble:reload': string;
  /** App → shell: the app has started. */
  'ramble:ready': null;
  /** App → shell: show the learn panel for a part. */
  'ramble:learn': { name: string; learn: Learn };
}

// Circuit data passed from the workbench to the simulator.

export interface PinRef {
  inst: string;
  pin: number;
}

export interface CompiledElement {
  id: string;
  label: string;
  type: Exclude<ModelType, 'none'>;
  /** Node index for each terminal. Node 0 is ground. */
  nodes: number[];
  model: ModelSpec;
  ratings?: Ratings;
}

export interface CompiledCircuit {
  nodeCount: number;
  elements: CompiledElement[];
}
