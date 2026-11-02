import type { CompiledCircuit, ModelSpec } from '../core/types.ts';
import type { FromWorker, SimState, ToWorker } from './protocol.ts';

/** Main-thread side of the simulator. The worker starts the first time the user presses Run. */
export class SimClient {
  running = false;
  onState: (state: SimState) => void = () => {};
  onError: (message: string) => void = () => {};
  private worker?: Worker;
  private circuit?: CompiledCircuit;
  private speed = 1;

  /** Sends a new circuit. A structural change starts the circuit again from power off. */
  load(circuit: CompiledCircuit): void {
    this.circuit = circuit;
    this.post({ type: 'load', circuit });
  }

  run(): void {
    if (!this.worker) {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        if (message.type === 'state') this.onState(message);
        else this.onError(message.message);
      };
      this.post({ type: 'speed', speed: this.speed });
      if (this.circuit) this.post({ type: 'load', circuit: this.circuit });
    }
    this.running = true;
    this.post({ type: 'run' });
  }

  pause(): void {
    this.running = false;
    this.post({ type: 'pause' });
  }

  reset(): void {
    this.post({ type: 'reset' });
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.post({ type: 'speed', speed });
  }

  /** Changes a value of 1 element and keeps the circuit state, for example a switch toggle. */
  setModel(index: number, model: ModelSpec): void {
    if (this.circuit) this.circuit.elements[index].model = model;
    this.post({ type: 'model', index, model });
  }

  private post(message: ToWorker): void {
    this.worker?.postMessage(message);
  }
}
