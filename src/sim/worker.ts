import type { CompiledCircuit } from '../core/types.ts';
import { Engine } from './engine.ts';
import type { FromWorker, ToWorker } from './protocol.ts';
import type { ModelFactory } from './stamp.ts';
import { ratingWarnings } from './warnings.ts';

// Each model is a separate chunk. The worker loads only the models that the circuit uses.
const modelLoaders = import.meta.glob<{ create: ModelFactory }>('./models/*.ts');

const TICK_MS = 16;
const MAX_STEPS_PER_TICK = 4000;

let circuit: CompiledCircuit | undefined;
let engine: Engine | undefined;
let factories: Record<string, ModelFactory> = {};
let running = false;
let speed = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

const post = (message: FromWorker, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer });

async function loadFactories(c: CompiledCircuit): Promise<void> {
  const types = [...new Set(c.elements.map((el) => el.type))].filter((type) => !factories[type]);
  const modules = await Promise.all(
    types.map((type) => {
      const loader = modelLoaders[`./models/${type}.ts`];
      if (!loader) throw new Error(`No simulation model for "${type}".`);
      return loader();
    }),
  );
  types.forEach((type, i) => (factories = { ...factories, [type]: modules[i].create }));
}

function postState(slow: boolean): void {
  if (!engine || !circuit) return;
  const values = new Float64Array(engine.elements.length * 2);
  engine.elements.forEach((e, k) => {
    values[2 * k] = e.voltage;
    values[2 * k + 1] = e.current;
  });
  const nodes = engine.voltages.slice();
  const warnings = ratingWarnings(circuit.elements, engine.elements);
  if (!engine.converged)
    warnings.push('The solver did not converge on the last step. Values can be wrong.');
  post({ type: 'state', time: engine.time, values, nodes, warnings, slow }, [
    values.buffer,
    nodes.buffer,
  ]);
}

function tick(): void {
  timer = undefined;
  if (!running || !engine) return;
  const wanted = Math.round((speed * TICK_MS) / 1000 / engine.dt);
  const steps = Math.min(Math.max(wanted, 1), MAX_STEPS_PER_TICK);
  for (let i = 0; i < steps; i++) engine.step();
  postState(wanted > MAX_STEPS_PER_TICK);
  timer = setTimeout(tick, TICK_MS);
}

function startTicking(): void {
  if (running && timer === undefined) timer = setTimeout(tick, 0);
}

async function handle(message: ToWorker): Promise<void> {
  switch (message.type) {
    case 'load':
      circuit = message.circuit;
      await loadFactories(circuit);
      engine = new Engine(circuit, factories);
      postState(false);
      startTicking();
      break;
    case 'reset':
      if (circuit) engine = new Engine(circuit, factories);
      postState(false);
      break;
    case 'run':
      running = true;
      startTicking();
      break;
    case 'pause':
      running = false;
      break;
    case 'speed':
      speed = message.speed;
      break;
    case 'model':
      // Elements read their model on every step, so the change applies at once and keeps the state.
      if (circuit) circuit.elements[message.index].model = message.model;
      break;
  }
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  handle(event.data).catch((error: Error) => post({ type: 'error', message: error.message }));
};
