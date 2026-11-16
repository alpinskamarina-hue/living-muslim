import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build: the whole app becomes one index.html that can be opened anywhere.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
});
