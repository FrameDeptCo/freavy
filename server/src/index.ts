import './config.ts'; // FIRST — sets install-folder paths from --config before other modules read them
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// load server/.env (FAL_KEY etc.) — try module-relative then cwd; no dependency
{
  const candidates = [join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), join(process.cwd(), '.env')];
  for (const p of candidates) {
    try { process.loadEnvFile(p); if (process.env.FAL_KEY) break; } catch { /* try next */ }
  }
  console.log(`[env] FAL_KEY ${process.env.FAL_KEY ? 'loaded' : 'not set'}`);
}
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { JobEvent, ProjectGraph } from '../../shared/types';
import { ASSETS_DIR, listAssets, saveAsset } from './assets.ts';
import { listProjects, loadProject, saveProject } from './projects.ts';
import { engineStatus, localModelIndex } from './status.ts';
import { REGISTRY } from '../../shared/registry.ts';
import { executeRun } from './executor.ts';
import { generate, type GenerateRequest } from './generate.ts';
import { buildCanvas, expandImages, listDir, loadCanvas, makeDir, runCanvas, saveCanvas, type BuildCanvasRequest } from './canvas.ts';
import { ensureEngines } from './engines.ts';
import { downloadModel } from './modelsDownload.ts';

const PORT = 5918;
const app = express();

// CORS + Chrome Private Network Access — lets the hosted UI (https) reach this local engine.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '200mb' }));
app.use('/assets', express.static(ASSETS_DIR));

app.get('/api/status', async (_req, res) => res.json(await engineStatus()));
app.get('/api/models', async (_req, res) => res.json(await localModelIndex()));
app.get('/api/registry', (_req, res) => res.json(REGISTRY));
app.get('/api/assets', (_req, res) => res.json(listAssets()));

app.post('/api/generate', async (req, res) => {
  try {
    res.json(await generate(req.body as GenerateRequest));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/fs/list', (req, res) => {
  try {
    res.json(listDir(String(req.query.path ?? process.env.USERPROFILE ?? homedir())));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
app.post('/api/fs/mkdir', (req, res) => {
  try {
    const { path } = req.body as { path: string };
    if (!path) return res.status(400).json({ error: 'path required' });
    makeDir(path);
    res.json({ ok: true, path });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
app.post('/api/canvas/save', (req, res) => {
  try {
    const { path, graph } = req.body as { path: string; graph: ProjectGraph };
    saveCanvas(path, graph);
    res.json({ ok: true, path });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
app.get('/api/canvas/load', (req, res) => {
  try {
    res.json(loadCanvas(String(req.query.path)));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
app.post('/api/canvas/build', (req, res) => {
  try {
    const body = req.body as BuildCanvasRequest & { imageFolder?: string };
    if (body.imageFolder) {
      const images = expandImages(body.imageFolder);
      body.items = images.map((image, i) => ({ image, prompt: body.items?.[i]?.prompt ?? body.items?.[0]?.prompt ?? '' }));
    }
    res.json(buildCanvas(body));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/canvas/run', async (req, res) => {
  try {
    const { path, outputDir, maxItems } = req.body as { path: string; outputDir?: string; maxItems?: number };
    res.json(await runCanvas(path, outputDir, maxItems ?? 1, broadcast));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/projects', (_req, res) => res.json(listProjects()));
app.get('/api/projects/:id', (req, res) => {
  const p = loadProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});
app.put('/api/projects/:id', (req, res) => {
  saveProject(req.body as ProjectGraph);
  res.json({ ok: true });
});

app.post('/api/upload', (req, res) => {
  const { data, type } = req.body as { data: string; type: 'image' | 'video' };
  const m = /^data:(\w+)\/(\w+);base64,(.+)$/.exec(data);
  if (!m) return res.status(400).json({ error: 'expected data URI' });
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const asset = saveAsset(Buffer.from(m[3], 'base64'), ext, type ?? 'image', { source: 'upload' });
  res.json(asset);
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<WebSocket>();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});
const broadcast = (e: JobEvent) => {
  const msg = JSON.stringify(e);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
};

app.post('/api/run', (req, res) => {
  const { graph, nodeId } = req.body as { graph: ProjectGraph; nodeId: string };
  if (!graph || !nodeId) return res.status(400).json({ error: 'graph and nodeId required' });
  const jobId = randomUUID().slice(0, 8);
  void executeRun(graph, nodeId, broadcast);
  res.json({ jobId });
});

// download a model's files into the correct ComfyUI folder; progress streams over /ws
app.post('/api/models/download', (req, res) => {
  const { modelId } = req.body as { modelId: string };
  if (!modelId) return res.status(400).json({ error: 'modelId required' });
  void downloadModel(modelId, broadcast);
  res.json({ started: true });
});

server.listen(PORT, () => {
  console.log(`freavy server on http://127.0.0.1:${PORT}`);
  void ensureEngines();
});
