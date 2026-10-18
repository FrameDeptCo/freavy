import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectGraph } from '../../shared/types';
import { DATA_DIR } from './assets.ts';

const PROJECTS_DIR = join(DATA_DIR, 'projects');
mkdirSync(PROJECTS_DIR, { recursive: true });

export function listProjects(): { id: string; name: string; updatedAt: string }[] {
  return readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const p = JSON.parse(readFileSync(join(PROJECTS_DIR, f), 'utf8')) as ProjectGraph;
      return { id: p.id, name: p.name, updatedAt: p.updatedAt };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadProject(id: string): ProjectGraph | null {
  try {
    return JSON.parse(readFileSync(join(PROJECTS_DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export function saveProject(p: ProjectGraph): void {
  p.updatedAt = new Date().toISOString();
  writeFileSync(join(PROJECTS_DIR, `${p.id}.json`), JSON.stringify(p, null, 2));
}
