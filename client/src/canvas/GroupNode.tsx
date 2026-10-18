import { useState } from 'react';
import { useStore } from '../store';

// Visual group container. Sized by the React Flow node style (width/height);
// dragging it moves its member nodes together (handled in Flow's onNodesChange).
export function GroupNode({ id, data }: { id: string; data: { title?: string } }) {
  const setTitle = useStore((s) => s.setTitle);
  const [editing, setEditing] = useState(false);
  return (
    <div className="group-node">
      {editing ? (
        <input
          className="group-label-input nodrag"
          autoFocus
          defaultValue={data.title || 'Group'}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={(e) => { setTitle(id, e.target.value.trim() || 'Group'); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <div className="group-label nodrag" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>
          {data.title || 'Group'}
        </div>
      )}
    </div>
  );
}
