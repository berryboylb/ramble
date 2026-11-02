import type { ShapeSpec } from '../../core/types.ts';
import type { BuildContext, Built } from '../parts.ts';

interface ShapeModule {
  build(spec: ShapeSpec, ctx: BuildContext): Built;
}

// Each shape builder is a separate chunk. It loads the first time a part of that kind is shown.
const loaders = import.meta.glob<ShapeModule>(['./*.ts', '!./index.ts']);

export async function buildShape(spec: ShapeSpec, ctx: BuildContext): Promise<Built> {
  const load = loaders[`./${spec.kind}.ts`];
  if (!load) throw new Error(`No shape builder for "${spec.kind}".`);
  const module = await load();
  return module.build(spec, ctx);
}
