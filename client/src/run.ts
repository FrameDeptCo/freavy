import type { AssetRef, GraphEdge, GraphNode, JobEvent, ProjectGraph } from '../../shared/types';
import { byId } from '../../shared/registry';
import { useStore } from './store';
import { api, WS_URL } from './engine';

let ws: WebSocket | null = null;

export function connectWs(): void {
  ws = new WebSocket(WS_URL);
  ws.onmessage = (ev) => {
    const e = JSON.parse(ev.data) as JobEvent;
    const s = useStore.getState();
    if ('nodeId' in e && e.nodeId.startsWith('sim-')) {
      if (e.type === 'node-start') s.setComposerRuntime(e.nodeId, { status: 'running', pct: 0, error: undefined });
      if (e.type === 'node-progress') s.setComposerRuntime(e.nodeId, { status: 'running', pct: e.pct });
      if (e.type === 'node-done') s.setComposerResults(e.nodeId, e.results);
      if (e.type === 'node-error') s.setComposerRuntime(e.nodeId, { status: 'error', error: e.error });
      return;
    }
    if (e.type === 'node-start') s.setRuntime(e.nodeId, { status: 'running', pct: 0, error: undefined });
    if (e.type === 'node-progress') s.setRuntime(e.nodeId, { status: 'running', pct: e.pct, label: e.label });
    if (e.type === 'node-done') {
      s.setRuntime(e.nodeId, { status: 'idle', pct: 100 });
      const existing = s.nodes.find((n) => n.id === e.nodeId)?.results ?? [];
      s.setResults(e.nodeId, [...existing, ...e.results]);
      void saveProject();
    }
    if (e.type === 'node-error') s.setRuntime(e.nodeId, { status: 'error', error: e.error });
    if (e.type === 'model-progress') s.setModelDL(e.modelId, { pct: e.pct, file: e.file });
    if (e.type === 'model-done') { s.setModelDL(e.modelId, { pct: 100, done: true }); void pollStatus(); setTimeout(() => useStore.getState().setModelDL(e.modelId, null), 2500); }
    if (e.type === 'model-error') s.setModelDL(e.modelId, { pct: 0, error: e.error });
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

export async function downloadModel(modelId: string): Promise<void> {
  useStore.getState().setModelDL(modelId, { pct: 0, file: 'starting…' });
  await fetch(api('/api/models/download'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modelId }),
  });
}

export async function runNode(nodeId: string): Promise<void> {
  const s = useStore.getState();
  s.setRuntime(nodeId, { status: 'running', pct: 0, error: undefined });
  await fetch(api('/api/run'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ graph: s.toGraph(), nodeId }),
  });
}

export interface ComposerGenerateInput {
  defId: string;
  modelId: string;
  modelLabel: string;
  prompt: string;
  params: Record<string, string | number | boolean>;
  refs: AssetRef[];
}

export async function runComposer(input: ComposerGenerateInput): Promise<void> {
  const def = byId.get(input.defId);
  if (!def) throw new Error(`Unknown node "${input.defId}"`);

  const runId = `sim-${crypto.randomUUID().slice(0, 8)}`;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let u = 0;
  const mk = (defId: string, params: GraphNode['params'] = {}, results: AssetRef[] = [], id?: string): GraphNode => {
    const node: GraphNode = { id: id ?? `${runId}-u${u++}`, defId, x: 0, y: 0, params, results, activeResult: 0 };
    nodes.push(node);
    return node;
  };
  const connect = (src: GraphNode, srcHandle: string, tgt: GraphNode, tgtHandle: string) =>
    edges.push({ id: `${runId}-e${edges.length}`, source: src.id, sourceHandle: srcHandle, target: tgt.id, targetHandle: tgtHandle });

  const target = mk(input.defId, input.params, [], runId);
  target.modelId = input.modelId;

  const promptInput = def.inputs.find((i) => i.type === 'text');
  if (input.prompt && promptInput) {
    const p = mk('prompt', { text: input.prompt });
    connect(p, 'text', target, promptInput.id);
  }

  const imageHandle = def.inputs.find((i) => i.type === 'image' && i.id !== 'last' && i.id !== 'refs')?.id;
  const videoHandle = def.inputs.find((i) => i.type === 'video')?.id;
  for (const asset of input.refs) {
    const handle = asset.type === 'video' ? videoHandle : imageHandle;
    if (!handle) continue;
    const imp = mk('import', {}, [asset]);
    connect(imp, 'image', target, handle);
  }

  useStore.getState().addComposerRun({
    id: runId,
    defId: input.defId,
    modelId: input.modelId,
    modelLabel: input.modelLabel,
    prompt: input.prompt,
    params: input.params,
    refAssetUrls: input.refs.map((a) => a.url),
    status: 'running',
    pct: 0,
    results: [],
    activeResult: 0,
    createdAt: new Date().toISOString(),
  });

  const graph: ProjectGraph = { id: runId, name: 'simple', nodes, edges, updatedAt: '' };
  await fetch(api('/api/run'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ graph, nodeId: target.id }),
  });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveProjectDebounced(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveProject(), 800);
}

export async function saveProject(): Promise<void> {
  const g = useStore.getState().toGraph();
  await fetch(api(`/api/projects/${g.id}`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(g),
  });
}

export async function loadProject(id: string): Promise<void> {
  const res = await fetch(api(`/api/projects/${id}`));
  if (res.ok) useStore.getState().loadGraph(await res.json());
}

export async function pollStatus(): Promise<void> {
  try {
    const res = await fetch(api('/api/status'));
    if (res.ok) useStore.getState().setEngines(await res.json());
    const models = await fetch(api('/api/models'));
    if (models.ok) useStore.getState().setModelIndex(await models.json());
  } catch {
    /* server offline */
  }
}

export async function uploadFile(file: File): Promise<{ id: string; url: string; type: 'image' | 'video' }> {
  const data = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsDataURL(file);
  });
  const type = file.type.startsWith('video') ? 'video' : 'image';
  const res = await fetch(api('/api/upload'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data, type }),
  });
  return { ...(await res.json()), type };
}
