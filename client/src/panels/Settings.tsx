import { byId, paramsFor, modelTitle, estimateCost, formatCost } from '../../../shared/registry';
import { modelAvailable, useStore } from '../store';
import { runNode, saveProjectDebounced, downloadModel } from '../run';
import { ParamControl } from './ParamControl';

export function Settings() {
  const selected = useStore((s) => s.selected);
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selected));
  const setParam = useStore((s) => s.setParam);
  const modelIndex = useStore((s) => s.modelIndex);
  const engines = useStore((s) => s.engines);
  const modelDL = useStore((s) => s.modelDL);
  const rt = useStore((s) => (s.selected ? s.runtime[s.selected] : undefined));

  if (!selected || !node) return null;
  const def = byId.get(node.defId);
  if (!def) return null;
  // nodes edited entirely inline don't need the panel
  if (['prompt', 'note', 'text-data'].includes(def.id)) return null;

  const isGen = def.kind === 'generative' || def.kind === 'llm';
  const models = def.models ?? [];
  const current = models.find((m) => m.id === node.modelId) ?? models[0];
  const avail = current ? modelAvailable(current, modelIndex, engines.fal) : true;
  const params = paramsFor(def, current);
  const cost = formatCost(estimateCost(current, node.params));

  return (
    <div className="settings">
      <h3>{isGen && current ? modelTitle(current.label) : def.title}</h3>
      {current ? (
        <div className="settings-sub">{current.provider === 'fal' ? 'fal.ai API' : 'Local · free'}</div>
      ) : (
        def.description && <div className="settings-sub">{def.description}</div>
      )}
      {current && !avail && current.provider === 'fal' && (
        <div className="settings-warn">Add your fal.ai API key to use this model.</div>
      )}
      {current && !avail && current.provider === 'comfy' && (() => {
        const dl = modelDL[current.id];
        if (dl && !dl.error) return (
          <div className="settings-warn">
            <div>Downloading {dl.file}… {dl.pct}%</div>
            <div className="dl-bar"><i style={{ width: `${dl.pct}%` }} /></div>
          </div>
        );
        return (
          <div className="settings-warn">
            <div>{dl?.error ? `Download failed: ${dl.error}` : "This model isn't installed yet."}</div>
            <button className="run-selected" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => void downloadModel(current.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Download model
            </button>
          </div>
        );
      })()}

      {params.map((p) => (
        <div className="field" key={p.id}>
          <label>{p.label}</label>
          <ParamControl
            p={p}
            value={node.params[p.id] ?? p.default}
            onChange={(v) => { setParam(node.id, p.id, v); saveProjectDebounced(); }}
          />
        </div>
      ))}

      {isGen && (
        <div className="run-footer">
          <div className="meta">
            <span>Run selected node</span>
            <span className="run-cost">{cost}</span>
          </div>
          <button
            className="run-selected"
            disabled={rt?.status === 'running' || !avail}
            onClick={() => void runNode(node.id)}
          >
            {rt?.status === 'running' ? `Running ${rt.pct}%` : '→ Run selected'}
          </button>
        </div>
      )}
    </div>
  );
}
