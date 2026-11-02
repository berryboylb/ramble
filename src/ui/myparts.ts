import { SYMBOLS } from '../core/symbols.ts';
import type { PartDef } from '../core/types.ts';

// "My parts" in the library list. The app owns this section, because custom parts live in the app.
// The boot script replaces the list when the catalog loads, so the app draws this again after
// every `ramble:catalog` event.

export class MyParts {
  private readonly section = document.createElement('div');
  private parts: PartDef[] = [];

  constructor(onPick: (part: PartDef) => void) {
    this.section.addEventListener('click', (event) => {
      const id = (event.target as Element).closest('button')?.dataset.mine;
      const part = this.parts.find((p) => p.id === id);
      if (part) onPick(part);
    });
  }

  render(list: HTMLElement, parts: PartDef[]): void {
    this.parts = parts;
    this.section.replaceChildren();
    if (parts.length > 0) {
      const heading = document.createElement('h3');
      heading.textContent = 'My parts';
      this.section.append(heading);
    }
    for (const part of parts) {
      const button = document.createElement('button');
      button.dataset.mine = part.id;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 40 20');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', SYMBOLS[part.symbol] ?? '');
      svg.append(path);
      button.append(svg, part.name);
      this.section.append(button);
    }
    if (!list.contains(this.section)) list.prepend(this.section);
  }
}
