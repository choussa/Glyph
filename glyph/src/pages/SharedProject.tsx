/**
 * The read-only view behind a share link.
 *
 * A share token addresses a source bundle stored by the render service. This
 * page fetches the metadata and the rendered pages and shows them: no editor,
 * no source text, no way to change the document from the reader's side. That is
 * the whole point of a share link — the same contract as the reference app.
 *
 * It also works with the editor never having been opened on this machine, which
 * is what makes it a link rather than a saved document.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../router';
import { RenderClient, RenderError, type PagesReport, type ShareSummary } from '../render/client';

const renderClient = new RenderClient();

interface SharedProjectProps {
  token: string;
}

interface State {
  summary: ShareSummary | null;
  pages: PagesReport | null;
  error: { message: string; status: number } | null;
}

/** Human date for the "shared on" line; never throws on a bad record. */
function sharedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function SharedProject({ token }: SharedProjectProps) {
  const [state, setState] = useState<State>({ summary: null, pages: null, error: null });
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ summary: null, pages: null, error: null });

    void (async () => {
      try {
        // Metadata and pages come from the same stored bundle, so fetching them
        // together keeps the title and the page count consistent.
        const [summary, pages] = await Promise.all([
          renderClient.share(token, controller.signal),
          renderClient.sharePages(token, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setState({ summary, pages, error: null });
        document.title = `${summary.title} · glyph`;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        const status = error instanceof RenderError ? error.status : 0;
        setState({
          summary: null,
          pages: null,
          error: { message: (error as Error).message, status },
        });
      }
    })();

    return () => controller.abort();
  }, [token]);

  const svgPages = useMemo(() => state.pages?.pages ?? [], [state.pages]);
  const diagnostics = state.pages?.diagnostics ?? [];

  // Same injection strategy as the editor's server preview: the engine's SVG is
  // authoritative, so it is inserted as-is and only its sizing is normalised.
  useEffect(() => {
    const container = scrollerRef.current;
    if (!container) return;
    const fragment = document.createDocumentFragment();
    for (const page of svgPages) {
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
    container.replaceChildren(fragment);
  }, [svgPages]);

  const title = state.summary?.title;
  const unavailable = state.error?.status === 404;

  return (
    <div className="share-view">
      <header className="share-bar">
        <Link to="/" className="share-brand" aria-label="glyph home">
          <span className="share-mark" aria-hidden="true">
            g
          </span>
          <span>glyph</span>
        </Link>

        <div className="share-heading">
          <h1 className="share-title">{title ?? (unavailable ? 'Share link' : 'Loading…')}</h1>
          <span className="share-meta">
            Read-only
            {state.pages ? ` · ${state.pages.count} page${state.pages.count === 1 ? '' : 's'}` : ''}
            {state.summary?.updatedAt ? ` · ${sharedOn(state.summary.updatedAt)}` : ''}
          </span>
        </div>

        <div className="share-spacer" />

        {state.summary && (
          <a
            className="btn"
            href={renderClient.sharePdfUrl(token)}
            target="_blank"
            rel="noreferrer"
          >
            Download PDF
          </a>
        )}
        <Link to="/dashboard" className="btn btn-primary">
          Open glyph
        </Link>
      </header>

      <main className="share-body" aria-busy={state.pages === null && state.error === null}>
        {state.error ? (
          <div className="share-message">
            <h2>{unavailable ? 'This share link is no longer available.' : 'The shared document could not be loaded.'}</h2>
            <p>
              {unavailable
                ? 'It may have been revoked, or the link may be incomplete.'
                : state.error.message}
            </p>
            <Link to="/" className="btn">
              Back to glyph
            </Link>
          </div>
        ) : state.pages === null ? (
          <div className="share-message">
            <p>Rendering pages…</p>
          </div>
        ) : (
          <>
            {diagnostics.length > 0 && (
              <ul className="overlay-diagnostics" aria-label="Render diagnostics">
                {diagnostics.map((diagnostic, index) => (
                  <li
                    key={index}
                    className={`overlay-diagnostic diag-${diagnostic.severity}`}
                  >
                    <span className="diag-severity">{diagnostic.severity}</span>
                    <span className="diag-message">{diagnostic.message}</span>
                    {diagnostic.file && <span className="diag-file">{diagnostic.file}</span>}
                  </li>
                ))}
              </ul>
            )}
            {svgPages.length === 0 ? (
              <div className="share-message">
                <p>This document produced no pages.</p>
              </div>
            ) : (
              <div className="preview-scroller share-pages" ref={scrollerRef} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
