import { useEffect } from 'react';
import { App } from './App';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { SharedProject } from './pages/SharedProject';
import { Link, projectIdFromPath, usePathname } from './router';
import { findProjectOrNull, isShareToken, loadUser } from './product/data';
import { loadSettings } from './settings';

const TITLES: Record<string, string> = {
  '/': 'glyph — write like a writer, compile like an engineer',
  '/signin': 'Sign in · glyph',
  '/signup': 'Create an account · glyph',
  '/dashboard': 'Projects · glyph',
};

function NotFound() {
  return (
    <div className="notfound">
      <span className="yc-mark">g</span>
      <h1>This page is not in the project.</h1>
      <p>The link may be old, or the route may never have existed.</p>
      <Link to="/" className="btn btn-primary">
        Back to glyph
      </Link>
    </div>
  );
}

export function Root() {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  const project = projectId ? findProjectOrNull(projectId) : null;

  useEffect(() => {
    // The theme may live on the signed-in profile, so resolve with the same
    // context the editor saves with.
    document.documentElement.dataset.theme = loadSettings({ user: loadUser()?.email }).theme;
  }, []);

  useEffect(() => {
    document.title = projectId
      ? project
        ? `${project.title} · glyph`
        : 'Shared document · glyph'
      : (TITLES[pathname] ?? 'glyph');
    window.scrollTo(0, 0);
    // `project` is re-read from storage on every render, so depend on its title
    // (a stable string) rather than the object identity.
  }, [pathname, projectId, project?.title]);

  if (projectId) {
    // `/project/:id` is the same route for an editable project and a share
    // token, as in the reference app. A local project id wins; a 22-char token
    // with no local project is a read-only share.
    if (project) return <App projectId={projectId} projectName={project.title} />;
    if (isShareToken(projectId)) return <SharedProject token={projectId} />;
    return <App projectId={projectId} projectName="Untitled document" />;
  }

  switch (pathname) {
    case '/':
      return <Landing />;
    case '/signin':
      return <Auth mode="signin" />;
    case '/signup':
      return <Auth mode="signup" />;
    case '/dashboard':
    case '/dashboard/':
      return <Dashboard />;
    default:
      return <NotFound />;
  }
}
