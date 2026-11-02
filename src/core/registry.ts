import { resolvePart } from './resolve.ts';
import type { CatalogEntry, PartDef, PartInput } from './types.ts';
import { validate } from './validate.ts';

export type Change = 'changed' | 'removed';
type Listener = (id: string, change: Change) => void;
type FetchJson = (url: string) => Promise<unknown>;

const defaultFetch: FetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.json();
};

export class ValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

/**
 * Holds the part definitions that are in use. Every change goes through `upsert`,
 * so there is one path for validation and one event for redraw.
 */
export class Registry {
  private readonly urls = new Map<string, string>();
  private readonly inputs = new Map<string, PartInput>();
  private readonly parts = new Map<string, PartDef>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly fetchJson: FetchJson = defaultFetch) {}

  setEntries(entries: CatalogEntry[]): void {
    for (const entry of entries) this.urls.set(entry.id, entry.url);
  }

  get(id: string): PartDef | undefined {
    return this.parts.get(id);
  }

  /** Every loaded part. */
  list(): PartDef[] {
    return [...this.parts.values()];
  }

  /** The id that a loaded part extends, if any. */
  baseOf(id: string): string | undefined {
    return this.inputs.get(id)?.extends;
  }

  /** True for a part from the catalog. Custom parts are not in the catalog. */
  isCatalogPart(id: string): boolean {
    return this.urls.has(id);
  }

  /** Ids of loaded parts whose `extends` names this part. */
  dependants(id: string): string[] {
    return [...this.inputs.values()]
      .filter((input) => input.extends === id)
      .map((input) => input.id);
  }

  /** Returns a part. Fetches it the first time. */
  async load(id: string): Promise<PartDef> {
    const part = this.parts.get(id);
    if (part) return part;
    return this.upsert(await this.fetchInput(id));
  }

  /** Fetches a part again, for example after its file changed. */
  async reload(id: string): Promise<void> {
    if (this.parts.has(id)) await this.upsert(await this.fetchInput(id));
  }

  /** Resolves `extends` and loads the base parts. Does not validate or store the part. */
  async resolve(input: PartInput): Promise<PartDef> {
    await this.loadBases(input);
    return resolvePart(input, (id) => (id === input.id ? input : this.inputs.get(id)));
  }

  /** Validates, resolves and stores a part, then tells every listener. */
  async upsert(input: PartInput): Promise<PartDef> {
    const part = await this.resolve(input);
    const problems = validate(part);
    if (problems.length > 0) throw new ValidationError(problems);

    this.inputs.set(input.id, input);
    this.parts.set(part.id, part);
    this.emit(part.id, 'changed');

    // Parts that extend this one must pick up the change.
    for (const other of this.inputs.values()) {
      if (other.extends === part.id && this.parts.has(other.id)) await this.upsert(other);
    }
    return part;
  }

  /** Removes a part. The caller must check first that nothing uses it. */
  remove(id: string): void {
    if (!this.parts.delete(id)) return;
    this.inputs.delete(id);
    this.emit(id, 'removed');
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(id: string, change: Change): void {
    for (const listener of this.listeners) listener(id, change);
  }

  private async fetchInput(id: string): Promise<PartInput> {
    const url = this.urls.get(id);
    if (!url) throw new Error(`Unknown part "${id}".`);
    return (await this.fetchJson(url)) as PartInput;
  }

  private async loadBases(input: PartInput): Promise<void> {
    const seen = new Set([input.id]);
    let base = input.extends;
    while (base && !seen.has(base)) {
      seen.add(base);
      if (!this.inputs.has(base)) this.inputs.set(base, await this.fetchInput(base));
      base = this.inputs.get(base)?.extends;
    }
  }
}
