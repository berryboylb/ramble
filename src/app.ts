// Tier 2: the 3D workbench. The boot script loads this entry after the first paint.
// It shares no code with the boot script. The 2 sides talk through the DOM events in ShellEvents.
import { Registry } from './core/registry.ts';
import { storage } from './core/storage.ts';
import type { PartInput, SavedBoard, ShellEvents } from './core/types.ts';
import { formatSI } from './core/units.ts';
import { isCustomId } from './core/validate.ts';
import type { EditorHost, EditorStart } from './editor/editor.ts';
import type { ViewName } from './render/controls.ts';
import { createView } from './render/scene.ts';
import { SimClient } from './sim/client.ts';
import css from './ui/app.css?inline';
import { Inspector } from './ui/inspector.ts';
import { MyParts } from './ui/myparts.ts';
import { Workbench } from './workbench/workbench.ts';

type EventName = keyof ShellEvents;

const emit = <K extends EventName>(type: K, detail: ShellEvents[K]) =>
  dispatchEvent(new CustomEvent(type, { detail }));
const on = <K extends EventName>(type: K, listener: (detail: ShellEvents[K]) => void) =>
  addEventListener(type, (event) => listener((event as CustomEvent<ShellEvents[K]>).detail));

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const BOARD_KEY = 'current';
const SAVE_DELAY_MS = 400;

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
  const newPart = element('button', 'New part');
  const importPart = element('button', 'Import part');
  const clear = element('button', 'Clear board');
  const time = element('span', '');
  $('#tools').append(run, reset, speed, allLabel, newPart, importPart, clear, time);
  return { run, reset, speed, all, newPart, importPart, clear, time };
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

/** Lets the user choose a .json file and returns its text. */
function chooseFile(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const input = element('input', '', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file ? file.text() : undefined);
    });
    input.click();
  });
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

  // Saving the board. Storage can fail (private window); the app still works without it.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let restoring = true;
  const saveBoard = () => {
    if (restoring) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      storage.put('boards', bench.serialize(), BOARD_KEY).catch(() => {
        setHint('The board could not be saved in this browser.');
      });
    }, SAVE_DELAY_MS);
  };

  const bench = new Workbench(view, registry, {
    // The inspector is created below. This callback runs only after a click, so it exists by then.
    onSelect: (instance) => inspector.show(instance),
    onCircuit: (compiled) => sim.load(compiled),
    onModel: (index, model) => sim.setModel(index, model),
    onHint: setHint,
    onPartView: (active) => (viewButtons.back.hidden = !active),
    onBoardChanged: saveBoard,
  });

  // Custom parts and the part editor.
  const customParts = () =>
    registry
      .list()
      .filter((part) => isCustomId(part.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  const myParts = new MyParts((part) => {
    emit('ramble:learn', { name: part.name, learn: part.learn });
    void bench.startPlacing(part.id);
  });
  const showMyParts = () => myParts.render($('#parts'), customParts());

  const host: EditorHost = {
    registry,
    async save(input: PartInput) {
      await registry.upsert(input);
      await storage.put('parts', input).catch(() => {
        setHint('The part works now, but it could not be saved in this browser.');
      });
      showMyParts();
    },
    async remove(id: string) {
      if (bench.usesPart(id)) return 'This part is on the board. Delete it from the board first.';
      const dependants = registry.dependants(id);
      if (dependants.length > 0) return `These parts are remixes of it: ${dependants.join(', ')}.`;
      registry.remove(id);
      await storage.delete('parts', id).catch(() => undefined);
      showMyParts();
      return undefined;
    },
    hint: setHint,
  };
  const loadEditor = () => import('./editor/editor.ts');
  const openEditor = (start: EditorStart) =>
    loadEditor()
      .then((editor) => editor.openEditor(host, start))
      .catch((error: Error) => setHint(error.message));

  const inspector = new Inspector(
    $('#inspect'),
    bench,
    (name, learn) => emit('ramble:learn', { name, learn }),
    (instance) =>
      openEditor(
        isCustomId(instance.def.id)
          ? { mode: 'edit', part: instance.def }
          : { mode: 'remix', base: instance.def },
      ),
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
  tools.newPart.addEventListener('click', () => void openEditor({ mode: 'new' }));
  tools.importPart.addEventListener('click', async () => {
    const text = await chooseFile();
    if (text === undefined) return;
    try {
      await openEditor({ mode: 'import', input: JSON.parse(text) as PartInput });
    } catch (error) {
      setHint(`The file is not valid JSON: ${(error as Error).message}`);
    }
  });
  tools.clear.addEventListener('click', () => {
    if (confirm('Remove every part and wire from the board?')) bench.clear();
  });
  viewButtons.back.addEventListener('click', () => bench.backToCircuit());
  for (const button of viewButtons.buttons) {
    button.addEventListener('click', () => view.controls.setView(button.dataset.view as ViewName));
  }

  // The first catalog event with entries means built-in parts can load.
  let catalogLoaded: () => void;
  const catalogReady = new Promise<void>((resolve) => (catalogLoaded = resolve));
  on('ramble:catalog', (entries) => {
    registry.setEntries(entries);
    showMyParts();
    if (entries.length > 0) catalogLoaded();
  });
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

  void catalogReady.then(async () => {
    await loadCustomParts(registry, setHint);
    showMyParts();
    await restoreBoard(bench, setHint);
    restoring = false;
    // A hash can be a share link. The editor knows the format, so only it reads the hash.
    if (location.hash) {
      const hash = location.hash;
      await loadEditor()
        .then(async (editor) => {
          if (await editor.openShareLink(host, hash)) {
            history.replaceState(null, '', location.pathname + location.search);
          }
        })
        .catch((error: Error) => setHint(`The share link did not open: ${error.message}`));
    }
  });
}

/** Loads the custom parts saved in this browser. A part that fails validation is skipped. */
async function loadCustomParts(registry: Registry, setHint: (text: string) => void) {
  const saved = await storage.all<PartInput>('parts').catch(() => [] as PartInput[]);
  const failed: string[] = [];
  // A remix of a custom part needs its base first, so retry until no more parts load.
  let pending = saved;
  while (pending.length > 0) {
    const next: PartInput[] = [];
    for (const input of pending) {
      try {
        await registry.upsert(input);
      } catch {
        next.push(input);
      }
    }
    if (next.length === pending.length) {
      failed.push(...next.map((input) => input.id));
      break;
    }
    pending = next;
  }
  if (failed.length > 0) setHint(`These saved parts could not load: ${failed.join(', ')}.`);
}

async function restoreBoard(bench: Workbench, setHint: (text: string) => void) {
  const board = await storage.get<SavedBoard>('boards', BOARD_KEY).catch(() => undefined);
  if (!board || board.parts.length === 0) return;
  const missing = await bench.restore(board);
  setHint(
    missing.length > 0
      ? `Board restored. These parts no longer exist: ${[...new Set(missing)].join(', ')}.`
      : 'Your last board is back. Clear board starts a new one.',
  );
}

start();
