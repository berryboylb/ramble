import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { createBoard } from './board.ts';
import { OrbitCamera } from './controls.ts';
import { Labels } from './labels.ts';
import { setAnisotropy } from './markings.ts';

export interface View {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitCamera;
  labels: Labels;
  canvas: HTMLCanvasElement;
  /** Asks for 1 new frame. Frames are drawn only on request. */
  invalidate(): void;
  /** Runs before every frame. */
  onFrame(callback: () => void): void;
}

export function createView(container: HTMLElement, labelRoot: HTMLElement): View {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const canvas = renderer.domElement;
  container.prepend(canvas);

  const scene = new Scene();
  scene.background = new Color('#0f1216');
  scene.add(new HemisphereLight('#ffffff', '#3a4250', 1.6));
  const sun = new DirectionalLight('#ffffff', 1.8);
  sun.position.set(40, 90, 60);
  const fill = new DirectionalLight('#ffffff', 0.5);
  fill.position.set(-40, -60, -30);
  scene.add(sun, fill, createBoard());

  const camera = new PerspectiveCamera(40, 1, 0.5, 3000);
  const labels = new Labels(labelRoot);
  const callbacks: (() => void)[] = [];
  let scheduled = false;

  const frame = (now: number) => {
    scheduled = false;
    const moving = controls.update(now);
    for (const callback of callbacks) callback();
    renderer.render(scene, camera);
    labels.update(camera, container.clientWidth, container.clientHeight);
    if (moving) invalidate();
  };
  const invalidate = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(frame);
    }
  };
  const controls = new OrbitCamera(camera, canvas, invalidate);

  new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    invalidate();
  }).observe(container);

  return {
    renderer,
    scene,
    camera,
    controls,
    labels,
    canvas,
    invalidate,
    onFrame: (cb) => callbacks.push(cb),
  };
}
