// Generates landing/models-manifest.json from the registry's comfy `requires`.
// Fill in each `url` (HuggingFace etc.); the connector downloads them into the right folder.
// Run: pnpm --filter server exec tsx gen-manifest.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY } from '../shared/registry.ts';

type Entry = { modelId: string; label: string; node: string; sizeGB: number; files: { folder: string; file: string; url: string }[] };
const out: Entry[] = [];

// approx download size per model (GB), net of files shared with other models — for the install picker
const SIZE_GB: Record<string, number> = {
  'qwen-image': 29.6, 'ideogram4': 27.5, 'qwen-edit': 19.1, 'esrgan': 0.06, 'wan-vace': 38.8, 'ltx-23': 39.8,
};

for (const node of REGISTRY) {
  for (const m of node.models ?? []) {
    if (m.provider === 'comfy' && m.requires?.length) {
      out.push({
        modelId: m.id,
        label: m.label,
        node: node.id,
        sizeGB: SIZE_GB[m.id] ?? 0,
        files: m.requires.map((r) => ({ folder: r.folder, file: r.file, url: r.url ?? '' })),
      });
    }
  }
}

const dest = join(import.meta.dirname, '..', 'landing', 'models-manifest.json');
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} models → ${dest}`);
