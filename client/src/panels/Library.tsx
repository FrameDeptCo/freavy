import { useEffect, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { AssetRef } from '../../../shared/types';
import type { ModelDef } from '../../../shared/types';
import { CATEGORIES, REGISTRY, modelTitle, estimateCost, formatCost } from '../../../shared/registry';
import { useStore } from '../store';
import { api } from '../engine';
import { saveProjectDebounced } from '../run';

export type PanelId = 'search' | 'quick' | 'toolbox' | 'assets' | 'image' | 'video' | 'three' | 'community' | null;

const NODE_GLYPHS: Record<string, string> = {
  Text: 'T',
  Image: '▣',
  Video: '▶',
  Edit: '✎',
  Matte: '◧',
  Utility: '⌘',
  Data: '#',
};

function useAddNode() {
  const addNode = useStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();
  return (defId: string): string => {
    const pos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const id = addNode(defId, pos.x, pos.y);
    saveProjectDebounced();
    return id;
  };
}

function Toolbox({ query }: { query: string }) {
  const add = useAddNode();
  const q = query.toLowerCase();
  return (
    <>
      <h2>Toolbox</h2>
      {CATEGORIES.map((cat) => {
        const items = REGISTRY.filter((d) => d.category === cat && (!q || d.title.toLowerCase().includes(q)));
        if (!items.length) return null;
        return (
          <div key={cat}>
            <div className="lib-cat">{cat}</div>
            <div className="lib-grid">
              {items.map((d) => (
                <button key={d.id} className="lib-card" onClick={() => add(d.id)} title={d.description ?? d.title}>
                  <span className="glyph">{NODE_GLYPHS[d.category] ?? '◇'}</span>
                  <span>{d.title}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function costOf(m: ModelDef): string {
  const p: Record<string, string | number | boolean> = {};
  for (const pp of m.params ?? []) p[pp.id] = pp.default;
  return formatCost(estimateCost(m, p));
}

function ModelCards({ title, nodeIds, query }: { title: string; nodeIds: string[]; query: string }) {
  const add = useAddNode();
  const setModel = useStore((s) => s.setModel);
  const q = query.toLowerCase();
  const defs = REGISTRY.filter((d) => nodeIds.includes(d.id));
  const all = defs.flatMap((d) => (d.models ?? []).map((m) => ({ d, m })));
  const groups: [string, typeof all][] = [
    ['Local · free', all.filter((x) => x.m.provider !== 'fal')],
    ['API · pay-per-use', all.filter((x) => x.m.provider === 'fal')],
  ];
  return (
    <>
      <h2>{title}</h2>
      {groups.map(([label, items]) => {
        const shown = items.filter((x) => !q || x.m.label.toLowerCase().includes(q));
        if (!shown.length) return null;
        return (
          <div key={label}>
            <div className="lib-cat">{label}</div>
            <div className="lib-grid">
              {shown.map(({ d, m }) => (
                <button
                  key={d.id + m.id}
                  className="lib-card"
                  title={`${d.title} — ${m.label}`}
                  onClick={() => { const id = add(d.id); setModel(id, m.id); saveProjectDebounced(); }}
                >
                  <span className="glyph">{m.provider === 'fal' ? '☁' : '⌂'}</span>
                  <span>{modelTitle(m.label)}</span>
                  <span className="tag">{costOf(m)} · {d.title}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function QuickAccess({ query }: { query: string }) {
  const add = useAddNode();
  const q = query.toLowerCase();
  const QUICK = ['prompt', 'import', 'export', 'preview', 'router', 'note', 'compare'];
  return (
    <>
      <h2>Quick access</h2>
      <div className="lib-grid">
        {REGISTRY.filter((d) => QUICK.includes(d.id) && (!q || d.title.toLowerCase().includes(q))).map((d) => (
          <button key={d.id} className="lib-card" onClick={() => add(d.id)}>
            <span className="glyph">{NODE_GLYPHS[d.category] ?? '◇'}</span>
            <span>{d.title}</span>
          </button>
        ))}
      </div>
      <h2>Saved</h2>
      <div className="lib-cat">Models</div>
      <p className="lib-note">Save models to reuse them across workflows. Coming soon.</p>
      <div className="lib-cat">Nodes</div>
      <p className="lib-note">Save nodes to reuse them across workflows. Coming soon.</p>
      <div className="lib-cat">Groups</div>
      <p className="lib-note">Save groups to reuse them across workflows. Coming soon.</p>
    </>
  );
}

function Assets({ query }: { query: string }) {
  const [assets, setAssets] = useState<(AssetRef & { mtime: number })[]>([]);
  const setResults = useStore((s) => s.setResults);
  const add = useAddNode();

  useEffect(() => {
    void fetch(api('/api/assets')).then(async (r) => r.ok && setAssets(await r.json()));
  }, []);

  const q = query.toLowerCase();
  const shown = useMemo(() => assets.filter((a) => !q || a.id.toLowerCase().includes(q)), [assets, q]);

  const grab = (a: AssetRef) => {
    const id = add('import');
    setResults(id, [{ id: a.id, type: a.type, url: a.url, meta: a.meta }]);
    saveProjectDebounced();
  };

  return (
    <>
      <h2>Assets</h2>
      <div className="lib-cat">{shown.length} files — click to add to canvas</div>
      <div className="asset-grid">
        {shown.map((a) => (
          <button key={a.url} className="asset-thumb" onClick={() => grab(a)} title={a.id}>
            {a.type === 'image' ? <img src={a.url} loading="lazy" alt="" /> : <video src={a.url} muted playsInline />}
            {a.type === 'video' && <span className="badge">▶</span>}
          </button>
        ))}
      </div>
    </>
  );
}

export function LibraryPanel({ panel, onClose }: { panel: PanelId; onClose: () => void }) {
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [panel]);
  if (!panel) return null;
  return (
    <div className="library">
      <div className="lib-head">
        <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <button className="ghost-btn" onClick={onClose}>✕</button>
      </div>
      <div className="lib-body">
        {panel === 'quick' && <QuickAccess query={query} />}
        {panel === 'toolbox' && <Toolbox query={query} />}
        {panel === 'assets' && <Assets query={query} />}
        {panel === 'image' && (
          <ModelCards title="Image Models" nodeIds={['image-generate', 'image-edit', 'inpaint', 'upscale', 'remove-bg']} query={query} />
        )}
        {panel === 'video' && (
          <ModelCards title="Video Models" nodeIds={['video-generate']} query={query} />
        )}
        {panel === 'three' && (
          <>
            <h2>3D Models</h2>
            <div className="lib-cat">Generate from text or image</div>
            <p className="lib-note">3D generation (Trellis, Hunyuan 3D, Meshy, Rodin) is planned — not wired up yet.</p>
          </>
        )}
        {panel === 'community' && (
          <>
            <h2>Community Models</h2>
            <div className="lib-cat">Community models</div>
            <p className="lib-note">Import any model from fal.ai or Replicate by URL. Coming soon — for now, add models in shared/registry.ts.</p>
          </>
        )}
        {panel === 'search' && (
          <>
            <Toolbox query={query} />
            <ModelCards title="Image Models" nodeIds={['image-generate', 'image-edit', 'inpaint', 'upscale', 'remove-bg']} query={query} />
            <ModelCards title="Video Models" nodeIds={['video-generate']} query={query} />
            <Assets query={query} />
          </>
        )}
      </div>
    </div>
  );
}
