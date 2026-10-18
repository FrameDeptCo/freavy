import { createElement, memo, useEffect, useRef } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import type { GraphNode, PortDef } from '../../../shared/types';
import { PORT_COLORS } from '../../../shared/types';
import { byId, modelTitle, estimateCost, formatCost } from '../../../shared/registry';
import { useStore } from '../store';
import { runNode, saveProjectDebounced, uploadFile } from '../run';
import { runEditingOp, mergeAlpha, blend, extractFrame } from '../editing/ops';
import { PainterCanvas } from './PainterCanvas';

const MV_SRC = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';
function Model3DView({ url }: { url: string }) {
  useEffect(() => {
    if (!document.querySelector(`script[src="${MV_SRC}"]`)) {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = MV_SRC;
      document.head.appendChild(s);
    }
  }, []);
  // model-viewer is a custom element; render via createElement to avoid JSX typing.
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {createElement('model-viewer' as unknown as 'div', {
        src: url,
        'camera-controls': true,
        'auto-rotate': true,
        'touch-action': 'pan-y',
        style: { width: '100%', height: '100%', background: '#111' },
      })}
      <a href={url} download style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, color: '#fff', opacity: 0.7, textDecoration: 'none' }}>
        ⤓ .glb
      </a>
    </div>
  );
}

function Port({ p, type, idx, total }: { p: PortDef; type: 'source' | 'target'; idx: number; total: number }) {
  const top = 44 + idx * 22;
  return (
    <Handle
      key={p.id}
      id={p.id}
      type={type}
      position={type === 'target' ? Position.Left : Position.Right}
      style={{ top, borderColor: PORT_COLORS[p.type] }}
      title={`${p.label} (${p.type})`}
    />
  );
}

export const WeaveNode = memo(function WeaveNode({ id, selected }: NodeProps) {
  const node = useStore((s) => s.nodes.find((n) => n.id === id));
  const rt = useStore((s) => s.runtime[id]);
  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);
  const setParam = useStore((s) => s.setParam);
  const setResults = useStore((s) => s.setResults);
  const setActiveResult = useStore((s) => s.setActiveResult);
  const removeNode = useStore((s) => s.removeNode);
  const openGallery = useStore((s) => s.openGallery);
  const setRuntime = useStore((s) => s.setRuntime);
  const setSize = useStore((s) => s.setSize);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!node) return null;
  const def = byId.get(node.defId);
  if (!def) return null;

  const active = node.results[Math.min(node.activeResult, node.results.length - 1)];
  const isGen = def.kind === 'generative' || def.kind === 'llm';
  const model = def.models?.find((m) => m.id === node.modelId);

  const inputUrl = (handle: string): string | undefined => {
    const e = edges.find((x) => x.target === id && x.targetHandle === handle);
    const src = e && nodes.find((n) => n.id === e.source);
    if (!src) return undefined;
    const srcDef = byId.get(src.defId);
    // multi-output nodes (e.g. Painter Result/Mask, channel split) route by output port index
    const outs = srcDef?.outputs ?? [];
    let idx = Math.min(src.activeResult, src.results.length - 1);
    if (outs.length > 1) {
      const oi = outs.findIndex((o) => o.id === e.sourceHandle);
      if (oi >= 0 && oi < src.results.length) idx = oi;
    }
    return src.results[idx]?.url || undefined;
  };

  const runEdit = async () => {
    try {
      setRuntime(id, { status: 'running', pct: 50, error: undefined });
      let out;
      if (def.id === 'merge-alpha') {
        const i = inputUrl('image');
        const m = inputUrl('mask');
        if (!i || !m) throw new Error('Connect image and mask');
        out = await mergeAlpha(i, m);
      } else if (def.id === 'blend') {
        const a = inputUrl('a');
        const b = inputUrl('b');
        if (!a || !b) throw new Error('Connect Base and Overlay');
        out = await blend(a, b, String(node.params.mode), Number(node.params.opacity));
      } else if (def.id === 'extract-frame') {
        const vurl = inputUrl('video');
        if (!vurl) throw new Error('Connect a video');
        out = await extractFrame(vurl, Number(node.params.position));
      } else {
        const url = inputUrl(def.inputs[0]?.id ?? 'image');
        if (!url) throw new Error('Connect an input image');
        out = await runEditingOp(node, url);
      }
      setResults(id, out);
      setRuntime(id, { status: 'idle', pct: 0 });
      saveProjectDebounced();
    } catch (e) {
      setRuntime(id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    const refs = [];
    for (const f of Array.from(files)) {
      const up = await uploadFile(f);
      refs.push({ id: up.id, type: up.type, url: up.url, meta: { name: f.name } });
    }
    setResults(id, [...node.results, ...refs]);
    saveProjectDebounced();
  };

  const isPainter = def.id === 'painter';
  const resizable = def.id === 'prompt' || def.id === 'note';
  const cls = ['wnode', resizable ? 'wnode-resizable' : '', isPainter ? 'wnode-painter' : '', selected ? 'selected' : '', rt?.status === 'running' ? 'running' : '', rt?.status === 'error' ? 'error' : ''].join(' ');

  return (
    <div
      className={cls}
      style={{
        minHeight: 44 + Math.max(def.inputs.length, def.outputs.length) * 22,
        ...(resizable ? { width: node.w ?? 340, height: node.h ?? 280 } : {}),
      }}
    >
      {resizable && (
        <NodeResizer
          minWidth={260}
          minHeight={200}
          lineStyle={{ borderColor: 'transparent', borderWidth: 6 }}
          handleStyle={{ width: 14, height: 14, background: 'transparent', border: 'none' }}
          onResize={(_e, p) => setSize(id, p.width, p.height)}
          onResizeEnd={() => saveProjectDebounced()}
        />
      )}
      {def.inputs.map((p, i) => (
        <Port key={p.id} p={p} type="target" idx={i} total={def.inputs.length} />
      ))}
      {def.outputs.map((p, i) => (
        <Port key={p.id} p={p} type="source" idx={i} total={def.outputs.length} />
      ))}
      {def.inputs.map((p, i) => (
        <span key={`l${p.id}`} className="port-label in" style={{ top: 44 + i * 22 - 5, color: PORT_COLORS[p.type] }}>
          {p.label}{p.optional ? '' : '*'}
        </span>
      ))}
      {def.outputs.map((p, i) => (
        <span key={`l${p.id}`} className="port-label out" style={{ top: 44 + i * 22 - 5, color: PORT_COLORS[p.type] }}>
          {p.label}
        </span>
      ))}

      <div className="wnode-header">
        <span>{isGen && model ? modelTitle(model.label) : def.title}</span>
        {model && <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 10 }}>{model.provider === 'fal' ? 'API' : 'LOCAL'}</span>}
        <button className="menu" onClick={() => removeNode(id)} title="Delete">⋯</button>
      </div>

      <div className="wnode-body nodrag">
        {isPainter && (
          <PainterCanvas node={node} inputUrl={inputUrl('image')} setParam={setParam} setResults={setResults} />
        )}
        {!isPainter && def.params.filter((p) => !p.advanced && p.control.kind === 'text').map((p) => (
          p.control.kind === 'text' && p.control.multiline ? (
            <textarea
              key={p.id}
              value={String(node.params[p.id] ?? '')}
              placeholder={p.label}
              onChange={(e) => { setParam(id, p.id, e.target.value); saveProjectDebounced(); }}
            />
          ) : (
            <input
              key={p.id}
              type="text"
              value={String(node.params[p.id] ?? '')}
              placeholder={p.label}
              onChange={(e) => { setParam(id, p.id, e.target.value); saveProjectDebounced(); }}
            />
          )
        ))}

        {!active && isGen && <div className="wnode-media empty" />}
        {!isPainter && (active || def.id === 'import') && (
          <div className="wnode-media" onDoubleClick={() => node.results.length && openGallery(id)}>
            {active?.type === 'image' && <img src={active.url} alt="" draggable={false} />}
            {active?.type === 'video' && <video src={active.url} autoPlay loop muted playsInline />}
            {active?.type === 'model3d' && <Model3DView url={active.url} />}
            {active?.type === 'text' && <div style={{ padding: 10, fontSize: 11, color: 'var(--text)', userSelect: 'text', whiteSpace: 'pre-wrap' }}>{active.text}</div>}
            {!active && def.id === 'import' && (
              <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-dim)', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
                Drop files or click to upload
              </div>
            )}
            {node.results.length > 1 && (
              <div className="nav">
                <button onClick={() => setActiveResult(id, (node.activeResult - 1 + node.results.length) % node.results.length)}>‹</button>
                <button onClick={() => setActiveResult(id, (node.activeResult + 1) % node.results.length)}>›</button>
              </div>
            )}
          </div>
        )}
        {def.id === 'import' && (
          <>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => onImport(e.target.files)} />
            {node.results.length > 0 && <button className="ghost-btn" onClick={() => fileRef.current?.click()}>+ Add more images</button>}
          </>
        )}
      </div>

      {rt?.status === 'running' && (
        <div className="progress"><i style={{ width: `${rt.pct}%` }} /></div>
      )}
      {rt?.status === 'error' && <div className="node-error-msg">{rt.error}</div>}

      <div className="wnode-footer nodrag">
        {isGen && (
          <>
            <span className="node-cost" title="Estimated cost for one run">{formatCost(estimateCost(model, node.params))}</span>
            <button className="run-btn" disabled={rt?.status === 'running'} onClick={() => void runNode(id)}>
              {rt?.status === 'running' ? `${rt.pct}%` : '→ Run Model'}
            </button>
          </>
        )}
        {def.kind === 'editing' && !isPainter && (
          <button className="run-btn" style={{ background: 'var(--panel-2)' }} onClick={() => void runEdit()}>Apply</button>
        )}
        {def.id === 'export' && active && (
          <a className="run-btn" style={{ textDecoration: 'none' }} href={active.url} download>Download</a>
        )}
      </div>
    </div>
  );
});
