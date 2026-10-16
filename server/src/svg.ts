/**
 * Splitting a multi-page SVG into standalone per-page SVGs.
 *
 * `typst.ts` renders a whole document as a single SVG: the root carries the
 * full-page viewBox, the shared `<style>`/`<defs>` (glyph outlines) come first,
 * and each page is a `<g class="typst-page" transform="translate(0, k·h)">`
 * with its own `data-page-width`/`data-page-height`.
 *
 * To hand a UI one SVG per page we lift the shared prefix out once, then wrap
 * each page group in its own root — with the page's own viewBox and the
 * vertical translate normalised back to the origin, since a standalone page
 * starts at (0, 0).
 */

export interface SvgPage {
  index: number;
  width: number;
  height: number;
  svg: string;
}

export interface SvgDocument {
  width: number;
  height: number;
  count: number;
  pages: SvgPage[];
}

const PAGE_MARKER = '<g class="typst-page"';

/** End offset (exclusive) of the `<g>` element starting at `start`, or -1. */
function matchGroupEnd(source: string, start: number): number {
  const tokens = /<g(?=[\s/>])|<\/g>/g;
  tokens.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(source)) !== null) {
    if (match[0] === '</g>') {
      depth--;
      if (depth === 0) return match.index + match[0].length;
      continue;
    }
    // `<g … />` is self-closing and contributes no depth.
    const tagEnd = source.indexOf('>', match.index);
    if (tagEnd !== -1 && source[tagEnd - 1] === '/') continue;
    depth++;
  }
  return -1;
}

function readAttr(source: string, name: string): number {
  const match = source.match(new RegExp(`${name}="([\\d.]+)"`));
  return match ? Number(match[1]) : 0;
}

/** Re-root the document `<svg …>` tag at one page's box. */
function pageRootTag(openTag: string, width: number, height: number): string {
  return openTag
    .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${width} ${height}"`)
    .replace(/(\s)width="[^"]*"/, `$1width="${width}"`)
    .replace(/(\s)height="[^"]*"/, `$1height="${height}"`)
    .replace(/(\s)data-width="[^"]*"/, `$1data-width="${width}"`)
    .replace(/(\s)data-height="[^"]*"/, `$1data-height="${height}"`);
}

export function splitSvgPages(source: string): SvgDocument {
  const firstPage = source.indexOf(PAGE_MARKER);
  if (firstPage === -1) {
    return { width: 0, height: 0, count: 0, pages: [] };
  }

  const svgOpen = source.indexOf('<svg');
  const svgTagEnd = source.indexOf('>', svgOpen);
  const openTag = source.slice(svgOpen, svgTagEnd + 1);
  const shared = source.slice(svgTagEnd + 1, firstPage);

  const docWidth = readAttr(openTag, 'data-width') || readAttr(openTag, 'width');
  const pages: SvgPage[] = [];

  let cursor: number | undefined = firstPage;
  while (cursor !== undefined) {
    const end = matchGroupEnd(source, cursor);
    if (end === -1) break;

    let body = source.slice(cursor, end);
    const width = readAttr(body, 'data-page-width') || docWidth;
    const height = readAttr(body, 'data-page-height');

    // Page groups are stacked with a vertical translate; a standalone page is
    // positioned at the origin instead.
    body = body.replace(
      /(<g class="typst-page"[^>]*?transform="translate\()([-\d.]+)\s*,\s*([-\d.]+)(\)")/,
      (_all, head: string, x: string, _y: string, tail: string) => `${head}${x}, 0${tail}`,
    );

    pages.push({
      index: pages.length,
      width,
      height,
      svg: `${pageRootTag(openTag, width, height)}${shared}${body}</svg>`,
    });

    const next = source.indexOf(PAGE_MARKER, end);
    cursor = next === -1 ? undefined : next;
  }

  return {
    width: docWidth,
    height: readAttr(openTag, 'data-height') || readAttr(openTag, 'height'),
    count: pages.length,
    pages,
  };
}
