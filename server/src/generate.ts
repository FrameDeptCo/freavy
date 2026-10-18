import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { AssetRef, GraphEdge, GraphNode, JobEvent, ProjectGraph } from '../../shared/types';
import { byId } from '../../shared/registry.ts';
import { ASSETS_DIR, saveAsset } from './assets.ts';
import { executeRun } from './executor.ts';

export interface GenerateRequest {
  node: string; // node def id: image-generate, video-generate, prompt-enhancer, image-describer, upscale, remove-bg, image-edit, inpaint
  prompt?: string;
  modelId?: string;
  params?: Record<string, string | number | boolean>;
  /** absolute file paths on this machine */
  images?: string[];
  last?: string;
  refs?: string[];
  video?: string;
  mask?: string;
  count?: number;
  /** absolute directory to copy outputs into */
  outputDir?: string;
}

export interface GenerateResult {
  results: { file?: string; url: string; type: string; text?: string; seed?: unknown }[];
}

function importFile(path: string): AssetRef {
  const buf = readFileSync(path);
  const ext = extname(path).slice(1).toLowerCase() || 'png';
  return saveAsset(buf, ext, ['mp4', 'webm', 'mov'].includes(ext) ? 'video' : 'image', { source: path });
}

export async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const def = byId.get(req.node);
  if (!def) throw new Error(`Unknown node "${req.node}"`);
  if (def.models && req.modelId && !def.models.some((m) => m.id === req.modelId)) {
    throw new Error(`Unknown model "${req.modelId}" for ${def.title}. Options: ${def.models.map((m) => m.id).join(', ')}`);
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const mk = (defId: string, params: GraphNode['params'] = {}, results: AssetRef[] = []): GraphNode => {
    const n: GraphNode = { id: `g${nodes.length}`, defId, x: 0, y: 0, params, results, activeResult: 0 };
    nodes.push(n);
    return n;
  };
  const connect = (src: GraphNode, srcHandle: string, tgt: GraphNode, tgtHandle: string) =>
    edges.push({ id: `e${edges.length}`, source: src.id, sourceHandle: srcHandle, target: tgt.id, targetHandle: tgtHandle });

  const defaults: GraphNode['params'] = {};
  for (const p of def.params) defaults[p.id] = p.default;
  const target = mk(req.node, { ...defaults, ...req.params });
  target.modelId = req.modelId ?? def.models?.find((m) => m.default)?.id ?? def.models?.[0]?.id;

  if (req.prompt) {
    const promptInput = def.inputs.find((i) => i.type === 'text');
    if (promptInput) {
      const p = mk('prompt', { text: req.prompt });
      connect(p, 'text', target, promptInput.id);
    }
  }
  const wireImages = (paths: string[] | undefined, handle: string) => {
    if (!def.inputs.some((i) => i.id === handle)) return;
    for (const path of paths ?? []) {
      const imp = mk('import', {}, [importFile(path)]);
      connect(imp, 'image', target, handle);
    }
  };
  const mainImageHandle = def.inputs.find((i) => i.type === 'image' && i.id !== 'last' && i.id !== 'refs')?.id;
  if (mainImageHandle) wireImages(req.images, mainImageHandle);
  if (req.last) wireImages([req.last], 'last');
  if (req.refs?.length) wireImages(req.refs, 'refs');
  if (req.video) wireImages([req.video], 'video');
  if (req.mask && def.inputs.some((i) => i.id === 'mask')) {
    const imp = mk('import', {}, [importFile(req.mask)]);
    connect(imp, 'image', target, 'mask');
  }

  const graph: ProjectGraph = { id: 'mcp', name: 'mcp', nodes, edges, updatedAt: '' };
  const count = Math.min(8, Math.max(1, req.count ?? 1));
  const collected: AssetRef[] = [];

  for (let i = 0; i < count; i++) {
    const results = await new Promise<AssetRef[]>((resolve, reject) => {
      const emit = (e: JobEvent) => {
        if (e.type === 'node-done' && e.nodeId === target.id) resolve(e.results);
        if (e.type === 'node-error' && e.nodeId === target.id) reject(new Error(e.error));
      };
      void executeRun(graph, target.id, emit);
    });
    collected.push(...results);
  }

  const out: GenerateResult['results'] = [];
  if (req.outputDir) mkdirSync(req.outputDir, { recursive: true });
  for (const r of collected) {
    let file: string | undefined;
    if (r.url && req.outputDir) {
      const name = basename(r.url);
      file = join(req.outputDir, name);
      copyFileSync(join(ASSETS_DIR, name), file);
      const metaName = name.replace(extname(name), '.json');
      try { copyFileSync(join(ASSETS_DIR, metaName), join(req.outputDir, metaName)); } catch { /* no sidecar */ }
    }
    out.push({ file, url: r.url, type: r.type, text: r.text, seed: r.meta?.seed });
  }
  return { results: out };
}
