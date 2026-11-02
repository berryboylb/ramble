import type { CompiledCircuit, ModelSpec } from '../core/types.ts';

export type ToWorker =
  | { type: 'load'; circuit: CompiledCircuit }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'speed'; speed: number }
  | { type: 'model'; index: number; model: ModelSpec };

export interface SimState {
  type: 'state';
  time: number;
  /** For element k: values[2k] is the voltage, values[2k + 1] is the current. */
  values: Float64Array;
  /** Voltage of each node to ground. */
  nodes: Float64Array;
  warnings: string[];
  /** True when the solver cannot keep up with the chosen speed. */
  slow: boolean;
}

export type FromWorker = SimState | { type: 'error'; message: string };
