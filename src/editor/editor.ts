// Tier 6: the part editor. It loads the first time the user remixes, edits, imports or makes a part.
// The form edits a full draft. On save, a remix stores only what differs from its base.
import { Box3, type Group, Sphere } from 'three';
import { terminals } from '../core/models.ts';
import { type Registry, ValidationError } from '../core/registry.ts';
import { decodePart, encodePart, SHARE_PREFIX } from '../core/share.ts';
import { SYMBOLS } from '../core/symbols.ts';
import type {
  Face,
  Marking,
  ModelType,
  PartDef,
  PartInput,
  Primitive,
  ShapeKind,
  Vec3,
} from '../core/types.ts';
import { formatSI, parseSI } from '../core/units.ts';
import { CATEGORIES, CUSTOM_PREFIX, isCustomId, validate } from '../core/validate.ts';
import { pinMarker } from '../render/pins.ts';
import { createView, type View } from '../render/scene.ts';
import { buildShape } from '../render/shapes/index.ts';
import { fieldLabel, labelOf, UNITS } from '../ui/fields.ts';
import { MODEL_DEFAULTS, newPart, SHAPE_DEFAULTS } from './defaults.ts';
import { remixOf } from './remix.ts';
import css from './editor.css?inline';

export interface EditorHost {
  registry: Registry;
  /** Stores a part in the registry and in the browser, and updates the library list. */
  save(input: PartInput): Promise<void>;
  /** Deletes a custom part. Returns the reason when it cannot. */
  remove(id: string): Promise<string | undefined>;
  hint(text: string): void;
}

export type EditorStart =
  | { mode: 'remix'; base: PartDef }
  | { mode: 'edit'; part: PartDef }
  | { mode: 'new' }
  | { mode: 'import'; input: PartInput };

type Json = Record<string, unknown>;

const PREVIEW_DELAY_MS = 120;
const TITLES: Record<EditorStart['mode'], string> = {
  remix: 'Remix part',
  edit: 'Edit part',
  new: 'New part',
  import: 'Imported part',
};
/** Text fields that accept only a few values get a select. */
const CHOICES: Record<string, [string, string][]> = {
  profile: [
    ['bone', 'Bone (wider ends)'],
    ['straight', 'Straight'],
  ],
  bands: [
    ['', 'None'],
    ['resistor', 'Resistor colour code'],
  ],
};
const FACES: Face[] = ['top', 'front', 'side'];
const PRIMITIVE_SIZE_HINT: Record<Primitive['type'], string> = {
  box: 'Size: width, height, depth (mm)',
  cylinder: 'Size: top radius, bottom radius, height (mm)',
  sphere: 'Size: radius (mm). The other 2 values are not used.',
};

let styled = false;

/** A copy of the draft without empty optional sections, so they are not saved or validated. */
function clean(part: PartDef): PartDef {
  const out = structuredClone(part);
  if (out.ratings && Object.keys(out.ratings).length === 0) delete out.ratings;
  if (out.markings?.length === 0) delete out.markings;
  return out;
}

/** A free custom id based on a name, for example "my-resistor-1k-2". */
function freeId(registry: Registry, base: string): string {
  const stem = `${CUSTOM_PREFIX}${base.replace(new RegExp(`^${CUSTOM_PREFIX}`), '')}`.slice(0, 58);
  let id = stem;
  for (let n = 2; registry.get(id); n++) id = `${stem}-${n}`;
  return id;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

export async function openEditor(host: EditorHost, start: EditorStart): Promise<void> {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    styled = true;
  }
  const { registry } = host;
  let draft: PartDef;
  let base: PartDef | undefined;
  if (start.mode === 'remix') {
    base = start.base;
    draft = {
      ...structuredClone(start.base),
      id: freeId(registry, start.base.id),
      name: `${start.base.name} (remix)`.slice(0, 80),
    };
  } else if (start.mode === 'edit') {
    draft = structuredClone(start.part);
    const baseId = registry.baseOf(start.part.id);
    base = baseId ? await registry.load(baseId) : undefined;
  } else if (start.mode === 'new') {
    draft = newPart(freeId(registry, 'part'));
  } else {
    draft = await registry.resolve(start.input);
    base = start.input.extends ? await registry.load(start.input.extends) : undefined;
    if (!isCustomId(draft.id)) draft.id = freeId(registry, draft.id);
  }
  new PartEditor(host, draft, base, start.mode).open();
}

/** Opens the editor with the part in a share link. Returns false when the hash is not a share link. */
export async function openShareLink(host: EditorHost, hash: string): Promise<boolean> {
  if (!hash.startsWith(SHARE_PREFIX)) return false;
  const input = (await decodePart(hash)) as PartInput;
  await openEditor(host, { mode: 'import', input });
  return true;
}

class PartEditor {
  private readonly dialog = element('dialog', '', 'editor');
  private readonly form = element('div', '', 'editor-form');
  private readonly errors = element('ul', '', 'editor-errors');
  private readonly json = element('textarea', '', 'editor-json');
  private readonly saveButton = element('button', 'Save');
  private readonly previewBox = element('div', '', 'editor-preview');
  private readonly labelRoot = element('div', '', 'editor-labels');
  private preview?: View;
  private previewObject?: Group;
  private previewTimer?: ReturnType<typeof setTimeout>;
  private fitted = false;
  /** Problems with the part itself. The preview draws only when there are none. */
  private partProblems: string[] = [];

  constructor(
    private readonly host: EditorHost,
    private draft: PartDef,
    private base: PartDef | undefined,
    private readonly mode: EditorStart['mode'],
  ) {}

  private get editing(): boolean {
    return this.mode === 'edit';
  }

  open(): void {
    const side = element('div', '', 'editor-side');
    const heading = element('h2', TITLES[this.mode]);
    const actions = element('div', '', 'actions');
    actions.append(
      this.saveButton,
      this.button('Download JSON', () => this.download()),
      this.button('Copy share link', () => void this.copyShareLink()),
      this.button('Fit view', () => this.fit()),
    );
    if (this.editing) actions.append(this.button('Delete part', () => void this.remove()));
    actions.append(this.button('Close', () => this.dialog.close()));
    this.saveButton.addEventListener('click', () => void this.save());

    const applyJson = this.button('Apply JSON', () => void this.applyJson());
    this.previewBox.append(this.labelRoot);
    side.append(
      this.previewBox,
      element('p', 'Drag to turn the part. Scroll to zoom.', 'editor-note'),
      this.errors,
      element('h3', 'JSON (what Save stores)'),
      this.json,
      applyJson,
    );
    this.dialog.append(heading, actions, this.form, side);
    this.dialog.addEventListener('close', () => this.dispose());
    document.body.append(this.dialog);
    this.dialog.showModal();

    this.preview = createView(this.previewBox, this.labelRoot, { board: false });
    this.renderForm();
  }

  // Changes.

  /** Call after every edit. A structural edit (new rows, new kind) rebuilds the form. */
  private changed(structural = false): void {
    if (structural) this.renderForm();
    else this.refresh();
  }

  private refresh(): void {
    this.partProblems = validate(clean(this.draft));
    const problems = [...this.partProblems, ...this.idProblems()];
    this.errors.replaceChildren(...problems.map((p) => element('li', p)));
    this.saveButton.disabled = problems.length > 0;
    this.json.value = JSON.stringify(this.saveInput(), null, 2);
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => void this.updatePreview(), PREVIEW_DELAY_MS);
  }

  /** Rules for custom parts only, on top of the shared part validation. */
  private idProblems(): string[] {
    const problems: string[] = [];
    const { id } = this.draft;
    if (!isCustomId(id)) problems.push(`${id}: the id must start with "${CUSTOM_PREFIX}".`);
    if (!this.editing && this.host.registry.get(id)) {
      problems.push(`${id}: a part with this id exists. Choose another id.`);
    }
    if (!SYMBOLS[this.draft.symbol]) problems.push(`${id}: unknown symbol "${this.draft.symbol}".`);
    return problems;
  }

  /** What Save stores: only the changes for a remix, the full part otherwise. */
  private saveInput(): PartInput {
    const part = clean(this.draft);
    return this.base ? remixOf(part, this.base) : part;
  }

  /** A part that works in another browser. A remix of a custom part carries its base resolved. */
  private portableInput(): PartInput {
    const part = clean(this.draft);
    return this.base && this.host.registry.isCatalogPart(this.base.id)
      ? remixOf(part, this.base)
      : part;
  }

  // Actions.

  private async save(): Promise<void> {
    try {
      await this.host.save(this.saveInput());
      this.host.hint(`Saved ${this.draft.name}. It is in "My parts" in the library.`);
      this.dialog.close();
    } catch (error) {
      const problems =
        error instanceof ValidationError ? error.problems : [(error as Error).message];
      this.errors.replaceChildren(...problems.map((p) => element('li', p)));
    }
  }

  private async remove(): Promise<void> {
    if (!confirm(`Delete ${this.draft.name}? This cannot be undone.`)) return;
    const reason = await this.host.remove(this.draft.id);
    if (reason) {
      this.errors.replaceChildren(element('li', reason));
      return;
    }
    this.host.hint(`Deleted ${this.draft.name}.`);
    this.dialog.close();
  }

  private download(): void {
    const blob = new Blob([JSON.stringify(this.portableInput(), null, 2)], {
      type: 'application/json',
    });
    const link = element('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${this.draft.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private async copyShareLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}${await encodePart(this.portableInput())}`;
    try {
      await navigator.clipboard.writeText(url);
      this.host.hint('Share link copied. Anyone with the link can open this part.');
    } catch {
      prompt('Copy this share link:', url);
    }
  }

  private async applyJson(): Promise<void> {
    try {
      const input = JSON.parse(this.json.value) as PartInput;
      this.draft = await this.host.registry.resolve(input);
      this.base = input.extends ? await this.host.registry.load(input.extends) : undefined;
      this.renderForm();
    } catch (error) {
      this.errors.replaceChildren(element('li', `JSON: ${(error as Error).message}`));
    }
  }

  // Preview.

  private async updatePreview(): Promise<void> {
    const view = this.preview;
    if (!view || this.partProblems.length > 0) return;
    const { shape, model, markings = [] } = clean(this.draft);
    let built;
    try {
      built = await buildShape(shape, { model, markings });
    } catch {
      return;
    }
    if (this.previewObject) view.scene.remove(this.previewObject);
    view.labels.clear('pin:');
    const names = terminals(model);
    built.pins.forEach((p, i) => {
      built.object.add(pinMarker(p));
      view.labels.set(`pin:${i}`, p, `${i + 1} ${names[i] ?? '?'}`, 'pin');
    });
    this.previewObject = built.object;
    view.scene.add(built.object);
    if (!this.fitted) this.fit();
    view.invalidate();
  }

  private fit(): void {
    if (!this.preview || !this.previewObject) return;
    const sphere = new Box3().setFromObject(this.previewObject).getBoundingSphere(new Sphere());
    this.preview.controls.focus(sphere.center, Math.max(sphere.radius, 2), 'iso');
    this.fitted = true;
  }

  private dispose(): void {
    clearTimeout(this.previewTimer);
    this.preview?.dispose();
    this.dialog.remove();
  }

  // The form.

  private renderForm(): void {
    const d = this.draft;
    const general = this.section('General');
    general.append(
      this.text(
        'Id',
        () => d.id,
        (v) => (d.id = v),
        this.editing,
      ),
      this.text(
        'Name',
        () => d.name,
        (v) => (d.name = v),
      ),
      this.select(
        'Category',
        Object.entries(CATEGORIES),
        () => d.category,
        (v) => {
          d.category = v as PartDef['category'];
        },
      ),
      this.select(
        'Symbol',
        Object.keys(SYMBOLS).map((s) => [s, labelOf(s)]),
        () => d.symbol,
        (v) => {
          d.symbol = v;
        },
      ),
    );

    const shape = this.section('3D shape');
    const kinds = Object.keys(SHAPE_DEFAULTS).map((k) => [k, labelOf(k)] as [string, string]);
    shape.append(
      this.select(
        'Kind',
        kinds,
        () => d.shape.kind,
        (v) => {
          d.shape = structuredClone(SHAPE_DEFAULTS[v as ShapeKind]);
          return true;
        },
      ),
    );
    if (d.shape.kind === 'custom') this.customShapeFields(shape);
    else this.objectFields(shape, d.shape as unknown as Json, ['kind']);

    const model = this.section('Electrical model');
    const types = Object.keys(MODEL_DEFAULTS).map((t) => [t, labelOf(t)] as [string, string]);
    model.append(
      this.select(
        'Type',
        types,
        () => d.model.type,
        (v) => {
          d.model = structuredClone(MODEL_DEFAULTS[v as ModelType]);
          return true;
        },
      ),
    );
    if (d.model.type === 'none') {
      const m = d.model;
      model.append(
        this.text(
          'Pin names, comma separated',
          () => m.pins.join(', '),
          (v) => {
            m.pins = v
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean);
          },
        ),
      );
    } else {
      this.objectFields(model, d.model as unknown as Json, ['type']);
    }

    const ratings = this.section('Ratings (empty means no limit)');
    d.ratings ??= {};
    for (const key of ['maxPower', 'maxVoltage', 'maxCurrent'] as const) {
      ratings.append(this.optionalNumber(key, d.ratings as Record<string, number>, key));
    }

    const markings = this.section('Markings (text on the part)');
    this.markingFields(markings);

    const learn = this.section('Learn');
    learn.append(
      this.textArea(
        'Summary',
        () => d.learn.summary,
        (v) => (d.learn.summary = v),
      ),
      this.text(
        'Formula',
        () => d.learn.formula ?? '',
        (v) => {
          if (v) d.learn.formula = v;
          else delete d.learn.formula;
        },
      ),
      this.textArea(
        'Tips, 1 per line',
        () => (d.learn.tips ?? []).join('\n'),
        (v) => {
          const tips = v
            .split('\n')
            .map((t) => t.trim())
            .filter(Boolean);
          if (tips.length) d.learn.tips = tips;
          else delete d.learn.tips;
        },
      ),
    );

    this.form.replaceChildren(general, shape, model, ratings, markings, learn);
    this.refresh();
  }

  /** A field for each number, colour or choice in an object, such as a shape or a model. */
  private objectFields(root: HTMLElement, object: Json, skip: string[]): void {
    for (const [key, value] of Object.entries(object)) {
      if (skip.includes(key)) continue;
      if (typeof value === 'number') root.append(this.numberField(key, object, key));
      else if (typeof value === 'boolean') root.append(this.checkbox(labelOf(key), object, key));
      else if (typeof value === 'string' && value.startsWith('#')) {
        root.append(this.color(labelOf(key), object, key));
      } else if (typeof value === 'string' && CHOICES[key]) {
        root.append(
          this.select(
            labelOf(key),
            CHOICES[key],
            () => object[key] as string,
            (v) => {
              if (v) object[key] = v;
              else delete object[key];
            },
          ),
        );
      } else if (typeof value === 'string') {
        root.append(
          this.text(
            labelOf(key),
            () => object[key] as string,
            (v) => (object[key] = v),
          ),
        );
      }
    }
  }

  private customShapeFields(root: HTMLElement): void {
    const shape = this.draft.shape as Extract<PartDef['shape'], { kind: 'custom' }>;
    shape.primitives.forEach((p, i) => {
      const row = element('div', '', 'editor-row');
      row.append(
        element('strong', `Solid ${i + 1}`),
        this.select(
          'Type',
          [
            ['box', 'Box'],
            ['cylinder', 'Cylinder'],
            ['sphere', 'Sphere'],
          ],
          () => p.type,
          (v) => {
            p.type = v as Primitive['type'];
            return true;
          },
        ),
        element('small', PRIMITIVE_SIZE_HINT[p.type]),
        this.vec3('Size', p.size),
        this.vec3('Position (mm)', p.position),
        this.vec3('Rotation (degrees)', (p.rotation ??= [0, 0, 0])),
        this.color('Colour', p as unknown as Json, 'color'),
        this.checkbox('Metal', p as unknown as Json, 'metal'),
        this.button('Remove solid', () => {
          shape.primitives.splice(i, 1);
          this.changed(true);
        }),
      );
      root.append(row);
    });
    const add = element('div', '', 'actions');
    for (const type of ['box', 'cylinder', 'sphere'] as const) {
      add.append(
        this.button(`Add ${type}`, () => {
          const size: Vec3 =
            type === 'box' ? [4, 4, 4] : type === 'cylinder' ? [2, 2, 4] : [2, 0, 0];
          shape.primitives.push({ type, size, position: [0, 2, 0], color: '#8a93a0' });
          this.changed(true);
        }),
      );
    }
    root.append(add);

    const names = terminals(this.draft.model);
    shape.pins.forEach((pin, i) => {
      const row = element('div', '', 'editor-row');
      row.append(
        this.vec3(`Pin ${i + 1} (${names[i] ?? 'no terminal'}), position (mm)`, pin),
        this.button('Remove pin', () => {
          shape.pins.splice(i, 1);
          this.changed(true);
        }),
      );
      root.append(row);
    });
    root.append(
      this.button('Add pin', () => {
        shape.pins.push([0, 0, 0]);
        this.changed(true);
      }),
    );
  }

  private markingFields(root: HTMLElement): void {
    const d = this.draft;
    const markings = (d.markings ??= []);
    const custom = d.shape.kind === 'custom';
    markings.forEach((m: Marking, i) => {
      const row = element('div', '', 'editor-row');
      row.append(
        this.text(
          'Text',
          () => m.text,
          (v) => (m.text = v),
        ),
        custom
          ? this.vec3('Position (mm)', (m.position ??= [0, 5, 0]))
          : this.select(
              'Face',
              FACES.map((f) => [f, labelOf(f)]),
              () => m.face ?? 'top',
              (v) => {
                m.face = v as Face;
              },
            ),
        ...(custom ? [this.vec3('Rotation (degrees)', (m.rotation ??= [0, 0, 0]))] : []),
        this.numberField('height', m as unknown as Json, 'height', 'Text height (mm)'),
        this.color('Colour', m as unknown as Json, 'color'),
        this.button('Remove text', () => {
          markings.splice(i, 1);
          this.changed(true);
        }),
      );
      root.append(row);
    });
    root.append(
      this.button('Add text', () => {
        markings.push({
          text: 'TEXT',
          height: 1,
          color: '#e6e9ee',
          ...(custom ? {} : { face: 'top' }),
        });
        this.changed(true);
      }),
    );
  }

  // Field builders.

  private section(title: string): HTMLFieldSetElement {
    const fieldset = element('fieldset');
    fieldset.append(element('legend', title));
    return fieldset;
  }

  private labelled(text: string, control: HTMLElement): HTMLLabelElement {
    const label = element('label');
    label.append(text, control);
    return label;
  }

  private text(text: string, get: () => string, set: (v: string) => void, readOnly = false) {
    const input = element('input');
    input.value = get();
    input.readOnly = readOnly;
    input.addEventListener('input', () => {
      set(input.value);
      this.changed();
    });
    return this.labelled(text, input);
  }

  private textArea(text: string, get: () => string, set: (v: string) => void) {
    const area = element('textarea');
    area.value = get();
    area.rows = 3;
    area.addEventListener('input', () => {
      set(area.value);
      this.changed();
    });
    return this.labelled(text, area);
  }

  /** A select. If `set` returns true, the change is structural and the form rebuilds. */
  private select(
    text: string,
    options: [string, string][],
    get: () => string,
    set: (v: string) => boolean | void,
  ) {
    const select = element('select');
    for (const [value, name] of options) {
      const option = element('option', name);
      option.value = value;
      select.append(option);
    }
    select.value = get();
    select.addEventListener('change', () => this.changed(set(select.value) === true));
    return this.labelled(text, select);
  }

  /** A number. Electrical values take SI prefixes (4.7k, 100n). Sizes are plain millimetres. */
  private numberField(key: string, object: Json, field: string, text = fieldLabel(key)) {
    const input = element('input');
    const unit = UNITS[key];
    const value = object[field] as number | undefined;
    input.value = value === undefined ? '' : unit ? formatSI(value, '').trim() : String(value);
    input.addEventListener('input', () => {
      const parsed = unit ? parseSI(input.value) : Number(input.value);
      const ok = input.value.trim() !== '' && Number.isFinite(parsed);
      input.classList.toggle('bad', !ok);
      if (ok) {
        object[field] = parsed;
        this.changed();
      }
    });
    return this.labelled(text, input);
  }

  private optionalNumber(key: string, object: Record<string, number>, field: string) {
    const label = this.numberField(key, object, field);
    const input = label.querySelector('input')!;
    input.addEventListener('input', () => {
      if (input.value.trim() === '') {
        delete object[field];
        input.classList.remove('bad');
        this.changed();
      }
    });
    return label;
  }

  private vec3(text: string, vector: Vec3) {
    const group = element('span', '', 'editor-vec3');
    vector.forEach((value, i) => {
      const input = element('input');
      input.value = String(value);
      input.inputMode = 'decimal';
      input.addEventListener('input', () => {
        const parsed = Number(input.value);
        const ok = input.value.trim() !== '' && Number.isFinite(parsed);
        input.classList.toggle('bad', !ok);
        if (ok) {
          vector[i] = parsed;
          this.changed();
        }
      });
      group.append(input);
    });
    return this.labelled(text, group);
  }

  private color(text: string, object: Json, field: string) {
    const input = element('input');
    input.type = 'color';
    input.value = (object[field] as string | undefined) ?? '#e6e9ee';
    input.addEventListener('input', () => {
      object[field] = input.value;
      this.changed();
    });
    return this.labelled(text, input);
  }

  private checkbox(text: string, object: Json, field: string) {
    const input = element('input');
    input.type = 'checkbox';
    input.checked = object[field] === true;
    input.addEventListener('change', () => {
      object[field] = input.checked;
      this.changed();
    });
    const label = element('label', '', 'editor-check');
    label.append(input, text);
    return label;
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const button = element('button', text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }
}
