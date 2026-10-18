import { useEffect, useState } from 'react';
import { byId } from '../../../shared/registry';
import { useStore } from '../store';

export function Gallery() {
  const galleryNode = useStore((s) => s.galleryNode);
  const node = useStore((s) => s.nodes.find((n) => n.id === s.galleryNode));
  const run = useStore((s) => s.composerRuns.find((r) => r.id === s.galleryNode));
  const openGallery = useStore((s) => s.openGallery);
  const setActiveResult = useStore((s) => s.setActiveResult);
  const setComposerActiveResult = useStore((s) => s.setComposerActiveResult);
  const [showInfo, setShowInfo] = useState(false);

  const source = node ?? run;
  const isRun = !node && Boolean(run);
  const setIdx = (idx: number) => {
    if (!source) return;
    if (isRun) setComposerActiveResult(source.id, idx);
    else setActiveResult(source.id, idx);
  };

  const count = source?.results.length ?? 0;
  const idx = source ? Math.min(source.activeResult, count - 1) : 0;

  useEffect(() => {
    if (!galleryNode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') openGallery(null);
      if (e.key === 'ArrowLeft' && source) setIdx((idx - 1 + count) % count);
      if (e.key === 'ArrowRight' && source) setIdx((idx + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryNode, source, idx, count, openGallery]);

  if (!galleryNode || !source || !count) return null;
  const active = source.results[idx];
  const def = byId.get(source.defId);
  const modelLabel = def?.models?.find((m) => m.id === source.modelId)?.label ?? def?.title ?? '';

  return (
    <div className="gallery">
      <div className="gallery-top">
        <div className="gallery-title">
          <button className="ghost-btn" onClick={() => openGallery(null)} title="Close (Esc)">✕</button>
          <span>{modelLabel}</span>
        </div>
        <div className="gallery-actions">
          <button className="ghost-btn" title="Show info" onClick={() => setShowInfo(!showInfo)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d="M12 11v5M12 8v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          {active.url && (
            <a className="ghost-btn" href={active.url} download title="Download">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
          )}
          <span className="gallery-count">{idx + 1} / {count}</span>
        </div>
      </div>

      <div className="stage" onClick={(e) => { if (e.target === e.currentTarget) openGallery(null); }}>
        {count > 1 && <button className="stage-nav" onClick={() => setIdx((idx - 1 + count) % count)}>‹</button>}
        {active.type === 'image' && <img src={active.url} alt="" />}
        {active.type === 'video' && <video src={active.url} controls autoPlay loop playsInline />}
        {active.type === 'text' && <div style={{ maxWidth: 640, userSelect: 'text', whiteSpace: 'pre-wrap' }}>{active.text}</div>}
        {count > 1 && <button className="stage-nav" onClick={() => setIdx((idx + 1) % count)}>›</button>}
      </div>

      {count > 1 && (
        <div className="gallery-strip">
          {source.results.map((r, i) => (
            <button key={r.id + i} className={`gallery-thumb ${i === idx ? 'active' : ''}`} onClick={() => setIdx(i)}>
              {r.type === 'image' && <img src={r.url} alt="" />}
              {r.type === 'video' && <video src={r.url} muted playsInline />}
              {r.type === 'text' && <span>T</span>}
            </button>
          ))}
        </div>
      )}

      {showInfo && (
        <div className="info">
          <div className="lib-cat">Details</div>
          {JSON.stringify(active.meta ?? {}, null, 2)}
        </div>
      )}
    </div>
  );
}
