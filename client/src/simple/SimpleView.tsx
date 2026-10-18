import { useState } from 'react';
import type { AssetRef, NodeDef } from '../../../shared/types';
import { REGISTRY, byId } from '../../../shared/registry';
import { Composer } from './Composer';
import { Feed } from './Feed';

export const COMPOSER_DEFS: NodeDef[] = REGISTRY.filter(
  (d) => (d.kind === 'generative' || d.kind === 'llm') && (d.models?.length ?? 0) > 0,
);
const CATEGORY_ORDER = ['Image', 'Video', '3D', 'Text', 'Matte'];
export const COMPOSER_CATEGORIES = CATEGORY_ORDER.filter((c) => COMPOSER_DEFS.some((d) => d.category === c));

function defaultsFor(d: NodeDef | undefined, m: { params?: NodeDef['params'] } | undefined): Record<string, string | number | boolean> {
  const next: Record<string, string | number | boolean> = {};
  for (const p of (m?.params ?? d?.params ?? [])) next[p.id] = p.default;
  return next;
}

export function SimpleView() {
  const [category, setCategory] = useState(COMPOSER_CATEGORIES[0] ?? '');
  const defsInCategory = COMPOSER_DEFS.filter((d) => d.category === category);
  const [defId, setDefId] = useState(defsInCategory[0]?.id ?? '');
  const def = byId.get(defId);
  const models = def?.models ?? [];
  const [modelId, setModelId] = useState(models.find((m) => m.default)?.id ?? models[0]?.id ?? '');
  const [prompt, setPrompt] = useState('');
  const [params, setParams] = useState<Record<string, string | number | boolean>>(defaultsFor(def, models.find((m) => m.id === modelId)));
  const [refs, setRefs] = useState<AssetRef[]>([]);
  const [count, setCount] = useState(1);

  const pickCategory = (cat: string) => {
    const first = COMPOSER_DEFS.find((d) => d.category === cat);
    const m = first?.models?.find((mm) => mm.default) ?? first?.models?.[0];
    setCategory(cat);
    setDefId(first?.id ?? '');
    setModelId(m?.id ?? '');
    setParams(defaultsFor(first, m));
  };

  const pickDef = (id: string) => {
    const d = byId.get(id);
    const m = d?.models?.find((mm) => mm.default) ?? d?.models?.[0];
    setDefId(id);
    setModelId(m?.id ?? '');
    setParams(defaultsFor(d, m));
  };

  const pickModel = (id: string) => {
    const m = models.find((mm) => mm.id === id);
    setModelId(id);
    setParams(defaultsFor(def, m));
  };

  return (
    <div className="simple-view">
      <Feed category={category} onUseExample={setPrompt} />
      <Composer
        category={category}
        categories={COMPOSER_CATEGORIES}
        onPickCategory={pickCategory}
        defsInCategory={defsInCategory}
        defId={defId}
        onPickDef={pickDef}
        models={models}
        modelId={modelId}
        onPickModel={pickModel}
        prompt={prompt}
        onPrompt={setPrompt}
        params={params}
        onParam={(id, v) => setParams((p) => ({ ...p, [id]: v }))}
        refs={refs}
        onRefs={setRefs}
        count={count}
        onCount={setCount}
      />
    </div>
  );
}
