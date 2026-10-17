/**
 * A deliberately small client router.
 *
 * The product has five real routes (landing, sign in, sign up, dashboard,
 * project). A routing dependency would be more code than the routes are worth,
 * so this module owns exactly the History API surface the app needs.
 */
import {
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', emit);
}

export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  );
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (window.location.pathname === to) return;
  if (options.replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  emit();
  window.scrollTo(0, 0);
}

/** The project id for `/project/:id`, or null for every other route. */
export function projectIdFromPath(pathname: string): string | null {
  const match = /^\/project\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
}

/** An anchor that keeps middle-click, ⌘-click and "open in new tab" working. */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
