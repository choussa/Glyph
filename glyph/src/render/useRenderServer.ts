import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RenderClient, type HealthReport } from './client';

export type ServerState =
  | { status: 'checking' }
  | { status: 'online'; health: HealthReport }
  | { status: 'offline'; reason: string };

/** How often the toolbar re-checks the service. One cheap request. */
const POLL_MS = 20_000;

/**
 * Tracks whether the render service is reachable.
 *
 * The editor is fully functional without it — the browser engine compiles
 * everything the user sees while typing. This only gates the server-backed
 * actions, so a missing service degrades rather than breaks.
 */
export function useRenderServer(): {
  client: RenderClient;
  state: ServerState;
  refresh: () => void;
} {
  const client = useMemo(() => new RenderClient(), []);
  const [state, setState] = useState<ServerState>({ status: 'checking' });
  const inFlight = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const health = await client.health(controller.signal);
      if (!controller.signal.aborted) setState({ status: 'online', health });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setState({ status: 'offline', reason: (error as Error).message });
    }
  }, [client]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => {
      window.clearInterval(timer);
      inFlight.current?.abort();
    };
  }, [check]);

  const refresh = useCallback(() => void check(), [check]);

  return { client, state, refresh };
}
