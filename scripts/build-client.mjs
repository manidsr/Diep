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
copyFileSync('src/client/vendor/three.min.js', 'dist/public/three.min.js');
mkdirSync('dist/public/assets/nature', { recursive: true });
for (const asset of ['tree1.glb', 'tree2.glb', 'tree3.glb', 'bush.glb']) {
  copyFileSync('src/client/assets/nature/' + asset, 'dist/public/assets/nature/' + asset);
}
