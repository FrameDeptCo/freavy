import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type OnConnectEnd,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PortType } from '../../../shared/types';
import { PORT_COLORS } from '../../../shared/types';
import { byId } from '../../../shared/registry';
import { useStore } from '../store';
import { saveProjectDebounced, uploadFile } from '../run';
import { WeaveNode } from './WeaveNode';
import { NodeMenu } from './NodeMenu';
import { ContextMenu, type CtxItem } from './ContextMenu';
import { GroupNode } from './GroupNode';
import { saveCanvas } from '../file';

const nodeTypes = { frv: WeaveNode, groupbox: GroupNode };

function portType(nodeDefId: string, handle: string, dir: 'in' | 'out'): PortType | undefined {
  const def = byId.get(nodeDefId);
  const ports = dir === 'in' ? def?.inputs : def?.outputs;
  return ports?.find((p) => p.id === handle)?.type;
}

const compatible = (a?: PortType, b?: PortType) =>
  !!a && !!b && (a === b || (a === 'image' && b === 'mask') || (a === 'mask' && b === 'image'));

export function Flow({ tool }: { tool: 'select' | 'hand' }) {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const moveNode = useStore((s) => s.moveNode);
  const addEdge = useStore((s) => s.addEdge);
  const removeEdge = useStore((s) => s.removeEdge);
  const removeNode = useStore((s) => s.removeNode);
  const removeNodes = useStore((s) => s.removeNodes);
  const duplicateNodes = useStore((s) => s.duplicateNodes);
  const setLocked = useStore((s) => s.setLocked);
  const clearAll = useStore((s) => s.clearAll);
  const groupNodes = useStore((s) => s.groupNodes);
  const ungroup = useStore((s) => s.ungroup);
  const addNode = useStore((s) => s.addNode);
  const select = useStore((s) => s.select);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const doGroup = (ids: string[]) => {
    // bounds from the actual rendered node rectangles (screen px) -> canvas coords; robust vs measured-size timing
    const rects = ids
      .map((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r);
    if (rects.length < 2) return;
    const tl = screenToFlowPosition({ x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)) });
    const br = screenToFlowPosition({ x: Math.max(...rects.map((r) => r.right)), y: Math.max(...rects.map((r) => r.bottom)) });
    groupNodes(ids, { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y });
    saveProjectDebounced();
  };
  const fitRequest = useStore((s) => s.fitRequest);
  const [menu, setMenu] = useState<{ x: number; y: number; pendingFrom?: { node: string; handle: string; type?: PortType } } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; ids: string[] } | null>(null);

  useEffect(() => {
    if (fitRequest > 0) setTimeout(() => void fitView({ padding: 0.15 }), 50);
  }, [fitRequest, fitView]);
  const connectFrom = useRef<{ node: string; handle: string } | null>(null);

  const selectedIds = useStore((s) => s.selectedIds);
  const setNodeSelected = useStore((s) => s.setNodeSelected);

  const rfNodes: RFNode[] = nodes.map((n) => n.group
    ? {
        id: n.id, type: 'groupbox', position: { x: n.x, y: n.y },
        selected: selectedIds.includes(n.id), draggable: !n.locked,
        style: { width: n.w, height: n.h }, zIndex: 0, data: { title: n.title },
      }
    : {
        id: n.id, type: 'frv', position: { x: n.x, y: n.y },
        selected: selectedIds.includes(n.id), draggable: !n.locked,
        zIndex: 1, data: {},
      });

  const rfEdges: RFEdge[] = edges.map((e) => {
    const t = portType(nodes.find((n) => n.id === e.source)?.defId ?? '', e.sourceHandle, 'out');
    return {
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
      style: { stroke: t ? PORT_COLORS[t] : '#666', strokeWidth: 1.6 },
    };
  });

  const onConnect = useCallback(
    (c: Connection) => {
      const srcDef = nodes.find((n) => n.id === c.source)?.defId ?? '';
      const tgtDef = nodes.find((n) => n.id === c.target)?.defId ?? '';
      const a = portType(srcDef, c.sourceHandle ?? '', 'out');
      const b = portType(tgtDef, c.targetHandle ?? '', 'in');
      if (!compatible(a, b) && !(a === 'text' && b === 'text')) {
        if (a !== b) return; // reject incompatible
      }
      addEdge({
        id: `e${c.source}${c.sourceHandle}-${c.target}${c.targetHandle}`,
        source: c.source!,
        sourceHandle: c.sourceHandle ?? '',
        target: c.target!,
        targetHandle: c.targetHandle ?? '',
      });
      saveProjectDebounced();
    },
    [nodes, addEdge],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (!connectionState.isValid && connectionState.fromNode && connectionState.fromHandle) {
        const ev = event as MouseEvent;
        const t = portType(
          nodes.find((n) => n.id === connectionState.fromNode!.id)?.defId ?? '',
          connectionState.fromHandle.id ?? '',
          'out',
        );
        setMenu({
          x: ev.clientX,
          y: ev.clientY,
          pendingFrom: { node: connectionState.fromNode.id, handle: connectionState.fromHandle.id ?? '', type: t },
        });
      }
    },
    [nodes],
  );

  const importFiles = useCallback(
    async (files: File[], clientX: number, clientY: number) => {
      const media = files.filter((f) => f.type.startsWith('image') || f.type.startsWith('video'));
      if (!media.length) return;
      const pos = screenToFlowPosition({ x: clientX, y: clientY });
      const id = useStore.getState().addNode('import', pos.x, pos.y);
      const refs = [];
      for (const f of media) {
        const up = await uploadFile(f);
        refs.push({ id: up.id, type: up.type, url: up.url, meta: { name: f.name } });
      }
      useStore.getState().setResults(id, refs);
      saveProjectDebounced();
    },
    [screenToFlowPosition],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) void importFiles(files, window.innerWidth / 2, window.innerHeight / 2);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [importFiles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const st = useStore.getState();
        const ids = st.selectedIds;
        const grp = ids.length === 1 && st.nodes.find((n) => n.id === ids[0])?.group;
        if (grp) { ungroup(ids[0]); saveProjectDebounced(); }
        else if (ids.length >= 2) doGroup(ids);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groupNodes, ungroup]);

  const pick = (defId: string) => {
    if (!menu) return;
    const pos = screenToFlowPosition({ x: menu.x, y: menu.y });
    const id = addNode(defId, pos.x, pos.y);
    if (menu.pendingFrom && id) {
      const def = byId.get(defId);
      const input = def?.inputs.find((i) => compatible(menu.pendingFrom!.type, i.type) || i.type === menu.pendingFrom!.type);
      if (input) {
        addEdge({
          id: `e${menu.pendingFrom.node}-${id}`,
          source: menu.pendingFrom.node,
          sourceHandle: menu.pendingFrom.handle,
          target: id,
          targetHandle: input.id,
        });
      }
    }
    setMenu(null);
    saveProjectDebounced();
  };

  const downloadAll = async () => {
    const urls = useStore.getState().nodes.flatMap((n) => (n.results ?? []).filter((r) => r.type !== 'text' && r.url).map((r) => r.url));
    for (const u of urls) {
      try {
        const blob = await (await fetch(u)).blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = u.split('/').pop() || 'frv';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
      } catch { /* skip unreachable assets */ }
    }
  };

  const ctxItems: CtxItem[] = (() => {
    if (!ctx) return [];
    const ids = ctx.ids;
    const has = ids.length > 0;
    const lockedAll = has && ids.every((id) => nodes.find((n) => n.id === id)?.locked);
    const singleGroup = ids.length === 1 && !!nodes.find((n) => n.id === ids[0])?.group;
    return [
      { label: 'Download all', onClick: () => void downloadAll() },
      { label: 'Clear canvas', onClick: () => { if (confirm('Clear the whole canvas? This removes every node.')) clearAll(); } },
      { label: 'Save', shortcut: 'Ctrl S', divider: true, onClick: () => void saveCanvas() },
      singleGroup
        ? { label: 'Ungroup', shortcut: 'Ctrl G', divider: true, onClick: () => { ungroup(ids[0]); saveProjectDebounced(); } }
        : { label: 'Group selection', shortcut: 'Ctrl G', disabled: ids.length < 2, divider: true, onClick: () => doGroup(ids) },
      { label: 'Duplicate', shortcut: 'Ctrl D', disabled: !has, onClick: () => { duplicateNodes(ids); saveProjectDebounced(); } },
      { label: lockedAll ? 'Unlock' : 'Lock', disabled: !has, onClick: () => { setLocked(ids, !lockedAll); saveProjectDebounced(); } },
      { label: 'Delete', shortcut: 'Del', danger: true, disabled: !has, divider: true, onClick: () => { removeNodes(ids); saveProjectDebounced(); } },
    ];
  })();

  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => {
        e.preventDefault();
        void importFiles(Array.from(e.dataTransfer.files), e.clientX, e.clientY);
      }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => {
          for (const ch of changes) {
            if (ch.type === 'position' && ch.position) {
              const st = useStore.getState();
              const node = st.nodes.find((n) => n.id === ch.id);
              if (node?.group) {
                const dx = ch.position.x - node.x, dy = ch.position.y - node.y;
                for (const mid of node.members ?? []) {
                  const m = st.nodes.find((n) => n.id === mid);
                  if (m) moveNode(mid, m.x + dx, m.y + dy);
                }
              }
              moveNode(ch.id, ch.position.x, ch.position.y);
            }
            if (ch.type === 'remove') removeNode(ch.id);
            if (ch.type === 'select') setNodeSelected(ch.id, ch.selected);
          }
          saveProjectDebounced();
        }}
        onEdgesChange={(changes) => {
          for (const ch of changes) if (ch.type === 'remove') removeEdge(ch.id);
          saveProjectDebounced();
        }}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          const ids = selectedIds.includes(node.id) && selectedIds.length ? selectedIds : [node.id];
          if (!selectedIds.includes(node.id)) select(node.id);
          setCtx({ x: e.clientX, y: e.clientY, ids });
        }}
        onSelectionContextMenu={(e, ns) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, ids: ns.map((n) => n.id) }); }}
        onPaneContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, ids: [] }); }}
        onPaneClick={() => { select(null); setMenu(null); setCtx(null); }}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.classList.contains('react-flow__pane')) setMenu({ x: e.clientX, y: e.clientY });
        }}
        panOnDrag={tool === 'hand' ? [0, 1, 2] : [1, 2]}
        selectionOnDrag={tool === 'select'}
        zoomOnScroll={false}
        zoomOnPinch
        panOnScroll
        zoomActivationKeyCode="Control"
        deleteKeyCode={['Delete', 'Backspace']}
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{ type: 'default' }}
        proOptions={{ hideAttribution: true }}
        fitView
        minZoom={0.1}
        style={{ background: 'var(--bg)' }}
      >
        <Background variant={BackgroundVariant.Dots} color="#26262c" gap={22} size={1.4} />
      </ReactFlow>
      {menu && (
        <NodeMenu
          x={menu.x}
          y={menu.y}
          filterType={menu.pendingFrom?.type}
          onPick={pick}
          onClose={() => setMenu(null)}
        />
      )}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={() => setCtx(null)} />}
    </div>
  );
}
