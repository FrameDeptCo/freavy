// freavy MCP server — exposes the local freavy orchestrator (http://127.0.0.1:5918) as tools.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.FREAVY_URL ?? process.env.WEAVY_URL ?? 'http://127.0.0.1:5918';

async function api(path, init) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new Error(`freavy server not reachable at ${BASE}. Start it with start-freavy.bat in the project.`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `freavy API error ${res.status}`);
  return json;
}

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: 'freavy', version: '1.0.0' });

server.registerTool('engine_status', {
  description: 'Check which freavy engines are online (ComfyUI for image/video, Ollama for LLM nodes, fal.ai API key presence).',
  inputSchema: {},
}, async () => text(await api('/api/status')));

server.registerTool('list_models', {
  description: 'List every generative node and its models with live availability (installed locally or usable via API). Call this before offering model choices.',
  inputSchema: {},
}, async () => {
  const [registry, index, status] = await Promise.all([
    import('../shared/registry.ts').catch(() => null),
    api('/api/models'),
    api('/api/status'),
  ]);
  // registry import may fail under plain node; fall back to server-known data via a static fetch
  const reg = registry?.REGISTRY ?? (await api('/api/registry').catch(() => []));
  const out = [];
  for (const def of reg) {
    if (!def.models) continue;
    out.push({
      node: def.id,
      title: def.title,
      models: def.models.map((m) => ({
        id: m.id,
        label: m.label,
        provider: m.provider,
        available:
          m.provider === 'fal'
            ? status.fal
            : m.provider === 'minimax'
              ? status.minimax
              : m.provider === 'ollama'
              ? index.ollama.some((n) => n.split(':')[0] === m.ref.split(':')[0])
              : !m.requires || m.requires.every((r) => (index.comfy[r.folder] ?? []).includes(r.file)),
      })),
    });
  }
  return text(out);
});

const genParams = {
  prompt: z.string().describe('Generation prompt'),
  model: z.string().optional().describe('Model id from list_models (defaults to the node default)'),
  aspect: z.string().optional().describe('Aspect ratio: auto (match input image), 16:9, 9:16, 1:1, 4:3, 3:4'),
  seed: z.number().optional().describe('Seed; omit or -1 for random'),
  count: z.number().optional().describe('How many variations (1-8, sequential)'),
  output_dir: z.string().describe('Absolute directory to save outputs into (use a folder inside the current project)'),
};

server.registerTool('generate_image', {
  description: 'Generate image(s) from a prompt via freavy. Returns saved file paths and seeds.',
  inputSchema: {
    ...genParams,
    image: z.string().optional().describe('Optional input image path (for edit-capable models)'),
  },
}, async (a) => text(await api('/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    node: 'image-generate',
    prompt: a.prompt,
    modelId: a.model,
    params: { ...(a.aspect ? { aspect: a.aspect } : {}), seed: a.seed ?? -1 },
    images: a.image ? [a.image] : undefined,
    count: a.count,
    outputDir: a.output_dir,
  }),
})));

server.registerTool('generate_video', {
  description: 'Generate video via freavy. Supports start frame, last frame (LTX), multiple reference images (Wan VACE multi-ref), and a reference video for real motion transfer (MiniMax H3 R2V only — the reference video\'s actual per-frame motion drives the output, not just a text description). Local video takes minutes per clip. IMPORTANT: aspect "auto" infers the ratio from start_frame/references — if the clip should match a source image, you MUST pass it as start_frame; with no image, auto falls back to 16:9.',
  inputSchema: {
    ...genParams,
    duration: z.enum(['5s', '10s']).optional(),
    resolution: z.enum(['720p', '1080p']).optional().describe('Omit to use the model default (720p). 1080p is slower.'),
    steps: z.number().optional().describe('Sampling steps. Omit to use the model default (MiniMax H3 Turbo LoRA: 8; tested range 4-8).'),
    start_frame: z.string().optional().describe('Image path used as the first frame'),
    last_frame: z.string().optional().describe('Image path pinned as the final frame (LTX only)'),
    references: z.array(z.string()).optional().describe('Reference image paths for subject/style consistency (Wan VACE)'),
    reference_video: z.string().optional().describe('Video path whose actual motion (camera move, subject motion) drives the output — model must be minimax-h3-r2v'),
  },
}, async (a) => text(await api('/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    node: 'video-generate',
    prompt: a.prompt,
    modelId: a.model,
    params: {
      aspect: a.aspect ?? 'auto',
      seed: a.seed ?? -1,
      duration: a.duration ?? '5s',
      ...(a.resolution ? { resolution: a.resolution } : {}),
      ...(a.steps !== undefined ? { steps: a.steps } : {}),
    },
    video: a.reference_video,
    images: a.start_frame ? [a.start_frame] : undefined,
    last: a.last_frame,
    refs: a.references,
    count: a.count,
    outputDir: a.output_dir,
  }),
})));

server.registerTool('image_edit', {
  description: 'Edit an image with a prompt (Qwen Image Edit locally, or API models).',
  inputSchema: {
    ...genParams,
    image: z.string().describe('Input image path'),
  },
}, async (a) => text(await api('/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    node: 'image-edit',
    prompt: a.prompt,
    modelId: a.model,
    params: { seed: a.seed ?? -1 },
    images: [a.image],
    count: a.count,
    outputDir: a.output_dir,
  }),
})));

server.registerTool('upscale', {
  description: 'Upscale an image 2x/4x (local ESRGAN by default).',
  inputSchema: {
    image: z.string().describe('Input image path'),
    scale: z.enum(['2x', '4x']).optional(),
    output_dir: z.string().describe('Absolute output directory'),
  },
}, async (a) => text(await api('/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ node: 'upscale', params: { scale: a.scale ?? '4x' }, images: [a.image], outputDir: a.output_dir }),
})));

server.registerTool('remove_background', {
  description: 'Remove the background of an image.',
  inputSchema: {
    image: z.string().describe('Input image path'),
    output_dir: z.string().describe('Absolute output directory'),
  },
}, async (a) => text(await api('/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ node: 'remove-bg', images: [a.image], outputDir: a.output_dir }),
})));

server.registerTool('enhance_prompt', {
  description: 'Rewrite a short prompt into a rich generation prompt using the local LLM.',
  inputSchema: {
    prompt: z.string(),
    guidelines: z.string().optional().describe('Style guidance for the rewrite'),
  },
}, async (a) => text(await api('/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ node: 'prompt-enhancer', prompt: a.prompt, params: a.guidelines ? { style: a.guidelines } : {} }),
})));

server.registerTool('describe_image', {
  description: 'Describe an image as a detailed generation prompt using the local vision LLM.',
  inputSchema: {
    image: z.string().describe('Input image path'),
    guidelines: z.string().optional(),
  },
}, async (a) => text(await api('/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ node: 'image-describer', images: [a.image], params: a.guidelines ? { guidelines: a.guidelines } : {} }),
})));

server.registerTool('build_canvas', {
  description: 'Build a wired freavy canvas file (.freavy.json): one Import + Prompt + generative node row per item, laid out and connected. Open it in the freavy app (Ctrl+O) or run items via generate_video/generate_image. Pass image_folder to expand a folder of images, or explicit items.',
  inputSchema: {
    output_path: z.string().describe('Absolute path for the canvas file, e.g. {project}/canvases/batch.freavy.json'),
    name: z.string().optional().describe('Canvas display name'),
    node: z.enum(['video-generate', 'image-generate', 'image-edit']).optional().describe('Generative node per row (default video-generate)'),
    model: z.string().optional().describe('Model id from list_models'),
    items: z.array(z.object({ image: z.string().optional(), prompt: z.string() })).describe('One row per item; image is an absolute path'),
    image_folder: z.string().optional().describe('Folder of images — expands to one row per image (prompts from items by index, or items[0].prompt for all)'),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Node params, e.g. {"aspect":"auto","duration":"5s"}'),
  },
}, async (a) => text(await api('/api/canvas/build', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    outputPath: a.output_path,
    name: a.name,
    node: a.node,
    modelId: a.model,
    items: a.items,
    imageFolder: a.image_folder,
    params: a.params,
  }),
})));

server.registerTool('run_canvas', {
  description: 'Execute pending generative nodes in a .freavy.json canvas file, using exactly the wiring in the file (images, prompts, models). Runs max_items nodes per call (default 1, sequential on the GPU) and returns output files + how many nodes remain — CALL REPEATEDLY until remaining is 0. Results are saved back into the canvas.',
  inputSchema: {
    path: z.string().describe('Absolute path to the .freavy.json canvas file'),
    output_dir: z.string().describe('Absolute directory to copy outputs into, e.g. {project}/motion/freavy/generations/{batch}'),
    max_items: z.number().optional().describe('Nodes to run this call (default 1; keep 1 for video)'),
  },
}, async (a) => text(await api('/api/canvas/run', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ path: a.path, outputDir: a.output_dir, maxItems: a.max_items ?? 1 }),
})));

await server.connect(new StdioServerTransport());
