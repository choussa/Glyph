/**
 * Persisted preferences, resolved across four scopes.
 *
 * The reference app stores settings at several levels and reconciles them into
 * one object. Its GraphQL contract shows two persisted scopes — `updateUser`
 * and `updateProject` both take a JSON `settings` string
 * (`typst-app-auth/export/bundle/graphql-documents.txt`, `EditSettingsMutation`)
 * — sitting on top of a per-editor store and the build-time defaults. This
 * module models all four:
 *
 * | Scope | Lives in | Example |
 * | --- | --- | --- |
 * | `global` | compiled in (`DEFAULT_SETTINGS`) | the fallback for everything |
 * | `local-editor` | this browser, unconditionally | pane widths, split position |
 * | `cloud-user` | the signed-in profile | theme, font, editor behaviour |
 * | `cloud-project` | one project | zoom, follow-cursor |
 *
 * Every setting has one **owning** scope (`SETTING_SCOPES`). Reading walks from
 * the owner's layer down to `local-editor` and takes the first layer that
 * defines the key, so a value set before signing in still applies afterwards.
 * Writing targets the highest *available* layer at or below the owner, so an
 * unauthenticated editor degrades exactly to the old single-blob behaviour.
 *
 * In this build every non-global layer is browser storage (there is no account
 * service yet); the split is real, the transport is local. That is why the
 * panel's wording stays "this browser".
 */
import type { PanelId } from './panels/registry';
import type { ZoomMode } from './preview/zoom';

/** How the editor and preview share the window. */
export type Layout = 'split' | 'vertical' | 'editor' | 'preview';

export interface Settings {
  theme: 'light' | 'dark';
  layout: Layout;
  /** Fraction of the split given to the editor. */
  splitRatio: number;
  /** Width of the icon rail, in pixels. */
  railWidth: number;
  /** Width of the side panel, in pixels. */
  panelWidth: number;
  /** The open side panel, or null when collapsed. */
  panel: PanelId | null;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wrap: boolean;
  lineNumbers: boolean;
  highlightActiveLine: boolean;
  showToolbar: boolean;
  showTabBar: boolean;
  showStatusBar: boolean;
  follow: boolean;
  zoomMode: ZoomMode;
  scale: number;
  /** Whether the preview opens in a separate window-sized overlay. */
  previewPopup: boolean;
}

/** A level a setting can be stored at, lowest precedence first. */
export type SettingsScope = 'global' | 'local-editor' | 'cloud-user' | 'cloud-project';

/** A scope that owns a storage layer. `global` is compiled in, not stored. */
export type StorageScope = Exclude<SettingsScope, 'global'>;

const RANK: Record<SettingsScope, number> = {
  global: 0,
  'local-editor': 1,
  'cloud-user': 2,
  'cloud-project': 3,
};

/**
 * Which scope owns each setting.
 *
 * Editor behaviour follows the person (`cloud-user`); how *this document* is
 * viewed belongs to the project; window arithmetic — where the splitter sits,
 * which panel is open — is a property of this machine, not of the account.
 */
export const SETTING_SCOPES: Record<keyof Settings, SettingsScope> = {
  theme: 'cloud-user',
  fontSize: 'cloud-user',
  lineHeight: 'cloud-user',
  tabSize: 'cloud-user',
  wrap: 'cloud-user',
  lineNumbers: 'cloud-user',
  highlightActiveLine: 'cloud-user',
  showToolbar: 'cloud-user',
  showTabBar: 'cloud-user',
  showStatusBar: 'cloud-user',

  follow: 'cloud-project',
  zoomMode: 'cloud-project',
  scale: 'cloud-project',

  layout: 'local-editor',
  splitRatio: 'local-editor',
  railWidth: 'local-editor',
  panelWidth: 'local-editor',
  panel: 'local-editor',
  previewPopup: 'local-editor',
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  layout: 'split',
  splitRatio: 0.5,
  railWidth: 48,
  panelWidth: 260,
  panel: 'files',
  fontSize: 14,
  lineHeight: 1.65,
  tabSize: 2,
  wrap: true,
  lineNumbers: true,
  highlightActiveLine: true,
  showToolbar: true,
  showTabBar: true,
  showStatusBar: true,
  follow: true,
  zoomMode: 'fit-width',
  scale: 1,
  previewPopup: false,
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

/** Which scopes a context can actually store to, highest precedence first. */
export interface SettingsContext {
  /** A stable id for the signed-in profile, or null/absent when signed out. */
  user?: string | null;
  /** The open project id, or null/absent when none is open. */
  projectId?: string | null;
}

/** Kept for compatibility with blobs written by earlier builds. */
const LOCAL_KEY = 'glyph.settings.v1';
const userKey = (user: string): string => `glyph.user-settings.v1:${user}`;
const projectKey = (id: string): string => `glyph.project-settings.v1:${id}`;

interface Layer {
  scope: StorageScope;
  key: string;
  value: Partial<Settings>;
}

/** Read one layer; `{}` when it is absent, corrupt, or unreadable. */
function readLayer(key: string): Partial<Settings> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Partial<Settings>;
  } catch {
    return {};
  }
}

/**
 * Merge into one layer.
 *
 * Merging rather than replacing is deliberate: when a value moves up to a
 * higher scope, the lower layer keeps its copy, so it resurfaces if the profile
 * or project layer is later cleared — and a value set before signing in is not
 * silently dropped.
 */
function writeLayer(key: string, value: Partial<Settings>): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...readLayer(key), ...value }));
  } catch {
    /* storage unavailable */
  }
}

function removeLayer(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** The storage layers a context provides, highest precedence first. */
function activeLayers(context: SettingsContext): Layer[] {
  const layers: Layer[] = [];
  if (context.projectId) {
    const key = projectKey(context.projectId);
    layers.push({ scope: 'cloud-project', key, value: readLayer(key) });
  }
  if (context.user) {
    const key = userKey(context.user);
    layers.push({ scope: 'cloud-user', key, value: readLayer(key) });
  }
  layers.push({ scope: 'local-editor', key: LOCAL_KEY, value: readLayer(LOCAL_KEY) });
  return layers;
}

/** The scopes a context can store to, highest precedence first. */
export function activeScopes(context: SettingsContext = {}): StorageScope[] {
  return activeLayers(context).map((layer) => layer.scope);
}

/** The scope that owns a setting. */
export function scopeOf(key: keyof Settings): SettingsScope {
  return SETTING_SCOPES[key];
}

/**
 * Resolve the effective settings for a context.
 *
 * With no context this is the historical behaviour: one browser-local blob over
 * the defaults.
 */
export function loadSettings(context: SettingsContext = {}): Settings {
  const layers = activeLayers(context);
  const settings = { ...DEFAULT_SETTINGS };
  const target = settings as unknown as Record<string, unknown>;

  for (const key of SETTINGS_KEYS) {
    const owner = RANK[SETTING_SCOPES[key]];
    for (const layer of layers) {
      // A layer above the owner's scope has no say in this key.
      if (RANK[layer.scope] > owner) continue;
      if (Object.prototype.hasOwnProperty.call(layer.value, key)) {
        target[key] = layer.value[key];
        break;
      }
    }
  }
  return settings;
}

/**
 * Persist settings to the highest available layer at or below each key's owner.
 *
 * A signed-in user editing with a project open therefore writes editor
 * behaviour to the profile and view settings to the project, while an
 * anonymous editor writes everything to this browser.
 */
export function saveSettings(settings: Settings, context: SettingsContext = {}): void {
  const layers = activeLayers(context);
  const groups = new Map<StorageScope, Partial<Settings>>();

  for (const key of SETTINGS_KEYS) {
    const owner = RANK[SETTING_SCOPES[key]];
    const destination = layers.find((layer) => RANK[layer.scope] <= owner) ?? layers[0]!;
    const group = groups.get(destination.scope) ?? {};
    (group as unknown as Record<string, unknown>)[key] = settings[key];
    groups.set(destination.scope, group);
  }

  for (const layer of layers) {
    const group = groups.get(layer.scope);
    if (group) writeLayer(layer.key, group);
  }
}

/** Clear every layer this context can see. */
export function clearSettings(context: SettingsContext = {}): void {
  for (const layer of activeLayers(context)) removeLayer(layer.key);
}
