import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AssetRef } from '../../shared/types';

export const DATA_DIR = process.env.FRV_DATA ?? join(import.meta.dirname, '..', '..', 'data');
export const ASSETS_DIR = join(DATA_DIR, 'assets');
mkdirSync(ASSETS_DIR, { recursive: true });

// Absolute so the hosted UI (or dev client on :5917) loads media straight from the local engine.
const ORIGIN = 'http://127.0.0.1:5918';

function slug(s: string, max = 48): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);
const VID_EXT = new Set(['mp4', 'webm', 'mov', 'mkv']);
const MESH_EXT = new Set(['glb', 'gltf', 'obj', 'ply']);

export function listAssets(): (AssetRef & { mtime: number })[] {
  const out: (AssetRef & { mtime: number })[] = [];
  for (const f of readdirSync(ASSETS_DIR)) {
    const ext = f.split('.').pop()!.toLowerCase();
    const isImg = IMG_EXT.has(ext);
    const isMesh = MESH_EXT.has(ext);
    if (!isImg && !isMesh && !VID_EXT.has(ext)) continue;
    const base = f.slice(0, -(ext.length + 1));
    let meta: Record<string, unknown> | undefined;
    try {
      meta = JSON.parse(readFileSync(join(ASSETS_DIR, `${base}.json`), 'utf8'));
    } catch {
      /* no sidecar */
    }
    const type: AssetRef['type'] = isImg ? 'image' : isMesh ? 'model3d' : 'video';
    out.push({ id: base, type, url: `${ORIGIN}/assets/${f}`, meta, mtime: statSync(join(ASSETS_DIR, f)).mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/** filename: {model}_{prompt-slug}_{shortid}.{ext} so generations are findable on disk */
export function saveAsset(buf: Buffer, ext: string, type: AssetRef['type'], meta: Record<string, unknown>): AssetRef {
  const id = randomUUID().slice(0, 8);
  const model = slug(String(meta.model ?? '').split('/').pop() ?? '', 24);
  const prompt = slug(String(meta.prompt ?? ''));
  const base = [model, prompt, id].filter(Boolean).join('_');
  const file = `${base}.${ext}`;
  writeFileSync(join(ASSETS_DIR, file), buf);
  writeFileSync(join(ASSETS_DIR, `${base}.json`), JSON.stringify(meta, null, 2));
  return { id, type, url: `${ORIGIN}/assets/${file}`, meta };
}
