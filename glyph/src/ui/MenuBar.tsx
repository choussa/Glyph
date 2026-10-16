/**
 * The application menu bar.
 *
 * Items mirror the affordances recovered from the reference editor (export
 * targets, panel toggles, scroll-preview-to-cursor) and add the ones a
 * desktop-grade editor is expected to have: new/rename/delete, undo/redo,
 * find & replace, go-to-line, and a command palette.
 *
 * Menus switch on hover once one is open, which is what every native menu bar
 * does and what makes the row feel like a single control.
 */
import { useState } from 'react';
import { Dropdown, type MenuItem } from './Menu';
import type { ZoomMode } from '../preview/zoom';
import type { PanelId } from '../panels/registry';
import type { Layout } from '../settings';

export type { Layout };

export interface MenuBarProps {
  // File
  onNewFile: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
  onDownloadProject: () => void;
  onExportBrowser: () => void;
  onExportServer: (format: 'pdf' | 'svg' | 'html' | 'vector') => void;
  onSharePreview: () => void;
  onResetWorkspace: () => void;
  // Edit
  onUndo: () => void;
  onRedo: () => void;
  onFormat: () => void;
  onFind: () => void;
  onReplace: () => void;
  onGotoLine: () => void;
  onSelectAll: () => void;
  onCommandPalette: () => void;
  // View
  panel: PanelId | null;
  onTogglePanel: (panel: PanelId) => void;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  zoomMode: ZoomMode;
  onZoomMode: (mode: ZoomMode) => void;
  scale: number;
  onScale: (scale: number) => void;
  theme: 'light' | 'dark';
  onTheme: (theme: 'light' | 'dark') => void;
  follow: boolean;
  onFollow: (value: boolean) => void;
  wrap: boolean;
  onWrap: (value: boolean) => void;
  showToolbar: boolean;
  onShowToolbar: (value: boolean) => void;
  showTabBar: boolean;
  onShowTabBar: (value: boolean) => void;
  // Help
  onShortcuts: () => void;
  onAbout: () => void;
}

export function MenuBar(props: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const file: MenuItem[] = [
    { label: 'New file…', icon: 'file', shortcut: '⌘N', onSelect: props.onNewFile },
    { label: 'New folder…', icon: 'folder', shortcut: '⇧⌘N', onSelect: props.onNewFolder },
    { label: 'Upload files…', icon: 'upload', shortcut: '⌘O', onSelect: props.onUpload },
    { kind: 'separator' },
    {
      label: 'Download project (.zip)',
      icon: 'download',
      onSelect: props.onDownloadProject,
    },
    { kind: 'separator' },
    {
      label: 'Export PDF',
      icon: 'export',
      hint: 'browser · instant',
      onSelect: props.onExportBrowser,
    },
    {
      label: 'Export PDF (server)',
      icon: 'export',
      hint: 'server',
      onSelect: () => props.onExportServer('pdf'),
    },
    { label: 'Export SVG', icon: 'export', hint: 'server', onSelect: () => props.onExportServer('svg') },
    { label: 'Export HTML', icon: 'export', hint: 'server', onSelect: () => props.onExportServer('html') },
    {
      label: 'Export vector IR',
      icon: 'export',
      hint: 'server',
      onSelect: () => props.onExportServer('vector'),
    },
    { kind: 'separator' },
    { label: 'Share preview…', icon: 'share', onSelect: props.onSharePreview },
    { kind: 'separator' },
    { label: 'Reset workspace', icon: 'refresh', danger: true, onSelect: props.onResetWorkspace },
  ];

  const edit: MenuItem[] = [
    { label: 'Undo', icon: 'undo', shortcut: '⌘Z', onSelect: props.onUndo },
    { label: 'Redo', icon: 'redo', shortcut: '⇧⌘Z', onSelect: props.onRedo },
    { kind: 'separator' },
    { label: 'Format document', icon: 'wand', shortcut: '⇧⌥F', onSelect: props.onFormat },
    { kind: 'separator' },
    { label: 'Find', icon: 'search', shortcut: '⌘F', onSelect: props.onFind },
    { label: 'Find and replace', icon: 'refresh', shortcut: '⌥⌘F', onSelect: props.onReplace },
    { label: 'Go to line…', icon: 'arrow-right', shortcut: '⌃G', onSelect: props.onGotoLine },
    { kind: 'separator' },
    { label: 'Select all', icon: 'text', shortcut: '⌘A', onSelect: props.onSelectAll },
    { label: 'Command palette…', icon: 'keyboard', shortcut: '⌘K', onSelect: props.onCommandPalette },
  ];

  const view: MenuItem[] = [
    {
      label: 'Files',
      icon: 'files',
      checked: props.panel === 'files',
      onSelect: () => props.onTogglePanel('files'),
    },
    {
      label: 'Search',
      icon: 'search',
      checked: props.panel === 'search',
      onSelect: () => props.onTogglePanel('search'),
    },
    {
      label: 'Outline',
      icon: 'outline',
      checked: props.panel === 'outline',
      onSelect: () => props.onTogglePanel('outline'),
    },
    {
      label: 'Issues',
      icon: 'issues',
      checked: props.panel === 'issues',
      onSelect: () => props.onTogglePanel('issues'),
    },
    { kind: 'separator' },
    { label: 'Split right', icon: 'split-h', checked: props.layout === 'split', onSelect: () => props.onLayout('split') },
    { label: 'Split down', icon: 'split-v', checked: props.layout === 'vertical', onSelect: () => props.onLayout('vertical') },
    { label: 'Editor only', icon: 'file', checked: props.layout === 'editor', onSelect: () => props.onLayout('editor') },
    { label: 'Preview only', icon: 'image', checked: props.layout === 'preview', onSelect: () => props.onLayout('preview') },
    { kind: 'separator' },
    { label: 'Zoom in', icon: 'zoom-in', shortcut: '⌘+', onSelect: () => props.onScale(Math.min(4, props.scale + 0.1)) },
    { label: 'Zoom out', icon: 'zoom-out', shortcut: '⌘−', onSelect: () => props.onScale(Math.max(0.1, props.scale - 0.1)) },
    { label: 'Fit width', icon: 'fit-width', checked: props.zoomMode === 'fit-width', onSelect: () => props.onZoomMode('fit-width') },
    { label: 'Fit page', icon: 'fit-page', checked: props.zoomMode === 'fit-page', onSelect: () => props.onZoomMode('fit-page') },
    { label: 'Fit height', icon: 'fit-height', checked: props.zoomMode === 'fit-height', onSelect: () => props.onZoomMode('fit-height') },
    { label: 'Actual size', icon: 'text', checked: props.zoomMode === 'manual', onSelect: () => props.onZoomMode('manual') },
    { kind: 'separator' },
    {
      label: 'Follow cursor',
      icon: 'arrow-right',
      checked: props.follow,
      onSelect: () => props.onFollow(!props.follow),
    },
    { label: 'Wrap lines', icon: 'text', checked: props.wrap, onSelect: () => props.onWrap(!props.wrap) },
    {
      label: 'Formatting toolbar',
      icon: 'wand',
      checked: props.showToolbar,
      onSelect: () => props.onShowToolbar(!props.showToolbar),
    },
    {
      label: 'Tab bar',
      icon: 'layers',
      checked: props.showTabBar,
      onSelect: () => props.onShowTabBar(!props.showTabBar),
    },
    { kind: 'separator' },
    { label: 'Dark theme', icon: 'moon', checked: props.theme === 'dark', onSelect: () => props.onTheme('dark') },
    { label: 'Light theme', icon: 'sun', checked: props.theme === 'light', onSelect: () => props.onTheme('light') },
  ];

  const help: MenuItem[] = [
    { label: 'Keyboard shortcuts', icon: 'keyboard', shortcut: '⌘/', onSelect: props.onShortcuts },
    { label: 'Typst documentation', icon: 'external', onSelect: () => window.open('https://typst.app/docs/', '_blank', 'noopener') },
    { kind: 'separator' },
    { label: 'About glyph', icon: 'info', onSelect: props.onAbout },
  ];

  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    { id: 'file', label: 'File', items: file },
    { id: 'edit', label: 'Edit', items: edit },
    { id: 'view', label: 'View', items: view },
    { id: 'help', label: 'Help', items: help },
  ];

  return (
    <nav className="menubar" aria-label="Application menu">
      {menus.map((menu) => (
        <div
          key={menu.id}
          className="menubar-slot"
          onMouseEnter={() => openMenu !== null && setOpenMenu(menu.id)}
        >
          <Dropdown
            className="menubar-menu"
            panelClassName="menu-panel-menubar"
            items={menu.items}
            open={openMenu === menu.id}
            onOpenChange={(next) => setOpenMenu(next ? menu.id : null)}
            title={menu.label}
          >
            <span className="menubar-label">{menu.label}</span>
          </Dropdown>
        </div>
      ))}
    </nav>
  );
}
