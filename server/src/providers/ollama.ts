import type { AssetRef } from '../../../shared/types';
import { OLLAMA_URL } from '../status.ts';

export interface OllamaArgs {
  modelRef: string;
  prompt: string;
  system?: string;
  images?: Buffer[];
  onProgress: (pct: number, label?: string) => void;
}

export async function runOllama(a: OllamaArgs): Promise<AssetRef[]> {
  a.onProgress(5, 'thinking');
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: a.modelRef,
      prompt: a.prompt,
      system: a.system || undefined,
      images: a.images?.map((b) => b.toString('base64')),
      stream: false,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { response: string };
  a.onProgress(100);
  return [{ id: crypto.randomUUID().slice(0, 12), type: 'text', url: '', text: json.response.trim(), meta: { model: a.modelRef, provider: 'ollama' } }];
}
