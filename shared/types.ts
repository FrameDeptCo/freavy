export type PortType = 'text' | 'image' | 'video' | 'model3d' | 'mask' | 'array' | 'number' | 'boolean';

export type NodeKind = 'editing' | 'generative' | 'llm' | 'utility';

export type Provider = 'comfy' | 'ollama' | 'fal' | 'minimax' | 'client';

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  optional?: boolean;
  multi?: boolean;
}

export type ParamControl =
  | { kind: 'text'; multiline?: boolean }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'slider'; min: number; max: number; step?: number }
  | { kind: 'select'; options: string[] }
  | { kind: 'toggle' }
  | { kind: 'seed' }
  | { kind: 'aspect'; options: string[] };

export interface ParamDef {
  id: string;
  label: string;
  control: ParamControl;
  default: string | number | boolean;
  advanced?: boolean;
}

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
  /** comfy template id, ollama model name, or fal endpoint id */
  ref: string;
  default?: boolean;
  /** comfy only: model files that must exist; url is the direct download (HuggingFace etc.) for the installer manifest */
  requires?: { folder: string; file: string; url?: string }[];
  /** model-specific controls shown in the inspector (override the node's generic params) */
  params?: ParamDef[];
  /** estimated USD cost for one run given the params; null/undefined = free (local) */
  cost?: (p: Record<string, string | number | boolean>) => number | null;
  /** Weavy sub-section label (e.g. "Generate from text", "Edit images") */
  group?: string;
  /** true for catalog stubs that have no working backend yet */
  unwired?: boolean;
}

export interface LocalModelIndex {
  comfy: Record<string, string[]>;
  ollama: string[];
}

export interface NodeDef {
  id: string;
  title: string;
  category: string;
  kind: NodeKind;
  inputs: PortDef[];
  outputs: PortDef[];
  params: ParamDef[];
  models?: ModelDef[];
  description?: string;
}

export interface AssetRef {
  id: string;
  type: 'image' | 'video' | 'model3d' | 'text';
  url: string;
  text?: string;
  meta?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  defId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  params: Record<string, string | number | boolean>;
  modelId?: string;
  results: AssetRef[];
  activeResult: number;
  locked?: boolean;
  /** group container: holds member nodes and drags them together */
  group?: boolean;
  title?: string;
  members?: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface ProjectGraph {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

export type JobEvent =
  | { type: 'node-start'; jobId: string; nodeId: string }
  | { type: 'node-progress'; jobId: string; nodeId: string; pct: number; label?: string; preview?: string }
  | { type: 'node-done'; jobId: string; nodeId: string; results: AssetRef[] }
  | { type: 'node-error'; jobId: string; nodeId: string; error: string }
  | { type: 'job-done'; jobId: string }
  | { type: 'job-error'; jobId: string; error: string }
  | { type: 'model-progress'; modelId: string; file: string; pct: number }
  | { type: 'model-done'; modelId: string }
  | { type: 'model-error'; modelId: string; error: string };

export const PORT_COLORS: Record<PortType, string> = {
  text: '#c08bff',
  image: '#34c98e',
  video: '#ff5d5d',
  model3d: '#ff9d3d',
  mask: '#c6e94b',
  array: '#4f8dff',
  number: '#e8a33d',
  boolean: '#e8a33d',
};
