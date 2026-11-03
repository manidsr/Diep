import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('dist/public', { recursive: true });
await build({
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  outfile: 'dist/public/client.js',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
copyFileSync('src/client/index.html', 'dist/public/index.html');
