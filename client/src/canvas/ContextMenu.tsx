import { useEffect, useRef } from 'react';

export interface CtxItem {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  divider?: boolean; // render a separator above this item
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 210);
  const top = Math.min(y, window.innerHeight - (items.length * 34 + 12));

  return (
    <div className="ctx-menu" style={{ left, top }} ref={ref}>
      {items.map((it, i) => (
        <div key={i}>
          {it.divider && <div className="ctx-sep" />}
          <button
            className={`ctx-item${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onClick={() => { if (!it.disabled) { it.onClick?.(); onClose(); } }}
          >
            <span>{it.label}</span>
            {it.shortcut && <span className="ctx-key">{it.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
