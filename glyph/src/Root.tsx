import { useEffect } from 'react';
import { App } from './App';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Link, projectIdFromPath, usePathname } from './router';
import { findProject } from './product/data';
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

  useEffect(() => {
    document.documentElement.dataset.theme = loadSettings().theme;
  }, []);

  useEffect(() => {
    document.title = projectId
      ? `${findProject(projectId).title} · glyph`
      : (TITLES[pathname] ?? 'glyph');
    window.scrollTo(0, 0);
  }, [pathname, projectId]);

  if (projectId) {
    return <App projectId={projectId} projectName={findProject(projectId).title} />;
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
