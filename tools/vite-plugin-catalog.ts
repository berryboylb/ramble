import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { resolvePart } from '../src/core/resolve.ts';
import type {
  Category,
  CatalogCategory,
  CatalogIndex,
  PartDef,
  PartInput,
} from '../src/core/types.ts';
import { CATEGORIES, validate } from '../src/core/validate.ts';
import { SYMBOLS } from './symbols.ts';

// Builds the component catalog from catalog/parts/*.json.
// Dev server: serves the catalog from memory and tells the browser when a part file changes.
// Build: validates every part and writes content-hashed files to dist/catalog.

export const PARTS_DIR = path.resolve('catalog/parts');

export interface Catalog {
  /** File contents keyed by path below /catalog/. */
  files: Map<string, string>;
  errors: string[];
}

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 10);

export function buildCatalog(dir: string, mode: 'dev' | 'build'): Catalog {
  const errors: string[] = [];
  const inputs = new Map<string, PartInput>();
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    try {
      const input = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as PartInput;
      if (`${input.id}.json` !== file)
        errors.push(`${file}: the file name must be "${input.id}.json".`);
      inputs.set(input.id, input);
    } catch (error) {
      errors.push(`${file}: ${(error as Error).message}`);
    }
  }

  const files = new Map<string, string>();
  // In dev, the content hash goes in the query string. In the build, it goes in the file name.
  const place = (name: string, body: string) => {
    const hash = hashOf(body);
    const file = mode === 'build' ? name.replace(/\.json$/, `.${hash}.json`) : name;
    files.set(file, body);
    return mode === 'build' ? `/catalog/${file}` : `/catalog/${file}?v=${hash}`;
  };

  const byCategory = new Map<Category, CatalogCategory['parts']>();
  for (const input of inputs.values()) {
    let part: PartDef;
    try {
      part = resolvePart(input, (id) => inputs.get(id));
    } catch (error) {
      errors.push((error as Error).message);
      continue;
    }
    const problems = validate(part);
    const symbol = SYMBOLS[part.symbol];
    if (!symbol) problems.push(`${part.id}: unknown symbol "${part.symbol}".`);
    if (problems.length > 0) {
      errors.push(...problems);
      continue;
    }
    const url = place(`parts/${part.id}.json`, JSON.stringify(part));
    const list = byCategory.get(part.category) ?? [];
    list.push({ id: part.id, name: part.name, symbol, url });
    byCategory.set(part.category, list);
  }

  const index: CatalogIndex = { version: 1, categories: [] };
  for (const [id, name] of Object.entries(CATEGORIES) as [Category, string][]) {
    const parts = byCategory.get(id);
    if (!parts) continue;
    const category: CatalogCategory = { id, name, parts };
    index.categories.push({ id, name, url: place(`c/${id}.json`, JSON.stringify(category)) });
  }
  files.set('index.json', JSON.stringify(index));
  return { files, errors };
}

export function catalogPlugin(dir = PARTS_DIR): Plugin {
  return {
    name: 'ramble-catalog',

    configureServer(server) {
      let catalog = buildCatalog(dir, 'dev');
      const report = () => {
        if (catalog.errors.length > 0) {
          server.config.logger.error(catalog.errors.join('\n'));
          server.ws.send({ type: 'error', err: { message: catalog.errors.join('\n'), stack: '' } });
        }
      };
      report();

      server.watcher.add(dir);
      server.watcher.on('all', (event, file) => {
        if (
          !file.startsWith(dir) ||
          !file.endsWith('.json') ||
          !['add', 'change', 'unlink'].includes(event)
        )
          return;
        catalog = buildCatalog(dir, 'dev');
        report();
        server.ws.send({
          type: 'custom',
          event: 'catalog:changed',
          data: { id: path.basename(file, '.json') },
        });
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/catalog/')) return next();
        const body = catalog.files.get(url.slice('/catalog/'.length));
        if (body === undefined) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(body);
      });
    },

    generateBundle() {
      const catalog = buildCatalog(dir, 'build');
      if (catalog.errors.length > 0)
        this.error(`The catalog has errors:\n${catalog.errors.join('\n')}`);
      for (const [file, source] of catalog.files) {
        this.emitFile({ type: 'asset', fileName: `catalog/${file}`, source });
      }
    },
  };
}
