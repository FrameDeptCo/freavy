# Models: what to download

freavy ships no models. Every local model node stays greyed out in the picker until its files are in your ComfyUI `models` folders (the app checks ComfyUI's model lists on startup and every time the status refreshes).

The smallest useful setup is **Qwen Image 2512** (text to image) plus Ollama for the prompt nodes. Everything else is optional: install only the models you want.

## Before you download anything

- **ComfyUI version.** Use a recent ComfyUI. MiniMax H3 needs 0.30.0 or newer (native support), and LTX 2.5 needs 0.31.0 or newer (native Gemma 4 text encoder). freavy was developed against 0.31.0.
- **Hugging Face gates.** Some repos (Lightricks LTX, for one) need you to accept the license on the model page while logged in before the download link works. The links below are the exact files freavy checks for; if a link 404s or asks you to log in, open the repo page first.
- **Folder names matter.** Put each file in the folder shown, under ComfyUI's `models` directory (for the portable build: `ComfyUI_windows_portable\ComfyUI\models`). File names must match exactly, because that is how freavy detects them.
- **Hardware.** Built and tested on a 24 GB RTX 4090 on Windows 11. MiniMax H3 (INT8) at 720p/5s takes about 2 minutes; 1080p/5s works but is tight on VRAM; 1080p/10s overflows and becomes unusable. Smaller GPUs are untested, and expect the 20B+ video models to need 24 GB.
- **Ollama models** (for the Prompt Enhancer, Image Describer and LLM nodes):

```
ollama pull qwen3.6:latest
ollama pull mistral:7b
```

Optional: set `COMFY_DIR` (see the README) if you want freavy to start ComfyUI for you.

## Status of each local model

| Status | Models |
|---|---|
| Tested by the author | Qwen Image 2512, Wan 2.1 VACE, LTX 2.3 distilled, MiniMax H3 (text, image and multi-reference), LTX 2.5 Alpha Gen |
| Wired but not re-tested | Qwen Image Edit 2511, 4x-UltraSharp upscale, Ideogram 4, TripoSG, LTX 2.3 dev INT8-ConvRot, LTX 2.5 distilled INT8-ConvRot |
| Not working | LTX 2.3 Foley V2A (shelved: runs into a VRAM eviction problem with the Gemma encoder) |
| Not implemented locally | Inpaint and Remove Background (no workflow template yet; use their fal.ai option), Mask by Text (no working option yet) |

## Per-model files

Generated from `shared/registry.ts`, so it matches what the app checks for.

### Qwen Image 2512 (local)

Node: `image-generate` | model id: `qwen-image`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `qwen_image_2512_fp8_e4m3fn.safetensors` | [download](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors) |
| `text_encoders` | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors) |
| `vae` | `qwen_image_vae.safetensors` | [download](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors) |
| `loras` | `Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors` | [download](https://huggingface.co/lightx2v/Qwen-Image-2512-Lightning/resolve/main/Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors) |

### Ideogram 4 (local)

Node: `image-generate` | model id: `ideogram4`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `ideogram4_fp8_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_fp8_scaled.safetensors) |
| `diffusion_models` | `ideogram4_unconditional_fp8_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_unconditional_fp8_scaled.safetensors) |
| `text_encoders` | `qwen3vl_8b_fp8_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors) |
| `vae` | `flux2-vae.safetensors` | [download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/vae/flux2-vae.safetensors) |

### Qwen Image Edit 2511 (local)

Node: `image-edit` | model id: `qwen-edit`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `qwen_image_edit_2511_fp8mixed.safetensors` | [download](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors) |
| `text_encoders` | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors) |
| `vae` | `qwen_image_vae.safetensors` | [download](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors) |

### TripoSG (local)

Node: `image-to-3d` | model id: `triposg`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `triposg` | `transformer/diffusion_pytorch_model.safetensors` | see the model page |

### Qwen Edit Inpaint (local)

Node: `inpaint` | model id: `qwen-inpaint`

**Not implemented yet.** There is no local ComfyUI workflow template for this in `server/src/providers/comfyTemplates.ts`, so the Inpaint node only works with its fal.ai model option for now. Contributions welcome.

### 4x-UltraSharp (local)

Node: `upscale` | model id: `esrgan`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `upscale_models` | `4x-UltraSharp.pth` | [download](https://huggingface.co/lokCX/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth) |

### RMBG 2.0 (local)

Node: `remove-bg` | model id: `rmbg`

**Not implemented yet.** There is no local ComfyUI workflow template for this in `server/src/providers/comfyTemplates.ts`, so the Remove Background node only works with its fal.ai model option for now. Contributions welcome.

### Wan 2.1 VACE 14B (local, multi-ref)

Node: `video-generate` | model id: `wan-vace`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `wan2.1_vace_14B_fp16.safetensors` | [download](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_vace_14B_fp16.safetensors) |
| `text_encoders` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) |
| `vae` | `wan_2.1_vae.safetensors` | [download](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors) |

### LTX 2.3 22B distilled (local)

Node: `video-generate` | model id: `ltx-23`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `checkpoints` | `ltx-2.3-22b-distilled.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors) |
| `text_encoders` | `gemma_3_12B_it_fp8_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp8_scaled.safetensors) |

### MiniMax H3 Turbo, pruned INT8-ConvRot (local, audio+video)

Node: `video-generate` | model id: `minimax-h3`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors) |
| `text_encoders` | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors) |
| `vae` | `minimax_h3_video_vae_fp16.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors) |
| `vae` | `minimax_h3_audio_vae_fp32.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors) |
| `loras` | `minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors` | [download](https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI/resolve/main/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors) |

### MiniMax H3 R2V, multi-reference (local, audio+video)

Node: `video-generate` | model id: `minimax-h3-r2v`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors) |
| `text_encoders` | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors) |
| `vae` | `minimax_h3_video_vae_fp16.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors) |
| `vae` | `minimax_h3_audio_vae_fp32.safetensors` | [download](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors) |

### LTX 2.3 22B dev, INT8-ConvRot (local)

Node: `video-generate` | model id: `ltx-23-dev-convrot`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors` | [download](https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/diffusion_models/ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors) |
| `text_encoders` | `gemma_3_12B_it_fp8_scaled.safetensors` | [download](https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp8_scaled.safetensors) |
| `text_encoders` | `ltx-2.3_text_projection_bf16.safetensors` | [download](https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/text_encoders/ltx-2.3_text_projection_bf16.safetensors) |
| `vae` | `LTX23_video_vae_bf16.safetensors` | [download](https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_video_vae_bf16.safetensors) |
| `checkpoints` | `ltx-2.3-22b-distilled.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors) |

### LTX 2.5 22B distilled, INT8-ConvRot (local, audio+video)

Node: `video-generate` | model id: `ltx-25-dev-convrot`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors) |
| `text_encoders` | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors) |
| `vae` | `ltx-2.5-video-vae-bf16.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-video-vae-bf16.safetensors) |
| `checkpoints` | `ltx-2.5-audio-vae-bf16.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-audio-vae-bf16.safetensors) |

### LTX 2.3 Foley V2A (local)

Node: `foley` | model id: `ltx-foley-v2a`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors` | [download](https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/diffusion_models/ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors) |
| `vae` | `LTX23_video_vae_bf16.safetensors` | [download](https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_video_vae_bf16.safetensors) |
| `checkpoints` | `ltx-2.3-22b-distilled.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors) |
| `loras` | `ltx-2.3-22b-lora-foley-v2a-1.0.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.3-22b-LoRA-Foley-V2A/resolve/main/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors) |
| `text_encoders` | `gemma-foley\model\model-00001-of-00005.safetensors` | [download](https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-unquantized/resolve/main/model-00001-of-00005.safetensors) |

### GroundingDINO + SAM (local)

Node: `mask-by-text` | model id: `sam-text`

**Not implemented yet.** There is no local ComfyUI workflow template for this in `server/src/providers/comfyTemplates.ts`, so the Mask by Text node (local-only) does not work yet. Contributions welcome.

### LTX 2.5 Alpha Gen IC-LoRA (local)

Node: `alpha-matte` | model id: `ltx25-alpha-gen`

| Folder (under ComfyUI `models/`) | File | Source |
|---|---|---|
| `diffusion_models` | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors) |
| `text_encoders` | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors) |
| `vae` | `ltx-2.5-video-vae-bf16.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-video-vae-bf16.safetensors) |
| `checkpoints` | `ltx-2.5-audio-vae-bf16.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-audio-vae-bf16.safetensors) |
| `loras` | `ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors` | [download](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Alpha-Gen/resolve/main/ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors) |

