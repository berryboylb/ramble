import type { CompiledElement } from '../core/types.ts';

/**
 * The matrix equation for one solve: G × v = I.
 * Row and column `node - 1` belong to a node. Node 0 is ground and has no row.
 */
export interface StampContext {
  G: Float64Array;
  I: Float64Array;
  size: number;
  /** Node voltages from the last iteration. v[0] is ground and is always 0. */
  v: Float64Array;
  /** Time step in seconds. */
  dt: number;
  /** Time at the end of this step in seconds. */
  time: number;
}

export interface SimElement {
  readonly nonlinear: boolean;
  /** Adds this element to the matrix. Called once per Newton iteration. */
  stamp(c: StampContext): void;
  /** Stores the state for the next step, after the step has converged. */
  accept(c: StampContext): void;
  /** Voltage across the first 2 terminals, after the last accepted step. */
  voltage: number;
  /** Current into terminal 0 and out of terminal 1, after the last accepted step. */
  current: number;
}

export type ModelFactory = (el: CompiledElement) => SimElement;

/** Very small conductance from every node to ground. It keeps the matrix solvable. */
export const GMIN = 1e-12;

function add(c: StampContext, row: number, col: number, value: number): void {
  if (row > 0 && col > 0) c.G[(row - 1) * c.size + (col - 1)] += value;
}

/** A conductance g between nodes a and b. */
export function conductance(c: StampContext, a: number, b: number, g: number): void {
  add(c, a, a, g);
  add(c, b, b, g);
  add(c, a, b, -g);
  add(c, b, a, -g);
}

/** A current from a to b equal to g × (v[p] − v[n]). */
export function transconductance(
  c: StampContext,
  a: number,
  b: number,
  p: number,
  n: number,
  g: number,
): void {
  add(c, a, p, g);
  add(c, a, n, -g);
  add(c, b, p, -g);
  add(c, b, n, g);
}

/** A current source that takes current i out of node `from` and pushes it into node `to`. */
export function currentSource(c: StampContext, from: number, to: number, i: number): void {
  if (from > 0) c.I[from - 1] -= i;
  if (to > 0) c.I[to - 1] += i;
}
