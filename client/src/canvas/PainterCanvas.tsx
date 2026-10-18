import { useEffect, useRef, useState } from 'react';
import type { AssetRef, GraphNode } from '../../../shared/types';
import { uploadFile, saveProjectDebounced } from '../run';

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function canvasToAsset(c: HTMLCanvasElement, meta: Record<string, unknown>): Promise<AssetRef> {
  const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'));
  const up = await uploadFile(new File([blob], 'painter.png', { type: 'image/png' }));
  return { id: up.id, type: 'image', url: up.url, meta };
}

export function PainterCanvas({
  node,
  inputUrl,
  setParam,
  setResults,
}: {
  node: GraphNode;
  inputUrl?: string;
  setParam: (id: string, key: string, value: string | number | boolean) => void;
  setResults: (id: string, results: AssetRef[]) => void;
}) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null); // offscreen strokes (color)
  const bgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const emitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [panel, setPanel] = useState<'brush' | 'eraser' | 'settings'>('brush');
  const [lock, setLock] = useState(true);

  const color = String(node.params.color ?? '#ffffff');
  const opacity = Number(node.params.opacity ?? 100);
  const size = Number(node.params.size ?? 30);
  const hardness = Number(node.params.hardness ?? 100);
  const bgColor = String(node.params.bgColor ?? '#000000');
  const W = Math.max(64, Number(node.params.canvasW ?? 1024));
  const H = Math.max(64, Number(node.params.canvasH ?? 1024));
  const tool = panel === 'eraser' ? 'eraser' : 'brush';

  // init offscreen paint canvas + restore saved strokes (once)
  useEffect(() => {
    if (!paintRef.current) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      paintRef.current = c;
    }
    const saved = String(node.params.paint ?? '');
    if (saved) {
      const img = new Image();
      img.onload = () => {
        const ctx = paintRef.current!.getContext('2d')!;
        ctx.clearRect(0, 0, paintRef.current!.width, paintRef.current!.height);
        ctx.drawImage(img, 0, 0, paintRef.current!.width, paintRef.current!.height);
        redraw();
      };
      img.src = saved;
    } else {
      redraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // resize paint canvas when dimensions change, rescaling existing strokes
  useEffect(() => {
    const p = paintRef.current;
    if (!p) return;
    if (p.width === W && p.height === H) return;
    const next = document.createElement('canvas');
    next.width = W; next.height = H;
    next.getContext('2d')!.drawImage(p, 0, 0, W, H);
    paintRef.current = next;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H]);

  // load / refresh background image
  useEffect(() => {
    if (!inputUrl) { bgRef.current = null; redraw(); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { bgRef.current = img; redraw(); };
    img.src = inputUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputUrl]);

  useEffect(redraw, [bgColor]);

  function redraw() {
    const d = displayRef.current;
    const p = paintRef.current;
    if (!d || !p) return;
    if (d.width !== p.width || d.height !== p.height) { d.width = p.width; d.height = p.height; }
    const ctx = d.getContext('2d')!;
    ctx.clearRect(0, 0, d.width, d.height);
    if (bgRef.current) ctx.drawImage(bgRef.current, 0, 0, d.width, d.height);
    else { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, d.width, d.height); }
    ctx.drawImage(p, 0, 0);
  }

  const stamp = (x: number, y: number) => {
    const ctx = paintRef.current!.getContext('2d')!;
    const r = size / 2;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${opacity / 100})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    const [cr, cg, cb] = hexToRgb(color);
    const a = opacity / 100;
    const soft = hardness / 100;
    ctx.globalCompositeOperation = 'source-over';
    if (soft >= 0.99) {
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(x, y, r * soft, x, y, r);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  };

  const strokeTo = (x: number, y: number) => {
    const p = last.current;
    if (p) {
      const dist = Math.hypot(x - p.x, y - p.y);
      const steps = Math.max(1, Math.ceil(dist / (size / 4)));
      for (let i = 1; i <= steps; i++) {
        stamp(p.x + ((x - p.x) * i) / steps, p.y + ((y - p.y) * i) / steps);
      }
    } else {
      stamp(x, y);
    }
    last.current = { x, y };
    redraw();
  };

  const toLocal = (e: React.PointerEvent) => {
    const rect = displayRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * paintRef.current!.width,
      y: ((e.clientY - rect.top) / rect.height) * paintRef.current!.height,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (panel === 'settings') return;
    e.stopPropagation();
    drawing.current = true;
    last.current = null;
    displayRef.current!.setPointerCapture(e.pointerId);
    const { x, y } = toLocal(e);
    strokeTo(x, y);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const { x, y } = toLocal(e);
    strokeTo(x, y);
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    persist();
  };

  const persist = () => {
    setParam(node.id, 'paint', paintRef.current!.toDataURL('image/png'));
    if (emitTimer.current) clearTimeout(emitTimer.current);
    emitTimer.current = setTimeout(() => void emit(), 400);
    saveProjectDebounced();
  };

  const emit = async () => {
    const paint = paintRef.current!;
    const w = paint.width, h = paint.height;
    const rc = document.createElement('canvas');
    rc.width = w; rc.height = h;
    const rctx = rc.getContext('2d')!;
    if (bgRef.current) rctx.drawImage(bgRef.current, 0, 0, w, h);
    else { rctx.fillStyle = bgColor; rctx.fillRect(0, 0, w, h); }
    rctx.drawImage(paint, 0, 0);
    const mc = document.createElement('canvas');
    mc.width = w; mc.height = h;
    const mctx = mc.getContext('2d')!;
    const src = paint.getContext('2d')!.getImageData(0, 0, w, h);
    const out = mctx.createImageData(w, h);
    for (let i = 0; i < src.data.length; i += 4) {
      const v = src.data[i + 3];
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    mctx.putImageData(out, 0, 0);
    const [result, mask] = await Promise.all([
      canvasToAsset(rc, { op: 'painter', port: 'image' }),
      canvasToAsset(mc, { op: 'painter', port: 'mask' }),
    ]);
    setResults(node.id, [result, mask]);
    saveProjectDebounced();
  };

  const reset = () => {
    const p = paintRef.current!;
    p.getContext('2d')!.clearRect(0, 0, p.width, p.height);
    redraw();
    setParam(node.id, 'paint', '');
    setResults(node.id, []);
    saveProjectDebounced();
  };

  const setDim = (key: 'canvasW' | 'canvasH', v: number) => {
    const val = Math.max(64, Math.min(2048, Math.round(v) || 64));
    setParam(node.id, key, val);
    if (lock) setParam(node.id, key === 'canvasW' ? 'canvasH' : 'canvasW', val);
    saveProjectDebounced();
  };

  const slider = (key: string, label: string, val: number, min: number, max: number, suffix: string) => (
    <div className="paint-row">
      <span className="paint-lbl">{label}</span>
      <input
        type="range" min={min} max={max} value={val}
        onChange={(e) => { setParam(node.id, key, Number(e.target.value)); saveProjectDebounced(); }}
      />
      <span className="paint-val">{val}{suffix}</span>
    </div>
  );

  const colorRow = (label: string, key: string) => {
    const v = String(node.params[key] ?? '#000000');
    return (
      <div className="paint-row">
        <span className="paint-lbl">{label}</span>
        <input type="color" className="paint-swatch" value={v} onChange={(e) => { setParam(node.id, key, e.target.value); saveProjectDebounced(); }} />
        <input
          type="text" className="paint-hex" value={v.replace('#', '').toUpperCase()}
          onChange={(e) => { setParam(node.id, key, '#' + e.target.value.replace('#', '')); saveProjectDebounced(); }}
        />
        <span className="paint-val">{opacity}%</span>
      </div>
    );
  };

  return (
    <div className="painter">
      <canvas
        ref={displayRef}
        className="paint-surface nodrag nowheel"
        style={{ aspectRatio: `${W} / ${H}`, cursor: panel === 'settings' ? 'default' : 'crosshair' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <div className="paint-tools">
        <button className={panel === 'brush' ? 'active' : ''} title="Brush" onClick={() => setPanel('brush')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15.5 5.5l3 3L9 18l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        </button>
        <button className={panel === 'eraser' ? 'active' : ''} title="Eraser" onClick={() => setPanel('eraser')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 15l7-7 5 5-5 5H7l-3-3zM9 20h10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        </button>
        <button className={panel === 'settings' ? 'active' : ''} title="Canvas settings" onClick={() => setPanel('settings')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M4 10h16M4 15h16M10 4v16M15 4v16" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button className="paint-reset" title="Clear canvas" onClick={reset}>Reset</button>
      </div>

      {panel === 'brush' && (
        <>
          {colorRow('Color', 'color')}
          {slider('size', 'Size', size, 1, 200, '')}
          {slider('hardness', 'Hardness', hardness, 1, 100, '%')}
        </>
      )}
      {panel === 'eraser' && (
        <>
          {slider('opacity', 'Opacity', opacity, 1, 100, '%')}
          {slider('size', 'Size', size, 1, 200, '')}
          {slider('hardness', 'Hardness', hardness, 1, 100, '%')}
        </>
      )}
      {panel === 'settings' && (
        <>
          {colorRow('Background color', 'bgColor')}
          <div className="paint-row">
            <span className="paint-lbl">Dimensions</span>
            <div className="paint-dims">
              <span className="paint-dim-lbl">W</span>
              <input type="number" className="paint-dim" value={W} min={64} max={2048}
                onChange={(e) => setDim('canvasW', Number(e.target.value))} />
              <span className="paint-dim-lbl">H</span>
              <input type="number" className="paint-dim" value={H} min={64} max={2048}
                onChange={(e) => setDim('canvasH', Number(e.target.value))} />
              <button className={`paint-link ${lock ? 'on' : ''}`} title="Lock aspect ratio" onClick={() => setLock((l) => !l)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 12h6M10 8.5a3.5 3.5 0 010 0L7.5 8.5a3.5 3.5 0 100 7H10M14 8.5h2.5a3.5 3.5 0 110 7H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
