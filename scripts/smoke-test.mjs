// Checks a freavy install end to end. Usage: node scripts/smoke-test.mjs [--generate]
// Needs the server running (pnpm --filter server dev). --generate runs one local Qwen Image render.
const BASE = process.env.FREAVY_URL ?? 'http://127.0.0.1:5918';
const generate = process.argv.includes('--generate');
let failed = false;
const say = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${path} returned ${r.status}`);
  return r.json();
}

let status;
try {
  status = await get('/api/status');
  say(true, `freavy server reachable at ${BASE}`);
} catch {
  say(false, `freavy server not reachable at ${BASE}. Start it: pnpm --filter server dev`);
  process.exit(1);
}
say(status.comfy, status.comfy ? 'ComfyUI reachable (default http://127.0.0.1:8188)' : 'ComfyUI not reachable. Start ComfyUI, or set COMFY_URL');
console.log(`${status.ollama ? 'OK  ' : 'note'} Ollama ${status.ollama ? 'reachable' : 'not reachable (only the prompt/describe/LLM nodes need it)'}`);
console.log(`note fal.ai key ${status.fal ? 'set' : 'not set'} (optional, paid API models)`);

const idx = await get('/api/models');
const registry = await get('/api/registry');
console.log('\nLocal models (ComfyUI):');
let qwenReady = false;
const seen = new Set();
for (const node of registry) {
  for (const m of node.models ?? []) {
    if (m.provider !== 'comfy' || seen.has(m.id) || !Array.isArray(m.requires)) continue;
    seen.add(m.id);
    const missing = m.requires.filter((r) => !(idx.comfy?.[r.folder] ?? []).includes(r.file));
    if (m.id === 'qwen-image') qwenReady = missing.length === 0;
    console.log(`  ${missing.length === 0 ? 'ready  ' : 'missing'} ${m.label}${missing.length ? ` (${missing.length} of ${m.requires.length} files missing)` : ''}`);
  }
}
if (!qwenReady) console.log('\nQwen Image 2512 is the smallest first model to install: see setup/models.md');

if (generate) {
  if (!status.comfy || !qwenReady) {
    say(false, 'cannot run --generate: ComfyUI must be up and the Qwen Image 2512 files installed');
  } else {
    console.log('\nGenerating one image with Qwen Image (local, free)...');
    const r = await fetch(`${BASE}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ node: 'image-generate', modelId: 'qwen-image', prompt: 'a red apple on a wooden table, soft window light', count: 1 }),
    });
    const j = await r.json();
    say(r.ok && j.results?.length > 0, r.ok ? `image saved: ${j.results?.[0]?.url}` : `generation failed: ${j.error}`);
  }
}
process.exit(failed ? 1 : 0);
