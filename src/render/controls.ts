import { Euler, MathUtils, type PerspectiveCamera, Quaternion, Vector3 } from 'three';

// A 360° orbit camera. Rotation uses quaternions, so the camera never locks or flips at the poles.

const WORLD_UP = new Vector3(0, 1, 0);
const LOCAL_RIGHT = new Vector3(1, 0, 0);
const ROTATE_SPEED = 0.008;
const DAMPING = 0.86;
const ANIMATION_MS = 450;

export type ViewName = 'top' | 'front' | 'side' | 'iso';

const VIEWS: Record<ViewName, [number, number]> = {
  top: [-90, 0],
  front: [-8, 0],
  side: [-8, 90],
  iso: [-35, 35],
};

/** The orientation for a preset view, from pitch and yaw in degrees. */
export function viewOrientation(name: ViewName): Quaternion {
  const [pitch, yaw] = VIEWS[name];
  return new Quaternion().setFromEuler(
    new Euler(pitch * MathUtils.DEG2RAD, yaw * MathUtils.DEG2RAD, 0, 'YXZ'),
  );
}

/**
 * Turns an orientation by a yaw about the world up axis and a pitch about the camera's own right axis.
 * The pitch has no limit, so the camera can go over the top and under the board.
 * When the camera is upside down, yaw is reversed, so a drag to the right still turns the view to the right.
 */
export function orbit(orientation: Quaternion, yaw: number, pitch: number): Quaternion {
  const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
  const sign = up.y < 0 ? -1 : 1;
  const yawTurn = new Quaternion().setFromAxisAngle(WORLD_UP, -yaw * sign);
  const pitchTurn = new Quaternion().setFromAxisAngle(LOCAL_RIGHT, -pitch);
  return yawTurn.multiply(orientation).multiply(pitchTurn).normalize();
}

interface Animation {
  start: number;
  fromTarget: Vector3;
  toTarget: Vector3;
  fromDistance: number;
  toDistance: number;
  fromOrientation: Quaternion;
  toOrientation: Quaternion;
}

export class OrbitCamera {
  readonly target = new Vector3();
  readonly orientation = viewOrientation('iso');
  distance = 170;
  minDistance = 5;
  maxDistance = 600;
  /** Return false to leave a pointer gesture to someone else, for example to drag a part. */
  shouldStart: (event: PointerEvent) => boolean = () => true;
  /** The world point under the pointer, for zoom to cursor. */
  pick: (clientX: number, clientY: number) => Vector3 | null = () => null;

  private yawVelocity = 0;
  private pitchVelocity = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private panning = false;
  private animation?: Animation;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly element: HTMLElement,
    private readonly invalidate: () => void,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKey);
    this.apply();
  }

  dispose(): void {
    const { element } = this;
    element.removeEventListener('pointerdown', this.onDown);
    element.removeEventListener('pointermove', this.onMove);
    element.removeEventListener('pointerup', this.onUp);
    element.removeEventListener('pointercancel', this.onUp);
    element.removeEventListener('wheel', this.onWheel);
    element.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKey);
  }

  /** Advances damping and animation. Returns true while the camera still moves. */
  update(now: number): boolean {
    let moving = false;
    if (this.animation) {
      const a = this.animation;
      const t = Math.min((now - a.start) / ANIMATION_MS, 1);
      const eased = 1 - (1 - t) ** 3;
      this.target.lerpVectors(a.fromTarget, a.toTarget, eased);
      this.distance = MathUtils.lerp(a.fromDistance, a.toDistance, eased);
      this.orientation.slerpQuaternions(a.fromOrientation, a.toOrientation, eased);
      if (t === 1) this.animation = undefined;
      moving = true;
    } else if (
      this.pointers.size === 0 &&
      Math.abs(this.yawVelocity) + Math.abs(this.pitchVelocity) > 1e-4
    ) {
      this.turn(this.yawVelocity, this.pitchVelocity);
      this.yawVelocity *= DAMPING;
      this.pitchVelocity *= DAMPING;
      moving = true;
    }
    this.apply();
    return moving;
  }

  /** Moves the camera smoothly so that a sphere with this centre and radius fills the view. */
  focus(centre: Vector3, radius: number, view?: ViewName): void {
    const halfFov = MathUtils.degToRad(this.camera.fov / 2);
    const distance = MathUtils.clamp(
      (radius / Math.sin(halfFov)) * 1.15,
      this.minDistance,
      this.maxDistance,
    );
    this.animateTo(centre, distance, view ? viewOrientation(view) : this.orientation);
  }

  setView(view: ViewName): void {
    this.animateTo(this.target, this.distance, viewOrientation(view));
  }

  /** Zooms by a factor. With a point, the zoom moves toward that point. */
  zoom(factor: number, point?: Vector3 | null): void {
    const distance = MathUtils.clamp(this.distance * factor, this.minDistance, this.maxDistance);
    const scale = distance / this.distance;
    if (point) this.target.sub(point).multiplyScalar(scale).add(point);
    this.distance = distance;
    this.changed();
  }

  /** Moves the orbit centre in the view plane by a distance in pixels. */
  pan(dx: number, dy: number): void {
    const size =
      (2 * this.distance * Math.tan(MathUtils.degToRad(this.camera.fov / 2))) /
      this.element.clientHeight;
    const right = new Vector3(1, 0, 0).applyQuaternion(this.orientation);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.orientation);
    this.target.addScaledVector(right, -dx * size).addScaledVector(up, dy * size);
    this.changed();
  }

  private turn(yaw: number, pitch: number): void {
    this.orientation.copy(orbit(this.orientation, yaw, pitch));
  }

  private apply(): void {
    const offset = new Vector3(0, 0, this.distance).applyQuaternion(this.orientation);
    this.camera.position.copy(this.target).add(offset);
    this.camera.quaternion.copy(this.orientation);
  }

  private changed(): void {
    this.animation = undefined;
    this.apply();
    this.invalidate();
  }

  private animateTo(target: Vector3, distance: number, orientation: Quaternion): void {
    this.yawVelocity = this.pitchVelocity = 0;
    this.animation = {
      start: performance.now(),
      fromTarget: this.target.clone(),
      toTarget: target.clone(),
      fromDistance: this.distance,
      toDistance: distance,
      fromOrientation: this.orientation.clone(),
      toOrientation: orientation.clone(),
    };
    this.invalidate();
  }

  private onDown = (event: PointerEvent): void => {
    if (this.pointers.size === 0 && !this.shouldStart(event)) return;
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.panning = event.button === 2 || event.shiftKey;
    this.yawVelocity = this.pitchVelocity = 0;
    this.animation = undefined;
  };

  private onMove = (event: PointerEvent): void => {
    const last = this.pointers.get(event.pointerId);
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;

    if (this.pointers.size === 1) {
      if (this.panning) {
        this.pan(dx, dy);
      } else {
        this.yawVelocity = dx * ROTATE_SPEED;
        this.pitchVelocity = dy * ROTATE_SPEED;
        this.turn(this.yawVelocity, this.pitchVelocity);
        this.changed();
      }
    } else if (this.pointers.size === 2) {
      // 2 fingers: pinch to zoom, move both to pan.
      const [a, b] = [...this.pointers.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      last.x = event.clientX;
      last.y = event.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (after > 0) this.zoom(before / after, this.pick((a.x + b.x) / 2, (a.y + b.y) / 2));
      this.pan((a.x + b.x) / 2 - midX, (a.y + b.y) / 2 - midY);
      return;
    }
    last.x = event.clientX;
    last.y = event.clientY;
  };

  private onUp = (event: PointerEvent): void => {
    if (!this.pointers.delete(event.pointerId)) return;
    // Keep the last velocity, so the view slows down smoothly after a fling.
    if (this.pointers.size > 0) this.yawVelocity = this.pitchVelocity = 0;
    this.invalidate();
  };

  private onContextMenu = (event: Event): void => event.preventDefault();

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoom(Math.exp(event.deltaY * 0.0015), this.pick(event.clientX, event.clientY));
  };

  private onKey = (event: KeyboardEvent): void => {
    if ((event.target as HTMLElement).closest('input, select, textarea')) return;
    const step = 0.06;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (this.yawVelocity = -step),
      ArrowRight: () => (this.yawVelocity = step),
      ArrowUp: () => (this.pitchVelocity = -step),
      ArrowDown: () => (this.pitchVelocity = step),
      '+': () => this.zoom(0.8),
      '=': () => this.zoom(0.8),
      '-': () => this.zoom(1.25),
      '1': () => this.setView('top'),
      '2': () => this.setView('front'),
      '3': () => this.setView('side'),
      '4': () => this.setView('iso'),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
    this.invalidate();
  };
}
