import {
  Box3,
  Box3Helper,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Plane,
  Raycaster,
  Sphere,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { terminals } from '../core/models.ts';
import { compile, type Compiled, pinKey } from '../core/netlist.ts';
import type { Registry } from '../core/registry.ts';
import type { ModelSpec, PartDef, PinRef } from '../core/types.ts';
import { formatSI } from '../core/units.ts';
import { material } from '../render/cache.ts';
import type { View } from '../render/scene.ts';
import { buildShape } from '../render/shapes/index.ts';
import type { SimState } from '../sim/protocol.ts';

const GRID = 1.27;
const TAP_PIXELS = 5;
const WIRE_COLORS = ['#e5484d', '#3e63dd', '#f5d90a', '#30a46c', '#f76b15', '#1d2127'];
const PIN_GEOMETRY = new SphereGeometry(0.6, 12, 8);
// Pins draw on top of part bodies. Many pins are under the body (LED, DIP, TO-92), and the user
// must still see and click them.
const pinMaterial = (color: string) =>
  new MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.4,
    depthTest: false,
    transparent: true,
  });
const PIN_MATERIAL = pinMaterial('#d4af37');
const PIN_HOVER = pinMaterial('#4cc38a');
const PIN_RENDER_ORDER = 10;

export interface Instance {
  id: string;
  label: string;
  def: PartDef;
  /** Values the user changed in the inspector. They override the part's model. */
  params: Record<string, number | boolean>;
  x: number;
  z: number;
  /** Rotation about the vertical axis, in quarter turns. */
  turns: number;
  object: Group;
  pins: Vector3[];
  glow?: MeshStandardMaterial;
}

interface Wire {
  id: string;
  a: PinRef;
  b: PinRef;
  mesh: Mesh;
}

export interface WorkbenchEvents {
  onSelect(instance: Instance | null): void;
  /** The circuit structure changed: parts or wires were added or removed. */
  onCircuit(compiled: Compiled): void;
  /** 1 element changed a value. The simulation keeps its state. */
  onModel(index: number, model: ModelSpec): void;
  onHint(text: string): void;
  onPartView(active: boolean): void;
}

/** Designator prefix for each part, for example R for resistors. */
function prefixOf(def: PartDef): string {
  if (def.shape.kind === 'led') return 'LED';
  const byModel: Record<string, string> = {
    resistor: 'R',
    capacitor: 'C',
    inductor: 'L',
    transformer: 'T',
    diode: 'D',
    battery: 'B',
    acsource: 'V',
    switch: 'S',
  };
  return byModel[def.model.type] ?? (def.shape.kind === 'to92' ? 'Q' : 'U');
}

export function modelOf(instance: Instance): ModelSpec {
  return { ...instance.def.model, ...instance.params } as ModelSpec;
}

export class Workbench {
  selected: Instance | null = null;
  private readonly instances = new Map<string, Instance>();
  private wires: Wire[] = [];
  private compiled?: Compiled;
  private state?: SimState;
  private ghost?: Instance;
  private wireStart?: PinRef;
  private rubberBand?: Mesh;
  private selectedWire?: Wire;
  private hoverPin?: Mesh;
  private drag?: { instance: Instance; start: Vector3; x: number; z: number; moved: boolean };
  private down?: { x: number; y: number };
  private partView = false;
  private showAll = false;
  private nextId = 1;
  private readonly counters = new Map<string, number>();
  private readonly raycaster = new Raycaster();
  private readonly boardPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly highlight = new Box3Helper(new Box3(), new Color('#4cc38a'));

  constructor(
    private readonly view: View,
    private readonly registry: Registry,
    private readonly events: WorkbenchEvents,
  ) {
    const { canvas, controls } = view;
    this.highlight.visible = false;
    view.scene.add(this.highlight);

    controls.shouldStart = (event) => !this.claimPointer(event);
    controls.pick = (x, y) => this.pickPoint(x, y);
    canvas.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKey);
    view.onFrame(() => this.updateLabels());

    registry.on((id) => {
      for (const instance of this.instances.values()) {
        if (instance.def.id !== id) continue;
        instance.def = registry.get(id)!;
        void this.rebuild(instance).then(() => this.circuitChanged());
      }
    });
    this.events.onHint('Choose a part in the library to place it on the board.');
  }

  // Public actions used by the app and the inspector.

  async startPlacing(defId: string): Promise<void> {
    this.cancel();
    const def = await this.registry.load(defId);
    const instance = this.createInstance(def);
    await this.rebuild(instance);
    this.ghost = instance;
    this.view.scene.add(instance.object);
    this.events.onHint(
      `Click the board to place the ${def.name}. Press R to rotate, Esc to cancel.`,
    );
    this.view.invalidate();
  }

  setParam(instance: Instance, key: string, value: number | boolean): void {
    instance.params[key] = value;
    void this.rebuild(instance);
    const index = this.compiled?.elementIndex.get(instance.id);
    if (index !== undefined) this.events.onModel(index, modelOf(instance));
  }

  toggleSwitch(instance: Instance): void {
    const model = modelOf(instance);
    if (model.type !== 'switch') return;
    this.setParam(instance, 'closed', !model.closed);
    if (instance === this.selected) this.events.onSelect(instance);
  }

  rotateSelected(): void {
    const instance = this.ghost ?? this.selected;
    if (!instance) return;
    instance.turns = (instance.turns + 1) % 4;
    this.place(instance);
  }

  deleteSelected(): void {
    if (this.selectedWire) {
      this.removeWire(this.selectedWire);
      this.selectedWire = undefined;
      this.circuitChanged();
      return;
    }
    const instance = this.selected;
    if (!instance) return;
    this.select(null);
    this.view.scene.remove(instance.object);
    this.instances.delete(instance.id);
    this.view.labels.delete(`part:${instance.id}`);
    for (const wire of this.wires.filter(
      (w) => w.a.inst === instance.id || w.b.inst === instance.id,
    )) {
      this.removeWire(wire);
    }
    this.circuitChanged();
  }

  /** Part view: the camera moves to the selected part and orbits around it. */
  focusSelected(): void {
    if (!this.selected) return;
    const sphere = new Box3().setFromObject(this.selected.object).getBoundingSphere(new Sphere());
    this.view.controls.focus(sphere.center, Math.max(sphere.radius, 3));
    this.setPartView(true);
  }

  backToCircuit(): void {
    const box = new Box3();
    for (const instance of this.instances.values()) box.expandByObject(instance.object);
    if (box.isEmpty()) box.set(new Vector3(-60, 0, -40), new Vector3(60, 0, 40));
    const sphere = box.getBoundingSphere(new Sphere());
    this.view.controls.focus(sphere.center, Math.max(sphere.radius, 30), 'iso');
    this.setPartView(false);
  }

  setShowAll(show: boolean): void {
    this.showAll = show;
    this.view.labels.clear('part:');
    this.view.invalidate();
  }

  applyState(state: SimState): void {
    this.state = state;
    for (const instance of this.instances.values()) {
      if (!instance.glow) continue;
      const index = this.compiled?.elementIndex.get(instance.id);
      const current = index === undefined ? 0 : state.values[index * 2 + 1];
      instance.glow.emissiveIntensity = Math.min(Math.max(current, 0) / 0.02, 1.5) * 1.5;
    }
    this.view.invalidate();
  }

  clearState(): void {
    this.state = undefined;
    for (const instance of this.instances.values())
      if (instance.glow) instance.glow.emissiveIntensity = 0;
    this.view.invalidate();
  }

  /** Voltage and current of a part from the last simulation state. */
  readout(instance: Instance): { voltage: number; current: number } | undefined {
    const index = this.compiled?.elementIndex.get(instance.id);
    if (!this.state || index === undefined) return undefined;
    return { voltage: this.state.values[index * 2], current: this.state.values[index * 2 + 1] };
  }

  // Building and placing.

  private createInstance(def: PartDef): Instance {
    const prefix = prefixOf(def);
    const count = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, count);
    const object = new Group();
    const instance: Instance = {
      id: `p${this.nextId++}`,
      label: `${prefix}${count}`,
      def,
      params: {},
      x: 0,
      z: 0,
      turns: 0,
      object,
      pins: [],
    };
    object.userData.instance = instance.id;
    return instance;
  }

  private async rebuild(instance: Instance): Promise<void> {
    const model = modelOf(instance);
    const built = await buildShape(instance.def.shape, {
      model,
      markings: instance.def.markings ?? [],
    });
    instance.object.clear();
    instance.object.add(built.object);
    instance.pins = built.pins;
    instance.glow = built.glow;
    const names = terminals(model);
    built.pins.forEach((p, index) => {
      const pin = new Mesh(PIN_GEOMETRY, PIN_MATERIAL);
      pin.position.copy(p);
      pin.renderOrder = PIN_RENDER_ORDER;
      pin.userData.pin = { inst: instance.id, pin: index, name: names[index] };
      instance.object.add(pin);
    });
    this.place(instance);
  }

  private place(instance: Instance): void {
    instance.object.position.set(instance.x, 0, instance.z);
    instance.object.rotation.y = (-instance.turns * Math.PI) / 2;
    instance.object.updateMatrixWorld(true);
    for (const wire of this.wires) {
      if (wire.a.inst === instance.id || wire.b.inst === instance.id) this.shapeWire(wire);
    }
    if (instance === this.selected) this.updateHighlight();
    this.view.invalidate();
  }

  private commitGhost(): void {
    const instance = this.ghost!;
    this.ghost = undefined;
    this.instances.set(instance.id, instance);
    this.select(instance);
    this.circuitChanged();
  }

  private circuitChanged(): void {
    const parts = [...this.instances.values()].map((instance) => ({
      id: instance.id,
      label: instance.label,
      model: modelOf(instance),
      ratings: instance.def.ratings,
      pinCount: instance.pins.length,
    }));
    this.compiled = compile(parts, this.wires);
    this.events.onCircuit(this.compiled);
  }

  // Wires.

  private pinWorld(ref: PinRef): Vector3 {
    const instance = this.instances.get(ref.inst) ?? this.ghost!;
    return instance.object.localToWorld(instance.pins[ref.pin].clone());
  }

  private wireGeometry(a: Vector3, b: Vector3): TubeGeometry {
    const lift = 3 + a.distanceTo(b) * 0.2;
    const middle = a.clone().add(b).multiplyScalar(0.5);
    middle.y = Math.max(a.y, b.y) + lift;
    const curve = new CatmullRomCurve3([
      a.clone().setY(a.y + 0.6),
      middle,
      b.clone().setY(b.y + 0.6),
    ]);
    return new TubeGeometry(curve, 32, 0.35, 6, false);
  }

  private shapeWire(wire: Wire): void {
    wire.mesh.geometry.dispose();
    wire.mesh.geometry = this.wireGeometry(this.pinWorld(wire.a), this.pinWorld(wire.b));
  }

  private addWire(a: PinRef, b: PinRef): void {
    const exists = this.wires.some(
      (w) =>
        (pinKey(w.a) === pinKey(a) && pinKey(w.b) === pinKey(b)) ||
        (pinKey(w.a) === pinKey(b) && pinKey(w.b) === pinKey(a)),
    );
    if (exists) return;
    const id = `w${this.nextId++}`;
    const color = WIRE_COLORS[this.wires.length % WIRE_COLORS.length];
    const mesh = new Mesh(this.wireGeometry(this.pinWorld(a), this.pinWorld(b)), material(color));
    mesh.userData.wire = id;
    this.wires.push({ id, a, b, mesh });
    this.view.scene.add(mesh);
    this.circuitChanged();
  }

  private removeWire(wire: Wire): void {
    this.view.scene.remove(wire.mesh);
    wire.mesh.geometry.dispose();
    this.wires = this.wires.filter((w) => w !== wire);
    this.view.invalidate();
  }

  private stopWiring(): void {
    this.wireStart = undefined;
    if (this.rubberBand) {
      this.view.scene.remove(this.rubberBand);
      this.rubberBand.geometry.dispose();
      this.rubberBand = undefined;
    }
  }

  // Selection.

  private select(instance: Instance | null): void {
    this.selected = instance;
    this.selectedWire = undefined;
    this.updateHighlight();
    this.events.onSelect(instance);
    this.view.invalidate();
  }

  private updateHighlight(): void {
    this.highlight.visible = !!this.selected;
    if (this.selected) this.highlight.box.setFromObject(this.selected.object).expandByScalar(0.8);
  }

  private setPartView(active: boolean): void {
    this.partView = active;
    this.events.onPartView(active);
  }

  /** Ends placing or wiring. Returns true if there was something to end. */
  private cancel(): boolean {
    if (this.ghost) {
      this.view.scene.remove(this.ghost.object);
      this.ghost = undefined;
      this.events.onHint('Placing cancelled.');
      this.view.invalidate();
      return true;
    }
    if (this.wireStart) {
      this.stopWiring();
      this.events.onHint('Wiring cancelled.');
      this.view.invalidate();
      return true;
    }
    return false;
  }

  // Picking.

  private setPointer(clientX: number, clientY: number): void {
    const rect = this.view.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.view.camera);
  }

  private boardPoint(clientX: number, clientY: number): Vector3 | null {
    this.setPointer(clientX, clientY);
    return this.raycaster.ray.intersectPlane(this.boardPlane, new Vector3());
  }

  /** The nearest part, pin or wire under the pointer. */
  private pick(
    clientX: number,
    clientY: number,
  ): { instance?: Instance; pin?: Mesh; wire?: Wire; point?: Vector3 } {
    this.setPointer(clientX, clientY);
    const targets: Object3D[] = [
      ...[...this.instances.values()].map((i) => i.object),
      ...this.wires.map((w) => w.mesh),
    ];
    const hits = this.raycaster.intersectObjects(targets, true);
    // A pin wins over a body in front of it, because pins draw on top.
    const hit = hits.find((h) => h.object.userData.pin) ?? hits[0];
    if (!hit) return {};
    if (hit.object.userData.wire) {
      return { wire: this.wires.find((w) => w.id === hit.object.userData.wire), point: hit.point };
    }
    let node: Object3D | null = hit.object;
    while (node && !node.userData.instance) node = node.parent;
    const instance = node ? this.instances.get(node.userData.instance) : undefined;
    const pin = hit.object.userData.pin ? (hit.object as Mesh) : undefined;
    return { instance, pin, point: hit.point };
  }

  private pickPoint(clientX: number, clientY: number): Vector3 | null {
    return this.pick(clientX, clientY).point ?? this.boardPoint(clientX, clientY);
  }

  /** Called by the camera at pointer down. Returns true when the workbench takes the gesture. */
  private claimPointer(event: PointerEvent): boolean {
    if (event.button !== 0 || this.ghost || this.wireStart) return false;
    const hit = this.pick(event.clientX, event.clientY);
    if (hit.pin) return true;
    if (!hit.instance) return false;
    const start = this.boardPoint(event.clientX, event.clientY);
    if (start)
      this.drag = {
        instance: hit.instance,
        start,
        x: hit.instance.x,
        z: hit.instance.z,
        moved: false,
      };
    return true;
  }

  // Pointer and keyboard events.

  private onMove = (event: PointerEvent): void => {
    if (this.drag) {
      const point = this.boardPoint(event.clientX, event.clientY);
      const moved =
        this.down &&
        Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > TAP_PIXELS;
      if (point && (moved || this.drag.moved)) {
        this.drag.moved = true;
        this.drag.instance.x =
          Math.round((this.drag.x + point.x - this.drag.start.x) / GRID) * GRID;
        this.drag.instance.z =
          Math.round((this.drag.z + point.z - this.drag.start.z) / GRID) * GRID;
        this.place(this.drag.instance);
      }
      return;
    }
    if (this.ghost) {
      const point = this.boardPoint(event.clientX, event.clientY);
      if (point) {
        this.ghost.x = Math.round(point.x / GRID) * GRID;
        this.ghost.z = Math.round(point.z / GRID) * GRID;
        this.place(this.ghost);
      }
      return;
    }

    const hit = this.pick(event.clientX, event.clientY);
    const pin = hit.pin;
    if (pin !== this.hoverPin) {
      if (this.hoverPin) this.hoverPin.material = PIN_MATERIAL;
      if (pin) pin.material = PIN_HOVER;
      this.hoverPin = pin;
      this.view.canvas.style.cursor = pin || hit.instance ? 'pointer' : '';
      this.view.invalidate();
    }
    if (this.wireStart) {
      const end = pin
        ? pin.getWorldPosition(new Vector3())
        : this.boardPoint(event.clientX, event.clientY);
      if (end) {
        if (this.rubberBand) this.rubberBand.geometry.dispose();
        else {
          this.rubberBand = new Mesh(undefined, material('#8a93a0', false, 0.7));
          this.view.scene.add(this.rubberBand);
        }
        this.rubberBand.geometry = this.wireGeometry(this.pinWorld(this.wireStart), end);
        this.view.invalidate();
      }
    }
  };

  private onUp = (event: PointerEvent): void => {
    const drag = this.drag;
    this.drag = undefined;
    const isTap =
      this.down &&
      Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) <= TAP_PIXELS;
    if (drag?.moved || !isTap || event.button !== 0) return;
    this.tap(event.clientX, event.clientY);
  };

  private tap(clientX: number, clientY: number): void {
    if (this.ghost) {
      this.commitGhost();
      this.events.onHint('Placed. Click a pin, then another pin, to connect them with a wire.');
      return;
    }
    const hit = this.pick(clientX, clientY);
    if (hit.pin) {
      const ref = hit.pin.userData.pin as PinRef & { name: string };
      const pin = { inst: ref.inst, pin: ref.pin };
      if (!this.wireStart) {
        this.wireStart = pin;
        this.events.onHint(
          `Wiring from ${this.instances.get(ref.inst)?.label} ${ref.name}. Click another pin. Esc cancels.`,
        );
      } else {
        if (pinKey(this.wireStart) !== pinKey(pin)) this.addWire(this.wireStart, pin);
        this.stopWiring();
        this.events.onHint('Wire added. Press Run to start the simulation.');
      }
      this.view.invalidate();
      return;
    }
    if (this.wireStart) {
      this.cancel();
      return;
    }
    if (hit.wire) {
      this.select(null);
      this.selectedWire = hit.wire;
      this.events.onHint('Wire selected. Press Delete to remove it.');
      return;
    }
    this.select(hit.instance ?? null);
    if (hit.instance)
      this.events.onHint(`${hit.instance.label} selected. Double-click to view it close up.`);
  }

  private onDoubleClick = (event: MouseEvent): void => {
    const hit = this.pick(event.clientX, event.clientY);
    if (!hit.instance) return;
    this.select(hit.instance);
    this.focusSelected();
  };

  private onKey = (event: KeyboardEvent): void => {
    if ((event.target as HTMLElement).closest('input, select, textarea')) return;
    switch (event.key) {
      case 'Escape':
        if (!this.cancel()) {
          if (this.partView) this.backToCircuit();
          else this.select(null);
        }
        break;
      case 'r':
      case 'R':
        this.rotateSelected();
        break;
      case 'Delete':
      case 'Backspace':
        this.deleteSelected();
        break;
      case 'f':
      case 'F':
        this.focusSelected();
        break;
      case ' ':
        if (this.selected) {
          event.preventDefault();
          this.toggleSwitch(this.selected);
        }
        break;
    }
  };

  // Labels over the 3D view.

  private updateLabels(): void {
    const { labels } = this.view;
    const hover = this.hoverPin?.userData.pin as (PinRef & { name: string }) | undefined;
    if (hover) {
      const node = this.compiled?.pinNodes.get(pinKey(hover));
      const volts =
        this.state && node !== undefined ? ` · ${formatSI(this.state.nodes[node], 'V')}` : '';
      labels.set(
        'hover',
        this.hoverPin!.getWorldPosition(new Vector3()),
        `${hover.name}${volts}`,
        'pin',
      );
    } else {
      labels.delete('hover');
    }

    for (const instance of this.instances.values()) {
      const key = `part:${instance.id}`;
      if (!this.showAll && instance !== this.selected) {
        labels.delete(key);
        continue;
      }
      const top = new Box3().setFromObject(instance.object);
      const position = new Vector3(
        (top.min.x + top.max.x) / 2,
        top.max.y + 1,
        (top.min.z + top.max.z) / 2,
      );
      const values = this.readout(instance);
      const text = values
        ? `${instance.label} · ${formatSI(values.voltage, 'V')} · ${formatSI(Math.abs(values.current), 'A')}`
        : instance.label;
      labels.set(key, position, text);
    }
  }
}
