import { defineConfig } from 'vite';
import { catalogPlugin } from './tools/vite-plugin-catalog.ts';
import { shellPlugin } from './tools/vite-plugin-shell.ts';

export default defineConfig({
  plugins: [catalogPlugin(), shellPlugin()],
  build: {
    modulePreload: false,
    target: 'es2022',
    // three.js is one chunk of about 590 KB before gzip. tools/check-size.js enforces the real budget.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      // 2 entries: the page shell (tier 0) and the 3D app (tier 2).
      input: { index: 'index.html', app: 'src/app.ts' },
    },
  },
  worker: { format: 'es' },
});
