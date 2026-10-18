import { useEffect, useRef, useState } from 'react';
import { ReactFlowProvider, useReactFlow, useViewport } from '@xyflow/react';
import { useStore } from './store';
import { connectWs, pollStatus, saveProjectDebounced } from './run';
import { Flow } from './canvas/Flow';
import { NodeMenu } from './canvas/NodeMenu';
import { Settings } from './panels/Settings';
import { Gallery } from './panels/Gallery';
import { LibraryPanel, type PanelId } from './panels/Library';
import { openCanvas, saveCanvas, saveCanvasAs } from './file';
import { FileDialog } from './panels/FileDialog';
import { SimpleView } from './simple/SimpleView';

function TopBar() {
  const name = useStore((s) => s.projectName);
  const setName = useStore((s) => s.setName);
  const engines = useStore((s) => s.engines);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const [saved, setSaved] = useState<string | null>(null);
  const flash = (file: string | null) => {
    if (!file) return;
    setSaved(file);
    setTimeout(() => setSaved(null), 2000);
  };
  return (
    <div className="topbar">
      <div className="topbar-left">
        <input className="project-name" value={name} onChange={(e) => { setName(e.target.value); saveProjectDebounced(); }} />
        <div className="file-actions">
          <button title="Open canvas (Ctrl+O)" onClick={() => openCanvas()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1M4 7v10a2 2 0 002 2h12a2 2 0 002-2.2l.8-6A2 2 0 0019 8.5H7a2 2 0 00-2 1.7L4 17" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </button>
          <button title="Save (Ctrl+S)" onClick={() => void saveCanvas().then(flash)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 4h11l3 3v13a0 0 0 010 0H5a0 0 0 010 0V4zM8 4v5h7V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </button>
          <button title="Save As (Ctrl+Shift+S)" onClick={() => saveCanvasAs()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 4h11l3 3v13H5V4zM8 4v5h7V4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 12v6M9 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          {saved && <span className="saved-flash">saved {saved}</span>}
        </div>
      </div>
      <div className="mode-toggle">
        <button className={mode === 'canvas' ? 'active' : ''} onClick={() => setMode('canvas')}>Canvas</button>
        <button className={mode === 'simple' ? 'active' : ''} onClick={() => setMode('simple')}>Simple</button>
      </div>
      <div className="topbar-right">
        <span className={`engine-dot ${engines.comfy ? 'on' : ''}`}><i />ComfyUI</span>
        <span className={`engine-dot ${engines.ollama ? 'on' : ''}`}><i />Ollama</span>
        <span className={`engine-dot ${engines.fal ? 'on' : ''}`}><i />fal.ai</span>
        <span className={`engine-dot ${engines.minimax ? 'on' : ''}`}><i />MiniMax</span>
      </div>
    </div>
  );
}

function Rail({ panel, setPanel }: { panel: PanelId; setPanel: (p: PanelId) => void }) {
  const toggle = (p: PanelId) => setPanel(panel === p ? null : p);
  return (
    <div className="rail">
      <img className="logo" src="./logo.svg" alt="freavy" />
      <button className={panel === 'search' ? 'active' : ''} title="Search" onClick={() => toggle('search')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>
      <button className={panel === 'quick' ? 'active' : ''} title="Quick access" onClick={() => toggle('quick')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>
      <button className={panel === 'toolbox' ? 'active' : ''} title="Toolbox" onClick={() => toggle('toolbox')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M9 8V6a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      <button className={panel === 'image' ? 'active' : ''} title="Image models" onClick={() => toggle('image')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.6" /><circle cx="9" cy="9" r="1.8" fill="currentColor" /><path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
      </button>
      <button className={panel === 'video' ? 'active' : ''} title="Video models" onClick={() => toggle('video')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" /><path d="M10 9l5 3-5 3V9z" fill="currentColor" /></svg>
      </button>
      <button className={panel === 'three' ? 'active' : ''} title="3D models" onClick={() => toggle('three')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button className={panel === 'community' ? 'active' : ''} title="Community models" onClick={() => toggle('community')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5s1.3-6.2 3.8-8.5z" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button className={panel === 'assets' ? 'active' : ''} title="Assets" onClick={() => toggle('assets')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" /><rect x="9.5" y="9.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
    </div>
  );
}

function Toolbar({ tool, setTool, onAdd }: { tool: 'select' | 'hand'; setTool: (t: 'select' | 'hand') => void; onAdd: () => void }) {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const [zoomMenu, setZoomMenu] = useState(false);
  const zoomWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!zoomMenu) return;
    const onDoc = (e: MouseEvent) => { if (!zoomWrap.current?.contains(e.target as Node)) setZoomMenu(false); };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [zoomMenu]);

  const zoomItems: [string, string, () => void][] = [
    ['Zoom in', 'Ctrl ++', () => zoomIn()],
    ['Zoom out', 'Ctrl +-', () => zoomOut()],
    ['Zoom to 100%', 'Ctrl 0', () => zoomTo(1)],
    ['Zoom to fit', 'Shift 1', () => fitView({ padding: 0.2 })],
  ];

  return (
    <div className="toolbar">
      <button className={tool === 'select' ? 'active' : ''} title="Select (V)" onClick={() => setTool('select')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8-6.6 1.4L9 19 5 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill={tool === 'select' ? 'currentColor' : 'none'} /></svg>
      </button>
      <button className={tool === 'hand' ? 'active' : ''} title="Hand (H)" onClick={() => setTool('hand')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M8 12V5.5a1.5 1.5 0 013 0V11m0-5.5v-1a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0V13m-9-1v6a4 4 0 004 4h1a4 4 0 004-4v-2m-9-4l-1.8-1.8a1.4 1.4 0 00-2 2L7 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button title="Add node (Tab)" onClick={onAdd}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <div className="sep" />
      <button title="Undo (Ctrl+Z)" onClick={undo}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M8 5L4 9l4 4M4 9h10a6 6 0 010 12h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button title="Redo (Ctrl+Shift+Z)" onClick={redo}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M16 5l4 4-4 4M20 9H10a6 6 0 000 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="sep" />
      <div className="zoom-wrap" ref={zoomWrap}>
        <button className="zoom-pct" onClick={() => setZoomMenu((m) => !m)} title="Zoom options">
          <span>{Math.round(zoom * 100)}%</span>
          <svg className="caret" width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {zoomMenu && (
          <div className="zoom-menu">
            {zoomItems.map(([label, key, fn]) => (
              <button key={label} onClick={() => { fn(); setZoomMenu(false); }}>
                <span>{label}</span><span className="kbd">{key}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Shell() {
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [panel, setPanel] = useState<PanelId>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const mode = useStore((s) => s.mode);
  const addNode = useStore((s) => s.addNode);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const { screenToFlowPosition, zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

  useEffect(() => {
    connectWs();
    // Always start blank — 'default' is an autosave scratch id (see run.ts's node-done
    // handler), not a canvas meant to be reloaded. Loading it back in would resurface
    // whatever was last dragged into a session.
    void pollStatus();
    const t = setInterval(() => void pollStatus(), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'canvas') return;
      if (e.ctrlKey && e.key === 's' && !e.shiftKey) { e.preventDefault(); void saveCanvas(); return; }
      if (e.ctrlKey && (e.key === 'S' || (e.shiftKey && e.key === 's'))) { e.preventDefault(); saveCanvasAs(); return; }
      if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openCanvas(); return; }
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return; }
      if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomOut(); return; }
      if (e.ctrlKey && e.key === '0') { e.preventDefault(); zoomTo(1); return; }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.shiftKey && (e.key === '1' || e.key === '!')) { e.preventDefault(); fitView({ padding: 0.2 }); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        setMenuAt({ x: window.innerWidth / 2 - 130, y: window.innerHeight / 3 });
      }
      if (e.key === 'v') setTool('select');
      if (e.key === 'h') setTool('hand');
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key === 'Z' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        const pos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        addNode('prompt', pos.x, pos.y);
      }
      if (e.ctrlKey && e.key === 'i') {
        e.preventDefault();
        const pos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        addNode('import', pos.x, pos.y);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, addNode, undo, redo, screenToFlowPosition, zoomIn, zoomOut, zoomTo, fitView]);

  return (
    <div className={mode === 'simple' ? 'app simple-mode' : 'app'}>
      {mode === 'canvas' && <Flow tool={tool} />}
      {mode === 'simple' && <SimpleView />}
      <TopBar />
      {mode === 'canvas' && <Rail panel={panel} setPanel={setPanel} />}
      {mode === 'canvas' && <LibraryPanel panel={panel} onClose={() => setPanel(null)} />}
      {mode === 'canvas' && (
        <Toolbar tool={tool} setTool={setTool} onAdd={() => setMenuAt({ x: window.innerWidth / 2 - 130, y: window.innerHeight / 3 })} />
      )}
      {mode === 'canvas' && <Settings />}
      <Gallery />
      {mode === 'canvas' && <FileDialog />}
      {mode === 'canvas' && menuAt && (
        <NodeMenu
          x={menuAt.x}
          y={menuAt.y}
          onPick={(defId) => {
            const pos = screenToFlowPosition({ x: menuAt.x + 130, y: menuAt.y + 100 });
            addNode(defId, pos.x, pos.y);
            setMenuAt(null);
          }}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Shell />
    </ReactFlowProvider>
  );
}
