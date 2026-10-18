import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { lastDir, openCanvasPath, rememberDir, saveCanvasTo, useFileDialog } from '../file';
import { api } from '../engine';

interface Entry {
  name: string;
  dir: boolean;
}

export function FileDialog() {
  const mode = useFileDialog((s) => s.mode);
  const closeDialog = useFileDialog((s) => s.closeDialog);
  const projectName = useStore((s) => s.projectName);
  const [path, setPath] = useState(lastDir());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (mode) {
      setPath(lastDir());
      setFilename(`${projectName || 'canvas'}.freavy.json`);
      setError('');
    }
  }, [mode, projectName]);

  useEffect(() => {
    if (!mode) return;
    void fetch(api(`/api/fs/list?path=${encodeURIComponent(path)}`))
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setEntries(j.entries);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [mode, path]);

  if (!mode) return null;

  const create = async () => {
    const name = newName.trim();
    if (!name) { setCreating(false); return; }
    try {
      const base = path.replace(/[\\/]+$/, '');
      const full = `${base}\\${name}`;
      const r = await fetch(api('/api/fs/mkdir'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: full }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setCreating(false); setNewName('');
      setPath(full); // jump into the new folder
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const up = () => {
    const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
    if (parts.length > 1) setPath(parts.slice(0, -1).join('\\'));
  };
  const enter = (name: string) => setPath(`${path.replace(/[\\/]+$/, '')}\\${name}`);

  const confirm = async (file?: string) => {
    try {
      rememberDir(path);
      if (mode === 'open') {
        if (!file) return;
        await openCanvasPath(`${path}\\${file}`);
      } else {
        await saveCanvasTo(`${path}\\${file ?? filename}`);
      }
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="file-dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="file-dialog">
        <div className="fd-head">
          <span>{mode === 'open' ? 'Open canvas' : 'Save canvas'}</span>
          <button className="ghost-btn" onClick={closeDialog}>✕</button>
        </div>
        <div className="fd-path">
          <button className="ghost-btn" onClick={up} title="Up one folder">↑</button>
          <input value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} />
          <button className="ghost-btn" onClick={() => { setCreating(true); setNewName(''); }} title="New folder">+ Folder</button>
        </div>
        {creating && (
          <div className="fd-newfolder">
            <input
              autoFocus value={newName} placeholder="New folder name" spellCheck={false}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
            />
            <button className="run-btn" onClick={() => void create()}>Create</button>
            <button className="ghost-btn" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
          </div>
        )}
        {error && <div className="fd-error">{error}</div>}
        <div className="fd-list">
          {entries.map((en) => (
            <button
              key={en.name}
              className="fd-entry"
              onClick={() => (en.dir ? enter(en.name) : mode === 'open' ? void confirm(en.name) : setFilename(en.name))}
            >
              <span className="fd-icon">{en.dir ? '▸' : '▦'}</span>
              {en.name}
            </button>
          ))}
          {!entries.length && <div className="fd-empty">No folders or canvases here</div>}
        </div>
        {mode === 'save' && (
          <div className="fd-save-row">
            <input value={filename} onChange={(e) => setFilename(e.target.value)} spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && void confirm()} />
            <button className="run-btn" onClick={() => void confirm()}>Save</button>
          </div>
        )}
      </div>
    </div>
  );
}
