# Setup guide for AI agents

Hand this file to Claude Code or any coding agent with the prompt: "Read AGENTS.md and get freavy running on this machine." Everything an agent needs to install, verify and troubleshoot freavy is here.

## What freavy is

A local node canvas for AI image and video generation. Three parts you set up:

1. **freavy itself** (this repo): a Vite + React client on :5917 and a Node orchestrator server on :5918.
2. **ComfyUI** on :8188: the engine that runs the local image and video models.
3. **Ollama** on :11434: only for the prompt, image-describe and LLM nodes (optional).

freavy never downloads or ships models. A local model is "available" only when its exact files sit in ComfyUI's `models` folders. The exact list is in `setup/models.md`.

## Rules for the agent

- Platform: developed and tested on Windows 11 only. Use Windows-correct commands. Other platforms are untested; tell the user if they are on one.
- Use `pnpm` (v12, pinned in `package.json`). Do not use npm or yarn, and do not edit the lockfile.
- Ask the user before downloading anything large. Model files are 5 to 60 GB each. State the file name, size and source first.
- Some Hugging Face repos are license-gated. If a download link returns 401/403/404, tell the user to open the repo page, accept the license while logged in, and then retry. Do not try to bypass the gate.
- Never put API keys in tracked files. Keys go in `server/.env` (git-ignored).
- Never call a paid fal.ai or MiniMax API model unless the user explicitly asks. Local models are free.
- Do not kill or restart the user's existing ComfyUI or Ollama unless asked.

## Step 1: check the machine

Run these and report the results before changing anything.

```
node -v
pnpm -v
nvidia-smi
curl.exe -s http://127.0.0.1:8188/system_stats
curl.exe -s http://127.0.0.1:11434/api/tags
```

- Node.js: current LTS or newer (tested on 24). Install from nodejs.org if missing.
- pnpm 12: see https://pnpm.io/installation if missing.
- GPU: needs an NVIDIA GPU. 24 GB VRAM is what the video models were tuned on; smaller cards are untested. If there is no NVIDIA GPU, say so: local generation will not work, only the canvas UI and the optional paid API models.
- ComfyUI: if `system_stats` answers, note `system.comfyui_version`. It must be recent: 0.30.0 or newer for MiniMax H3, 0.31.0 or newer for LTX 2.5. If ComfyUI is not running, ask the user whether it is installed and where. If it is not installed, point them to the Windows portable build at https://github.com/comfyanonymous/ComfyUI and ask before installing it.
- Ollama: optional. Only needed for the Prompt Enhancer, Image Describer and LLM nodes.

## Step 2: install and start freavy

```
git clone https://github.com/FrameDeptCo/freavy.git
cd freavy
pnpm install --frozen-lockfile
copy server\.env.example server\.env
```

Start the two processes (two terminals, or background jobs):

```
pnpm --filter server dev
pnpm --filter client dev
```

The app is at http://localhost:5917. Optional environment variables (set before starting the server) are listed in `README.md`: `COMFY_URL`, `OLLAMA_URL`, `COMFY_DIR` (lets freavy start a portable ComfyUI), `FAL_KEY`, `MINIMAX_API_KEY`.

## Step 3: verify with the smoke test

```
node scripts/smoke-test.mjs
```

It checks that the server is reachable, that ComfyUI/Ollama are up, and prints every local model as `ready` or `missing` with how many files are missing. Expected before any models are installed: server OK, ComfyUI OK if running, all models `missing`. That is a correct state, not a failure.

## Step 4: install a first model

The smallest useful model is **Qwen Image 2512** (text to image). Its files are listed under "Qwen Image 2512 (local)" in `setup/models.md`, with the folder each file goes in, relative to ComfyUI's `models` directory. For a portable ComfyUI that is `<ComfyUI root>\ComfyUI\models`.

1. Tell the user the four files, their folders and rough sizes, and get a yes.
2. Download each file into its folder, keeping the exact file name.
3. Run `node scripts/smoke-test.mjs` again. Qwen Image 2512 should now say `ready`. No restart is normally needed; if it still says missing, restart ComfyUI and check again.
4. Prove the whole chain with one free local render: `node scripts/smoke-test.mjs --generate`. It should print an image URL.

Open `examples/hello-image.freavy.json` in the app (File dialog, folder icon top left) and press Run Model on the image node to see the same thing on the canvas.

## Step 5: video and other models (only if the user wants them)

- Choose from `setup/models.md`. Check the status table there: some models are untested or not implemented.
- Check VRAM first (`nvidia-smi`). MiniMax H3 at 720p/5s is the tested baseline on 24 GB.
- Open `examples/image-to-video.freavy.json`: Qwen Image makes a still, MiniMax H3 animates it.
- Re-run the smoke test after each model install to confirm `ready`.

## Step 6 (optional): use freavy from Claude

```
claude mcp add freavy -- node <absolute path to repo>/mcp/server.mjs
```

The freavy server must be running. Tools: `engine_status`, `list_models`, `generate_image`, `generate_video`, `build_canvas`, `run_canvas` and more.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Smoke test: server not reachable | The server is not running. Start `pnpm --filter server dev`. Check nothing else is on :5918. |
| ComfyUI dot red / "ComfyUI not reachable" | ComfyUI is not running at `COMFY_URL` (default http://127.0.0.1:8188). Start it, or set `COMFY_URL`. To let freavy start a portable ComfyUI, set `COMFY_DIR` to its root. |
| Model shows `missing` | A file is absent or named differently. Compare with `setup/models.md`; names must match exactly and sit in the listed folder. |
| Port 5917 or 5918 already in use | Another process holds it. Find it with `Get-NetTCPConnection -LocalPort 5917,5918`, or stop the old freavy. |
| `pnpm install` fails on the lockfile | Use pnpm 12 (`pnpm -v`). Do not use npm. Do not regenerate the lockfile. |
| Run starts but never finishes, or is extremely slow | Out of VRAM. Lower resolution or duration, or pick a smaller model. |
| Download link returns 401/403/404 | The Hugging Face repo is gated. The user must accept the license on the repo page while logged in. |
| A node only offers an API model | Inpaint and Remove Background have no local workflow yet, and Mask by Text has no working option. See the status table in `setup/models.md`. |

## Done means

- `node scripts/smoke-test.mjs` shows the server and ComfyUI OK.
- At least one local model is `ready`, and `node scripts/smoke-test.mjs --generate` produced an image.
- The user can open http://localhost:5917 and run `examples/hello-image.freavy.json`.

Report what was installed, what is still missing, and anything you could not verify.
