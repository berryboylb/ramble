// Tier 2: the 3D workbench. The boot script loads this entry after the first paint.
// It shares no code with the boot script. The 2 sides talk through the DOM events in ShellEvents.
import { Registry } from './core/registry.ts';
import type { ShellEvents } from './core/types.ts';
import { formatSI } from './core/units.ts';
import type { ViewName } from './render/controls.ts';
import { createView } from './render/scene.ts';
import { SimClient } from './sim/client.ts';
import css from './ui/app.css?inline';
import { Inspector } from './ui/inspector.ts';
import { Workbench } from './workbench/workbench.ts';

type EventName = keyof ShellEvents;

const emit = <K extends EventName>(type: K, detail: ShellEvents[K]) =>
  dispatchEvent(new CustomEvent(type, { detail }));
const on = <K extends EventName>(type: K, listener: (detail: ShellEvents[K]) => void) =>
  addEventListener(type, (event) => listener((event as CustomEvent<ShellEvents[K]>).detail));

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

/** Creates an element with text and attributes. */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  attributes: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = text;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function createToolbar() {
  const run = element('button', 'Run');
  const reset = element('button', 'Reset');
  const speed = element('select', '', { 'aria-label': 'Simulation speed' });
  for (const value of ['1', '0.1', '0.01'])
    speed.append(element('option', `${value}× speed`, { value }));
  const all = element('input', '', { type: 'checkbox' });
  const allLabel = element('label', ' All labels');
  allLabel.prepend(all);
  const time = element('span', '');
  $('#tools').append(run, reset, speed, allLabel, time);
  return { run, reset, speed, all, time };
}

function createViewButtons(viewport: HTMLElement) {
  const bar = element('div', '', { id: 'views' });
  const back = element('button', 'Back to circuit');
  back.hidden = true;
  bar.append(back);
  const views: Record<ViewName, string> = { top: 'Top', front: 'Front', side: 'Side', iso: '3D' };
  const buttons = Object.entries(views).map(([view, text]) =>
    element('button', text, { 'data-view': view }),
  );
  bar.append(...buttons);
  viewport.append(bar);
  return { back, buttons };
}

function start(): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const registry = new Registry();
  const sim = new SimClient();
  const hint = $('#hint');
  const warn = $('#warn');
  const setHint = (text: string) => (hint.textContent = text);

  const viewport = $('#view');
  const labelRoot = element('div', '', { id: 'labels' });
  viewport.append(labelRoot);
  const view = createView(viewport, labelRoot);
  const tools = createToolbar();
  const viewButtons = createViewButtons(viewport);

  const bench = new Workbench(view, registry, {
    // The inspector is created below. This callback runs only after a click, so it exists by then.
    onSelect: (instance) => inspector.show(instance),
    onCircuit: (compiled) => sim.load(compiled),
    onModel: (index, model) => sim.setModel(index, model),
    onHint: setHint,
    onPartView: (active) => (viewButtons.back.hidden = !active),
  });
  const inspector = new Inspector($('#inspect'), bench, (name, learn) =>
    emit('ramble:learn', { name, learn }),
  );

  sim.onState = (state) => {
    bench.applyState(state);
    inspector.update();
    tools.time.textContent = `t = ${formatSI(state.time, 's')}${state.slow ? ' (slower than chosen speed)' : ''}`;
    warn.textContent = state.warnings.join(' ');
  };
  sim.onError = setHint;

  tools.run.addEventListener('click', () => {
    if (sim.running) sim.pause();
    else sim.run();
    tools.run.textContent = sim.running ? 'Pause' : 'Run';
  });
  tools.reset.addEventListener('click', () => sim.reset());
  tools.speed.addEventListener('change', () => sim.setSpeed(Number(tools.speed.value)));
  tools.all.addEventListener('change', () => bench.setShowAll(tools.all.checked));
  viewButtons.back.addEventListener('click', () => bench.backToCircuit());
  for (const button of viewButtons.buttons) {
    button.addEventListener('click', () => view.controls.setView(button.dataset.view as ViewName));
  }

  on('ramble:catalog', (entries) => registry.setEntries(entries));
  on(
    'ramble:pick',
    (id) => void bench.startPlacing(id).catch((error: Error) => setHint(error.message)),
  );
  on(
    'ramble:reload',
    (id) => void registry.reload(id).catch((error: Error) => setHint(error.message)),
  );

  viewport.classList.add('ready');
  view.invalidate();
  emit('ramble:ready', null);
}

start();
