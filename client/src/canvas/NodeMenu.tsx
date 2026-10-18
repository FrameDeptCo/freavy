import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, REGISTRY } from '../../../shared/registry';

interface Props {
  x: number;
  y: number;
  filterType?: string;
  onPick: (defId: string) => void;
  onClose: () => void;
}

export function NodeMenu({ x, y, filterType, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const items = useMemo(() => {
    const ql = q.toLowerCase();
    return REGISTRY.filter((d) => {
      if (filterType && !d.inputs.some((i) => i.type === filterType)) return false;
      return !ql || d.title.toLowerCase().includes(ql) || d.category.toLowerCase().includes(ql);
    });
  }, [q, filterType]);

  useEffect(() => setFocus(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') setFocus((f) => Math.min(items.length - 1, f + 1));
    if (e.key === 'ArrowUp') setFocus((f) => Math.max(0, f - 1));
    if (e.key === 'Enter' && items[focus]) onPick(items[focus].id);
  };

  const left = Math.min(x, window.innerWidth - 280);
  const top = Math.min(y, window.innerHeight - 440);

  return (
    <div className="node-menu" style={{ left, top }} onKeyDown={onKey}>
      <input ref={ref} value={q} placeholder="Search nodes..." onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(onClose, 150)} />
      {CATEGORIES.map((cat) => {
        const inCat = items.filter((d) => d.category === cat);
        if (!inCat.length) return null;
        return (
          <div key={cat}>
            <div className="cat">{cat}</div>
            {inCat.map((d) => (
              <div
                key={d.id}
                className={`item ${items[focus]?.id === d.id ? 'focus' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); onPick(d.id); }}
              >
                <span>{d.title}</span>
                <span className="kind">{d.kind === 'generative' || d.kind === 'llm' ? (d.models?.some((m) => m.provider !== 'fal') ? 'local' : 'api') : ''}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
