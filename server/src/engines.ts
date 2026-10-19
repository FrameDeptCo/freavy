// Auto-start local engines (ComfyUI + Ollama) on server boot if they aren't already up.
// Paths are configurable via env so a future installer can point them anywhere.
import { spawn } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { COMFY_URL, OLLAMA_URL } from './status.ts';

const COMFY_DIR = process.env.COMFY_DIR; // optional: portable ComfyUI root; unset = never autostart ComfyUI
const COMFY_PYTHON = process.env.COMFY_PYTHON ?? (COMFY_DIR ? join(COMFY_DIR, 'python_embeded', 'python.exe') : '');
const COMFY_MAIN = process.env.COMFY_MAIN ?? (COMFY_DIR ? join(COMFY_DIR, 'ComfyUI', 'main.py') : '');
const OLLAMA_EXE = process.env.OLLAMA_EXE ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe');
const OLLAMA_MODELS = process.env.OLLAMA_MODELS; // optional: custom Ollama model folder

async function reachable(url: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

// avoids double-launching across dev (tsx watch) restarts while an engine is still booting
function recentlyLaunched(name: string): boolean {
  const f = join(tmpdir(), name);
  try { if (statSync(f).mtimeMs > Date.now() - 90_000) return true; } catch { /* no lock yet */ }
  try { writeFileSync(f, String(Date.now())); } catch { /* best effort */ }
  return false;
}

function launch(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv }): boolean {
  if (!existsSync(cmd)) {
    console.log(`[engines] not found, skipping autostart: ${cmd}`);
    return false;
  }
  const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, detached: true, stdio: 'ignore' });
  child.on('error', (e) => console.log(`[engines] failed to start ${cmd}: ${e.message}`));
  child.unref();
  return true;
}

export async function ensureEngines(): Promise<void> {
  const [comfy, ollama] = await Promise.all([reachable(COMFY_URL), reachable(OLLAMA_URL)]);

  if (ollama) { console.log('[engines] Ollama already up'); }
  else if (!recentlyLaunched('frv-ollama.lock')) {
    if (launch(OLLAMA_EXE, ['serve'], { env: OLLAMA_MODELS ? { ...process.env, OLLAMA_MODELS } : process.env })) console.log('[engines] starting Ollama…');
  }

  if (comfy) { console.log('[engines] ComfyUI already up'); }
  else if (!recentlyLaunched('frv-comfy.lock')) {
    if (!COMFY_PYTHON || !COMFY_MAIN) console.log(`[engines] ComfyUI not reachable at ${COMFY_URL}. Start it yourself, or set COMFY_DIR so freavy can.`);
    else if (launch(COMFY_PYTHON, ['-s', COMFY_MAIN, '--windows-standalone-build'], { cwd: COMFY_DIR }))
      console.log('[engines] starting ComfyUI… (model load ~20–40s; engine dots go green when ready)');
  }
}
