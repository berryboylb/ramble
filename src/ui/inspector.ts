import type { Learn } from '../core/types.ts';
import { formatSI, parseSI } from '../core/units.ts';
import { isCustomId, validate } from '../core/validate.ts';
import { type Instance, modelOf, type Workbench } from '../workbench/workbench.ts';
import { fieldLabel, labelOf, UNITS } from './fields.ts';

/** Shows the selected part: its values, actions and live readout. */
export class Inspector {
  private instance: Instance | null = null;
  private readonly readoutElement = document.createElement('p');

  constructor(
    private readonly root: HTMLElement,
    private readonly bench: Workbench,
    private readonly showLearn: (name: string, learn: Learn) => void,
    /** Opens the part editor: a remix for a built-in part, an edit for a custom part. */
    private readonly openEditor: (instance: Instance) => void,
  ) {
    this.readoutElement.className = 'readout';
  }

  show(instance: Instance | null): void {
    this.instance = instance;
    this.root.replaceChildren();
    if (!instance) return;
    this.showLearn(instance.def.name, instance.def.learn);

    const title = document.createElement('h2');
    title.textContent = `${instance.label} · ${instance.def.name}`;
    this.root.append(title);

    const model = modelOf(instance);
    for (const [key, value] of Object.entries(model)) {
      if (typeof value === 'number') this.root.append(this.numberField(instance, key, value));
      if (typeof value === 'boolean' && key !== 'polarized')
        this.root.append(this.toggleField(instance, key, value));
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      this.button('Rotate (R)', () => this.bench.rotateSelected()),
      this.button('View close up (F)', () => this.bench.focusSelected()),
      this.button('Delete', () => this.bench.deleteSelected()),
      this.button(isCustomId(instance.def.id) ? 'Edit part' : 'Remix part', () =>
        this.openEditor(instance),
      ),
    );
    this.root.append(actions, this.readoutElement);
    this.update();
  }

  /** Updates the live voltage, current and power. */
  update(): void {
    if (!this.instance) return;
    const values = this.bench.readout(this.instance);
    if (!values) {
      this.readoutElement.textContent = 'Press Run to see voltage and current.';
      return;
    }
    const { voltage, current } = values;
    this.readoutElement.textContent =
      `V ${formatSI(voltage, 'V')} · I ${formatSI(Math.abs(current), 'A')} · ` +
      `P ${formatSI(Math.abs(voltage * current), 'W')}`;
  }

  private numberField(instance: Instance, key: string, value: number): HTMLLabelElement {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const unit = UNITS[key] ?? '';
    input.value = unit ? formatSI(value, '').trim() : String(value);
    input.addEventListener('change', () => {
      const parsed = parseSI(input.value);
      const problems = validate({
        ...instance.def,
        model: { ...modelOf(instance), [key]: parsed },
      });
      input.classList.toggle('bad', problems.length > 0);
      input.title = problems.join('\n');
      if (problems.length === 0) this.bench.setParam(instance, key, parsed);
    });
    label.append(fieldLabel(key), input);
    return label;
  }

  private toggleField(instance: Instance, key: string, value: boolean): HTMLButtonElement {
    return this.button(
      key === 'closed' ? (value ? 'Open switch (Space)' : 'Close switch (Space)') : labelOf(key),
      () => {
        this.bench.setParam(instance, key, !value);
        this.show(instance);
      },
    );
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }
}
