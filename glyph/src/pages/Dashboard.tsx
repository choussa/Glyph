import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, navigate } from '../router';
import { Icon } from '../ui/Icon';
import { useRenderServer } from '../render/useRenderServer';
import {
  TEMPLATES,
  createProject,
  findProject,
  formatBytes,
  loadProjects,
  loadUser,
  signOut,
  storageBytes,
  type Project,
  type TemplateId,
} from '../product/data';

type Filter = 'all' | 'recent';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <Link to={`/project/${project.id}`} className="project-row">
      <span className="project-lead">
        <span className={`doc-thumb doc-thumb-${project.template}`} aria-hidden="true">
          <span className="doc-thumb-title">{project.excerpt[0]}</span>
          <span className="doc-thumb-rule" />
          <span className="doc-thumb-line" />
          <span className="doc-thumb-line doc-thumb-short" />
          <span className="doc-thumb-line" />
          <span className="doc-thumb-line doc-thumb-short" />
        </span>
        <span className="doc-name">
          <strong>{project.title}</strong>
          <span>{project.template} · local project</span>
        </span>
      </span>
      <span className="project-cell project-edited">{project.edited}</span>
      <span className="project-cell project-pages">{project.pages} pp</span>
      <span className="project-cell project-words">{project.words.toLocaleString()} words</span>
      <span className="project-open" aria-hidden="true">
        <Icon name="arrow-right" size={15} />
      </span>
    </Link>
  );
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [storage, setStorage] = useState(() => storageBytes());
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const user = loadUser();
  const server = useRenderServer();

  useEffect(() => {
    setStorage(storageBytes());
  }, [projects]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    };
    const onPointer = (event: MouseEvent) => {
      const node = event.target as Node;
      if (menuOpen && menuRef.current && !menuRef.current.contains(node)) setMenuOpen(false);
      if (accountOpen && accountRef.current && !accountRef.current.contains(node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [menuOpen, accountOpen]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = projects.filter((project) =>
      needle ? project.title.toLowerCase().includes(needle) : true,
    );
    return filter === 'recent' ? filtered.slice(0, 3) : filtered;
  }, [projects, filter, query]);

  const startProject = (template: TemplateId) => {
    const project = createProject('Untitled document', template);
    setProjects(loadProjects());
    setMenuOpen(false);
    navigate(`/project/${project.id}`);
  };

  const openFirst = () => {
    const project = projects[0] ?? findProject('attention');
    navigate(`/project/${project.id}`);
  };

  const used = Math.min(100, Math.round((storage / (5 * 1024 * 1024)) * 100));

  return (
    <div className="dash">
      <aside className="dash-side">
        <Link to="/" className="dash-brand" aria-label="glyph home">
          <span className="yc-mark">g</span>
          <span>glyph</span>
        </Link>

        <nav className="dash-nav" aria-label="Workspace">
          <span className="dash-nav-label">Workspace</span>
          <Link to="/dashboard" className="dash-nav-item is-active">
            <Icon name="files" size={16} />
            Projects
            <span className="dash-nav-count">{projects.length}</span>
          </Link>
          <a href="#templates" className="dash-nav-item">
            <Icon name="layers" size={16} />
            Templates
          </a>
          <a href="#engine" className="dash-nav-item">
            <Icon name="issues" size={16} />
            Engine
            <span
              className={`service-dot service-${server.state.status}`}
              aria-label={server.state.status}
            />
          </a>
        </nav>

        <div className="dash-side-foot">
          <div className="storage-block">
            <div className="storage-head">
              <span>Local storage</span>
              <span>{formatBytes(storage)}</span>
            </div>
            <div className="storage-bar" role="presentation">
              <span style={{ width: `${used}%` }} />
            </div>
            <p>Your files stay in this browser. Nothing is uploaded.</p>
          </div>

          <div className="account" ref={accountRef}>
            <button
              type="button"
              className="account-button"
              onClick={() => setAccountOpen((value) => !value)}
              aria-expanded={accountOpen}
            >
              <span className="avatar">{user ? initials(user.name) : 'DM'}</span>
              <span className="account-name">
                <strong>{user?.name ?? 'Demo workspace'}</strong>
                <span>{user?.email ?? 'Local only'}</span>
              </span>
              <Icon name="chevron-down" size={13} />
            </button>
            {accountOpen && (
              <div className="account-menu" role="menu">
                {user ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      signOut();
                      navigate('/');
                    }}
                  >
                    Sign out
                  </button>
                ) : (
                  <Link to="/signin" role="menuitem">
                    Sign in
                  </Link>
                )}
                <Link to="/signup" role="menuitem">
                  Create an account
                </Link>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-top">
          <div className="dash-search">
            <Icon name="search" size={15} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search projects"
              aria-label="Search projects"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/</kbd>
          </div>
          <div className="dash-top-actions">
            <span className="dash-crumb">Projects</span>
            <div className="new-project" ref={menuRef}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setMenuOpen((value) => !value)}
                aria-expanded={menuOpen}
              >
                <Icon name="plus" size={15} />
                New project
                <Icon name="chevron-down" size={12} />
              </button>
              {menuOpen && (
                <div className="new-project-menu" role="menu">
                  <span className="new-project-label">Start from</span>
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      role="menuitem"
                      onClick={() => startProject(template.id)}
                    >
                      <span>{template.name}</span>
                      <span>{template.page}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="dash-content">
          <div className="dash-heading">
            <div>
              <h1>Projects</h1>
              <p>
                {projects.length} {projects.length === 1 ? 'project' : 'projects'} ·{' '}
                {user ? `signed in locally as ${user.name}` : 'local demo workspace'}
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={openFirst}>
              Continue writing
              <Icon name="arrow-right" size={15} />
            </button>
          </div>

          <div className="filter-row">
            <div className="filter-tabs" role="tablist" aria-label="Filter projects">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={filter === 'all' ? 'is-active' : undefined}
                onClick={() => setFilter('all')}
              >
                All
                <span>{projects.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'recent'}
                className={filter === 'recent' ? 'is-active' : undefined}
                onClick={() => setFilter('recent')}
              >
                Recent
              </button>
            </div>
            <span className="filter-summary">
              {visible.length} shown{query ? ` for “${query}”` : ''}
            </span>
          </div>

          <div className="project-table" role="table" aria-label="Projects">
            <div className="project-table-head" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Edited</span>
              <span role="columnheader">Length</span>
              <span role="columnheader">Words</span>
              <span aria-hidden="true" />
            </div>
            {visible.length === 0 ? (
              <div className="empty-projects">
                <p>No project matches “{query}”.</p>
                <button type="button" className="text-link" onClick={() => setQuery('')}>
                  Clear the search
                </button>
              </div>
            ) : (
              visible.map((project) => <ProjectRow key={project.id} project={project} />)
            )}
          </div>

          <section className="template-section" id="templates">
            <header className="section-head">
              <h2>Start from a template</h2>
              <p>Every template is a real Typst document. Change anything.</p>
            </header>
            <div className="template-grid">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="template-tile"
                  onClick={() => startProject(template.id)}
                >
                  <span className={`template-page template-page-${template.id}`}>
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="template-copy">
                    <strong>{template.name}</strong>
                    <span>{template.detail}</span>
                  </span>
                  <span className="template-size">{template.page}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="engine-card" id="engine">
            <div className="engine-card-head">
              <span className="engine-card-title">Render service</span>
              <span className={`engine-state engine-${server.state.status}`}>
                <span className="service-dot" />
                {server.state.status === 'online'
                  ? 'Online'
                  : server.state.status === 'offline'
                    ? 'Offline'
                    : 'Checking'}
              </span>
            </div>
            {server.state.status === 'online' ? (
              <dl className="engine-facts">
                <div>
                  <dt>Engine</dt>
                  <dd>typst.ts {server.state.health.engine.version}</dd>
                </div>
                <div>
                  <dt>Workers</dt>
                  <dd>{server.state.health.pool.size}</dd>
                </div>
                <div>
                  <dt>Cache</dt>
                  <dd>{Math.round(server.state.health.cache.maxBytes / 1024 / 1024)} MB</dd>
                </div>
              </dl>
            ) : (
              <p className="engine-offline">
                Server exports are unavailable. The editor, preview and browser PDF export
                keep working because they run on your machine.
              </p>
            )}
            <div className="engine-actions">
              <button type="button" className="btn btn-outline" onClick={() => server.refresh()}>
                <Icon name="refresh" size={14} />
                Refresh
              </button>
              <Link to="/project/attention" className="text-link">
                Open the editor <Icon name="arrow-right" size={13} />
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
