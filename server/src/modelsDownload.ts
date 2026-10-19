// Download a model's files straight into the correct ComfyUI folder, with progress over WS.
// Uses the manifest hosted on the domain so URLs can change without re-shipping the connector.
import { createWriteStream, mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { JobEvent } from '../../shared/types';

type Emit = (e: JobEvent) => void;

const BASE = process.env.FRV_BASE ?? 'https://freavy.com';
const MANIFEST_URL = `${BASE}/models-manifest.json`;

type ManifestEntry = { modelId: string; label: string; files: { folder: string; file: string; url: string }[] };

function modelsRoot(): string {
  // ComfyUI portable: <COMFY_DIR>\ComfyUI\models
  const comfy = process.env.COMFY_DIR;
  if (!comfy) throw new Error('In-app downloads need COMFY_DIR (portable ComfyUI root) set. Otherwise download the files by hand: see setup/models.md');
  return join(comfy, 'ComfyUI', 'models');
}

async function fetchManifest(): Promise<ManifestEntry[]> {
  const r = await fetch(MANIFEST_URL);
  if (!r.ok) throw new Error(`model manifest unavailable (${r.status}). Download the files by hand: see setup/models.md`);
  return (await r.json()) as ManifestEntry[];
}

async function downloadFile(url: string, dest: string, onPct: (pct: number) => void): Promise<void> {
  const tmp = `${dest}.part`;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`);
  const total = Number(r.headers.get('content-length') ?? 0);
  let got = 0;
  const out = createWriteStream(tmp);
  const reader = Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0]);
  reader.on('data', (chunk: Buffer) => { got += chunk.length; if (total) onPct(Math.min(99, Math.round((got / total) * 100))); });
  await new Promise<void>((ok, bad) => { reader.pipe(out); out.on('finish', ok); out.on('error', bad); reader.on('error', bad); });
  renameSync(tmp, dest); // atomic — a half-download never looks complete
}

/** Download every file for a model into ComfyUI's models tree. */
export async function downloadModel(modelId: string, emit: Emit): Promise<void> {
  try {
    const manifest = await fetchManifest();
    const entry = manifest.find((m) => m.modelId === modelId);
    if (!entry) throw new Error(`model "${modelId}" not in manifest`);

    for (const f of entry.files) {
      if (!f.url) throw new Error(`no download URL set for ${f.file}`);
      const dir = join(modelsRoot(), f.folder);
      mkdirSync(dir, { recursive: true });
      const dest = join(dir, f.file);
      if (existsSync(dest) && statSync(dest).size > 0) { emit({ type: 'model-progress', modelId, file: f.file, pct: 100 }); continue; }
      await downloadFile(f.url, dest, (pct) => emit({ type: 'model-progress', modelId, file: f.file, pct }));
      emit({ type: 'model-progress', modelId, file: f.file, pct: 100 });
    }
    emit({ type: 'model-done', modelId });
  } catch (err) {
    emit({ type: 'model-error', modelId, error: err instanceof Error ? err.message : String(err) });
  }
}
