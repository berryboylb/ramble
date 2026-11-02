// Tier 0: the only script in the first load. It must stay under the 2 KB budget.
// It shows the component library and the learn panel, then loads the 3D app after the first paint.
// It shares no code with the app. The 2 sides talk through the DOM events in ShellEvents.
import type {
  CatalogCategory,
  CatalogEntry,
  CatalogIndex,
  PartDef,
  ShellEvents,
} from './core/types.ts';
import { escapeHtml, renderLearn } from './ui/learn.ts';

type EventName = keyof ShellEvents;

const emit = <K extends EventName>(type: K, detail: ShellEvents[K]) =>
  dispatchEvent(new CustomEvent(type, { detail }));
const on = <K extends EventName>(type: K, listener: (detail: ShellEvents[K]) => void) =>
  addEventListener(type, (event) => listener((event as CustomEvent<ShellEvents[K]>).detail));
const byId = (id: string) => document.getElementById(id)!;

const list = byId('parts');
const search = byId('search') as HTMLInputElement;
let entries: CatalogEntry[] = [];
let appReady = false;
let pending: string | undefined;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url);
  return response.json();
}

async function loadCatalog(): Promise<void> {
  const index = await getJson<CatalogIndex>('/catalog/index.json');
  const categories = await Promise.all(
    index.categories.map((c) => getJson<CatalogCategory>(c.url)),
  );
  entries = categories.flatMap((c) => c.parts);
  list.innerHTML = categories
    .map(
      (c) =>
        `<h3>${escapeHtml(c.name)}</h3>` +
        c.parts
          .map(
            (p) =>
              `<button data-id="${escapeHtml(p.id)}"><svg viewBox="0 0 40 20"><path d="${escapeHtml(p.symbol)}"/></svg>${escapeHtml(p.name)}</button>`,
          )
          .join(''),
    )
    .join('');
  emit('ramble:catalog', entries);
}

list.addEventListener('click', async (event) => {
  const entry = entries.find(
    (p) => p.id === (event.target as Element).closest('button')?.dataset.id,
  );
  if (!entry) return;
  if (appReady) emit('ramble:pick', entry.id);
  else pending = entry.id;
  const part = await getJson<PartDef>(entry.url);
  renderLearn(byId('learn'), part.name, part.learn);
});

search.addEventListener('input', () => {
  const query = search.value.toLowerCase();
  for (const button of list.querySelectorAll('button')) {
    button.hidden = !button.textContent!.toLowerCase().includes(query);
  }
});

on('ramble:ready', () => {
  appReady = true;
  emit('ramble:catalog', entries);
  if (pending) emit('ramble:pick', pending);
});
on('ramble:learn', ({ name, learn }) => renderLearn(byId('learn'), name, learn));

loadCatalog().catch(() => (list.textContent = 'The component library did not load.'));

// Start the 3D download after the first paint. It does not wait for a click.
// The URL is in data-app. The build replaces it with the hashed file name.
requestAnimationFrame(() =>
  setTimeout(() =>
    import(/* @vite-ignore */ byId('view').dataset.app!).catch(
      () => (byId('hint').textContent = 'The 3D view could not start. Check that WebGL is on.'),
    ),
  ),
);

// Development only. Vite removes this block from the production build.
if (import.meta.hot) {
  import.meta.hot.on('catalog:changed', async ({ id }: { id: string }) => {
    await loadCatalog();
    emit('ramble:reload', id);
  });
}
