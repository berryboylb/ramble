import type { Plugin } from 'vite';

// Build only. The 3D app is its own entry, so Vite does not wrap its import in the preload helper.
// This plugin writes the app's hashed file name into index.html, where boot.ts reads it.

const APP_SOURCE = '/src/app.ts';

export function shellPlugin(): Plugin {
  return {
    name: 'ramble-shell',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const app = Object.values(ctx.bundle ?? {}).find(
          (chunk) =>
            chunk.type === 'chunk' && chunk.isEntry && chunk.facadeModuleId?.endsWith(APP_SOURCE),
        );
        if (!app) throw new Error(`The build has no entry chunk for ${APP_SOURCE}.`);
        return html
          .replace(`data-app="${APP_SOURCE}"`, `data-app="/${app.fileName}"`)
          .replace(/>\s+</g, '><')
          .trim();
      },
    },
  };
}
