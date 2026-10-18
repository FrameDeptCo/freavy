import type { ParamDef } from '../../../shared/types';
import { Select } from '../ui/Select';

export function ParamControl({ p, value, onChange }: { p: ParamDef; value: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  const c = p.control;
  switch (c.kind) {
    case 'text':
      return c.multiline ? (
        <textarea rows={4} value={String(value)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} />
      );
    case 'number':
      return <input type="number" min={c.min} max={c.max} step={c.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />;
    case 'slider':
      return (
        <div className="row">
          <input type="range" min={c.min} max={c.max} step={c.step ?? 1} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ width: 36, textAlign: 'right' }}>{value}</span>
        </div>
      );
    case 'select':
    case 'aspect':
      return <Select value={String(value)} options={c.options.map((o) => ({ value: o, label: o }))} onChange={onChange} />;
    case 'toggle':
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />;
    case 'seed':
      return (
        <div className="row">
          <input type="number" value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
          <button className="ghost-btn" title="Randomize each run" onClick={() => onChange(-1)}>🎲</button>
        </div>
      );
  }
}
