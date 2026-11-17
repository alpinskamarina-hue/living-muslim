// After the app build: the landing becomes the site root, the app moves to /app/.
import { copyFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
mkdirSync('dist/app', { recursive: true });
renameSync('dist/index.html', 'dist/app/index.html');
for (const f of readdirSync('dist')) if (/^quran-.*\.json$/.test(f)) copyFileSync(`dist/${f}`, `dist/app/${f}`);
copyFileSync('landing/index.html', 'dist/index.html');
copyFileSync('landing/privacy.html', 'dist/privacy.html');
mkdirSync('dist/guide', { recursive: true });
copyFileSync('landing/guide.html', 'dist/guide/index.html');
console.log('landing at /, app at /app/');
