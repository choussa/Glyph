/**
 * Local product data.
 *
 * This build has no accounts or database, so the dashboard and auth flow are a
 * working local demonstration: the user record and project list live in
 * `localStorage` and the copy says so. Nothing here is presented as a hosted
 * account, a team, or a shared workspace.
 */
import { loadSettings } from '../settings';

export interface User {
  name: string;
  email: string;
}

export interface Project {
  id: string;
  title: string;
  template: TemplateId;
  edited: string;
  pages: number;
  words: number;
  /** Two or three lines of the first page, for the document thumbnail. */
  excerpt: string[];
}

export type TemplateId = 'paper' | 'thesis' | 'report' | 'notes' | 'letter' | 'slides';

export interface Template {
  id: TemplateId;
  name: string;
  detail: string;
  page: string;
}

export const TEMPLATES: Template[] = [
  { id: 'paper', name: 'Paper', detail: 'A4 · two-column ready', page: 'A4' },
  { id: 'thesis', name: 'Thesis', detail: 'Chapters, figures, TOC', page: 'A4' },
  { id: 'report', name: 'Lab report', detail: 'Methods, results, math', page: 'A4' },
  { id: 'notes', name: 'Notes', detail: 'Fast, single column', page: 'A5' },
  { id: 'letter', name: 'Letter', detail: 'Formal correspondence', page: 'Letter' },
  { id: 'slides', name: 'Slides', detail: '16:9 presentation', page: '16:9' },
];

const PROJECTS_KEY = 'glyph.projects.v1';
const USER_KEY = 'glyph.user.v1';

export const SEED_PROJECTS: Project[] = [
  {
    id: 'attention',
    title: 'On the shape of attention',
    template: 'paper',
    edited: '2 hours ago',
    pages: 12,
    words: 5840,
    excerpt: ['On the shape of attention', 'A. Rivera · Institute for Cognitive Systems', 'Abstract'],
  },
  {
    id: 'mycelium',
    title: 'Urban mycelium: field notes',
    template: 'notes',
    edited: 'Yesterday',
    pages: 34,
    words: 9120,
    excerpt: ['Urban mycelium', 'Field notes, spring cohort', 'Plot 07 — after rain'],
  },
  {
    id: 'spectroscopy',
    title: 'Lab report 04 — spectroscopy',
    template: 'report',
    edited: '3 days ago',
    pages: 6,
    words: 2140,
    excerpt: ['Lab report 04', 'Raman spectroscopy of thin films', '1. Method'],
  },
  {
    id: 'typography',
    title: 'Reading list: typography',
    template: 'notes',
    edited: 'Last week',
    pages: 18,
    words: 3760,
    excerpt: ['Reading list', 'Typography & the printed page', '— Bringhurst, 1992'],
  },
  {
    id: 'soil-carbon',
    title: 'Grant proposal — soil carbon',
    template: 'thesis',
    edited: 'Last week',
    pages: 9,
    words: 4210,
    excerpt: ['Soil carbon sequestration', 'Proposal · 2026 cycle', 'Summary of work'],
  },
  {
    id: 'small-tools',
    title: 'Conference talk: small tools',
    template: 'slides',
    edited: '2 weeks ago',
    pages: 22,
    words: 1980,
    excerpt: ['Small tools', 'A talk about editors', 'glyph — 2026'],
  },
];

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function loadUser(): User | null {
  return read<User>(USER_KEY);
}

export function saveUser(user: User): void {
  write(USER_KEY, user);
}

export function signOut(): void {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Demo projects, with any locally created ones in front. */
export function loadProjects(): Project[] {
  const stored = read<Project[]>(PROJECTS_KEY);
  if (!stored || stored.length === 0) return SEED_PROJECTS;
  const seen = new Set(stored.map((project) => project.id));
  return [...stored, ...SEED_PROJECTS.filter((project) => !seen.has(project.id))];
}

export function saveProjects(projects: Project[]): void {
  write(PROJECTS_KEY, projects);
}

export function createProject(title: string, template: TemplateId): Project {
  const project: Project = {
    id: `draft-${Date.now().toString(36)}`,
    title: title.trim() || 'Untitled document',
    template,
    edited: 'Just now',
    pages: 1,
    words: 0,
    excerpt: [title.trim() || 'Untitled document', 'Draft', ''],
  };
  const local = read<Project[]>(PROJECTS_KEY) ?? [];
  saveProjects([project, ...local]);
  return project;
}

export function findProject(id: string): Project {
  return loadProjects().find((project) => project.id === id) ?? {
    id,
    title: 'Untitled document',
    template: 'paper',
    edited: 'Just now',
    pages: 1,
    words: 0,
    excerpt: ['Untitled document', '', ''],
  };
}

/** The template a new project should open with, independent of the theme. */
export function defaultTemplate(): TemplateId {
  return 'paper';
}

/** Approximate bytes the browser is holding for this product. */
export function storageBytes(): number {
  let total = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('glyph.')) continue;
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    return 0;
  }
  return total * 2; // UTF-16 code units are two bytes.
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function currentTheme(): 'light' | 'dark' {
  return loadSettings().theme;
}
