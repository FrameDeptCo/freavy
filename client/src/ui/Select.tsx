import { useEffect, useRef, useState } from 'react';

export function Select({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="ui-select" ref={ref}>
      <button type="button" className="ui-select-btn" onClick={() => setOpen((o) => !o)}>
        <span>{current?.label ?? value}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="ui-select-menu">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              className={o.value === value ? 'active' : ''}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
