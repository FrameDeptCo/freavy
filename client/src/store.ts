import { create } from 'zustand';
import type { AssetRef, GraphEdge, GraphNode, LocalModelIndex, ModelDef, ProjectGraph } from '../../shared/types';
import { byId } from '../../shared/registry';

export interface NodeRuntime {
  status: 'idle' | 'running' | 'error';
  pct: number;
  label?: string;
  error?: string;
}

export type AppMode = 'canvas' | 'simple';

export interface ComposerRun {
  id: string;
  defId: string;
  modelId: string;
  modelLabel: string;
  prompt: string;
  params: Record<string, string | number | boolean>;
  refAssetUrls: string[];
  status: 'running' | 'done' | 'error';
  pct: number;
  results: AssetRef[];
  activeResult: number;
  error?: string;
  createdAt: string;
}

const MODE_KEY = 'freavy.mode';
const RUNS_KEY = 'freavy.composerRuns';
const MAX_RUNS = 200;

function loadMode(): AppMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'simple' ? 'simple' : 'canvas';
  } catch {
    return 'canvas';
  }
}

function loadComposerRuns(): ComposerRun[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    return raw ? (JSON.parse(raw) as ComposerRun[]) : [];
  } catch {
    return [];
  }
}

function saveComposerRuns(runs: ComposerRun[]): void {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    /* storage full or unavailable — Feed just won't persist this session */
  }
}

interface State {
  projectId: string;
  projectName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  runtime: Record<string, NodeRuntime>;
  selected: string | null;
  selectedIds: string[];
  galleryNode: string | null;
  engines: { comfy: boolean; ollama: boolean; fal: boolean; minimax: boolean };
  modelIndex: LocalModelIndex;
  past: { nodes: GraphNode[]; edges: GraphEdge[] }[];
  future: { nodes: GraphNode[]; edges: GraphEdge[] }[];

  setName: (n: string) => void;
  addNode: (defId: string, x: number, y: number) => string;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  duplicateNodes: (ids: string[]) => void;
  setLocked: (ids: string[], locked: boolean) => void;
  clearAll: () => void;
  groupNodes: (ids: string[], bounds?: { x: number; y: number; width: number; height: number }) => void;
  ungroup: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  setSize: (id: string, w: number, h: number) => void;
  setParam: (id: string, key: string, value: string | number | boolean) => void;
  setModel: (id: string, modelId: string) => void;
  setResults: (id: string, results: AssetRef[]) => void;
  setActiveResult: (id: string, idx: number) => void;
  addEdge: (e: GraphEdge) => void;
  removeEdge: (id: string) => void;
  setRuntime: (id: string, rt: Partial<NodeRuntime>) => void;
  select: (id: string | null) => void;
  setNodeSelected: (id: string, sel: boolean) => void;
  openGallery: (id: string | null) => void;
  setEngines: (e: State['engines']) => void;
  setModelIndex: (m: LocalModelIndex) => void;
  modelDL: Record<string, { pct: number; file?: string; error?: string; done?: boolean }>;
  setModelDL: (modelId: string, v: { pct: number; file?: string; error?: string; done?: boolean } | null) => void;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  toGraph: () => ProjectGraph;
  loadGraph: (g: ProjectGraph) => void;
  fitRequest: number;

  mode: AppMode;
  setMode: (m: AppMode) => void;
  composerRuns: ComposerRun[];
  addComposerRun: (run: ComposerRun) => void;
  setComposerRuntime: (id: string, rt: { status?: ComposerRun['status']; pct?: number; error?: string }) => void;
  setComposerResults: (id: string, results: AssetRef[]) => void;
  setComposerActiveResult: (id: string, idx: number) => void;
}

let counter = 0;
const nid = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`;

export const useStore = create<State>((set, get) => ({
  projectId: 'default',
  projectName: 'untitled',
  nodes: [],
  edges: [],
  runtime: {},
  selected: null,
  selectedIds: [],
  galleryNode: null,
  engines: { comfy: false, ollama: false, fal: false, minimax: false },
  modelIndex: { comfy: {}, ollama: [] },
  modelDL: {},
  past: [],
  future: [],
  mode: loadMode(),
  composerRuns: loadComposerRuns(),

  setName: (n) => set({ projectName: n }),

  snapshot: () => {
    const { nodes, edges, past } = get();
    set({ past: [...past.slice(-49), { nodes, edges }], future: [] });
  },
  undo: () => {
    const { past, future, nodes, edges } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ nodes: prev.nodes, edges: prev.edges, past: past.slice(0, -1), future: [{ nodes, edges }, ...future] });
  },
  redo: () => {
    const { past, future, nodes, edges } = get();
    const next = future[0];
    if (!next) return;
    set({ nodes: next.nodes, edges: next.edges, future: future.slice(1), past: [...past, { nodes, edges }] });
  },

  addNode: (defId, x, y) => {
    const def = byId.get(defId);
    if (!def) return '';
    get().snapshot();
    const id = nid();
    const model = def.models?.find((m) => m.default) ?? def.models?.[0];
    const params: GraphNode['params'] = {};
    for (const p of (model?.params ?? def.params)) params[p.id] = p.default;
    const node: GraphNode = {
      id, defId, x, y, params,
      modelId: model?.id,
      results: [], activeResult: 0,
    };
    set({ nodes: [...get().nodes, node], selected: id });
    return id;
  },
  removeNode: (id) => {
    get().snapshot();
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selected: get().selected === id ? null : get().selected,
    });
  },
  removeNodes: (ids) => {
    if (!ids.length) return;
    get().snapshot();
    const set2 = new Set(ids);
    set({
      nodes: get().nodes.filter((n) => !set2.has(n.id)),
      edges: get().edges.filter((e) => !set2.has(e.source) && !set2.has(e.target)),
      selected: null, selectedIds: [],
    });
  },
  duplicateNodes: (ids) => {
    const src = get().nodes.filter((n) => ids.includes(n.id) && !n.group);
    if (!src.length) return;
    get().snapshot();
    const clones = src.map((n) => ({ ...n, id: nid(), x: n.x + 28, y: n.y + 28, locked: false, results: [], activeResult: 0 }));
    set({ nodes: [...get().nodes, ...clones], selectedIds: clones.map((c) => c.id), selected: clones[0]?.id ?? null });
  },
  setLocked: (ids, locked) => {
    get().snapshot();
    set({ nodes: get().nodes.map((n) => (ids.includes(n.id) ? { ...n, locked } : n)) });
  },
  clearAll: () => {
    get().snapshot();
    set({ nodes: [], edges: [], selected: null, selectedIds: [] });
  },
  groupNodes: (ids, bounds) => {
    const members = get().nodes.filter((n) => ids.includes(n.id) && !n.group);
    if (members.length < 2) return;
    get().snapshot();
    const PAD = 28, TOP = 44;
    let x: number, y: number, w: number, h: number;
    if (bounds) {
      x = bounds.x - PAD; y = bounds.y - TOP; w = bounds.width + PAD * 2; h = bounds.height + TOP + PAD;
    } else {
      const DW = 230, DH = 300;
      const minX = Math.min(...members.map((n) => n.x));
      const minY = Math.min(...members.map((n) => n.y));
      const maxX = Math.max(...members.map((n) => n.x + (n.w || DW)));
      const maxY = Math.max(...members.map((n) => n.y + (n.h || DH)));
      x = minX - PAD; y = minY - TOP; w = maxX - minX + PAD * 2; h = maxY - minY + TOP + PAD;
    }
    const group: GraphNode = {
      id: nid(), defId: '', x, y, w, h,
      params: {}, results: [], activeResult: 0,
      group: true, title: 'Group', members: members.map((m) => m.id),
    };
    set({ nodes: [group, ...get().nodes], selected: null, selectedIds: [group.id] });
  },
  ungroup: (id) => {
    get().snapshot();
    set({ nodes: get().nodes.filter((n) => n.id !== id), selectedIds: [], selected: null });
  },
  setTitle: (id, title) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, title } : n)) }),
  moveNode: (id, x, y) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }),
  setSize: (id, w, h) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, w, h } : n)) }),
  setParam: (id, key, value) =>
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)) }),
  setModel: (id, modelId) => set({ nodes: get().nodes.map((n) => {
    if (n.id !== id) return n;
    const def = byId.get(n.defId);
    const model = def?.models?.find((m) => m.id === modelId);
    const params = { ...n.params };
    for (const p of (model?.params ?? [])) if (!(p.id in params)) params[p.id] = p.default;
    return { ...n, modelId, params };
  }) }),
  setResults: (id, results) =>
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, results, activeResult: results.length - 1 } : n)) }),
  setActiveResult: (id, idx) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, activeResult: idx } : n)) }),
  addEdge: (e) => {
    get().snapshot();
    set({ edges: [...get().edges.filter((x) => !(x.target === e.target && x.targetHandle === e.targetHandle && !isMulti(e, get().nodes))), e] });
  },
  removeEdge: (id) => {
    get().snapshot();
    set({ edges: get().edges.filter((e) => e.id !== id) });
  },
  setRuntime: (id, rt) => {
    const prev: NodeRuntime = get().runtime[id] ?? { status: 'idle', pct: 0 };
    set({ runtime: { ...get().runtime, [id]: { ...prev, ...rt } } });
  },
  select: (id) => set({ selected: id, selectedIds: id ? [id] : [] }),
  setNodeSelected: (id, sel) => {
    const ids = new Set(get().selectedIds);
    if (sel) ids.add(id);
    else ids.delete(id);
    set({ selectedIds: [...ids], selected: sel ? id : get().selected === id ? null : get().selected });
  },
  openGallery: (id) => set({ galleryNode: id }),
  setEngines: (e) => set({ engines: e }),
  setModelIndex: (m) => set({ modelIndex: m }),
  setModelDL: (modelId, v) => set((s) => {
    const next = { ...s.modelDL };
    if (v === null) delete next[modelId]; else next[modelId] = v;
    return { modelDL: next };
  }),

  toGraph: () => {
    const { projectId, projectName, nodes, edges } = get();
    return { id: projectId, name: projectName, nodes, edges, updatedAt: new Date().toISOString() };
  },
  fitRequest: 0,
  loadGraph: (g) =>
    set({ projectId: g.id, projectName: g.name, nodes: g.nodes, edges: g.edges, past: [], future: [], fitRequest: get().fitRequest + 1 }),

  setMode: (m) => {
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
    set({ mode: m });
  },
  addComposerRun: (run) => {
    const runs = [run, ...get().composerRuns].slice(0, MAX_RUNS);
    saveComposerRuns(runs);
    set({ composerRuns: runs });
  },
  setComposerRuntime: (id, rt) => {
    const runs = get().composerRuns.map((r) => (r.id === id ? { ...r, ...rt } : r));
    saveComposerRuns(runs);
    set({ composerRuns: runs });
  },
  setComposerResults: (id, results) => {
    const runs = get().composerRuns.map((r) =>
      r.id === id ? { ...r, results, status: 'done' as const, pct: 100, activeResult: results.length - 1 } : r,
    );
    saveComposerRuns(runs);
    set({ composerRuns: runs });
  },
  setComposerActiveResult: (id, idx) => {
    set({ composerRuns: get().composerRuns.map((r) => (r.id === id ? { ...r, activeResult: idx } : r)) });
  },
}));

export function modelAvailable(m: ModelDef, idx: LocalModelIndex, falKey: boolean): boolean {
  if (m.provider === 'fal') return falKey;
  if (m.provider === 'ollama') return idx.ollama.some((n) => n === m.ref || n.split(':')[0] === m.ref.split(':')[0]);
  if (m.provider === 'comfy') {
    if (!m.requires) return true; // availability unknown; fails with a clear error at run time
    return m.requires.every((r) => (idx.comfy[r.folder] ?? []).includes(r.file));
  }
  return true;
}

function isMulti(e: GraphEdge, nodes: GraphNode[]): boolean {
  const target = nodes.find((n) => n.id === e.target);
  const def = target && byId.get(target.defId);
  return Boolean(def?.inputs.find((i) => i.id === e.targetHandle)?.multi);
}
