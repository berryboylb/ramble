import { type Camera, Vector3 } from 'three';

// HTML labels placed over the 3D view. Text stays sharp at every zoom level.

interface Label {
  element: HTMLDivElement;
  position: Vector3;
}

export class Labels {
  private readonly labels = new Map<string, Label>();
  private readonly projected = new Vector3();

  constructor(private readonly root: HTMLElement) {}

  set(key: string, position: Vector3, text: string, className = ''): void {
    let label = this.labels.get(key);
    if (!label) {
      const element = document.createElement('div');
      this.root.append(element);
      label = { element, position: new Vector3() };
      this.labels.set(key, label);
    }
    label.element.className = `label ${className}`;
    if (label.element.textContent !== text) label.element.textContent = text;
    label.position.copy(position);
  }

  delete(key: string): void {
    this.labels.get(key)?.element.remove();
    this.labels.delete(key);
  }

  /** Removes every label whose key starts with the prefix. */
  clear(prefix: string): void {
    for (const key of [...this.labels.keys()]) if (key.startsWith(prefix)) this.delete(key);
  }

  update(camera: Camera, width: number, height: number): void {
    for (const { element, position } of this.labels.values()) {
      const p = this.projected.copy(position).project(camera);
      const visible = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
      element.hidden = !visible;
      if (visible) {
        element.style.transform = `translate(${((p.x + 1) / 2) * width}px, ${((1 - p.y) / 2) * height}px)`;
      }
    }
  }
}
