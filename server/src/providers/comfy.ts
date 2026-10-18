import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { AssetRef } from '../../../shared/types';
import { saveAsset } from '../assets.ts';
import { COMFY_URL } from '../status.ts';
import { TEMPLATES, aspectToSize, ltxSize, wanSize, minimaxSize, minimaxFrames, shortEdge } from './comfyTemplates.ts';
import { imageSize } from '../imageSize.ts';

/** Fit the source image's aspect into a pixel budget, dims divisible by `step`. */
function autoSize(buf: Buffer, budget: number, step: number, fallback: { width: number; height: number }) {
  const dims = imageSize(buf);
  if (!dims) return fallback;
  const r = dims.width / dims.height;
  const width = Math.max(step, Math.round(Math.sqrt(budget * r) / step) * step);
  const height = Math.max(step, Math.round(Math.sqrt(budget / r) / step) * step);
  return { width, height };
}

export interface RunArgs {
  modelRef: string;
  prompt: string;
  images: Buffer[];
  mask?: Buffer;
  last?: Buffer;
  refs?: Buffer[];
  video?: Buffer;
  params: Record<string, string | number | boolean>;
  onProgress: (pct: number, label?: string) => void;
}

async function uploadImage(buf: Buffer): Promise<string> {
  const name = `weave_${randomUUID().slice(0, 8)}.png`;
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buf)], { type: 'image/png' }), name);
  const res = await fetch(`${COMFY_URL}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ComfyUI upload failed: ${res.status}`);
  const json = (await res.json()) as { name: string };
  return json.name;
}

async function uploadVideo(buf: Buffer): Promise<string> {
  const name = `weave_${randomUUID().slice(0, 8)}.mp4`;
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buf)], { type: 'video/mp4' }), name);
  const res = await fetch(`${COMFY_URL}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ComfyUI video upload failed: ${res.status}`);
  const json = (await res.json()) as { name: string };
  return json.name;
}

const execFileP = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

/** total frame count of a video buffer, via ffprobe on a temp file */
async function videoFrameCount(buf: Buffer): Promise<number> {
  const tmp = join(tmpdir(), `frv_probe_${randomUUID().slice(0, 8)}.mp4`);
  await writeFile(tmp, buf);
  try {
    const { stdout } = await execFileP(FFPROBE, [
      '-v', 'error', '-select_streams', 'v:0',
      '-count_frames', '-show_entries', 'stream=nb_read_frames',
      '-of', 'default=nokey=1:noprint_wrappers=1', tmp,
    ]);
    const n = parseInt(stdout.trim(), 10);
    if (!n || Number.isNaN(n)) throw new Error('ffprobe returned no frame count');
    return n;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

async function videoDims(buf: Buffer): Promise<{ width: number; height: number }> {
  const tmp = join(tmpdir(), `frv_probe_${randomUUID().slice(0, 8)}.mp4`);
  await writeFile(tmp, buf);
  try {
    const { stdout } = await execFileP(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', tmp]);
    const [width, height] = stdout.trim().split(',').map(Number);
    if (!width || !height) throw new Error('ffprobe returned no video size');
    return { width, height };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

export async function runComfy(a: RunArgs): Promise<AssetRef[]> {
  const builder = TEMPLATES[a.modelRef];
  if (!builder) throw new Error(`No ComfyUI template for model "${a.modelRef}". Check Model Manager / setup docs.`);

  const imagePaths = await Promise.all(a.images.map(uploadImage));
  const maskPath = a.mask ? await uploadImage(a.mask) : undefined;
  const lastPath = a.last ? await uploadImage(a.last) : undefined;
  const refPaths = await Promise.all((a.refs ?? []).map(uploadImage));
  const videoPath = a.video ? await uploadVideo(a.video) : undefined;
  // Foley (V2A) freezes the source video, so it needs the source's own frame count
  // rounded DOWN to 8n+1 (LTX latent constraint) rather than a generated duration.
  const isAlphaGen = a.modelRef === 'ltx-25-alpha-gen';
  // Alpha Gen is trained for clips of at most 145 frames (RGB leaks into the matte beyond that)
  const videoFrames = a.video ? Math.min(Math.floor((await videoFrameCount(a.video) - 1) / 8) * 8 + 1, isAlphaGen ? 145 : Infinity) : undefined;
  const seedParam = Number(a.params.seed ?? -1);
  const seed = seedParam < 0 ? Math.floor(Math.random() * 2 ** 48) : seedParam;
  const isWan = a.modelRef.startsWith('wan');
  const isMinimax = a.modelRef === 'minimax-h3' || a.modelRef === 'minimax-h3-r2v';
  const isVideo = isWan || isMinimax || isAlphaGen || a.modelRef.includes('t2v') || a.modelRef.includes('i2v');
  const aspect = String(a.params.aspect ?? (isVideo ? '16:9' : '1:1'));
  const imgBase = a.modelRef.startsWith('ideogram') ? 1024 : 1328; // Ideogram 4 is trained at ~1MP
  const resolution = String(a.params.resolution ?? '720p');
  const sizeFor = isWan ? wanSize : isMinimax ? minimaxSize : ltxSize;
  let { width, height } = isVideo ? sizeFor(aspect, resolution) : aspectToSize(aspect, imgBase);
  if (aspect === 'auto') {
    const ref = a.images[0] ?? a.refs?.[0];
    if (ref) {
      const short = shortEdge(resolution); // video short-edge target in px
      const vidBudget = Math.round((short * 16) / 9) * short; // 16:9 pixel budget at the chosen resolution
      ({ width, height } = isVideo
        ? autoSize(ref, vidBudget, isWan ? 16 : 32, sizeFor('16:9', resolution))
        : autoSize(ref, imgBase * imgBase, 16, aspectToSize('1:1', imgBase)));
    }
  }
  if (isAlphaGen && a.video) {
    // keep the source aspect: short edge = chosen resolution (never upscaled), dims divisible by 32, long edge capped at 1920
    const src = await videoDims(a.video);
    const short = Math.min(shortEdge(resolution), Math.min(src.width, src.height));
    const r = src.width / src.height;
    const snap = (n: number) => Math.max(32, Math.round(n / 32) * 32);
    width = snap(r >= 1 ? short * r : short);
    height = snap(r >= 1 ? short : short / r);
    const over = Math.max(width, height) / 1920;
    if (over > 1) { width = snap(width / over); height = snap(height / over); }
  }
  const fps = isWan ? 16 : 24;
  const durationSec = parseInt(String(a.params.duration ?? '5s'), 10) || 5;
  // video frame counts must be 8n+1 (LTX) / 4n+1 (Wan) — 8n+1 satisfies both; MiniMax snaps to its own 17k+5 grid
  const frames = isAlphaGen && videoFrames ? videoFrames : isMinimax ? minimaxFrames(durationSec, fps) : Math.round((durationSec * fps) / 8) * 8 + 1;

  const { workflow, outputNodeId } = builder({
    prompt: a.prompt,
    imagePaths,
    maskPath,
    lastPath,
    refPaths,
    width,
    height,
    seed,
    // minimax-h3-r2v runs the base (non-Turbo) weights — needs the full ~20 steps; minimax-h3 and
    // everything else run the Turbo LoRA path at 8.
    steps: Number(a.params.steps ?? (a.modelRef === 'minimax-h3-r2v' ? 20 : 8)),
    cfg: Number(a.params.cfg ?? 1),
    batch: Number(a.params.batch ?? 1),
    loraStrength: Number(a.params.loraStrength ?? 1),
    realismStrength: Number(a.params.realismStrength ?? 0),
    cameraLoraStrength: Number(a.params.cameraLoraStrength ?? 0),
    frames,
    fps,
    videoPath,
    videoFrames,
  });

  const clientId = randomUUID();
  const ws = new WebSocket(`${COMFY_URL.replace('http', 'ws')}/ws?clientId=${clientId}`);
  await new Promise<void>((ok, bad) => {
    ws.once('open', () => ok());
    ws.once('error', bad);
  });

  const submit = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!submit.ok) {
    ws.close();
    throw new Error(`ComfyUI rejected workflow: ${await submit.text()}`);
  }
  const { prompt_id } = (await submit.json()) as { prompt_id: string };

  await new Promise<void>((done, fail) => {
    // MiniMax H3 R2V has no Turbo LoRA yet (untested compatibility, see comfyTemplates.ts) and
    // runs the full 20 official steps with multi-reference conditioning riding along every
    // step — routinely exceeds 10 min. 25 min covers that with headroom for other slow local models.
    const timeoutMs = a.modelRef === 'minimax-h3-r2v' ? 1_500_000 : 600_000;
    const timeout = setTimeout(() => fail(new Error(`ComfyUI run timed out (${Math.round(timeoutMs / 60_000)} min)`)), timeoutMs);
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'progress' && msg.data.prompt_id === prompt_id) {
        a.onProgress(Math.round((msg.data.value / msg.data.max) * 100), 'sampling');
      }
      if (msg.type === 'executing' && msg.data.prompt_id === prompt_id && msg.data.node === null) {
        clearTimeout(timeout);
        done();
      }
      if (msg.type === 'execution_error' && msg.data.prompt_id === prompt_id) {
        clearTimeout(timeout);
        fail(new Error(msg.data.exception_message ?? 'ComfyUI execution error'));
      }
    });
    ws.once('error', (e) => {
      clearTimeout(timeout);
      fail(e);
    });
  }).finally(() => ws.close());

  const histRes = await fetch(`${COMFY_URL}/history/${prompt_id}`);
  const hist = (await histRes.json()) as Record<string, { outputs: Record<string, Record<string, unknown>> }>;
  const nodeOut = hist[prompt_id]?.outputs?.[outputNodeId] ?? {};
  // SaveImage uses "images", SaveVideo/SaveWEBM report under other keys — collect any {filename} arrays
  const files: { filename: string; subfolder: string; type: string }[] = [];
  for (const v of Object.values(nodeOut)) {
    if (Array.isArray(v)) for (const f of v) if (f && typeof f === 'object' && 'filename' in f) files.push(f as { filename: string; subfolder: string; type: string });
  }
  if (!files.length) throw new Error('ComfyUI produced no output files');

  const assets: AssetRef[] = [];
  for (const f of files) {
    const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder ?? '', type: f.type ?? 'output' });
    const res = await fetch(`${COMFY_URL}/view?${q}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (f.filename.split('.').pop() ?? 'png').toLowerCase();
    const video = ['mp4', 'webm', 'mov', 'mkv'].includes(ext);
    const mesh = ['glb', 'gltf', 'obj', 'ply'].includes(ext);
    const kind = mesh ? 'model3d' : video ? 'video' : 'image';
    assets.push(saveAsset(buf, ext, kind, {
      prompt: a.prompt, model: a.modelRef, seed, params: a.params, provider: 'comfy',
      width, height, inputImages: a.images.length, refImages: a.refs?.length ?? 0,
    }));
  }
  return assets;
}
