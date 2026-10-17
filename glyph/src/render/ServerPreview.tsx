import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractOutline } from '../workspace/model';
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

/** Creating a link is a separate, explicit action from rendering the preview. */
type ShareState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string };

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

  const [share, setShare] = useState<ShareState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  /**
   * Publish the bundle and show the read-only URL.
   *
   * The first heading is the closest thing a project has to a title; a document
   * without one is still shareable and falls back to a neutral name.
   */
  const createShareLink = useCallback(async () => {
    setShare({ status: 'creating' });
    try {
      const files = bundleRef.current.files;
      const entry = bundleRef.current.entry ?? '/main.typ';
      const title = extractOutline(files[entry] ?? '')[0]?.title ?? 'Shared document';
      const created = await client.createShare(bundleRef.current, title);
      setShare({ status: 'ready', url: created.url });
    } catch (error) {
      setShare({ status: 'error', message: (error as Error).message });
    }
  }, [client]);

  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the field is still selectable.
    }
  }, []);

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
              {errors > 0 && <span className="chip chip-err">{errors} error{errors === 1 ? '' : 's'}</span>}
              {warnings > 0 && <span className="chip chip-warn">{warnings} warning{warnings === 1 ? '' : 's'}</span>}
            </>
          )}
          {state.error && <span className="chip chip-err">{state.error}</span>}
          {share.status === 'ready' ? (
            <div className="share-link">
              <input
                readOnly
                value={share.url}
                aria-label="Read-only share link"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button onClick={() => void copyLink(share.url)}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <button
              className="btn btn-share"
              onClick={() => void createShareLink()}
              disabled={share.status === 'creating'}
              title="Publish a read-only link to these pages"
            >
              {share.status === 'creating' ? 'Creating…' : 'Create link'}
            </button>
          )}
          {share.status === 'error' && <span className="chip chip-err">{share.message}</span>}
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
          <>
            {diagnostics.length > 0 && (
              <ul className="overlay-diagnostics" aria-label="Server diagnostics">
                {diagnostics.map((diag, index) => (
                  <li key={index} className={`overlay-diagnostic diag-${diag.severity}`}>
                    <span className="diag-severity">{diag.severity}</span>
                    <span className="diag-message">{diag.message}</span>
                    {diag.file && <span className="diag-file">{diag.file}</span>}
                    {diag.hints.map((hint, hintIndex) => (
                      <span key={hintIndex} className="diag-hint">
                        {hint}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            {pages.length === 0 ? (
              <div className="overlay-message">
                <p>{diagnostics.length > 0 ? 'The server produced no pages.' : 'This document produced no pages.'}</p>
              </div>
            ) : (
              <div className="preview-scroller server-preview-scroller" ref={scrollerRef} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
