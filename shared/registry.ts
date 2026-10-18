import type { ModelDef, NodeDef, ParamDef } from './types';

const ar: ParamDef = { id: 'aspect', label: 'Aspect ratio', control: { kind: 'aspect', options: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] }, default: '1:1' };
const seed: ParamDef = { id: 'seed', label: 'Seed', control: { kind: 'seed' }, default: -1, advanced: true };
const steps = (n: number): ParamDef => ({ id: 'steps', label: 'Steps', control: { kind: 'slider', min: 1, max: 50, step: 1 }, default: n, advanced: true });
const cfg = (n: number): ParamDef => ({ id: 'cfg', label: 'Guidance', control: { kind: 'slider', min: 0, max: 15, step: 0.1 }, default: n, advanced: true });
const batch: ParamDef = { id: 'batch', label: 'Batch', control: { kind: 'slider', min: 1, max: 4, step: 1 }, default: 1, advanced: true };

// model-specific param helpers
type P = Record<string, string | number | boolean>;
const sel = (id: string, label: string, options: string[], def: string): ParamDef => ({ id, label, control: { kind: 'select', options }, default: def });
const aspectSel = (def = '1:1'): ParamDef => ({ id: 'aspect', label: 'Aspect ratio', control: { kind: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] }, default: def });
const secs = (p: P) => parseInt(String(p.duration ?? '5s'), 10) || 5;
const pick = <T,>(table: Record<string, T>, key: string, fallback: T): T => table[key] ?? fallback;

// per-model param sets
const nbResP = sel('resolution', 'Resolution', ['1K', '2K', '4K'], '1K');
const gptParams: ParamDef[] = [sel('quality', 'Quality', ['low', 'medium', 'high'], 'medium'), sel('size', 'Size', ['1024x1024', '1536x1024', '1024x1536'], '1024x1024')];

// estimated USD cost helpers (rough; shown with ~ in the UI)
const nbCost = (p: P) => pick({ '1K': 0.08, '2K': 0.12, '4K': 0.16 }, String(p.resolution ?? '1K'), 0.08);
const nbProCost = (p: P) => pick({ '1K': 0.13, '2K': 0.14, '4K': 0.24 }, String(p.resolution ?? '2K'), 0.14);
const gptCost = (p: P) => {
  const q = String(p.quality ?? 'medium');
  const big = String(p.size ?? '1024x1024') !== '1024x1024';
  const base = pick({ low: 0.02, medium: 0.04, high: 0.17 }, q, 0.04);
  return Math.round(base * (big ? 1.5 : 1) * 1000) / 1000;
};

export const REGISTRY: NodeDef[] = [
  // ---------- Text / LLM ----------
  {
    id: 'prompt', title: 'Prompt', category: 'Text', kind: 'utility',
    inputs: [{ id: 'vars', label: 'Variables', type: 'text', optional: true, multi: true }],
    outputs: [{ id: 'text', label: 'Text', type: 'text' }],
    params: [{ id: 'text', label: 'Prompt', control: { kind: 'text', multiline: true }, default: '' }],
    description: 'Free-form text prompt with optional variables.',
  },
  {
    id: 'concat', title: 'Prompt Concatenator', category: 'Text', kind: 'utility',
    inputs: [{ id: 'texts', label: 'Texts', type: 'text', multi: true }],
    outputs: [{ id: 'text', label: 'Text', type: 'text' }],
    params: [{ id: 'separator', label: 'Separator', control: { kind: 'text' }, default: ', ' }],
    description: 'Merge multiple texts into one string.',
  },
  {
    id: 'prompt-enhancer', title: 'Prompt Enhancer', category: 'Text', kind: 'llm',
    inputs: [{ id: 'text', label: 'Text', type: 'text' }],
    outputs: [{ id: 'text', label: 'Text', type: 'text' }],
    params: [{ id: 'style', label: 'Guidelines', control: { kind: 'text', multiline: true }, default: 'Rewrite as a rich, detailed image-generation prompt. Keep the core idea.' }],
    models: [
      { id: 'ollama-qwen', label: 'Qwen 3.6 (local)', provider: 'ollama', ref: 'qwen3.6:latest', default: true },
      { id: 'ollama-mistral', label: 'Mistral 7B (local)', provider: 'ollama', ref: 'mistral:7b' },
    ],
  },
  {
    id: 'image-describer', title: 'Image Describer', category: 'Text', kind: 'llm',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'text', label: 'Text', type: 'text' }],
    params: [{ id: 'guidelines', label: 'Guidelines', control: { kind: 'text', multiline: true }, default: 'Describe this image as a detailed generation prompt.' }],
    models: [{ id: 'ollama-vl', label: 'Qwen 3.6 (local)', provider: 'ollama', ref: 'qwen3.6:latest', default: true }],
  },
  {
    id: 'run-llm', title: 'Run Any LLM', category: 'Text', kind: 'llm',
    inputs: [
      { id: 'text', label: 'Text', type: 'text' },
      { id: 'image', label: 'Image', type: 'image', optional: true },
    ],
    outputs: [{ id: 'text', label: 'Text', type: 'text' }],
    params: [{ id: 'system', label: 'System prompt', control: { kind: 'text', multiline: true }, default: '' }],
    models: [
      { id: 'ollama-qwen', label: 'Qwen 3.6 (local)', provider: 'ollama', ref: 'qwen3.6:latest', default: true },
      { id: 'ollama-mistral', label: 'Mistral 7B (local)', provider: 'ollama', ref: 'mistral:7b' },
    ],
  },

  // ---------- Generative: image ----------
  {
    id: 'image-generate', title: 'Image Generate', category: 'Image', kind: 'generative',
    inputs: [{ id: 'prompt', label: 'Prompt', type: 'text' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [ar, batch, seed, steps(8), cfg(1)],
    models: [
      {
        id: 'qwen-image', label: 'Qwen Image 2512 (local)', provider: 'comfy', ref: 'qwen-image-t2i', default: true,
        requires: [
          { folder: 'diffusion_models', file: 'qwen_image_2512_fp8_e4m3fn.safetensors', url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors' },
          { folder: 'text_encoders', file: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors' },
          { folder: 'vae', file: 'qwen_image_vae.safetensors', url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors' },
          { folder: 'loras', file: 'Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors', url: 'https://huggingface.co/lightx2v/Qwen-Image-2512-Lightning/resolve/main/Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors' },
        ],
      },
      {
        id: 'ideogram4', label: 'Ideogram 4 (local)', provider: 'comfy', ref: 'ideogram4-t2i',
        requires: [
          { folder: 'diffusion_models', file: 'ideogram4_fp8_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_fp8_scaled.safetensors' },
          { folder: 'diffusion_models', file: 'ideogram4_unconditional_fp8_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_unconditional_fp8_scaled.safetensors' },
          { folder: 'text_encoders', file: 'qwen3vl_8b_fp8_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors' },
          { folder: 'vae', file: 'flux2-vae.safetensors', url: 'https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/vae/flux2-vae.safetensors' },
        ],
      },
      { id: 'fal-nano-banana-2', label: 'Nano Banana 2 (API)', provider: 'fal', ref: 'fal-ai/nano-banana-2', params: [aspectSel(), nbResP], cost: nbCost },
      { id: 'fal-nano-banana-pro', label: 'Nano Banana Pro (API)', provider: 'fal', ref: 'fal-ai/gemini-3-pro-image-preview', params: [aspectSel(), sel('resolution', 'Resolution', ['1K', '2K', '4K'], '2K')], cost: nbProCost },
      { id: 'fal-gpt-image-2', label: 'GPT Image 2 (API)', provider: 'fal', ref: 'openai/gpt-image-2', params: gptParams, cost: gptCost },
      { id: 'fal-flux2', label: 'Flux 2 Pro (API)', provider: 'fal', ref: 'fal-ai/flux-pro/v2', params: [aspectSel()], cost: () => 0.04 },
      { id: 'fal-flux-11-ultra', label: 'Flux Pro 1.1 Ultra (API)', provider: 'fal', ref: 'fal-ai/flux-pro/v1.1-ultra', params: [aspectSel('16:9')], cost: () => 0.06 },
      { id: 'fal-flux-11', label: 'Flux Pro 1.1 (API)', provider: 'fal', ref: 'fal-ai/flux-pro/v1.1', params: [aspectSel()], cost: () => 0.04 },
      { id: 'fal-flux-dev', label: 'Flux dev (API)', provider: 'fal', ref: 'fal-ai/flux/dev', params: [aspectSel()], cost: () => 0.025 },
      { id: 'fal-flux-schnell', label: 'Flux Fast (API)', provider: 'fal', ref: 'fal-ai/flux/schnell', params: [aspectSel()], cost: () => 0.003 },
      { id: 'fal-recraft-v3', label: 'Recraft V3 (API)', provider: 'fal', ref: 'fal-ai/recraft-v3', params: [aspectSel()], cost: () => 0.04 },
      { id: 'fal-ideogram-v3', label: 'Ideogram V3 (API)', provider: 'fal', ref: 'fal-ai/ideogram/v3', params: [aspectSel()], cost: () => 0.08 },
      { id: 'fal-sd35', label: 'Stable Diffusion 3.5 (API)', provider: 'fal', ref: 'fal-ai/stable-diffusion-v35-large', params: [aspectSel()], cost: () => 0.035 },
      { id: 'fal-luma-photon', label: 'Luma Photon (API)', provider: 'fal', ref: 'fal-ai/luma-photon', params: [aspectSel()], cost: () => 0.02 },
      { id: 'fal-seedream', label: 'Seedream 4 (API)', provider: 'fal', ref: 'fal-ai/bytedance/seedream/v4/text-to-image', params: [aspectSel()], cost: () => 0.03 },
    ],
  },
  {
    id: 'image-edit', title: 'Image Edit', category: 'Image', kind: 'generative',
    inputs: [
      { id: 'image', label: 'Image', type: 'image', multi: true },
      { id: 'prompt', label: 'Prompt', type: 'text' },
    ],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [batch, seed, steps(8), cfg(1)],
    models: [
      {
        id: 'qwen-edit', label: 'Qwen Image Edit 2511 (local)', provider: 'comfy', ref: 'qwen-image-edit', default: true,
        requires: [
          { folder: 'diffusion_models', file: 'qwen_image_edit_2511_fp8mixed.safetensors', url: 'https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors' },
          { folder: 'text_encoders', file: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors' },
          { folder: 'vae', file: 'qwen_image_vae.safetensors', url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors' },
        ],
      },
      { id: 'fal-nano-banana-2-edit', label: 'Nano Banana 2 (API)', provider: 'fal', ref: 'fal-ai/nano-banana-2', params: [nbResP], cost: nbCost },
      { id: 'fal-nano-banana-pro-edit', label: 'Nano Banana Pro (API)', provider: 'fal', ref: 'fal-ai/nano-banana-pro/edit', params: [sel('resolution', 'Resolution', ['1K', '2K', '4K'], '2K')], cost: nbProCost },
      { id: 'fal-gpt-image-2-edit', label: 'GPT Image 2 (API)', provider: 'fal', ref: 'openai/gpt-image-2/edit', params: gptParams, cost: gptCost },
      { id: 'fal-flux-kontext', label: 'Flux Kontext (API)', provider: 'fal', ref: 'fal-ai/flux-pro/kontext', cost: () => 0.04 },
      { id: 'fal-flux-kontext-max', label: 'Flux Kontext Max (API)', provider: 'fal', ref: 'fal-ai/flux-pro/kontext/max', cost: () => 0.08 },
      { id: 'fal-qwen-edit', label: 'Qwen Image Edit (API)', provider: 'fal', ref: 'fal-ai/qwen-image-edit', cost: () => 0.03 },
      { id: 'fal-seedream-edit', label: 'Seedream 4 Edit (API)', provider: 'fal', ref: 'fal-ai/bytedance/seedream/v4/edit', cost: () => 0.03 },
    ],
  },
  {
    id: 'image-to-3d', title: 'Image to 3D', category: '3D', kind: 'generative',
    description: 'Generate a 3D mesh (.glb) from a single image. TripoSG runs locally on ComfyUI.',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'model', label: '3D Model', type: 'model3d' }],
    params: [seed],
    models: [
      {
        id: 'triposg', label: 'TripoSG (local)', provider: 'comfy', ref: 'triposg', default: true,
        group: 'Generate 3D from image',
        params: [
          seed,
          { id: 'steps', label: 'Steps', control: { kind: 'slider', min: 8, max: 50, step: 1 }, default: 50, advanced: true },
          { id: 'cfg', label: 'Guidance', control: { kind: 'slider', min: 0, max: 15, step: 0.1 }, default: 7, advanced: true },
        ],
        requires: [{ folder: 'triposg', file: 'transformer/diffusion_pytorch_model.safetensors' }],
      },
    ],
  },
  {
    id: 'inpaint', title: 'Inpaint', category: 'Image', kind: 'generative',
    inputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'mask', label: 'Mask', type: 'mask' },
      { id: 'prompt', label: 'Prompt', type: 'text' },
    ],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [seed, steps(20), cfg(5)],
    models: [
      { id: 'qwen-inpaint', label: 'Qwen Edit Inpaint (local)', provider: 'comfy', ref: 'qwen-inpaint', default: true },
      { id: 'fal-flux-fill', label: 'Flux Fill Pro (API)', provider: 'fal', ref: 'fal-ai/flux-pro/v1/fill' },
    ],
  },
  {
    id: 'upscale', title: 'Upscale', category: 'Image', kind: 'generative',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'scale', label: 'Scale', control: { kind: 'select', options: ['2x', '4x'] }, default: '4x' }],
    models: [
      { id: 'esrgan', label: '4x-UltraSharp (local)', provider: 'comfy', ref: 'esrgan-upscale', default: true, requires: [{ folder: 'upscale_models', file: '4x-UltraSharp.pth', url: 'https://huggingface.co/lokCX/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth' }] },
      { id: 'fal-clarity', label: 'Clarity Upscaler (API)', provider: 'fal', ref: 'fal-ai/clarity-upscaler', cost: () => 0.04 },
      { id: 'fal-esrgan', label: 'ESRGAN (API)', provider: 'fal', ref: 'fal-ai/esrgan', cost: () => 0.01 },
    ],
  },
  {
    id: 'remove-bg', title: 'Remove Background', category: 'Image', kind: 'generative',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [],
    models: [
      { id: 'rmbg', label: 'RMBG 2.0 (local)', provider: 'comfy', ref: 'rmbg', default: true },
      { id: 'fal-rmbg', label: 'Bria RMBG (API)', provider: 'fal', ref: 'fal-ai/bria/background/remove' },
    ],
  },

  // ---------- Generative: video ----------
  {
    id: 'video-generate', title: 'Video Generate', category: 'Video', kind: 'generative',
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'text' },
      { id: 'image', label: 'Start frame', type: 'image', optional: true },
      { id: 'last', label: 'Last frame', type: 'image', optional: true },
      { id: 'refs', label: 'References', type: 'image', optional: true, multi: true },
      { id: 'video', label: 'Reference video (motion)', type: 'video', optional: true },
    ],
    outputs: [{ id: 'video', label: 'Video', type: 'video' }],
    params: [
      { id: 'duration', label: 'Duration', control: { kind: 'select', options: ['5s', '10s'] }, default: '5s' },
      { id: 'resolution', label: 'Resolution', control: { kind: 'select', options: ['720p', '1080p'] }, default: '720p' },
      { id: 'aspect', label: 'Aspect ratio', control: { kind: 'aspect', options: ['auto', '16:9', '9:16', '1:1'] }, default: 'auto' },
      seed,
    ],
    models: [
      { id: 'fal-seedance2-fast', label: 'Seedance 2.0 Fast (API, cheapest)', provider: 'fal', ref: 'bytedance/seedance-2.0/fast/image-to-video', default: true, cost: (p) => +(0.022 * secs(p)).toFixed(2) },
      { id: 'fal-seedance2', label: 'Seedance 2.0 (API)', provider: 'fal', ref: 'bytedance/seedance-2.0/image-to-video', cost: (p) => +(0.3 * secs(p)).toFixed(2) },
      { id: 'fal-kling', label: 'Kling 2.5 (API)', provider: 'fal', ref: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', cost: (p) => +(0.07 * secs(p)).toFixed(2) },
      { id: 'fal-seedance', label: 'Seedance 1.5 Pro (API)', provider: 'fal', ref: 'fal-ai/bytedance/seedance/v1.5/pro', cost: (p) => +(0.12 * secs(p)).toFixed(2) },
      { id: 'fal-wan', label: 'Wan 2.5 (API)', provider: 'fal', ref: 'fal-ai/wan-25/text-to-video', cost: (p) => +(0.1 * secs(p)).toFixed(2) },
      { id: 'fal-ltx', label: 'LTX 2 (API)', provider: 'fal', ref: 'fal-ai/ltx-2/text-to-video', cost: (p) => +(0.04 * secs(p)).toFixed(2) },
      { id: 'fal-luma-ray2', label: 'Luma Ray 2 (API)', provider: 'fal', ref: 'fal-ai/luma-dream-machine/ray-2', cost: (p) => +(0.12 * secs(p)).toFixed(2) },
      {
        id: 'wan-vace', label: 'Wan 2.1 VACE 14B (local, multi-ref)', provider: 'comfy', ref: 'wan-vace',
        requires: [
          { folder: 'diffusion_models', file: 'wan2.1_vace_14B_fp16.safetensors', url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_vace_14B_fp16.safetensors' },
          { folder: 'text_encoders', file: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors' },
          { folder: 'vae', file: 'wan_2.1_vae.safetensors', url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors' },
        ],
      },
      {
        id: 'ltx-23', label: 'LTX 2.3 22B distilled (local)', provider: 'comfy', ref: 'ltx-23-t2v',
        requires: [
          { folder: 'checkpoints', file: 'ltx-2.3-22b-distilled.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors' },
          { folder: 'text_encoders', file: 'gemma_3_12B_it_fp8_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp8_scaled.safetensors' },
        ],
      },
      {
        id: 'minimax-h3', label: 'MiniMax H3 Turbo, pruned INT8-ConvRot (local, audio+video)', provider: 'comfy', ref: 'minimax-h3',
        requires: [
          { folder: 'diffusion_models', file: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors' },
          { folder: 'text_encoders', file: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
          { folder: 'vae', file: 'minimax_h3_video_vae_fp16.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors' },
          { folder: 'vae', file: 'minimax_h3_audio_vae_fp32.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors' },
          { folder: 'loras', file: 'minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors', url: 'https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI/resolve/main/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors' },
        ],
        params: [
          { id: 'duration', label: 'Duration', control: { kind: 'select', options: ['5s', '10s'] }, default: '5s' },
          { id: 'resolution', label: 'Resolution', control: { kind: 'select', options: ['720p', '1080p'] }, default: '720p' },
          { id: 'aspect', label: 'Aspect ratio', control: { kind: 'aspect', options: ['auto', '16:9', '9:16', '1:1'] }, default: 'auto' },
          {
            id: 'realismStrength', label: 'Realism LoRA', control: { kind: 'slider', min: 0, max: 1, step: 0.05 }, default: 0,
          },
          {
            id: 'cameraLoraStrength', label: 'Snorricam camera LoRA', control: { kind: 'slider', min: 0, max: 1.5, step: 0.05 }, default: 0,
          },
          seed,
        ],
      },
      {
        id: 'minimax-h3-r2v', label: 'MiniMax H3 R2V, multi-reference (local, audio+video)', provider: 'comfy', ref: 'minimax-h3-r2v',
        requires: [
          { folder: 'diffusion_models', file: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors' },
          { folder: 'text_encoders', file: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
          { folder: 'vae', file: 'minimax_h3_video_vae_fp16.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors' },
          { folder: 'vae', file: 'minimax_h3_audio_vae_fp32.safetensors', url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors' },
        ],
      },
      // Direct MiniMax platform API (api.minimax.io) — bypasses fal.ai's 2x markup
      // ($0.13/sec 2K, $0.08/sec 768P direct vs fal's $0.26/sec). Needs MINIMAX_API_KEY.
      {
        id: 'minimax-api-2k', label: 'MiniMax H3 2K (Direct API)', provider: 'minimax', ref: 'MiniMax-H3',
        params: [
          { id: 'duration', label: 'Duration', control: { kind: 'select', options: ['5s', '10s'] }, default: '5s' },
          { id: 'resolution', label: 'Resolution', control: { kind: 'select', options: ['2K'] }, default: '2K' },
          { id: 'aspect', label: 'Aspect ratio', control: { kind: 'aspect', options: ['auto', '16:9', '9:16', '1:1'] }, default: 'auto' },
          seed,
        ],
        cost: (p) => +(0.13 * secs(p)).toFixed(2),
      },
      {
        id: 'minimax-api-768p', label: 'MiniMax H3 768P (Direct API, cheapest)', provider: 'minimax', ref: 'MiniMax-H3',
        params: [
          { id: 'duration', label: 'Duration', control: { kind: 'select', options: ['5s', '10s'] }, default: '5s' },
          { id: 'resolution', label: 'Resolution', control: { kind: 'select', options: ['768P'] }, default: '768P' },
          { id: 'aspect', label: 'Aspect ratio', control: { kind: 'aspect', options: ['auto', '16:9', '9:16', '1:1'] }, default: 'auto' },
          seed,
        ],
        cost: (p) => +(0.08 * secs(p)).toFixed(2),
      },
      {
        id: 'ltx-23-dev-convrot', label: 'LTX 2.3 22B dev, INT8-ConvRot (local)', provider: 'comfy', ref: 'ltx-23-dev-convrot',
        requires: [
          { folder: 'diffusion_models', file: 'ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors', url: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/diffusion_models/ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors' },
          { folder: 'text_encoders', file: 'gemma_3_12B_it_fp8_scaled.safetensors', url: 'https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp8_scaled.safetensors' },
          { folder: 'text_encoders', file: 'ltx-2.3_text_projection_bf16.safetensors', url: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/text_encoders/ltx-2.3_text_projection_bf16.safetensors' },
          { folder: 'vae', file: 'LTX23_video_vae_bf16.safetensors', url: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_video_vae_bf16.safetensors' },
          { folder: 'checkpoints', file: 'ltx-2.3-22b-distilled.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors' },
        ],
      },
      {
        id: 'ltx-25-dev-convrot', label: 'LTX 2.5 22B distilled, INT8-ConvRot (local, audio+video)', provider: 'comfy', ref: 'ltx-25-dev-convrot',
        requires: [
          { folder: 'diffusion_models', file: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors' },
          { folder: 'text_encoders', file: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors' },
          { folder: 'vae', file: 'ltx-2.5-video-vae-bf16.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-video-vae-bf16.safetensors' },
          { folder: 'checkpoints', file: 'ltx-2.5-audio-vae-bf16.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-audio-vae-bf16.safetensors' },
        ],
      },
    ],
  },
  {
    id: 'foley', title: 'Add Foley', category: 'Video', kind: 'generative',
    inputs: [
      { id: 'video', label: 'Video', type: 'video' },
      { id: 'prompt', label: 'Sound prompt', type: 'text' },
    ],
    outputs: [{ id: 'video', label: 'Video', type: 'video' }],
    params: [seed],
    description: 'Video-to-audio: generates synced Foley SFX for a silent clip. No speech/music.',
    models: [
      {
        id: 'ltx-foley-v2a', label: 'LTX 2.3 Foley V2A (local)', provider: 'comfy', ref: 'ltx-foley-v2a', default: true,
        requires: [
          { folder: 'diffusion_models', file: 'ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors', url: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/diffusion_models/ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors' },
          { folder: 'vae', file: 'LTX23_video_vae_bf16.safetensors', url: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_video_vae_bf16.safetensors' },
          { folder: 'checkpoints', file: 'ltx-2.3-22b-distilled.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors' },
          { folder: 'loras', file: 'ltx-2.3-22b-lora-foley-v2a-1.0.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.3-22b-LoRA-Foley-V2A/resolve/main/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors' },
          { folder: 'text_encoders', file: 'gemma-foley\\model\\model-00001-of-00005.safetensors', url: 'https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-unquantized/resolve/main/model-00001-of-00005.safetensors' },
        ],
      },
    ],
  },

  // ---------- Matte ----------
  {
    id: 'mask-by-text', title: 'Mask by Text', category: 'Matte', kind: 'generative',
    inputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'prompt', label: 'Text', type: 'text' },
    ],
    outputs: [{ id: 'mask', label: 'Mask', type: 'mask' }],
    params: [{ id: 'threshold', label: 'Threshold', control: { kind: 'slider', min: 0, max: 1, step: 0.05 }, default: 0.3 }],
    models: [{ id: 'sam-text', label: 'GroundingDINO + SAM (local)', provider: 'comfy', ref: 'mask-by-text', default: true }],
  },
  {
    id: 'alpha-matte', title: 'Alpha Matte (Video)', category: 'Matte', kind: 'generative',
    inputs: [{ id: 'video', label: 'Video', type: 'video' }],
    outputs: [{ id: 'video', label: 'Matte video', type: 'video' }],
    params: [
      { id: 'resolution', label: 'Resolution', control: { kind: 'select', options: ['720p', '1080p'] }, default: '720p' },
      seed,
    ],
    description: 'Generates a grayscale alpha matte video from an RGB clip (hair, fur, smoke, glass, water). Max 145 frames, no prompt.',
    models: [
      {
        id: 'ltx25-alpha-gen', label: 'LTX 2.5 Alpha Gen IC-LoRA (local)', provider: 'comfy', ref: 'ltx-25-alpha-gen', default: true,
        requires: [
          { folder: 'diffusion_models', file: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors' },
          { folder: 'text_encoders', file: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors' },
          { folder: 'vae', file: 'ltx-2.5-video-vae-bf16.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-video-vae-bf16.safetensors' },
          { folder: 'checkpoints', file: 'ltx-2.5-audio-vae-bf16.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-audio-vae-bf16.safetensors' },
          { folder: 'loras', file: 'ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors', url: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Alpha-Gen/resolve/main/ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors' },
        ],
      },
    ],
  },
  {
    id: 'mask-grow', title: 'Matte Grow/Shrink', category: 'Matte', kind: 'editing',
    inputs: [{ id: 'mask', label: 'Mask', type: 'mask' }],
    outputs: [{ id: 'mask', label: 'Mask', type: 'mask' }],
    params: [{ id: 'amount', label: 'Amount (px)', control: { kind: 'slider', min: -64, max: 64, step: 1 }, default: 4 }],
  },
  {
    id: 'merge-alpha', title: 'Merge Alpha', category: 'Matte', kind: 'editing',
    inputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'mask', label: 'Mask', type: 'mask' },
    ],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [],
  },
  {
    id: 'invert', title: 'Invert', category: 'Matte', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [],
  },
  {
    id: 'mask-extract', title: 'Mask Extractor', category: 'Matte', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'mask', label: 'Mask', type: 'mask' }],
    params: [{ id: 'source', label: 'Source', control: { kind: 'select', options: ['luminance', 'alpha'] }, default: 'luminance' }],
  },

  // ---------- Editing ----------
  {
    id: 'crop', title: 'Crop', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [
      { id: 'aspect', label: 'Aspect', control: { kind: 'aspect', options: ['free', '1:1', '16:9', '9:16', '4:3', '3:4'] }, default: 'free' },
      { id: 'x', label: 'X %', control: { kind: 'slider', min: 0, max: 100, step: 1 }, default: 0 },
      { id: 'y', label: 'Y %', control: { kind: 'slider', min: 0, max: 100, step: 1 }, default: 0 },
      { id: 'w', label: 'Width %', control: { kind: 'slider', min: 1, max: 100, step: 1 }, default: 100 },
      { id: 'h', label: 'Height %', control: { kind: 'slider', min: 1, max: 100, step: 1 }, default: 100 },
    ],
  },
  {
    id: 'resize', title: 'Resize', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [
      { id: 'width', label: 'Width', control: { kind: 'number', min: 8, max: 8192 }, default: 1024 },
      { id: 'height', label: 'Height', control: { kind: 'number', min: 8, max: 8192 }, default: 1024 },
    ],
  },
  {
    id: 'blur', title: 'Blur', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'radius', label: 'Radius', control: { kind: 'slider', min: 0, max: 100, step: 1 }, default: 10 }],
  },
  {
    id: 'levels', title: 'Levels', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [
      { id: 'shadows', label: 'Shadows', control: { kind: 'slider', min: 0, max: 255, step: 1 }, default: 0 },
      { id: 'midtones', label: 'Midtones', control: { kind: 'slider', min: 0.1, max: 3, step: 0.05 }, default: 1 },
      { id: 'highlights', label: 'Highlights', control: { kind: 'slider', min: 0, max: 255, step: 1 }, default: 255 },
    ],
  },
  {
    id: 'channels', title: 'Channels', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [
      { id: 'r', label: 'R', type: 'image' },
      { id: 'g', label: 'G', type: 'image' },
      { id: 'b', label: 'B', type: 'image' },
      { id: 'a', label: 'A', type: 'mask' },
    ],
    params: [],
  },
  {
    id: 'rotate-flip', title: 'Rotate and flip', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [
      { id: 'rotate', label: 'Rotate', control: { kind: 'select', options: ['0', '90', '180', '270'] }, default: '0' },
      { id: 'flipH', label: 'Flip horizontal', control: { kind: 'toggle' }, default: false },
      { id: 'flipV', label: 'Flip vertical', control: { kind: 'toggle' }, default: false },
    ],
  },
  {
    id: 'color-correct', title: 'Color correction', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [
      { id: 'brightness', label: 'Brightness', control: { kind: 'slider', min: -100, max: 100, step: 1 }, default: 0 },
      { id: 'contrast', label: 'Contrast', control: { kind: 'slider', min: -100, max: 100, step: 1 }, default: 0 },
      { id: 'saturation', label: 'Saturation', control: { kind: 'slider', min: 0, max: 200, step: 1 }, default: 100 },
    ],
  },
  {
    id: 'sharpen', title: 'Sharpen', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'amount', label: 'Amount', control: { kind: 'slider', min: 0, max: 100, step: 1 }, default: 40 }],
  },
  {
    id: 'color-palette', title: 'Color palette', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Palette', type: 'image' }],
    params: [{ id: 'count', label: 'Colors', control: { kind: 'slider', min: 2, max: 12, step: 1 }, default: 6 }],
  },
  {
    id: 'blend', title: 'Blend', category: 'Edit', kind: 'editing',
    inputs: [
      { id: 'a', label: 'Base', type: 'image' },
      { id: 'b', label: 'Overlay', type: 'image' },
    ],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [
      { id: 'mode', label: 'Mode', control: { kind: 'select', options: ['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'difference'] }, default: 'normal' },
      { id: 'opacity', label: 'Opacity', control: { kind: 'slider', min: 0, max: 100, step: 1 }, default: 100 },
    ],
  },
  {
    id: 'grayscale', title: 'Grayscale', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [],
  },
  {
    id: 'threshold', title: 'Threshold', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'level', label: 'Level', control: { kind: 'slider', min: 0, max: 255, step: 1 }, default: 128 }],
  },
  {
    id: 'posterize', title: 'Posterize', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'levels', label: 'Levels', control: { kind: 'slider', min: 2, max: 32, step: 1 }, default: 6 }],
  },
  {
    id: 'hue-rotate', title: 'Hue Rotate', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'angle', label: 'Angle', control: { kind: 'slider', min: 0, max: 360, step: 1 }, default: 0 }],
  },
  {
    id: 'vignette', title: 'Vignette', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'amount', label: 'Amount', control: { kind: 'slider', min: 0, max: 100, step: 1 }, default: 50 }],
  },
  {
    id: 'pixelate', title: 'Pixelate', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'size', label: 'Pixel size', control: { kind: 'slider', min: 2, max: 64, step: 1 }, default: 8 }],
  },
  {
    id: 'extract-frame', title: 'Extract Video Frame', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'video', label: 'Video', type: 'video' }],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [{ id: 'position', label: 'Position %', control: { kind: 'slider', min: 0, max: 100, step: 1 }, default: 0 }],
  },
  {
    id: 'painter', title: 'Painter', category: 'Edit', kind: 'editing',
    inputs: [{ id: 'image', label: 'Image', type: 'image', optional: true }],
    outputs: [
      { id: 'image', label: 'Result', type: 'image' },
      { id: 'mask', label: 'Mask', type: 'mask' },
    ],
    params: [
      { id: 'color', label: 'Color', control: { kind: 'text' }, default: '#ffffff' },
      { id: 'opacity', label: 'Opacity', control: { kind: 'slider', min: 1, max: 100, step: 1 }, default: 100 },
      { id: 'size', label: 'Size', control: { kind: 'slider', min: 1, max: 200, step: 1 }, default: 30 },
      { id: 'hardness', label: 'Hardness', control: { kind: 'slider', min: 1, max: 100, step: 1 }, default: 100 },
      { id: 'bgColor', label: 'Background', control: { kind: 'text' }, default: '#000000' },
      { id: 'canvasW', label: 'Width', control: { kind: 'number', min: 64, max: 2048, step: 1 }, default: 1024 },
      { id: 'canvasH', label: 'Height', control: { kind: 'number', min: 64, max: 2048, step: 1 }, default: 1024 },
      { id: 'paint', label: 'Paint', control: { kind: 'text' }, default: '', advanced: true },
    ],
  },

  // ---------- Utility ----------
  {
    id: 'import', title: 'Import', category: 'Utility', kind: 'utility',
    inputs: [],
    outputs: [{ id: 'image', label: 'Image', type: 'image' }],
    params: [],
    description: 'Drag & drop or upload media.',
  },
  {
    id: 'export', title: 'Export', category: 'Utility', kind: 'utility',
    inputs: [{ id: 'media', label: 'Media', type: 'image' }],
    outputs: [],
    params: [],
  },
  {
    id: 'preview', title: 'Preview', category: 'Utility', kind: 'utility',
    inputs: [{ id: 'media', label: 'Media', type: 'image' }],
    outputs: [],
    params: [],
  },
  {
    id: 'router', title: 'Router', category: 'Utility', kind: 'utility',
    inputs: [{ id: 'in', label: 'In', type: 'image' }],
    outputs: [{ id: 'out', label: 'Out', type: 'image' }],
    params: [],
  },
  {
    id: 'compare', title: 'Compare', category: 'Utility', kind: 'utility',
    inputs: [
      { id: 'a', label: 'A', type: 'image' },
      { id: 'b', label: 'B', type: 'image' },
    ],
    outputs: [],
    params: [],
  },
  {
    id: 'note', title: 'Sticky Note', category: 'Utility', kind: 'utility',
    inputs: [],
    outputs: [],
    params: [{ id: 'text', label: 'Note', control: { kind: 'text', multiline: true }, default: '' }],
  },
  {
    id: 'number', title: 'Number', category: 'Data', kind: 'utility',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    params: [{ id: 'value', label: 'Value', control: { kind: 'number' }, default: 0 }],
  },
  {
    id: 'text-data', title: 'Text', category: 'Data', kind: 'utility',
    inputs: [],
    outputs: [{ id: 'text', label: 'Text', type: 'text' }],
    params: [{ id: 'text', label: 'Text', control: { kind: 'text' }, default: '' }],
  },
  {
    id: 'toggle', title: 'Toggle', category: 'Data', kind: 'utility',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'boolean' }],
    params: [{ id: 'value', label: 'Value', control: { kind: 'toggle' }, default: false }],
  },
  {
    id: 'seed-node', title: 'Seed', category: 'Data', kind: 'utility',
    inputs: [],
    outputs: [{ id: 'value', label: 'Seed', type: 'number' }],
    params: [{ id: 'value', label: 'Seed', control: { kind: 'seed' }, default: -1 }],
  },
];

export const byId = new Map(REGISTRY.map((d) => [d.id, d]));
export const CATEGORIES = [...new Set(REGISTRY.map((d) => d.category))];

/** the params a node shows = its model's own params, else the node's generic params */
export function paramsFor(def: NodeDef, model?: ModelDef): ParamDef[] {
  return model?.params ?? def.params;
}

/** clean model label for display as a node/inspector title, e.g. "Nano Banana 2 (API)" → "Nano Banana 2" */
export function modelTitle(label: string): string {
  return label.replace(/\s*\((API|local|local, slow|API, cheapest)\)\s*$/i, '').trim();
}

/** estimated USD cost for one run; null = free (local) */
export function estimateCost(model: ModelDef | undefined, params: Record<string, string | number | boolean>): number | null {
  if (!model || !model.cost) return null;
  const n = model.cost(params);
  return n == null ? null : n;
}

export function formatCost(n: number | null): string {
  if (n == null) return 'Free';
  if (n < 0.01) return '~<$0.01';
  return `~$${n.toFixed(2)}`;
}
