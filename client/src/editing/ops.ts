import type { AssetRef, GraphNode } from '../../../shared/types';
import { uploadFile } from '../run';

type Params = Record<string, string | number | boolean>;

async function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = bad;
    img.src = url;
  });
}

function canvasFor(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

async function toAsset(c: HTMLCanvasElement, meta: Record<string, unknown>): Promise<AssetRef> {
  const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'));
  const file = new File([blob], 'edit.png', { type: 'image/png' });
  const up = await uploadFile(file);
  return { id: up.id, type: 'image', url: up.url, meta };
}

export async function runEditingOp(node: GraphNode, inputUrl: string): Promise<AssetRef[]> {
  const img = await loadImg(inputUrl);
  const p = node.params;
  const meta = { op: node.defId, params: p, source: inputUrl };

  switch (node.defId) {
    case 'crop': {
      const x = (Number(p.x) / 100) * img.width;
      const y = (Number(p.y) / 100) * img.height;
      let w = (Number(p.w) / 100) * img.width;
      let h = (Number(p.h) / 100) * img.height;
      const aspect = String(p.aspect);
      if (aspect !== 'free' && aspect.includes(':')) {
        const [aw, ah] = aspect.split(':').map(Number);
        const r = aw / ah;
        if (w / h > r) w = h * r;
        else h = w / r;
      }
      const [c, ctx] = canvasFor(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
      return [await toAsset(c, meta)];
    }
    case 'resize': {
      const [c, ctx] = canvasFor(Number(p.width), Number(p.height));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return [await toAsset(c, meta)];
    }
    case 'blur': {
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.filter = `blur(${Number(p.radius)}px)`;
      ctx.drawImage(img, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'invert': {
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.filter = 'invert(1)';
      ctx.drawImage(img, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'color-correct': {
      const [c, ctx] = canvasFor(img.width, img.height);
      const b = 1 + Number(p.brightness) / 100;
      const ct = 1 + Number(p.contrast) / 100;
      const s = Number(p.saturation) / 100;
      ctx.filter = `brightness(${b}) contrast(${ct}) saturate(${s})`;
      ctx.drawImage(img, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'rotate-flip': {
      const rot = Number(p.rotate) % 360;
      const swap = rot === 90 || rot === 270;
      const [c, ctx] = canvasFor(swap ? img.height : img.width, swap ? img.width : img.height);
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(p.flipH ? -1 : 1, p.flipV ? -1 : 1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      return [await toAsset(c, meta)];
    }
    case 'mask-extract': {
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      const useAlpha = String(p.source) === 'alpha';
      for (let i = 0; i < d.length; i += 4) {
        const v = useAlpha ? d[i + 3] : Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'sharpen': {
      const k = Number(p.amount) / 100;
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const src = ctx.getImageData(0, 0, c.width, c.height);
      const out = ctx.createImageData(c.width, c.height);
      const w = c.width, h = c.height, sd = src.data, od = out.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const c0 = sd[i + ch];
            const up = y > 0 ? sd[i - w * 4 + ch] : c0;
            const dn = y < h - 1 ? sd[i + w * 4 + ch] : c0;
            const lf = x > 0 ? sd[i - 4 + ch] : c0;
            const rt = x < w - 1 ? sd[i + 4 + ch] : c0;
            od[i + ch] = Math.min(255, Math.max(0, c0 + (c0 * 4 - up - dn - lf - rt) * k));
          }
          od[i + 3] = sd[i + 3];
        }
      }
      ctx.putImageData(out, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'color-palette': {
      const n = Number(p.count);
      const sw = 64;
      const [sc, sctx] = canvasFor(sw, sw);
      sctx.drawImage(img, 0, 0, sw, sw);
      const sd = sctx.getImageData(0, 0, sw, sw).data;
      const buckets = new Map<string, { r: number; g: number; b: number; c: number }>();
      for (let i = 0; i < sd.length; i += 4) {
        const key = `${sd[i] >> 5}-${sd[i + 1] >> 5}-${sd[i + 2] >> 5}`;
        const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, c: 0 };
        e.r += sd[i]; e.g += sd[i + 1]; e.b += sd[i + 2]; e.c++;
        buckets.set(key, e);
      }
      const top = [...buckets.values()].sort((a, b) => b.c - a.c).slice(0, n);
      const cw = Math.max(1, top.length) * 120;
      const [c, ctx] = canvasFor(cw, 200);
      top.forEach((e, idx) => {
        ctx.fillStyle = `rgb(${Math.round(e.r / e.c)},${Math.round(e.g / e.c)},${Math.round(e.b / e.c)})`;
        ctx.fillRect(idx * 120, 0, 120, 200);
      });
      return [await toAsset(c, meta)];
    }
    case 'levels': {
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const lo = Number(p.shadows), hi = Number(p.highlights), mid = Number(p.midtones);
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        let v = (i - lo) / Math.max(1, hi - lo);
        v = Math.min(1, Math.max(0, v));
        lut[i] = Math.round(Math.pow(v, 1 / mid) * 255);
      }
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]];
        d[i + 1] = lut[d[i + 1]];
        d[i + 2] = lut[d[i + 2]];
      }
      ctx.putImageData(data, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'channels': {
      const out: AssetRef[] = [];
      for (const ch of [0, 1, 2, 3]) {
        const [c, ctx] = canvasFor(img.width, img.height);
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height);
        const d = data.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i + ch];
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        out.push(await toAsset(c, { ...meta, channel: 'rgba'[ch] }));
      }
      return out;
    }
    case 'mask-grow': {
      const amt = Number(p.amount);
      const [c, ctx] = canvasFor(img.width, img.height);
      // dilate/erode approximation via repeated 1px blur+threshold
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      const thresh = amt >= 0 ? 1 : 254;
      const passes = Math.abs(amt);
      let src = d;
      for (let pass = 0; pass < passes; pass++) {
        const copy = new Uint8ClampedArray(src);
        for (let y = 1; y < c.height - 1; y++) {
          for (let x = 1; x < c.width - 1; x++) {
            const idx = (y * c.width + x) * 4;
            const nb = Math.max(
              copy[idx - 4], copy[idx + 4],
              copy[idx - c.width * 4], copy[idx + c.width * 4],
            );
            const nbMin = Math.min(
              copy[idx - 4], copy[idx + 4],
              copy[idx - c.width * 4], copy[idx + c.width * 4],
            );
            const v = amt >= 0 ? Math.max(copy[idx], nb >= thresh ? nb : copy[idx]) : Math.min(copy[idx], nbMin);
            src[idx] = src[idx + 1] = src[idx + 2] = v;
            src[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(data, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'grayscale': {
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.filter = 'grayscale(1)';
      ctx.drawImage(img, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'hue-rotate': {
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.filter = `hue-rotate(${Number(p.angle)}deg)`;
      ctx.drawImage(img, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'threshold': {
      const t = Number(p.level);
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= t ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(data, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'posterize': {
      const n = Math.max(2, Number(p.levels));
      const step = 255 / (n - 1);
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.round(Math.round(d[i] / step) * step);
        d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
        d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
      }
      ctx.putImageData(data, 0, 0);
      return [await toAsset(c, meta)];
    }
    case 'vignette': {
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const a = Number(p.amount) / 100;
      const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      return [await toAsset(c, meta)];
    }
    case 'pixelate': {
      const s = Math.max(2, Number(p.size));
      const sw = Math.max(1, Math.round(img.width / s));
      const sh = Math.max(1, Math.round(img.height / s));
      const [small, sctx] = canvasFor(sw, sh);
      sctx.drawImage(img, 0, 0, sw, sh);
      const [c, ctx] = canvasFor(img.width, img.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw, sh, 0, 0, c.width, c.height);
      return [await toAsset(c, meta)];
    }
    default:
      throw new Error(`No client op for ${node.defId}`);
  }
}

export async function extractFrame(videoUrl: string, posPct: number): Promise<AssetRef[]> {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.src = videoUrl;
  await new Promise<void>((ok, bad) => {
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(v.duration - 0.01, Math.max(0, (v.duration * posPct) / 100));
    };
    v.onseeked = () => ok();
    v.onerror = () => bad(new Error('Could not load video'));
  });
  const [c, ctx] = canvasFor(v.videoWidth || 1280, v.videoHeight || 720);
  ctx.drawImage(v, 0, 0, c.width, c.height);
  return [await toAsset(c, { op: 'extract-frame', position: posPct })];
}

export async function blend(baseUrl: string, overUrl: string, mode: string, opacity: number): Promise<AssetRef[]> {
  const [base, over] = await Promise.all([loadImg(baseUrl), loadImg(overUrl)]);
  const [c, ctx] = canvasFor(base.width, base.height);
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity / 100));
  ctx.globalCompositeOperation = (mode === 'normal' ? 'source-over' : mode) as GlobalCompositeOperation;
  ctx.drawImage(over, 0, 0, base.width, base.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return [await toAsset(c, { op: 'blend', mode, opacity })];
}

export async function mergeAlpha(imageUrl: string, maskUrl: string): Promise<AssetRef[]> {
  const [img, mask] = await Promise.all([loadImg(imageUrl), loadImg(maskUrl)]);
  const [c, ctx] = canvasFor(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const [mc, mctx] = canvasFor(img.width, img.height);
  mctx.drawImage(mask, 0, 0, img.width, img.height);
  const md = mctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = md[i];
  ctx.putImageData(id, 0, 0);
  return [await toAsset(c, { op: 'merge-alpha' })];
}
