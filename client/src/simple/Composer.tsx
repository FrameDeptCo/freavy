import { useState } from 'react';
import type { AssetRef, ModelDef, NodeDef } from '../../../shared/types';
import { estimateCost, formatCost, modelTitle, paramsFor } from '../../../shared/registry';
import { modelAvailable, useStore } from '../store';
import { downloadModel, runComposer, uploadFile } from '../run';
import { ParamControl } from '../panels/ParamControl';
import { Select } from '../ui/Select';

interface Props {
  category: string;
  categories: string[];
  onPickCategory: (c: string) => void;
  defsInCategory: NodeDef[];
  defId: string;
  onPickDef: (id: string) => void;
  models: ModelDef[];
  modelId: string;
  onPickModel: (id: string) => void;
  prompt: string;
  onPrompt: (p: string) => void;
  params: Record<string, string | number | boolean>;
  onParam: (id: string, v: string | number | boolean) => void;
  refs: AssetRef[];
  onRefs: (r: AssetRef[]) => void;
  count: number;
  onCount: (n: number) => void;
}

export function Composer({
  category, categories, onPickCategory,
  defsInCategory, defId, onPickDef,
  models, modelId, onPickModel,
  prompt, onPrompt, params, onParam,
  refs, onRefs, count, onCount,
}: Props) {
  const modelIndex = useStore((s) => s.modelIndex);
  const engines = useStore((s) => s.engines);
  const modelDL = useStore((s) => s.modelDL);
  const [busy, setBusy] = useState(false);

  const def = defsInCategory.find((d) => d.id === defId);
  const model = models.find((m) => m.id === modelId) ?? models[0];
  const paramDefs = def && model ? paramsFor(def, model).filter((p) => !p.advanced) : [];
  const avail = model ? modelAvailable(model, modelIndex, engines.fal) : true;
  const cost = formatCost(estimateCost(model, params));

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: AssetRef[] = [];
    for (const f of Array.from(files)) {
      const up = await uploadFile(f);
      next.push({ id: up.id, type: up.type, url: up.url });
    }
    onRefs([...refs, ...next]);
  };

  const onGenerate = async () => {
    if (!def || !model || busy) return;
    setBusy(true);
    try {
      const n = Math.min(4, Math.max(1, count));
      for (let i = 0; i < n; i++) {
        await runComposer({ defId: def.id, modelId: model.id, modelLabel: model.label, prompt, params, refs });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer-dock">
      <div className="composer-warn-wrap">
        {model && !avail && model.provider === 'fal' && (
          <div className="composer-warn">Add your fal.ai API key to use this model.</div>
        )}
        {model && !avail && model.provider === 'comfy' && (() => {
          const dl = modelDL[model.id];
          if (dl && !dl.error) {
            return (
              <div className="composer-warn">
                <div>Downloading {dl.file}… {dl.pct}%</div>
                <div className="dl-bar"><i style={{ width: `${dl.pct}%` }} /></div>
              </div>
            );
          }
          return (
            <div className="composer-warn">
              <div>{dl?.error ? `Download failed: ${dl.error}` : "This model isn't installed yet."}</div>
              <button className="run-selected" onClick={() => void downloadModel(model.id)}>Download model</button>
            </div>
          );
        })()}
      </div>

      <div className="composer-tabs">
        {categories.map((c) => (
          <button key={c} className={c === category ? 'active' : ''} onClick={() => onPickCategory(c)}>{c}</button>
        ))}
        {defsInCategory.length > 1 && (
          <div className="composer-mode-select">
            <Select value={defId} options={defsInCategory.map((d) => ({ value: d.id, label: d.title }))} onChange={onPickDef} />
          </div>
        )}
      </div>

      <div className="composer-bar">
        <label className="composer-add" title="Add reference media">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => void onFiles(e.target.files)} />
        </label>

        {refs.map((r, i) => (
          <div key={r.id + i} className="composer-ref-thumb">
            {r.type === 'video' ? <video src={r.url} muted /> : <img src={r.url} alt="" />}
            <button onClick={() => onRefs(refs.filter((_, j) => j !== i))}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </button>
          </div>
        ))}

        <input
          className="composer-input"
          placeholder={def ? `Describe the ${def.title.toLowerCase()}...` : 'Describe what to generate...'}
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') void onGenerate(); }}
        />

        {models.length > 0 && (
          <div className="composer-pill">
            <Select value={modelId} options={models.map((m) => ({ value: m.id, label: modelTitle(m.label) }))} onChange={onPickModel} />
          </div>
        )}

        {paramDefs.map((p) => (
          <div className="composer-pill" key={p.id} title={p.label}>
            {p.control.kind !== 'select' && p.control.kind !== 'aspect' && (
              <span className="composer-pill-label">{p.label}</span>
            )}
            <ParamControl p={p} value={params[p.id] ?? p.default} onChange={(v) => onParam(p.id, v)} />
          </div>
        ))}

        <div className="composer-count">
          <button onClick={() => onCount(Math.max(1, count - 1))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          <span>{count}/4</span>
          <button onClick={() => onCount(Math.min(4, count + 1))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <span className="composer-cost">{cost}</span>
        <button className="composer-generate" disabled={!def || !model || !avail || busy} onClick={() => void onGenerate()}>
          {busy ? 'Generating…' : 'Generate'} <span className="kbd">Ctrl⏎</span>
        </button>
      </div>
    </div>
  );
}
