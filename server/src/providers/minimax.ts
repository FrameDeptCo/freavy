import type { AssetRef } from '../../../shared/types';
import { saveAsset } from '../assets.ts';
import { imageSize, nearestAspect } from '../imageSize.ts';

// Direct MiniMax platform API (api.minimax.io) — NOT fal.ai. Bypasses fal's markup
// (fal charges $0.26/sec at 2K for MiniMax H3 vs $0.13/sec direct, $0.08/sec at 768P).
// Docs: https://platform.minimax.io/docs/guides/video-generation

export interface MinimaxArgs {
  modelRef: string;
  prompt: string;
  images: Buffer[]; // treated as first_frame(s)
  refs?: Buffer[]; // additional reference images (subject/style consistency, up to 9 total w/ images)
  video?: Buffer; // reference video (motion/camera reference, up to 3 supported by the API — we send 1)
  last?: Buffer; // last frame pin
  params: Record<string, string | number | boolean>;
  onProgress: (pct: number, label?: string) => void;
}

const BASE_URL = 'https://api.minimax.io';

const MINIMAX_KEY = () => {
  const k = process.env.MINIMAX_API_KEY;
  if (!k) throw new Error('MINIMAX_API_KEY not set. Add it to server/.env (get a key at platform.minimax.io) or switch the node to a different model.');
  return k;
};

function toDataUri(buf: Buffer, kind: 'image' | 'video'): string {
  const mime = kind === 'video' ? 'video/mp4' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role?: string }
  | { type: 'video_url'; video_url: { url: string }; role?: string };

export async function runMinimax(a: MinimaxArgs): Promise<AssetRef[]> {
  const key = MINIMAX_KEY();

  const content: ContentBlock[] = [{ type: 'text', text: a.prompt }];
  for (const img of a.images) content.push({ type: 'image_url', image_url: { url: toDataUri(img, 'image') }, role: 'first_frame' });
  if (a.last) content.push({ type: 'image_url', image_url: { url: toDataUri(a.last, 'image') }, role: 'last_frame' });
  for (const r of a.refs ?? []) content.push({ type: 'image_url', image_url: { url: toDataUri(r, 'image') }, role: 'reference_image' });
  if (a.video) content.push({ type: 'video_url', video_url: { url: toDataUri(a.video, 'video') }, role: 'reference_video' });

  const isRef = content.some((c) => c.type !== 'text');
  const duration = Number(String(a.params.duration ?? '5s').replace('s', '')) || 5;

  // model-tier resolution: registry entries set params.resolution to lock 2K vs 768P vs 1080P pricing tiers
  const resolution = a.params.resolution ? String(a.params.resolution) : '768P';

  let ratio: string | undefined;
  if (a.params.aspect === 'auto') {
    const first = a.images[0] ?? a.refs?.[0];
    const dims = first ? imageSize(first) : null;
    ratio = dims ? nearestAspect(dims.width, dims.height, ['16:9', '9:16', '1:1', '4:3', '3:4']) : '16:9';
  } else if (a.params.aspect) {
    ratio = String(a.params.aspect);
  }
  // t2va (no images/refs/video) requires a concrete ratio; ref2va/i2va can go adaptive
  if (!ratio) ratio = isRef ? 'adaptive' : '16:9';

  const payload: Record<string, unknown> = { model: a.modelRef, content, duration, resolution, ratio };
  const seed = Number(a.params.seed ?? -1);
  if (seed >= 0) payload.seed = seed;

  a.onProgress(5, 'submitting');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const submit = await fetch(`${BASE_URL}/v2/video_generation`, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!submit.ok) throw new Error(`MiniMax API error ${submit.status}: ${await submit.text()}`);
  const submitJson = (await submit.json()) as { task_id?: string; base_resp?: { status_code: number; status_msg: string } };
  if (submitJson.base_resp && submitJson.base_resp.status_code !== 0) {
    throw new Error(`MiniMax API error ${submitJson.base_resp.status_code}: ${submitJson.base_resp.status_msg}`);
  }
  const taskId = submitJson.task_id;
  if (!taskId) throw new Error('MiniMax API returned no task_id');

  a.onProgress(10, 'queued');
  let videoUrl: string | undefined;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const st = await fetch(`${BASE_URL}/v2/query/video_generation/${taskId}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!st.ok) throw new Error(`MiniMax API query error ${st.status}: ${await st.text()}`);
    const sj = (await st.json()) as { task?: { status: string; content?: { url: string }; error?: string } };
    const status = sj.task?.status;
    if (status === 'succeeded') { videoUrl = sj.task?.content?.url; break; }
    if (status === 'failed' || status === 'cancelled') throw new Error(`MiniMax video generation ${status}: ${sj.task?.error ?? 'unknown error'}`);
    a.onProgress(Math.min(90, 10 + i * 3), status ?? 'processing');
  }
  if (!videoUrl) throw new Error('MiniMax video generation timed out after 20 minutes');

  a.onProgress(95, 'downloading');
  const res = await fetch(videoUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const asset = saveAsset(buf, 'mp4', 'video', { prompt: a.prompt, model: a.modelRef, params: a.params, provider: 'minimax' });
  a.onProgress(100, 'done');
  return [asset];
}
