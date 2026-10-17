/**
 * The preview pane.
 *
 * Pages are rendered by the engine on demand and inserted as SVG. Two details
 * matter for how it feels:
 *
 * - **Rendering is decoupled from zoom.** Pages are fetched once per compile;
 *   changing the zoom only rewrites each page's width. Zooming therefore never
 *   re-invokes the compiler or re-lays-out the document.
 * - **A `PreviewNavigator` owns the inverse mapping.** An SVG cannot tell you
 *   which source range a click came from, so the engine's navigator supplies
 *   click-to-source and scroll-to-source.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  PreviewNavigator,
  type CompileResult,
  type RenderedSvgPage,
  type TypstProject,
} from '@vedivad/typst-web-service';
import { PT_TO_PX, computeScale, type PageBox, type ZoomMode } from './preview/zoom';
import { Icon } from './ui/Icon';

export interface PreviewProps {
  project: TypstProject;
  result: CompileResult | null;
  zoomMode: ZoomMode;
  manualScale: number;
  /** Reports the scale actually in use, so the toolbar can display it. */
  onScaleChange: (scale: number) => void;
  /** Click-to-source: the engine resolved a click in the preview to a location. */
  onSource: (file: string, line: number, column: number) => void;
  /** Filled in with the navigator so the host can drive `scrollToSource`. */
  navRef: RefObject<PreviewNavigator | null>;
}

interface RenderedPage {
  element: HTMLElement;
  width: number;
  height: number;
  /**
   * A canonical form of the page's SVG (see `pageSignature`). Two compiles that
   * leave a page byte-for-byte equivalent produce the same signature, so the
   * page's DOM node can be kept instead of torn down and rebuilt.
   */
  signature: string;
}

/**
 * Canonical form of a rendered page for change detection.
 *
 * Typst names its SVG glyphs with generated ids, and re-rendering can hand the
 * same page different ids, so comparing raw markup would rebuild every page on
 * every compile. Mapping each id to its first-seen ordinal erases that noise:
 * two renders of the same page normalize to the same string.
 */
function pageSignature(svg: string): string {
  const seen = new Map<string, string>();
  return svg.replace(/(id="|href="#)([A-Za-z0-9_-]+)/g, (_match, lead: string, id: string) => {
    let canonical = seen.get(id);
    if (canonical === undefined) {
      canonical = `p${seen.size}`;
      seen.set(id, canonical);
    }
    return lead + canonical;
  });
}

/** Build one page node — the engine's SVG plus a page-number badge. */
function createPage(page: RenderedSvgPage, scale: number): RenderedPage {
  const wrapper = document.createElement('div');
  wrapper.className = 'page';
  wrapper.dataset.index = String(page.index);
  wrapper.innerHTML = page.svg;

  const svg = wrapper.querySelector('svg');
  if (svg) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';
  }

  const badge = document.createElement('span');
  badge.className = 'page-number';
  badge.textContent = String(page.index + 1);
  wrapper.appendChild(badge);

  // Size it now rather than waiting for the zoom effect, so a freshly built
  // page is never painted at the wrong width.
  wrapper.style.width = `${(page.width * PT_TO_PX * scale).toFixed(2)}px`;

  return { element: wrapper, width: page.width, height: page.height, signature: pageSignature(page.svg) };
}

/** The rendered page whose top edge sits closest to the scroller's top edge. */
function nearestPage(scroller: HTMLElement, pages: RenderedPage[]): HTMLElement | null {
  const top = scroller.getBoundingClientRect().top;
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const page of pages) {
    const distance = Math.abs(page.element.getBoundingClientRect().top - top);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = page.element;
    }
  }
  return best;
}

export function Preview({
  project,
  result,
  zoomMode,
  manualScale,
  onScaleChange,
  onSource,
  navRef,
}: PreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<RenderedPage[]>([]);
  const scaleRef = useRef(1);
  const onSourceRef = useRef(onSource);
  onSourceRef.current = onSource;

  const [rendered, setRendered] = useState(false);
  const [pageBox, setPageBox] = useState<PageBox | null>(null);
  const [container, setContainer] = useState<PageBox>({ width: 0, height: 0 });
  const [currentPage, setCurrentPage] = useState(1);

  /* ------------------------------------------------------- click-to-source */

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // `listen: false` — the navigator still owns the inverse mapping and the
    // scroll helpers, but we route clicks ourselves so we can nudge the point.
    const navigator = PreviewNavigator.create({
      project,
      scroller,
      pages: () => scroller.querySelectorAll('.page'),
      listen: false,
      onSource: (file, line, column) => onSourceRef.current(file, line, column),
      onUrl: (url) => window.open(url, '_blank', 'noopener'),
    });
    navRef.current = navigator;

    // The engine resolves a click only when the point falls inside a text run's
    // box, and consecutive lines are ~21 pt apart with only ~11 pt of ink — so a
    // click in the leading resolves nothing. Probe outward from the click so a
    // near-miss still reaches the nearest line. Ordered by distance; the first
    // hit wins.
    const NUDGE = [0, -3, 3, -6, 6, -9, 9, -12, 12, -16, 16];

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const hit = navigator.pointToPage(event.clientX, event.clientY);
      if (!hit) return;
      void (async () => {
        for (const dy of NUDGE) {
          const jump = await project.clickJump(hit.page, hit.x, hit.y + dy);
          if (!jump) continue;
          if (jump.kind === 'source') {
            onSourceRef.current(jump.file, jump.line, jump.column);
          } else if (jump.kind === 'url') {
            window.open(jump.url, '_blank', 'noopener');
          } else {
            navigator.scrollToPosition(jump.page, jump.y);
          }
          return;
        }
      })();
    };

    scroller.addEventListener('click', onClick);
    return () => {
      scroller.removeEventListener('click', onClick);
      // Only clear the host's ref if it still points at *this* navigator: the
      // pane preview and the popup preview can mount/unmount around each other,
      // and an unconditional `navRef.current = null` would clobber the survivor.
      if (navRef.current === navigator) navRef.current = null;
      navigator.dispose();
    };
  }, [project, navRef]);

  /* --------------------------------------------------------- container size */

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainer({ width: rect.width, height: rect.height });
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  /* ----------------------------------------------------------- page render */

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !result) return;

    let cancelled = false;
    const previousScroll = scroller.scrollTop;

    // Anchor the viewport to the page nearest the top edge. Reusing that page's
    // node and measuring it again after the update lets us cancel any shift
    // caused by reflow above it, so the text under the reader stays put.
    const anchor = nearestPage(scroller, pagesRef.current);
    const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;

    (async () => {
      let pages;
      try {
        pages = await project.renderedPages(0, result.pages.length);
      } catch {
        return;
      }
      if (cancelled) return;

      const previous = pagesRef.current;
      const boxes: RenderedPage[] = pages.map((page, index) => {
        const prior = previous[index];
        const signature = pageSignature(page.svg);

        // An unchanged page keeps its node (and its painted pixels); only the
        // pages a compile actually changed are rebuilt. This is what stops the
        // whole preview from flashing on every keystroke.
        if (prior && prior.signature === signature) {
          prior.width = page.width;
          prior.height = page.height;
          return prior;
        }

        const next = createPage(page, scaleRef.current);
        if (prior) scroller.replaceChild(next.element, prior.element);
        else scroller.appendChild(next.element);
        return next;
      });

      // Drop any pages the new compile no longer has.
      for (let i = pages.length; i < previous.length; i++) previous[i].element.remove();

      pagesRef.current = boxes;

      if (anchor?.isConnected) {
        const shift = anchor.getBoundingClientRect().top - anchorTop;
        if (shift) scroller.scrollTop += shift;
      } else {
        scroller.scrollTop = previousScroll;
      }

      const first = boxes[0];
      setPageBox((prev) =>
        (prev?.width ?? null) === (first?.width ?? null) &&
        (prev?.height ?? null) === (first?.height ?? null)
          ? prev
          : first
            ? { width: first.width, height: first.height }
            : null,
      );
      setRendered(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [project, result]);

  /* ------------------------------------------------------------------ zoom */

  const scale = computeScale(zoomMode, manualScale, container, pageBox);
  scaleRef.current = scale;

  useEffect(() => {
    for (const page of pagesRef.current) {
      page.element.style.width = `${(page.width * PT_TO_PX * scale).toFixed(2)}px`;
    }
  }, [scale, pageBox]);

  useEffect(() => {
    onScaleChange(scale);
  }, [scale, onScaleChange]);

  /* -------------------------------------------------------- current page */

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const top = scroller.getBoundingClientRect().top;
        let nearest = 1;
        let best = Infinity;
        for (const page of pagesRef.current) {
          const distance = Math.abs(page.element.getBoundingClientRect().top - top);
          if (distance < best) {
            best = distance;
            nearest = Number(page.element.dataset.index ?? '0') + 1;
          }
        }
        setCurrentPage(nearest);
      });
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const totalPages = result?.pages.length ?? 0;

  return (
    <div className="preview-wrap">
      <div className="preview-scroller" ref={scrollerRef} />

      {!rendered && (
        <div className="preview-empty">
          <span className="spinner" />
          Compiling…
        </div>
      )}

      {rendered && totalPages === 0 && (
        <div className="preview-empty">
          <Icon name="info" size={18} />
          This document produced no pages.
        </div>
      )}

      {rendered && totalPages > 1 && (
        <div className="preview-page-indicator" role="status">
          {currentPage} / {totalPages}
        </div>
      )}
    </div>
  );
}
