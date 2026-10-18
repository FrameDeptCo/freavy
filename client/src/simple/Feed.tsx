import { byId, modelTitle } from '../../../shared/registry';
import { useStore } from '../store';
import { runComposer } from '../run';

const EXAMPLES: Record<string, string[]> = {
  Image: [
    'Studio product shot of a ceramic mug on a warm gradient background',
    'Editorial portrait, moody window light, shallow depth of field',
    'Flat lay of coffee, notebook and glasses on a wooden desk',
  ],
  Video: [
    'Drone orbit around a lighthouse in heavy swell, grey sea, spray hitting the lens',
    'Underwater shot of a swimmer breaking the surface, bubbles, sunlight refracting',
    'Macro shot of ink blooming in water, backlit, ultra slow motion, black backdrop',
  ],
  '3D': [
    'Turntable of a leather boot on a seamless studio background',
    'Low-poly stylized mountain landscape at sunset',
  ],
  Text: [
    'Rewrite this as a rich, cinematic prompt for a perfume ad',
    'Describe this reference image as a detailed generation prompt',
  ],
  Matte: ['Isolate the subject from the background'],
};

export function Feed({ category, onUseExample }: { category: string; onUseExample: (p: string) => void }) {
  const runs = useStore((s) => s.composerRuns).filter((r) => byId.get(r.defId)?.category === category);
  const openGallery = useStore((s) => s.openGallery);

  if (!runs.length) {
    const examples = EXAMPLES[category] ?? [];
    return (
      <div className="feed-empty">
        <h2>Your {category.toLowerCase()} runs land here</h2>
        <p>Describe the shot below, pick a model, press Generate. Every finished run stays in this browser.</p>
        <div className="feed-examples">
          {examples.map((ex) => (
            <button key={ex} className="feed-example" onClick={() => onUseExample(ex)}>
              <span className="feed-example-swatch" />
              <span>{ex}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="feed">
      {runs.map((run) => (
        <div key={run.id} className={`feed-row ${run.status}`}>
          <button className="feed-row-thumb" onClick={() => run.results.length && openGallery(run.id)}>
            {run.results[0]?.type === 'image' && <img src={run.results[0].url} alt="" />}
            {run.results[0]?.type === 'video' && <video src={run.results[0].url} muted playsInline />}
            {run.results[0]?.type === 'model3d' && <span>3D</span>}
            {!run.results.length && <span className="feed-row-spin" />}
          </button>
          <div className="feed-row-body">
            <div className="feed-row-prompt">{run.prompt || modelTitle(run.modelLabel)}</div>
            {run.status === 'running' && (
              <div className="progress"><i style={{ width: `${run.pct}%` }} /></div>
            )}
            {run.status === 'error' && (
              <div className="node-error-msg">
                {run.error}
                <button
                  className="ghost-btn"
                  onClick={() => void runComposer({
                    defId: run.defId,
                    modelId: run.modelId,
                    modelLabel: run.modelLabel,
                    prompt: run.prompt,
                    params: run.params,
                    refs: [],
                  })}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
