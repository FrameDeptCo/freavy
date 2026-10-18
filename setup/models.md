# Model Downloads — freavy Local Engine

Install into your ComfyUI `models` folder. Already installed: Qwen Image 2512 fp8 + Lightning 4-step LoRA.

## Required for Qwen Image (text-to-image) — the default node

The diffusion model is present, but the t2i template also needs:

| File | Folder | Source |
|---|---|---|
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` (~9 GB) | `text_encoders\` | Comfy-Org/Qwen-Image_ComfyUI on Hugging Face |
| `qwen_image_vae.safetensors` (~250 MB) | `vae\` | same repo |

## Qwen Image Edit (image edit node)

| File | Folder |
|---|---|
| `qwen_image_edit_2511_fp8_e4m3fn.safetensors` (~20 GB) | `diffusion_models\` |

Uses the same text encoder + VAE as above. Requires recent ComfyUI (TextEncodeQwenImageEdit node is built in).

## Upscale node

| File | Folder |
|---|---|
| `4x-UltraSharp.pth` (~64 MB) | `upscale_models\` |

## Remove Background / Mask by Text (templates pending)

These need ComfyUI custom node packs, installed via ComfyUI Manager:
- `ComfyUI-RMBG` (remove background)
- `comfyui_segment_anything` + GroundingDINO models (mask by text)

After installing, add the matching workflow templates in `server/src/providers/comfyTemplates.ts` (refs `rmbg`, `mask-by-text`).

## Ollama models

```
ollama pull qwen2.5:14b
ollama pull qwen2.5vl:7b
```

## Flux / SDXL (optional local image gen)

- Flux dev fp8: `flux1-dev-fp8.safetensors` → `checkpoints\` (then add a `flux-dev-t2i` template)
- SDXL base: `sd_xl_base_1.0.safetensors` → `checkpoints\` (then add an `sdxl-t2i` template)
