import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RenderClient, type PagesReport, type SourceBundle } from './client';

interface ServerPreviewProps {
  client: RenderClient;
  bundle: SourceBundle;
  /** Changes whenever the document changes, so the preview knows to re-render. */
  revision: number;
  onClose: () => void;
}

interface State {
  loading: boolean;
  result: PagesReport | null;
  error: string | null;
}

/** The number of diagnostics of a given severity, or 0. */
function countSeverity(report: PagesReport | null, severity: 'error' | 'warning'): number {
  if (!report) return 0;
  return report.diagnostics.filter((d) => d.severity === severity).length;
}

/**
 * The server-rendered view of the current document.
 *
 * This is the same artifact a share link would serve: pages compiled by the
 * native Typst engine on the server, with no dependency on the visitor's
 * browser. It doubles as a parity check — the pages here should be
 * indistinguishable from the local preview.
 */
export function ServerPreview({ client, bundle, revision, onClose }: ServerPreviewProps) {
  const [state, setState] = useState<State>({ loading: true, result: null, error: null });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  const load = useCallback(
    async (signal: AbortSignal) => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const result = await client.pages(bundleRef.current, signal);
        if (signal.aborted) return;
        setState({ loading: false, result, error: null });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setState({ loading: false, result: null, error: (error as Error).message });
      }
    },
    [client],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, revision]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const pages = useMemo(() => state.result?.pages ?? [], [state.result]);
  const diagnostics = state.result?.diagnostics ?? [];
  const errors = countSeverity(state.result, 'error');
  const warnings = countSeverity(state.result, 'warning');

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const fragment = document.createDocumentFragment();
    for (const page of pages) {
      const wrapper = document.createElement('div');
      wrapper.className = 'page';
      wrapper.dataset.index = String(page.index);
      wrapper.style.width = `${page.width}px`;
      wrapper.innerHTML = page.svg;
      const svg = wrapper.querySelector('svg');
      if (svg) {
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.display = 'block';
      }
      fragment.appendChild(wrapper);
    }
    scroller.replaceChildren(fragment);
  }, [pages]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Server-rendered preview">
      <header className="overlay-bar">
        <div className="overlay-title">
          <strong>Server preview</strong>
          <span className="overlay-sub">native Typst on the render service</span>
        </div>
        <div className="overlay-stats">
          {state.loading && <span className="chip">rendering…</span>}
          {state.result && (
            <>
              <span className="chip chip-accent">{state.result.ms.toFixed(1)} ms</span>
              <span className="chip">{state.result.count} pages</span>
            </>
          )}
          {state.error && <span className="chip chip-err">{state.error}</span>}
        </div>
        <button onClick={onClose} title="Close (Esc)">
          Close
        </button>
      </header>

      <div className="overlay-body">
        {state.error ? (
          <div className="overlay-message">
            <p>The render service could not render this document.</p>
            <pre>{state.error}</pre>
          </div>
        ) : state.loading && pages.length === 0 ? (
          <div className="overlay-message">
            <p>Rendering on the server…</p>
          </div>
        ) : (
          <div className="preview-scroller server-preview-scroller" ref={scrollerRef} />
        )}
      </div>
    </div>
  );
}
