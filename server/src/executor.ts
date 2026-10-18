import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AssetRef, GraphEdge, GraphNode, JobEvent, ProjectGraph } from '../../shared/types';
import { byId } from '../../shared/registry.ts';
import { ASSETS_DIR } from './assets.ts';
import { runComfy } from './providers/comfy.ts';
import { runOllama } from './providers/ollama.ts';
import { runFal } from './providers/fal.ts';
import { runMinimax } from './providers/minimax.ts';

type Emit = (e: JobEvent) => void;

/** Nodes whose value the server can compute; editing nodes resolve client-side and pass results in the graph. */
const SERVER_KINDS = new Set(['generative', 'llm']);

function upstreamOrder(graph: ProjectGraph, targetId: string): GraphNode[] {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);
  }
  const order: GraphNode[] = [];
  const seen = new Set<string>();
  const visit = (id: string, stack: Set<string>) => {
    if (seen.has(id)) return;
    if (stack.has(id)) throw new Error('Cycle detected in graph');
    stack.add(id);
    for (const e of incoming.get(id) ?? []) visit(e.source, stack);
    stack.delete(id);
    seen.add(id);
    const n = nodes.get(id);
    if (n) order.push(n);
  };
  visit(targetId, new Set());
  return order;
}

function assetBuffer(a: AssetRef): Buffer {
  const file = a.url.split('/').pop()!;
  return readFileSync(join(ASSETS_DIR, file));
}

function resolveInput(node: GraphNode, handle: string, graph: ProjectGraph, results: Map<string, AssetRef[]>): AssetRef[] {
  const edges = graph.edges.filter((e) => e.target === node.id && e.targetHandle === handle);
  const out: AssetRef[] = [];
  for (const e of edges) {
    const src = graph.nodes.find((n) => n.id === e.source);
    if (!src) continue;
    const r = results.get(src.id) ?? src.results;
    // multi-output nodes (e.g. Painter Result/Mask) route by output port index
    const outs = byId.get(src.defId)?.outputs ?? [];
    let idx = Math.min(src.activeResult, Math.max(0, r.length - 1));
    if (outs.length > 1) {
      const oi = outs.findIndex((o) => o.id === e.sourceHandle);
      if (oi >= 0 && oi < r.length) idx = oi;
    }
    const active = r[idx];
    if (active) out.push(active);
  }
  return out;
}

function textOf(node: GraphNode, handle: string, graph: ProjectGraph, results: Map<string, AssetRef[]>): string {
  const refs = resolveInput(node, handle, graph, results);
  const texts = refs.map((r) => r.text ?? '').filter(Boolean);
  // prompt/text-data nodes carry their text as a param, surfaced via pseudo-result
  return texts.join(', ');
}

async function runNode(node: GraphNode, graph: ProjectGraph, results: Map<string, AssetRef[]>, onProgress: (pct: number, label?: string) => void): Promise<AssetRef[]> {
  const def = byId.get(node.defId);
  if (!def) throw new Error(`Unknown node type ${node.defId}`);

  // utility text sources produce pseudo-results
  if (def.id === 'prompt' || def.id === 'text-data') {
    let text = String(node.params.text ?? '');
    const vars = resolveInput(node, 'vars', graph, results);
    for (const v of vars) if (v.text) text = `${text}\n${v.text}`;
    return [{ id: node.id, type: 'text', url: '', text }];
  }
  if (def.id === 'concat') {
    const sep = String(node.params.separator ?? ', ');
    const texts = resolveInput(node, 'texts', graph, results).map((r) => r.text ?? '');
    return [{ id: node.id, type: 'text', url: '', text: texts.filter(Boolean).join(sep) }];
  }

  if (!SERVER_KINDS.has(def.kind)) {
    // editing/utility nodes: pass through existing client-computed result
    return results.get(node.id) ?? node.results;
  }

  const model = def.models?.find((m) => m.id === node.modelId) ?? def.models?.find((m) => m.default) ?? def.models?.[0];
  if (!model) throw new Error(`${def.title}: no model selected`);

  const prompt = textOf(node, 'prompt', graph, results) || textOf(node, 'text', graph, results);
  const imageRefs = [
    ...resolveInput(node, 'image', graph, results),
    ...resolveInput(node, 'media', graph, results),
  ].filter((r) => r.type === 'image');
  const maskRefs = resolveInput(node, 'mask', graph, results);
  const images = imageRefs.map(assetBuffer);
  const mask = maskRefs[0] ? assetBuffer(maskRefs[0]) : undefined;
  const lastRef = resolveInput(node, 'last', graph, results).find((r) => r.type === 'image');
  const last = lastRef ? assetBuffer(lastRef) : undefined;
  const refs = resolveInput(node, 'refs', graph, results).filter((r) => r.type === 'image').map(assetBuffer);
  const videoRef = resolveInput(node, 'video', graph, results).find((r) => r.type === 'video');
  const video = videoRef ? assetBuffer(videoRef) : undefined;

  if (model.provider === 'comfy') {
    return runComfy({ modelRef: model.ref, prompt, images, mask, last, refs, video, params: node.params, onProgress });
  }
  if (model.provider === 'ollama') {
    const system = String(node.params.system ?? node.params.style ?? node.params.guidelines ?? '');
    return runOllama({ modelRef: model.ref, prompt: prompt || system, system, images, onProgress });
  }
  if (model.provider === 'fal') {
    return runFal({ modelRef: model.ref, prompt, images, params: node.params, onProgress });
  }
  if (model.provider === 'minimax') {
    return runMinimax({ modelRef: model.ref, prompt, images, refs, video, last, params: node.params, onProgress });
  }
  throw new Error(`Provider ${model.provider} not executable on server`);
}

export async function executeRun(graph: ProjectGraph, targetNodeId: string, emit: Emit): Promise<void> {
  const jobId = randomUUID().slice(0, 8);
  const results = new Map<string, AssetRef[]>();
  try {
    const order = upstreamOrder(graph, targetNodeId);
    for (const node of order) {
      const def = byId.get(node.defId);
      const isTarget = node.id === targetNodeId;
      // re-run llm/generative only if target or it has no cached result
      const needsRun =
        def && (def.id === 'prompt' || def.id === 'text-data' || def.id === 'concat' || (SERVER_KINDS.has(def.kind) && (isTarget || node.results.length === 0)));
      if (!needsRun) {
        results.set(node.id, node.results);
        continue;
      }
      if (def && SERVER_KINDS.has(def.kind)) emit({ type: 'node-start', jobId, nodeId: node.id });
      const r = await runNode(node, graph, results, (pct, label) => emit({ type: 'node-progress', jobId, nodeId: node.id, pct, label }));
      results.set(node.id, r);
      if (def && SERVER_KINDS.has(def.kind)) emit({ type: 'node-done', jobId, nodeId: node.id, results: r });
    }
    emit({ type: 'job-done', jobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ type: 'node-error', jobId, nodeId: targetNodeId, error: msg });
    emit({ type: 'job-error', jobId, error: msg });
  }
}
