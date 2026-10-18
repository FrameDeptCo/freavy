import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { AssetRef, GraphEdge, GraphNode, JobEvent, ProjectGraph } from '../../shared/types';
import { byId } from '../../shared/registry.ts';
import { ASSETS_DIR, saveAsset } from './assets.ts';
import { executeRun } from './executor.ts';

export interface FsEntry {
  name: string;
  dir: boolean;
}

/** list directories and .freavy.json (or legacy .weavy.json) canvas files at a path */
export function listDir(path: string): { path: string; entries: FsEntry[] } {
  const entries: FsEntry[] = [];
  for (const name of readdirSync(path)) {
    try {
      const full = join(path, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!name.startsWith('.') && name !== 'node_modules') entries.push({ name, dir: true });
      } else if (name.endsWith('.freavy.json') || name.endsWith('.weavy.json')) {
        entries.push({ name, dir: false });
      }
    } catch {
      /* unreadable entry */
    }
  }
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  return { path, entries };
}

export function saveCanvas(path: string, graph: ProjectGraph): void {
  if (!path.endsWith('.json')) path += '.freavy.json';
  writeFileSync(path, JSON.stringify(graph, null, 2));
}

export function makeDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function loadCanvas(path: string): ProjectGraph {
  return JSON.parse(readFileSync(path, 'utf8')) as ProjectGraph;
}

export interface BuildCanvasRequest {
  /** absolute path for the .freavy.json canvas file */
  outputPath: string;
  name?: string;
  /** image+prompt pairs; image is an absolute path or a folder is expanded by caller */
  items: { image?: string; prompt: string }[];
  /** generative node def id, e.g. video-generate / image-generate */
  node?: string;
  modelId?: string;
  params?: Record<string, string | number | boolean>;
}

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export function expandImages(folder: string): string[] {
  return readdirSync(folder)
    .filter((f) => IMG_EXT.has(extname(f).toLowerCase()))
    .map((f) => join(folder, f))
    .filter((f) => statSync(f).isFile());
}

/**
 * Run pending generative nodes in a canvas file, sequentially. Results are written
 * back into the canvas after every node, and media copied to outputDir if given.
 * Runs at most maxItems nodes per call so callers can loop with progress.
 */
export async function runCanvas(
  path: string,
  outputDir: string | undefined,
  maxItems: number,
  emit: (e: JobEvent) => void,
): Promise<{ ran: { nodeId: string; files: string[]; error?: string }[]; remaining: number }> {
  const graph = loadCanvas(path);
  const isPending = (n: GraphNode) => {
    const def = byId.get(n.defId);
    return Boolean(def && (def.kind === 'generative' || def.kind === 'llm') && n.results.length === 0);
  };
  const pending = graph.nodes.filter(isPending);
  const batch = pending.slice(0, Math.max(1, maxItems));
  const ran: { nodeId: string; files: string[]; error?: string }[] = [];
  if (outputDir) mkdirSync(outputDir, { recursive: true });

  for (const node of batch) {
    try {
      const results = await new Promise<AssetRef[]>((resolve, reject) => {
        const handler = (e: JobEvent) => {
          emit(e);
          if (e.type === 'node-done' && e.nodeId === node.id) resolve(e.results);
          if (e.type === 'node-error' && e.nodeId === node.id) reject(new Error(e.error));
        };
        void executeRun(graph, node.id, handler);
      });
      node.results = results;
      node.activeResult = 0;
      saveCanvas(path, graph);
      const files: string[] = [];
      for (const r of results) {
        if (!r.url || !outputDir) continue;
        const name = basename(r.url);
        copyFileSync(join(ASSETS_DIR, name), join(outputDir, name));
        try { copyFileSync(join(ASSETS_DIR, name.replace(extname(name), '.json')), join(outputDir, name.replace(extname(name), '.json'))); } catch { /* no sidecar */ }
        files.push(join(outputDir, name));
      }
      ran.push({ nodeId: node.id, files });
    } catch (err) {
      ran.push({ nodeId: node.id, files: [], error: err instanceof Error ? err.message : String(err) });
    }
  }
  const remaining = graph.nodes.filter(isPending).length;
  return { ran, remaining };
}

/** Build a laid-out, fully wired canvas: per item an Import + Prompt feeding one generative node. */
export function buildCanvas(req: BuildCanvasRequest): ProjectGraph {
  const defId = req.node ?? 'video-generate';
  const def = byId.get(defId);
  if (!def) throw new Error(`Unknown node "${defId}"`);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const ROW = 560;

  req.items.forEach((item, i) => {
    const y = i * ROW;
    const promptNode: GraphNode = {
      id: `p${i}`, defId: 'prompt', x: 0, y, w: 340, h: 240,
      params: { text: item.prompt }, results: [], activeResult: 0,
    };
    nodes.push(promptNode);

    const defaults: GraphNode['params'] = {};
    for (const p of def.params) defaults[p.id] = p.default;
    const gen: GraphNode = {
      id: `g${i}`, defId, x: 760, y,
      params: { ...defaults, ...req.params },
      modelId: req.modelId ?? def.models?.find((m) => m.default)?.id,
      results: [], activeResult: 0,
    };
    nodes.push(gen);

    const textInput = def.inputs.find((x) => x.type === 'text');
    if (textInput) edges.push({ id: `ep${i}`, source: promptNode.id, sourceHandle: 'text', target: gen.id, targetHandle: textInput.id });

    if (item.image) {
      const buf = readFileSync(item.image);
      const ext = extname(item.image).slice(1).toLowerCase() || 'png';
      const asset = saveAsset(buf, ext, 'image', { source: item.image });
      const imp: GraphNode = { id: `i${i}`, defId: 'import', x: 380, y: y + 80, params: {}, results: [asset], activeResult: 0 };
      nodes.push(imp);
      const imgInput = def.inputs.find((x) => x.type === 'image' && x.id !== 'last' && x.id !== 'refs');
      if (imgInput) edges.push({ id: `ei${i}`, source: imp.id, sourceHandle: 'image', target: gen.id, targetHandle: imgInput.id });
    }
  });

  const graph: ProjectGraph = {
    id: `canvas-${Date.now().toString(36)}`,
    name: req.name ?? 'batch',
    nodes,
    edges,
    updatedAt: new Date().toISOString(),
  };
  saveCanvas(req.outputPath, graph);
  return graph;
}
