import { create } from 'zustand';
import type { ProjectGraph } from '../../shared/types';
import { useStore } from './store';
import { api } from './engine';

interface FileDialogState {
  mode: 'open' | 'save' | null;
  openDialog: (mode: 'open' | 'save') => void;
  closeDialog: () => void;
}

export const useFileDialog = create<FileDialogState>((set) => ({
  mode: null,
  openDialog: (mode) => set({ mode }),
  closeDialog: () => set({ mode: null }),
}));

// localStorage keys: read legacy weavy-* as a fallback so existing installs keep their paths
let currentPath: string | null = localStorage.getItem('frv-file') || localStorage.getItem('weavy-file') || null;

export function lastDir(): string {
  return localStorage.getItem('frv-dir') || localStorage.getItem('weavy-dir') || '';
}

export function rememberDir(dir: string): void {
  localStorage.setItem('frv-dir', dir);
}

export async function saveCanvasTo(path: string): Promise<string> {
  const s = useStore.getState();
  if (!path.endsWith('.json')) path += '.freavy.json';
  const name = path.split(/[\\/]/).pop()!.replace(/\.freavy\.json$|\.weavy\.json$|\.json$/, '');
  s.setName(name);
  const res = await fetch(api('/api/canvas/save'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, graph: { ...s.toGraph(), name } }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  currentPath = path;
  localStorage.setItem('frv-file', path);
  return path;
}

/** Ctrl+S: save to the current file, or open the Save dialog if there is none */
export async function saveCanvas(): Promise<string | null> {
  if (!currentPath) {
    useFileDialog.getState().openDialog('save');
    return null;
  }
  return saveCanvasTo(currentPath);
}

export function saveCanvasAs(): void {
  useFileDialog.getState().openDialog('save');
}

export function openCanvas(): void {
  useFileDialog.getState().openDialog('open');
}

export async function openCanvasPath(path: string): Promise<void> {
  const res = await fetch(api(`/api/canvas/load?path=${encodeURIComponent(path)}`));
  if (!res.ok) throw new Error((await res.json()).error);
  const graph = (await res.json()) as ProjectGraph;
  useStore.getState().loadGraph(graph);
  currentPath = path;
  localStorage.setItem('frv-file', path);
}

export function currentFileName(): string | null {
  return currentPath ? currentPath.split(/[\\/]/).pop()! : null;
}
