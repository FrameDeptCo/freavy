import type { AssetRef } from '../../../shared/types';
import { saveAsset } from '../assets.ts';
import { imageSize, nearestAspect } from '../imageSize.ts';

export interface FalArgs {
  modelRef: string;
  prompt: string;
  images: Buffer[];
  params: Record<string, string | number | boolean>;
  onProgress: (pct: number, label?: string) => void;
}

const FAL_KEY = () => {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error('FAL_KEY not set. Add it to server/.env or switch the node to a local model.');
  return k;
};

async function toDataUri(buf: Buffer): Promise<string> {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function runFal(a: FalArgs): Promise<AssetRef[]> {
  const key = FAL_KEY();
  const body: Record<string, unknown> = { prompt: a.prompt };
  // Gemini/nano-banana endpoints require the plural `image_urls` array even for a single
  // image (confirmed via direct API test — `image_url` alone 400s with "Field required:
  // image_urls"). Other fal endpoints (Kling, Seedance, Clarity, ...) use the singular
  // `image_url` for one image and only switch to `image_urls` for multi-ref.
  const alwaysPlural = /nano-banana|gemini/.test(a.modelRef);
  if (a.images.length === 1 && !alwaysPlural) body.image_url = await toDataUri(a.images[0]);
  if (a.images.length > 1 || (a.images.length === 1 && alwaysPlural)) body.image_urls = await Promise.all(a.images.map(toDataUri));
  if (a.params.aspect === 'auto') {
    const dims = a.images[0] ? imageSize(a.images[0]) : null;
    body.aspect_ratio = dims ? nearestAspect(dims.width, dims.height, ['16:9', '9:16', '1:1', '4:3', '3:4']) : '16:9';
  } else if (a.params.aspect) {
    body.aspect_ratio = a.params.aspect;
  }
  if (a.params.duration) body.duration = String(a.params.duration).replace('s', '');
  if (a.params.resolution) body.resolution = String(a.params.resolution);
  // forward model-specific params (gpt-image-2 etc.); unknown fields are ignored by most fal endpoints
  if (a.params.quality) body.quality = String(a.params.quality);
  if (a.params.size) {
    const [w, h] = String(a.params.size).split('x').map(Number);
    if (w && h) body.image_size = { width: w, height: h };
  }
  const seed = Number(a.params.seed ?? -1);
  if (seed >= 0) body.seed = seed;

  a.onProgress(5, 'queued');
  const submit = await fetch(`https://queue.fal.run/${a.modelRef}`, {
    method: 'POST',
    headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!submit.ok) throw new Error(`fal.ai error ${submit.status}: ${await submit.text()}`);
  const { status_url, response_url } = (await submit.json()) as { status_url: string; response_url: string };

  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(status_url, { headers: { authorization: `Key ${key}` } });
    const sj = (await st.json()) as { status: string };
    if (sj.status === 'COMPLETED') break;
    if (sj.status === 'IN_PROGRESS') a.onProgress(Math.min(90, 10 + i * 2), 'generating');
    if (sj.status === 'FAILED') throw new Error('fal.ai job failed');
  }

  const out = await fetch(response_url, { headers: { authorization: `Key ${key}` } });
  const oj = (await out.json()) as { images?: { url: string }[]; image?: { url: string }; video?: { url: string } };
  const urls: { url: string; video: boolean }[] = [
    ...(oj.images ?? []).map((i) => ({ url: i.url, video: false })),
    ...(oj.image ? [{ url: oj.image.url, video: false }] : []),
    ...(oj.video ? [{ url: oj.video.url, video: true }] : []),
  ];
  if (!urls.length) throw new Error('fal.ai returned no media');

  const assets: AssetRef[] = [];
  for (const u of urls) {
    const res = await fetch(u.url);
    const buf = Buffer.from(await res.arrayBuffer());
    assets.push(saveAsset(buf, u.video ? 'mp4' : 'png', u.video ? 'video' : 'image', { prompt: a.prompt, model: a.modelRef, params: a.params, provider: 'fal' }));
  }
  return assets;
}
