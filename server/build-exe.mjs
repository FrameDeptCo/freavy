// Builds the distributable connector: bundle the server → Node SEA blob → inject into node.exe.
// Run: pnpm --filter server build:exe   →   server/dist/freavy-connector.exe
import { build } from 'esbuild';
import { writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = import.meta.dirname;
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const cjs = join(dist, 'connector.cjs');
const blob = join(dist, 'sea-prep.blob');
const exe = join(dist, 'freavy-connector.exe');

console.log('1/4  bundling server →', cjs);
await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outfile: cjs,
  external: ['bufferutil', 'utf-8-validate'], // optional ws deps, loaded via try/catch at runtime
  banner: { js: "const import_meta_url=require('url').pathToFileURL(__filename).href;" },
  define: { 'import.meta.url': 'import_meta_url', 'import.meta.dirname': '__dirname' },
});

console.log('2/4  creating SEA blob');
writeFileSync(join(dist, 'sea-config.json'), JSON.stringify({ main: cjs, output: blob, disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ['--experimental-sea-config', join(dist, 'sea-config.json')], { stdio: 'inherit' });

console.log('3/4  copying node runtime →', exe);
copyFileSync(process.execPath, exe);

console.log('4/4  injecting blob');
const postject = join(root, 'node_modules', 'postject', 'dist', 'cli.js');
execFileSync(process.execPath, [postject, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });

console.log('\n✓ built', exe);
