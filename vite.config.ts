import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The site build splits the app into cached chunks under /app/assets/, so the first screen loads fast
// and heavy screens arrive when opened. SINGLE=1 makes the old one-file build (for a claude.ai artifact).
const single = process.env.SINGLE === '1';

export default defineConfig({
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  base: single ? './' : '/',
  build: single ? {} : { assetsDir: 'app/assets', chunkSizeWarningLimit: 900 },
});
