import type { CompiledCircuit } from '../core/types.ts';
import { solveLinear } from './mna.ts';
import { GMIN, type ModelFactory, type SimElement, type StampContext } from './stamp.ts';

const MAX_NEWTON_ITERATIONS = 100;

/** Transient solver. It starts from power off and uses backward Euler steps. */
export class Engine {
  time = 0;
  /** False when the last step did not converge. */
  converged = true;
  readonly elements: SimElement[];
  readonly voltages: Float64Array;
  private readonly ctx: StampContext;
  private readonly nonlinear: boolean;

  constructor(
    circuit: CompiledCircuit,
    factories: Record<string, ModelFactory>,
    readonly dt = 1e-5,
  ) {
    const size = circuit.nodeCount - 1;
    this.voltages = new Float64Array(circuit.nodeCount);
    this.ctx = {
      G: new Float64Array(size * size),
      I: new Float64Array(size),
      size,
      v: this.voltages,
      dt,
      time: 0,
    };
    this.elements = circuit.elements.map((el) => {
      const factory = factories[el.type];
      if (!factory) throw new Error(`No simulation model for "${el.type}".`);
      return factory(el);
    });
    this.nonlinear = this.elements.some((e) => e.nonlinear);
  }

  step(): void {
    const { ctx, elements, voltages } = this;
    const n = ctx.size;
    ctx.time = this.time + this.dt;
    this.converged = !this.nonlinear;

    const iterations = this.nonlinear ? MAX_NEWTON_ITERATIONS : 1;
    for (let iter = 0; iter < iterations; iter++) {
      ctx.G.fill(0);
      ctx.I.fill(0);
      for (let i = 0; i < n; i++) ctx.G[i * n + i] = GMIN;
      for (const e of elements) e.stamp(ctx);
      if (!solveLinear(ctx.G, ctx.I, n)) {
        this.converged = false;
        break;
      }

      let worst = 0;
      for (let i = 0; i < n; i++) {
        const next = ctx.I[i];
        worst = Math.max(worst, Math.abs(next - voltages[i + 1]) / (1e-6 + 1e-4 * Math.abs(next)));
        voltages[i + 1] = next;
      }
      if (this.nonlinear && iter > 0 && worst < 1) {
        this.converged = true;
        break;
      }
    }

    for (const e of elements) e.accept(ctx);
    this.time = ctx.time;
  }
}
