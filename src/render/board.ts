import {
  CircleGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import { box, mesh } from './parts.ts';

// A perforated board with holes on a 2.54 mm grid. The surface is y = 0.

export const BOARD_WIDTH = 120;
export const BOARD_DEPTH = 80;
export const BOARD_THICKNESS = 1.6;
const PITCH = 2.54;

export function createBoard(): Group {
  const group = new Group();
  const pcb = new MeshStandardMaterial({ color: '#1f5a3a', roughness: 0.8 });
  group.add(
    mesh(box(BOARD_WIDTH, BOARD_THICKNESS, BOARD_DEPTH), pcb, [0, -BOARD_THICKNESS / 2, 0]),
  );

  // All holes are 1 instanced mesh, so they draw in 1 GPU call.
  const columns = Math.floor(BOARD_WIDTH / PITCH / 2) * 2 - 1;
  const rows = Math.floor(BOARD_DEPTH / PITCH / 2) * 2 - 1;
  const hole = new CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
  const holes = new InstancedMesh(
    hole,
    new MeshBasicMaterial({ color: '#0d2a1b' }),
    columns * rows,
  );
  const matrix = new Matrix4();
  let i = 0;
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      matrix.makeTranslation((c - (columns - 1) / 2) * PITCH, 0.01, (r - (rows - 1) / 2) * PITCH);
      holes.setMatrixAt(i++, matrix);
    }
  }
  group.add(holes);
  return group;
}
