// Distribution config — when launched by the installer as the connector, it gets
// `--config <dir>\config.json` and points all paths at the user's install folder.
// In dev (no --config) everything falls back to the existing behavior. Imported FIRST
// in index.ts so these env vars are set before any module reads them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const i = process.argv.indexOf('--config');
const cfgPath = i >= 0 ? process.argv[i + 1] : process.env.FRV_CONFIG;

if (cfgPath) {
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, string>;
    if (cfg.dir) {
      process.env.FRV_DIR = cfg.dir;
      process.env.FRV_DATA = join(cfg.dir, 'data');
    }
    if (cfg.engine) {
      const root = join(cfg.engine, 'ComfyUI'); // installer renames the portable to <engine>\ComfyUI
      process.env.COMFY_DIR = root;
      process.env.COMFY_PYTHON = join(root, 'python_embeded', 'python.exe');
      process.env.COMFY_MAIN = join(root, 'ComfyUI', 'main.py');
    }
    if (cfg.ollama) process.env.OLLAMA_MODELS = cfg.ollama;
    console.log(`[config] loaded ${cfgPath}`);
  } catch (e) {
    console.log(`[config] could not read ${cfgPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// The user's OWN fal key (never bundled) — from <dir>\fal-key.txt if present.
if (!process.env.FAL_KEY && process.env.FRV_DIR) {
  try {
    const k = readFileSync(join(process.env.FRV_DIR, 'fal-key.txt'), 'utf8').trim();
    if (k) process.env.FAL_KEY = k;
  } catch { /* no key file — fal models just stay unavailable until they add one */ }
}
