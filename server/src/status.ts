export const COMFY_URL = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

async function ping(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function engineStatus() {
  const [comfy, ollama] = await Promise.all([ping(`${COMFY_URL}/system_stats`), ping(`${OLLAMA_URL}/api/tags`)]);
  return { comfy, ollama, fal: Boolean(process.env.FAL_KEY), minimax: Boolean(process.env.MINIMAX_API_KEY) };
}

const COMFY_FOLDERS = ['checkpoints', 'diffusion_models', 'text_encoders', 'vae', 'upscale_models', 'loras'];

export async function localModelIndex() {
  const comfy: Record<string, string[]> = {};
  await Promise.all(
    COMFY_FOLDERS.map(async (folder) => {
      try {
        const res = await fetch(`${COMFY_URL}/models/${folder}`, { signal: AbortSignal.timeout(3000) });
        comfy[folder] = res.ok ? ((await res.json()) as string[]) : [];
      } catch {
        comfy[folder] = [];
      }
    }),
  );
  let ollama: string[] = [];
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) ollama = ((await res.json()) as { models: { name: string }[] }).models.map((m) => m.name);
  } catch {
    /* offline */
  }
  return { comfy, ollama };
}
