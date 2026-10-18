# freavy

A free, local-first node canvas for AI image and video generation, built on top of [ComfyUI](https://github.com/comfyanonymous/ComfyUI). A simpler alternative to Weavy: drag nodes onto one canvas, wire them together, and run everything on your own GPU. Any node can optionally switch to a fal.ai API model.

- **Canvas mode**: full node graph (prompt, generate, edit, upscale, video).
- **Simple mode**: Higgsfield-style composer plus feed.
- **Local engines**: ComfyUI (:8188) and Ollama (:11434). No account, nothing uploaded.
- **MCP server**: drive generation and canvases from Claude Code or any MCP client (`mcp/`).

Built by [Frame Department](https://framedepartment.co). MIT licensed.

## Requirements

- Node.js and [pnpm](https://pnpm.io) 12
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (recent version) running on `127.0.0.1:8188`
- [Ollama](https://ollama.com) on `127.0.0.1:11434` (for LLM/vision nodes)
- An NVIDIA GPU (24 GB VRAM recommended for the video models)
- Model files: see [setup/models.md](setup/models.md)

## Setup

```
git clone https://github.com/FrameDeptCo/freavy.git
cd freavy
pnpm install --frozen-lockfile
copy server\.env.example server\.env
```

`server/.env` is optional: add `FAL_KEY` to enable the fal.ai API models, `MINIMAX_API_KEY` for direct MiniMax.

Start ComfyUI and Ollama, then run the app:

```
pnpm --filter server dev
pnpm --filter client dev
```

Or run `start-freavy.bat`. Open http://localhost:5917 (client); the orchestrator server listens on :5918.

## Layout

| Path | What |
|---|---|
| `client/` | Vite + React canvas UI |
| `server/` | Orchestrator: ComfyUI/Ollama/fal.ai providers, workflow templates |
| `shared/` | Model registry and shared types |
| `mcp/` | MCP server exposing generation tools |

Adding a model: add an entry in `shared/registry.ts` and a graph builder in `server/src/providers/comfyTemplates.ts`.

## License

[MIT](LICENSE)
