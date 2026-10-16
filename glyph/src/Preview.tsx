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
import { PreviewNavigator, type CompileResult, type TypstProject } from '@vedivad/typst-web-service';
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
      navRef.current = null;
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

    (async () => {
      let pages;
      try {
        pages = await project.renderedPages(0, result.pages.length);
      } catch {
        return;
      }
      if (cancelled) return;

      const fragment = document.createDocumentFragment();
      const boxes: RenderedPage[] = [];

      for (const page of pages) {
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

        fragment.appendChild(wrapper);
        boxes.push({ element: wrapper, width: page.width, height: page.height });
      }

      // The scroller is owned imperatively (React renders no children into it).
      scroller.replaceChildren(fragment);
      scroller.scrollTop = previousScroll;
      pagesRef.current = boxes;
      setPageBox(boxes[0] ? { width: boxes[0].width, height: boxes[0].height } : null);
      setRendered(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [project, result]);

  /* ------------------------------------------------------------------ zoom */

  const scale = computeScale(zoomMode, manualScale, container, pageBox);

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
