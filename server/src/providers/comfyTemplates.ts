// ComfyUI workflow (API-format) templates keyed by model ref.
// Each builder returns { workflow, outputNodeId } for the prompt API.

interface TplArgs {
  prompt: string;
  imagePaths: string[]; // comfy server-side filenames (after upload)
  maskPath?: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfg: number;
  batch: number;
  loraStrength: number;
  realismStrength: number;
  cameraLoraStrength: number;
  scale?: number;
  frames: number;
  fps: number;
  lastPath?: string;
  refPaths: string[];
  videoPath?: string;
  videoFrames?: number;
}

export interface BuiltWorkflow {
  workflow: Record<string, unknown>;
  outputNodeId: string;
}

type Builder = (a: TplArgs) => BuiltWorkflow;

const qwenT2I: Builder = (a) => ({
  outputNodeId: '9',
  workflow: {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_2512_fp8_e4m3fn.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    '10': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors', strength_model: 1.0 } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: a.prompt } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '' } },
    '6': { class_type: 'EmptySD3LatentImage', inputs: { width: a.width, height: a.height, batch_size: a.batch } },
    '7': {
      class_type: 'KSampler',
      inputs: {
        model: ['10', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0],
        seed: a.seed, steps: a.steps, cfg: a.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'frv' } },
  },
});

// Ideogram 4 is trained on structured JSON captions; bare text prompts tend to trip its baked-in safety placeholder
function ideogramPrompt(a: TplArgs): string {
  const t = a.prompt.trim();
  if (t.startsWith('{')) return t;
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const d = gcd(a.width, a.height);
  return JSON.stringify({
    aspect_ratio: `${a.width / d}:${a.height / d}`,
    high_level_description: t,
    compositional_deconstruction: { background: '', elements: [{ type: 'obj', desc: t }] },
  });
}

// Official presets: Quality 48 (mu 0, std 1.5), Default 20 (mu 0, std 1.75), Turbo 12 (mu 0.5, std 1.75)
const ideogram4T2I: Builder = (a) => {
  const steps = a.steps >= 20 ? a.steps : 20;
  const mu = steps <= 12 ? 0.5 : 0.0;
  const std = steps >= 48 ? 1.5 : 1.75;
  return {
    outputNodeId: '15',
    workflow: {
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'ideogram4_fp8_scaled.safetensors', weight_dtype: 'default' } },
      '2': { class_type: 'UNETLoader', inputs: { unet_name: 'ideogram4_unconditional_fp8_scaled.safetensors', weight_dtype: 'default' } },
      '3': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_8b_fp8_scaled.safetensors', type: 'ideogram4', device: 'default' } },
      '4': { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
      '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['3', 0], text: ideogramPrompt(a) } },
      '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
      '7': { class_type: 'CFGOverride', inputs: { model: ['1', 0], cfg: 3, start_percent: 0.7, end_percent: 1 } },
      '8': { class_type: 'DualModelGuider', inputs: { model: ['7', 0], model_negative: ['2', 0], positive: ['5', 0], negative: ['6', 0], cfg: 7 } },
      '9': { class_type: 'EmptyFlux2LatentImage', inputs: { width: a.width, height: a.height, batch_size: a.batch } },
      '10': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
      '11': { class_type: 'Ideogram4Scheduler', inputs: { steps, width: a.width, height: a.height, mu, std } },
      '12': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
      '13': {
        class_type: 'SamplerCustomAdvanced',
        inputs: { noise: ['12', 0], guider: ['8', 0], sampler: ['10', 0], sigmas: ['11', 0], latent_image: ['9', 0] },
      },
      '14': { class_type: 'VAEDecode', inputs: { samples: ['13', 0], vae: ['4', 0] } },
      '15': { class_type: 'SaveImage', inputs: { images: ['14', 0], filename_prefix: 'frv_ideo' } },
    },
  };
};

const esrgan: Builder = (a) => ({
  outputNodeId: '4',
  workflow: {
    '1': { class_type: 'LoadImage', inputs: { image: a.imagePaths[0] } },
    '2': { class_type: 'UpscaleModelLoader', inputs: { model_name: '4x-UltraSharp.pth' } },
    '3': { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['2', 0], image: ['1', 0] } },
    '4': { class_type: 'SaveImage', inputs: { images: ['3', 0], filename_prefix: 'frv_up' } },
  },
});

const qwenEdit: Builder = (a) => ({
  outputNodeId: '9',
  workflow: {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_edit_2511_fp8mixed.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    '11': { class_type: 'LoadImage', inputs: { image: a.imagePaths[0] } },
    '4': { class_type: 'TextEncodeQwenImageEdit', inputs: { clip: ['2', 0], vae: ['3', 0], image: ['11', 0], prompt: a.prompt } },
    '5': { class_type: 'TextEncodeQwenImageEdit', inputs: { clip: ['2', 0], vae: ['3', 0], image: ['11', 0], prompt: '' } },
    '6': { class_type: 'VAEEncode', inputs: { pixels: ['11', 0], vae: ['3', 0] } },
    '7': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0],
        seed: a.seed, steps: a.steps, cfg: a.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'frv_edit' } },
  },
});

// LTX 2.3 22B distilled, single-stage. Text-to-video, or image-to-video when an
// input image is connected (image conditions the first frame via LTXVImgToVideoInplace).
const ltx23T2V: Builder = (a) => {
  const hasImage = a.imagePaths.length > 0;
  const hasLast = Boolean(a.lastPath);
  const imageNodes: Record<string, unknown> = hasImage
    ? {
        '20': { class_type: 'LoadImage', inputs: { image: a.imagePaths[0] } },
        '21': { class_type: 'ImageScale', inputs: { image: ['20', 0], upscale_method: 'lanczos', width: a.width, height: a.height, crop: 'center' } },
        '22': { class_type: 'LTXVPreprocess', inputs: { image: ['21', 0], img_compression: 18 } },
        '23': { class_type: 'LTXVImgToVideoInplace', inputs: { vae: ['1', 2], image: ['22', 0], latent: ['6', 0], strength: 1, bypass: false } },
      }
    : {};
  const baseLatent = hasImage ? ['23', 0] : ['6', 0];
  // last-frame guide: pins the final frame to an image, crops guide frames back out after sampling
  const lastNodes: Record<string, unknown> = hasLast
    ? {
        '24': { class_type: 'LoadImage', inputs: { image: a.lastPath } },
        '25': { class_type: 'ImageScale', inputs: { image: ['24', 0], upscale_method: 'lanczos', width: a.width, height: a.height, crop: 'center' } },
        '26': { class_type: 'LTXVPreprocess', inputs: { image: ['25', 0], img_compression: 18 } },
        '27': {
          class_type: 'LTXVAddGuide',
          inputs: { positive: ['5', 0], negative: ['5', 1], vae: ['1', 2], latent: baseLatent, image: ['26', 0], frame_idx: -1, strength: 1 },
        },
        '28': { class_type: 'LTXVCropGuides', inputs: { positive: ['27', 0], negative: ['27', 1], latent: ['15', 0] } },
      }
    : {};
  const positive = hasLast ? ['27', 0] : ['5', 0];
  const negative = hasLast ? ['27', 1] : ['5', 1];
  const videoLatent = hasLast ? ['27', 2] : baseLatent;
  const decodeLatent = hasLast ? ['28', 2] : ['15', 0];
  return {
    outputNodeId: '18',
    workflow: {
      ...imageNodes,
      ...lastNodes,
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'ltx-2.3-22b-distilled.safetensors' } },
    '2': { class_type: 'LTXAVTextEncoderLoader', inputs: { text_encoder: 'gemma_3_12B_it_fp8_scaled.safetensors', ckpt_name: 'ltx-2.3-22b-distilled.safetensors', device: 'default' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: a.prompt } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'low quality, distorted, glitchy, cartoonish' } },
    '5': { class_type: 'LTXVConditioning', inputs: { positive: ['3', 0], negative: ['4', 0], frame_rate: a.fps } },
    '6': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: a.width, height: a.height, length: a.frames, batch_size: 1 } },
    '7': { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: 'ltx-2.3-22b-distilled.safetensors' } },
    '8': { class_type: 'LTXVEmptyLatentAudio', inputs: { frames_number: a.frames, frame_rate: 25, batch_size: 1, audio_vae: ['7', 0] } },
    '9': { class_type: 'LTXVConcatAVLatent', inputs: { video_latent: videoLatent, audio_latent: ['8', 0] } },
    '10': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
    '11': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } },
    '12': { class_type: 'ManualSigmas', inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' } },
    '13': { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive, negative, cfg: 1 } },
    '14': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['10', 0], guider: ['13', 0], sampler: ['11', 0], sigmas: ['12', 0], latent_image: ['9', 0] } },
    '15': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['14', 0] } },
    '16': { class_type: 'VAEDecodeTiled', inputs: { samples: decodeLatent, vae: ['1', 2], tile_size: 768, overlap: 64, temporal_size: 4096, temporal_overlap: 4 } },
    '17': { class_type: 'CreateVideo', inputs: { images: ['16', 0], fps: a.fps } },
    '18': { class_type: 'SaveVideo', inputs: { video: ['17', 0], filename_prefix: 'frv_ltx', format: 'auto', codec: 'auto' } },
    },
  };
};

// LTX 2.3 22B dev, INT8-ConvRot — same graph shape as ltx23T2V but the dev transformer
// ships as a split file, so loaders are UNETLoader/DualCLIPLoader/VAELoader(+KJ audio)
// instead of the all-in-one CheckpointLoaderSimple/LTXAVTextEncoderLoader.
const ltx23DevConvrot: Builder = (a) => {
  const hasImage = a.imagePaths.length > 0;
  const hasLast = Boolean(a.lastPath);
  const imageNodes: Record<string, unknown> = hasImage
    ? {
        '20': { class_type: 'LoadImage', inputs: { image: a.imagePaths[0] } },
        '21': { class_type: 'ImageScale', inputs: { image: ['20', 0], upscale_method: 'lanczos', width: a.width, height: a.height, crop: 'center' } },
        '22': { class_type: 'LTXVPreprocess', inputs: { image: ['21', 0], img_compression: 18 } },
        '23': { class_type: 'LTXVImgToVideoInplace', inputs: { vae: ['30', 0], image: ['22', 0], latent: ['6', 0], strength: 1, bypass: false } },
      }
    : {};
  const baseLatent = hasImage ? ['23', 0] : ['6', 0];
  const lastNodes: Record<string, unknown> = hasLast
    ? {
        '24': { class_type: 'LoadImage', inputs: { image: a.lastPath } },
        '25': { class_type: 'ImageScale', inputs: { image: ['24', 0], upscale_method: 'lanczos', width: a.width, height: a.height, crop: 'center' } },
        '26': { class_type: 'LTXVPreprocess', inputs: { image: ['25', 0], img_compression: 18 } },
        '27': {
          class_type: 'LTXVAddGuide',
          inputs: { positive: ['5', 0], negative: ['5', 1], vae: ['30', 0], latent: baseLatent, image: ['26', 0], frame_idx: -1, strength: 1 },
        },
        '28': { class_type: 'LTXVCropGuides', inputs: { positive: ['27', 0], negative: ['27', 1], latent: ['15', 0] } },
      }
    : {};
  const positive = hasLast ? ['27', 0] : ['5', 0];
  const negative = hasLast ? ['27', 1] : ['5', 1];
  const videoLatent = hasLast ? ['27', 2] : baseLatent;
  const decodeLatent = hasLast ? ['28', 2] : ['15', 0];
  return {
    outputNodeId: '18',
    workflow: {
      ...imageNodes,
      ...lastNodes,
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors', weight_dtype: 'default' } },
      '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 'gemma_3_12B_it_fp8_scaled.safetensors', clip_name2: 'ltx-2.3_text_projection_bf16.safetensors', type: 'ltxv', device: 'default' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: a.prompt } },
      '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'low quality, distorted, glitchy, cartoonish' } },
      '5': { class_type: 'LTXVConditioning', inputs: { positive: ['3', 0], negative: ['4', 0], frame_rate: a.fps } },
      '6': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: a.width, height: a.height, length: a.frames, batch_size: 1 } },
      '30': { class_type: 'VAELoader', inputs: { vae_name: 'LTX23_video_vae_bf16.safetensors' } },
      '31': { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: 'ltx-2.3-22b-distilled.safetensors' } },
      '8': { class_type: 'LTXVEmptyLatentAudio', inputs: { frames_number: a.frames, frame_rate: 25, batch_size: 1, audio_vae: ['31', 0] } },
      '9': { class_type: 'LTXVConcatAVLatent', inputs: { video_latent: videoLatent, audio_latent: ['8', 0] } },
      '10': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
      '11': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } },
      '12': { class_type: 'ManualSigmas', inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' } },
      '13': { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive, negative, cfg: 1 } },
      '14': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['10', 0], guider: ['13', 0], sampler: ['11', 0], sigmas: ['12', 0], latent_image: ['9', 0] } },
      '15': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['14', 0] } },
      '16': { class_type: 'VAEDecodeTiled', inputs: { samples: decodeLatent, vae: ['30', 0], tile_size: 768, overlap: 64, temporal_size: 4096, temporal_overlap: 4 } },
      '17': { class_type: 'CreateVideo', inputs: { images: ['16', 0], fps: a.fps } },
      '18': { class_type: 'SaveVideo', inputs: { video: ['17', 0], filename_prefix: 'frv_ltxdev', format: 'auto', codec: 'auto' } },
    },
  };
};

// LTX 2.5 22B distilled, INT8-ConvRot — same graph shape as ltx23DevConvrot, but the
// text encoder ships as a single file with the Gemma4→projection already bundled ("with-proj"
// in the filename), so a single CLIPLoader replaces the DualCLIPLoader used for 2.3's split
// gemma+projection files. Audio VAE file has no matching checkpoint-shaped host in 2.5's own
// repo, so it's placed in the `checkpoints` folder to satisfy LTXVAudioVAELoader's ckpt_name
// input (same workaround pattern as 2.3's foley builder). ComfyUI core 0.31.0+ required —
// gemma4 detection was added to comfy.sd.load_clip's LTXV branch in that release.
const ltx25DevConvrot: Builder = (a) => {
  const hasImage = a.imagePaths.length > 0;
  const hasLast = Boolean(a.lastPath);
  const imageNodes: Record<string, unknown> = hasImage
    ? {
        '20': { class_type: 'LoadImage', inputs: { image: a.imagePaths[0] } },
        '21': { class_type: 'ImageScale', inputs: { image: ['20', 0], upscale_method: 'lanczos', width: a.width, height: a.height, crop: 'center' } },
        '22': { class_type: 'LTXVPreprocess', inputs: { image: ['21', 0], img_compression: 18 } },
        '23': { class_type: 'LTXVImgToVideoInplace', inputs: { vae: ['30', 0], image: ['22', 0], latent: ['6', 0], strength: 1, bypass: false } },
      }
    : {};
  const baseLatent = hasImage ? ['23', 0] : ['6', 0];
  const lastNodes: Record<string, unknown> = hasLast
    ? {
        '24': { class_type: 'LoadImage', inputs: { image: a.lastPath } },
        '25': { class_type: 'ImageScale', inputs: { image: ['24', 0], upscale_method: 'lanczos', width: a.width, height: a.height, crop: 'center' } },
        '26': { class_type: 'LTXVPreprocess', inputs: { image: ['25', 0], img_compression: 18 } },
        '27': {
          class_type: 'LTXVAddGuide',
          inputs: { positive: ['5', 0], negative: ['5', 1], vae: ['30', 0], latent: baseLatent, image: ['26', 0], frame_idx: -1, strength: 1 },
        },
        '28': { class_type: 'LTXVCropGuides', inputs: { positive: ['27', 0], negative: ['27', 1], latent: ['15', 0] } },
      }
    : {};
  const positive = hasLast ? ['27', 0] : ['5', 0];
  const negative = hasLast ? ['27', 1] : ['5', 1];
  const videoLatent = hasLast ? ['27', 2] : baseLatent;
  const decodeLatent = hasLast ? ['28', 2] : ['15', 0];
  return {
    outputNodeId: '18',
    workflow: {
      ...imageNodes,
      ...lastNodes,
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', weight_dtype: 'default' } },
      '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', type: 'ltxv', device: 'default' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: a.prompt } },
      '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'low quality, distorted, glitchy, cartoonish' } },
      '5': { class_type: 'LTXVConditioning', inputs: { positive: ['3', 0], negative: ['4', 0], frame_rate: a.fps } },
      '6': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: a.width, height: a.height, length: a.frames, batch_size: 1 } },
      '30': { class_type: 'VAELoader', inputs: { vae_name: 'ltx-2.5-video-vae-bf16.safetensors' } },
      '31': { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: 'ltx-2.5-audio-vae-bf16.safetensors' } },
      '8': { class_type: 'LTXVEmptyLatentAudio', inputs: { frames_number: a.frames, frame_rate: 25, batch_size: 1, audio_vae: ['31', 0] } },
      '9': { class_type: 'LTXVConcatAVLatent', inputs: { video_latent: videoLatent, audio_latent: ['8', 0] } },
      '10': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
      '11': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } },
      '12': { class_type: 'ManualSigmas', inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' } },
      '13': { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive, negative, cfg: 1 } },
      '14': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['10', 0], guider: ['13', 0], sampler: ['11', 0], sigmas: ['12', 0], latent_image: ['9', 0] } },
      '15': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['14', 0] } },
      '16': { class_type: 'VAEDecodeTiled', inputs: { samples: decodeLatent, vae: ['30', 0], tile_size: 768, overlap: 64, temporal_size: 4096, temporal_overlap: 4 } },
      '17': { class_type: 'CreateVideo', inputs: { images: ['16', 0], fps: a.fps } },
      '18': { class_type: 'SaveVideo', inputs: { video: ['17', 0], filename_prefix: 'frv_ltx25', format: 'auto', codec: 'auto' } },
    },
  };
};

// LTX 2.5 Alpha Gen IC-LoRA — RGB video in, grayscale alpha matte video out. Single-stage at
// native size on the distilled base, empty prompt, LoRA 1.0, reference conditioning 1.0 (per the
// model card). Clip is capped at 145 frames / 8n+1 and dims divisible by 32 by the caller.
const ltx25AlphaGen: Builder = (a) => ({
  outputNodeId: '18',
  workflow: {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', type: 'ltxv', device: 'default' } },
    '3': { class_type: 'LTXICLoRALoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors', strength_model: 1.0 } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '' } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '' } },
    '6': { class_type: 'LTXVConditioning', inputs: { positive: ['4', 0], negative: ['5', 0], frame_rate: a.fps } },
    '7': { class_type: 'VHS_LoadVideo', inputs: { video: a.videoPath, force_rate: a.fps, custom_width: a.width, custom_height: a.height, frame_load_cap: a.videoFrames ?? 0, skip_first_frames: 0, select_every_nth: 1 } },
    '8': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: a.width, height: a.height, length: a.frames, batch_size: 1 } },
    '30': { class_type: 'VAELoader', inputs: { vae_name: 'ltx-2.5-video-vae-bf16.safetensors' } },
    '31': { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: 'ltx-2.5-audio-vae-bf16.safetensors' } },
    '9': {
      class_type: 'LTXAddVideoICLoRAGuide',
      inputs: {
        positive: ['6', 0], negative: ['6', 1], vae: ['30', 0], latent: ['8', 0], image: ['7', 0],
        frame_idx: 0, strength: 1, latent_downscale_factor: ['3', 1], crop: 'disabled', use_tiled_encode: false, tile_size: 256, tile_overlap: 64,
      },
    },
    '10': { class_type: 'LTXVEmptyLatentAudio', inputs: { frames_number: a.frames, frame_rate: 25, batch_size: 1, audio_vae: ['31', 0] } },
    '11': { class_type: 'LTXVConcatAVLatent', inputs: { video_latent: ['9', 2], audio_latent: ['10', 0] } },
    '12': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
    '13': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } },
    '14': { class_type: 'ManualSigmas', inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' } },
    '15': { class_type: 'CFGGuider', inputs: { model: ['3', 0], positive: ['9', 0], negative: ['9', 1], cfg: 1 } },
    '16': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['12', 0], guider: ['15', 0], sampler: ['13', 0], sigmas: ['14', 0], latent_image: ['11', 0] } },
    '19': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['16', 0] } },
    '20': { class_type: 'LTXVCropGuides', inputs: { positive: ['9', 0], negative: ['9', 1], latent: ['19', 0] } },
    '21': { class_type: 'VAEDecodeTiled', inputs: { samples: ['20', 2], vae: ['30', 0], tile_size: 768, overlap: 64, temporal_size: 4096, temporal_overlap: 4 } },
    '17': { class_type: 'CreateVideo', inputs: { images: ['21', 0], fps: a.fps } },
    '18': { class_type: 'SaveVideo', inputs: { video: ['17', 0], filename_prefix: 'frv_alphagen', format: 'auto', codec: 'auto' } },
  },
});

// MiniMax H3 — omni-modal FL2VA (text/first-last-frame-to-video-audio). Native audio +
// video come out of one SamplerCustomAdvanced pass; MiniMaxH3ImageToVideo bundles prompt
// encoding + image conditioning + empty latent into a single node (no separate negative
// prompt / CFG — BasicGuider only).
//
// Community Turbo LoRA (drbaph/MiniMax-H3-Turbo-Lora-ComfyUI, pruned-checkpoint-compatible
// build of larryvrh's distillation) applied on top of the stock official graph — cuts
// effective step count from the base model's native ~20 to 8 at full quality (drbaph's docs:
// steps 4-8, sampler euler, scheduler beta, strength 1.0). Also tried the community
// SageAttention patch (KJNodes) for a further free speedup, but the `sageattention` PyPI
// package isn't installed here (needs a compiled wheel matched to torch 2.10/cu130) — skip
// rather than risk the env; EasyCache was tried by the community too but has reported
// quality regressions, so it's skipped here as well.
const minimaxH3: Builder = (a) => {
  const hasImage = a.imagePaths.length > 0;
  const hasLast = Boolean(a.lastPath);
  const imageNodes: Record<string, unknown> = {
    ...(hasImage ? { '20': { class_type: 'LoadImage', inputs: { image: a.imagePaths[0] } } } : {}),
    ...(hasLast ? { '21': { class_type: 'LoadImage', inputs: { image: a.lastPath } } } : {}),
  };
  // fal's realism LoRA (h3-realism-people, rank 32) stacks on top of the Turbo LoRA —
  // chained after node 30 so both apply when both strengths are non-zero. Needs the
  // r34l1sm trigger word somewhere in the prompt to actually engage.
  const useRealism = a.realismStrength > 0;
  // Snorricam camera-rig LoRA (Nebsh/Snorricam_H3_LORA) — chained last so it can stack on
  // top of Turbo/realism. Intense chaotic handheld body-rig camera motion.
  const useCamera = a.cameraLoraStrength > 0;
  const modelOut: [string, number] = useCamera ? ['32', 0] : useRealism ? ['31', 0] : ['30', 0];
  return {
    outputNodeId: '14',
    workflow: {
      ...imageNodes,
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', weight_dtype: 'default' } },
      '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' } },
      '3': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } },
      '4': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' } },
      '30': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors', strength_model: a.loraStrength } },
      ...(useRealism ? { '31': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['30', 0], lora_name: 'h3-realism-people-t2v-i2v-r2v.safetensors', strength_model: a.realismStrength } } } : {}),
      ...(useCamera ? { '32': { class_type: 'LoraLoaderModelOnly', inputs: { model: useRealism ? ['31', 0] : ['30', 0], lora_name: 'Snorricam_H3.safetensors', strength_model: a.cameraLoraStrength } } } : {}),
      '5': {
        class_type: 'MiniMaxH3ImageToVideo',
        inputs: {
          clip: ['2', 0], vae: ['3', 0],
          first_frame: hasImage ? ['20', 0] : null,
          last_frame: hasLast ? ['21', 0] : null,
          prompt: a.prompt, width: a.width, height: a.height, length: a.frames,
        },
      },
      '6': { class_type: 'BasicGuider', inputs: { model: modelOut, conditioning: ['5', 0] } },
      '7': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
      '8': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
      '9': { class_type: 'BasicScheduler', inputs: { model: modelOut, scheduler: 'beta', steps: a.steps, denoise: 1 } },
      '10': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['7', 0], guider: ['6', 0], sampler: ['8', 0], sigmas: ['9', 0], latent_image: ['5', 1] } },
      '11': { class_type: 'VAEDecode', inputs: { samples: ['10', 0], vae: ['3', 0] } },
      '12': { class_type: 'VAEDecodeAudio', inputs: { samples: ['10', 0], vae: ['4', 0] } },
      '13': { class_type: 'CreateVideo', inputs: { images: ['11', 0], audio: ['12', 0], fps: a.fps } },
      '14': { class_type: 'SaveVideo', inputs: { video: ['13', 0], filename_prefix: 'frv_minimax', format: 'auto', codec: 'auto' } },
    },
  };
};

// MiniMax H3 R2V (reference-to-video) — locks identity/style/motion from up to 9 reference
// images (wired via the node's multi `refs` input) instead of a single start/last frame.
// Different diffusion checkpoint from the T2V/I2V fl2va model (ref2va — a distinct
// task-head), but the Turbo LoRA was confirmed compatible here too (2026-08-10, Range
// Rover project test): no node errors, no fidelity regression vs. the stock 20-step
// baseline in a direct side-by-side, ~2.4x faster on a 4-ref/8-step run. Prompt must tag
// references in connection order: <Picture 1>, <Picture 2>, ...
const minimaxH3R2V: Builder = (a) => {
  const refs = a.refPaths.length ? a.refPaths : a.imagePaths;
  const refNodes: Record<string, unknown> = {};
  const refInputs: Record<string, unknown> = {};
  refs.slice(0, 9).forEach((p, i) => {
    const nodeId = `2${i}`;
    refNodes[nodeId] = { class_type: 'LoadImage', inputs: { image: p } };
    refInputs[`ref_images.ref_image_${i}`] = [nodeId, 0];
  });
  // Reference video drives real motion transfer — MiniMaxH3ReferenceToVideo's ref_videos.ref_video_0
  // input takes an IMAGE batch (decoded frames), not a VIDEO object, so we decode via VHS_LoadVideo.
  // Raw RGB alone was found to not track a camera-only move at all (tiffany project, session
  // 2026-08-26) — per the "video editing" case in the freavy-workflow-rules tutorials, camera
  // geometry adherence comes from feeding a Depth Anything V2 map of the source video as its own
  // ref_video slot (ref_video_0), with the raw RGB kept as a second slot (ref_video_1) for lighting/
  // context only. The prompt must tag each slot's role explicitly (see minimax-h3-r2v-motion-transfer
  // memory) — untagged video refs get treated as generic context, not a geometry constraint.
  const videoInputs: Record<string, unknown> = {};
  if (a.videoPath) {
    refNodes['40'] = {
      class_type: 'VHS_LoadVideo',
      inputs: { video: a.videoPath, force_rate: a.fps, custom_width: 0, custom_height: 0, frame_load_cap: a.videoFrames ?? 0, skip_first_frames: 0, select_every_nth: 1 },
    };
    refNodes['41'] = {
      class_type: 'DepthAnythingV2Preprocessor',
      inputs: { image: ['40', 0], ckpt_name: 'depth_anything_v2_vitl.pth', resolution: 512 },
    };
    videoInputs['ref_videos.ref_video_0'] = ['41', 0];
    videoInputs['ref_videos.ref_video_1'] = ['40', 0];
  }
  return {
    outputNodeId: '14',
    workflow: {
      ...refNodes,
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', weight_dtype: 'default' } },
      '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' } },
      '3': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } },
      '4': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' } },
      // NOTE: deliberately no Turbo LoRA here. The Turbo LoRA (euler+beta, ~8 steps) is a distilled
      // speed path that visibly degrades how closely R2V tracks a reference video's actual per-frame
      // motion — community consensus (and the freavy-workflow-rules reference tutorials) runs R2V
      // on the base weights at res_multistep/simple/20 steps/cfg baked-in(guidance via BasicGuider,
      // no separate cfg needed) specifically because motion-transfer fidelity requires the full model.
      '5': {
        class_type: 'MiniMaxH3ReferenceToVideo',
        inputs: {
          clip: ['2', 0], vae: ['3', 0], audio_vae: ['4', 0],
          prompt: a.prompt, width: a.width, height: a.height, length: a.frames, ref_image_size: 'match',
          ...refInputs,
          ...videoInputs,
        },
      },
      '6': { class_type: 'BasicGuider', inputs: { model: ['1', 0], conditioning: ['5', 0] } },
      '7': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
      '8': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
      '9': { class_type: 'BasicScheduler', inputs: { model: ['1', 0], scheduler: 'simple', steps: a.steps, denoise: 1 } },
      '10': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['7', 0], guider: ['6', 0], sampler: ['8', 0], sigmas: ['9', 0], latent_image: ['5', 1] } },
      '11': { class_type: 'VAEDecode', inputs: { samples: ['10', 0], vae: ['3', 0] } },
      '12': { class_type: 'VAEDecodeAudio', inputs: { samples: ['10', 0], vae: ['4', 0] } },
      '13': { class_type: 'CreateVideo', inputs: { images: ['11', 0], audio: ['12', 0], fps: a.fps } },
      '14': { class_type: 'SaveVideo', inputs: { video: ['13', 0], filename_prefix: 'frv_minimax_r2v', format: 'auto', codec: 'auto' } },
    },
  };
};

// LTX 2.3 Foley (V2A) — freezes an existing silent video and generates synced SFX audio
// for it via the Lightricks Foley LoRA. video_fps/frames come from the source clip itself
// (rounded down to 8n+1), not from the usual duration param.
const foleyV2A: Builder = (a) => ({
  outputNodeId: '20',
  workflow: {
    // Use the lighter int8-convrot transformer split + standalone video VAE (already on
    // disk) instead of the full 46GB bf16 dev checkpoint — that was thrashing VRAM+RAM on
    // a 24GB card. Audio VAE / Gemma text-projection weights are pulled from the (smaller,
    // already-downloaded) distilled full checkpoint since those components are shared
    // across the LTX 2.3 family, not dev-specific.
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'ltx-2.3-22b-lora-foley-v2a-1.0.safetensors', strength_model: 1.0 } },
    '3': { class_type: 'LTXVGemmaCLIPModelLoader', inputs: { gemma_path: 'gemma-foley\\model\\model-00001-of-00005.safetensors', ltxv_path: 'ltx-2.3-22b-distilled.safetensors', max_length: 1024 } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: a.prompt, clip: ['3', 0] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: 'music, melody, song, singing, vocals, score, soundtrack, beat, instrumental backing, speech, dialogue, talking, narration, tinny, thin, harsh, clipped, distorted, low bitrate, static, noise, room tone', clip: ['3', 0] } },
    '6': { class_type: 'VHS_LoadVideo', inputs: { video: a.videoPath, force_rate: a.fps, custom_width: 0, custom_height: 0, frame_load_cap: a.videoFrames, skip_first_frames: 0, select_every_nth: 1 } },
    '30': { class_type: 'VAELoader', inputs: { vae_name: 'LTX23_video_vae_bf16.safetensors' } },
    '9': { class_type: 'VAEEncode', inputs: { pixels: ['6', 0], vae: ['30', 0] } },
    '10': { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: 'ltx-2.3-22b-distilled.safetensors' } },
    '11': { class_type: 'LTXVEmptyLatentAudio', inputs: { frames_number: a.videoFrames, frame_rate: a.fps, batch_size: 1, audio_vae: ['10', 0] } },
    '12': { class_type: 'LTXVConcatAVLatent', inputs: { video_latent: ['9', 0], audio_latent: ['11', 0] } },
    '13': {
      class_type: 'LTXVSetAudioVideoMaskByTime',
      inputs: {
        av_latent: ['12', 0], positive: ['4', 0], negative: ['5', 0], model: ['2', 0], vae: ['30', 0], audio_vae: ['10', 0],
        start_time: 0.0, end_time: 30.0, video_fps: a.fps, mask_video: false, mask_audio: true,
        mask_init_value_video: 0.0, mask_init_value_audio: 0.0, slope_len: 1,
      },
    },
    '14': { class_type: 'GuiderParameters', inputs: { modality: 'AUDIO', cfg: 6.0, stg: 1.0, perturb_attn: true, rescale: 0.0, modality_scale: 3.0, skip_step: 0, cross_attn: true } },
    '15': { class_type: 'GuiderParameters', inputs: { modality: 'VIDEO', cfg: 1.0, stg: 1.0, perturb_attn: true, rescale: 0.0, modality_scale: 3.0, skip_step: 0, cross_attn: true, parameters: ['14', 0] } },
    '16': { class_type: 'MultimodalGuider', inputs: { model: ['2', 0], positive: ['13', 0], negative: ['13', 1], parameters: ['15', 0], skip_blocks: '29' } },
    '17': { class_type: 'LTXVScheduler', inputs: { steps: 30, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ['13', 2] } },
    'sampler_sel': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    'noise': { class_type: 'RandomNoise', inputs: { noise_seed: a.seed } },
    '18': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['noise', 0], guider: ['16', 0], sampler: ['sampler_sel', 0], sigmas: ['17', 0], latent_image: ['13', 2] } },
    '19': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['18', 0] } },
    'audio_decode': { class_type: 'LTXVAudioVAEDecode', inputs: { samples: ['19', 1], audio_vae: ['10', 0] } },
    '20': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images: ['6', 0], audio: ['audio_decode', 0], frame_rate: a.fps, loop_count: 0,
        filename_prefix: 'frv_foley', format: 'video/h264-mp4', pingpong: false, save_output: true,
      },
    },
  },
});

// Wan 2.1 VACE 14B — multi-reference video. Reference images are batched and keep
// subject/style identity across the clip.
const wanVace: Builder = (a) => {
  const refs = a.refPaths.length ? a.refPaths : a.imagePaths;
  const refNodes: Record<string, unknown> = {};
  let refOut: unknown;
  refs.forEach((p, i) => {
    refNodes[`3${i}0`] = { class_type: 'LoadImage', inputs: { image: p } };
    refOut = refOut === undefined ? [`3${i}0`, 0] : undefined;
  });
  // chain ImageBatch pairwise for multiple refs
  for (let i = 1; i < refs.length; i++) {
    refNodes[`3${i}5`] = { class_type: 'ImageBatch', inputs: { image1: i === 1 ? ['300', 0] : [`3${i - 1}5`, 0], image2: [`3${i}0`, 0] } };
    refOut = [`3${i}5`, 0];
  }
  return {
    outputNodeId: '12',
    workflow: {
      ...refNodes,
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.1_vace_14B_fp16.safetensors', weight_dtype: 'fp8_e4m3fn' } },
      '2': { class_type: 'ModelSamplingSD3', inputs: { model: ['1', 0], shift: 8 } },
      '3': { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' } },
      '4': { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
      '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['3', 0], text: a.prompt } },
      '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['3', 0], text: 'static, blurry, low quality, distorted, watermark' } },
      '7': {
        class_type: 'WanVaceToVideo',
        inputs: {
          positive: ['5', 0], negative: ['6', 0], vae: ['4', 0],
          width: a.width, height: a.height, length: a.frames, batch_size: 1, strength: 1,
          ...(refOut ? { reference_image: refOut } : {}),
        },
      },
      '8': {
        class_type: 'KSampler',
        inputs: {
          model: ['2', 0], positive: ['7', 0], negative: ['7', 1], latent_image: ['7', 2],
          seed: a.seed, steps: 20, cfg: 4, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1,
        },
      },
      '9': { class_type: 'TrimVideoLatent', inputs: { samples: ['8', 0], trim_amount: ['7', 3] } },
      '10': { class_type: 'VAEDecodeTiled', inputs: { samples: ['9', 0], vae: ['4', 0], tile_size: 256, overlap: 64, temporal_size: 64, temporal_overlap: 8 } },
      '11': { class_type: 'CreateVideo', inputs: { images: ['10', 0], fps: a.fps } },
      '12': { class_type: 'SaveVideo', inputs: { video: ['11', 0], filename_prefix: 'frv_vace', format: 'auto', codec: 'auto' } },
    },
  };
};

/** short edge (smaller dimension) in px for a resolution tier */
export function shortEdge(resolution: string): number {
  return resolution === '1080p' ? 1080 : 720;
}

/** width×height from an aspect + short-edge target, each rounded to a multiple of `step` */
function videoDims(aspect: string, short: number, step: number): { width: number; height: number } {
  const [w0, h0] = (aspect.includes(':') ? aspect : '16:9').split(':').map(Number);
  const r = w0 > 0 && h0 > 0 ? w0 / h0 : 16 / 9;
  const w = r >= 1 ? short * r : short;
  const h = r >= 1 ? short : short / r;
  const round = (n: number) => Math.max(step, Math.round(n / step) * step);
  return { width: round(w), height: round(h) };
}

/** Wan 14B (divisible by 16). Note: 720p+ on a 24GB card will likely OOM. */
export function wanSize(aspect: string, resolution = '720p'): { width: number; height: number } {
  return videoDims(aspect, shortEdge(resolution), 16);
}

/** LTX wants dims divisible by 32 */
export function ltxSize(aspect: string, resolution = '720p'): { width: number; height: number } {
  return videoDims(aspect, shortEdge(resolution), 32);
}

/** MiniMax H3 native short edge is 768px (720p tier) / ~1088px (1080p tier, ~2K cap), dims divisible by 32 */
export function minimaxSize(aspect: string, resolution = '720p'): { width: number; height: number } {
  return videoDims(aspect, resolution === '1080p' ? 1088 : 768, 32);
}

/** MiniMax H3 snaps length to the model's 17-frame-per-block (17k+5) grid at 24fps */
export function minimaxFrames(durationSec: number, fps = 24): number {
  const raw = Math.max(5, Math.round(durationSec * fps));
  return raw + ((5 - (raw % 17)) % 17 + 17) % 17;
}

// TripoSG image-to-3D (MIT). LoadImage -> FRV_TripoSG (custom node) which saves a .glb
// and reports it under ui.meshes. steps -> num_inference_steps, cfg -> guidance_scale.
const triposg: Builder = (a) => ({
  outputNodeId: '2',
  workflow: {
    '1': { class_type: 'LoadImage', inputs: { image: a.imagePaths[0] } },
    '2': {
      class_type: 'FRV_TripoSG',
      inputs: {
        image: ['1', 0],
        seed: a.seed,
        num_inference_steps: a.steps,
        guidance_scale: a.cfg,
        faces: 0,
        remove_background: true,
      },
    },
  },
});

export const TEMPLATES: Record<string, Builder> = {
  triposg,
  'ltx-23-t2v': ltx23T2V,
  'ltx-23-dev-convrot': ltx23DevConvrot,
  'ltx-25-dev-convrot': ltx25DevConvrot,
  'ltx-foley-v2a': foleyV2A,
  'ltx-25-alpha-gen': ltx25AlphaGen,
  'wan-vace': wanVace,
  'minimax-h3': minimaxH3,
  'minimax-h3-r2v': minimaxH3R2V,
  'qwen-image-t2i': qwenT2I,
  'ideogram4-t2i': ideogram4T2I,
  'qwen-image-edit': qwenEdit,
  'esrgan-upscale': esrgan,
};

export function aspectToSize(aspect: string, base = 1328): { width: number; height: number } {
  const [w, h] = (aspect.includes(':') ? aspect : '1:1').split(':').map(Number);
  const ratio = w / h;
  const width = Math.round(Math.sqrt(base * base * ratio) / 16) * 16;
  const height = Math.round(Math.sqrt((base * base) / ratio) / 16) * 16;
  return { width, height };
}
