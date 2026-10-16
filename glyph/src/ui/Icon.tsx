/**
 * The icon set.
 *
 * Clean-room, hand-drawn geometry on a 24×24 grid: stroke icons share
 * `currentColor` and round caps so they inherit weight and colour from whatever
 * they sit in. A handful of "letter" icons (bold, italic, heading…) render a
 * glyph instead of a path — that is how every editor draws those, and it reads
 * better than an abstract shape.
 */
import type { ReactNode, SVGProps } from 'react';

export type IconName =
  // navigation & panels
  | 'files'
  | 'search'
  | 'outline'
  | 'issues'
  | 'settings'
  | 'help'
  | 'sidebar'
  | 'split-h'
  | 'split-v'
  // actions
  | 'plus'
  | 'pencil'
  | 'trash'
  | 'copy'
  | 'upload'
  | 'download'
  | 'refresh'
  | 'check'
  | 'x'
  | 'dots'
  | 'share'
  | 'export'
  | 'wand'
  | 'play'
  | 'undo'
  | 'redo'
  | 'arrow-right'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left'
  | 'external'
  // objects
  | 'file'
  | 'folder'
  | 'image'
  | 'layers'
  // view
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-width'
  | 'fit-height'
  | 'fit-page'
  | 'sun'
  | 'moon'
  // formatting
  | 'bold'
  | 'italic'
  | 'underline'
  | 'heading'
  | 'list'
  | 'ordered-list'
  | 'math'
  | 'code'
  | 'link'
  | 'comment'
  | 'text'
  // search options
  | 'case'
  | 'regex'
  | 'word'
  // alerts
  | 'alert'
  | 'info'
  | 'keyboard';

const GLYPH = {
  stroke: 'none',
  fill: 'currentColor',
  fontFamily: 'var(--ui)',
} as const;

const ICONS: Record<IconName, ReactNode> = {
  /* ---------------------------------------------------------- navigation */
  files: (
    <>
      <path d="M15 3H7a2 2 0 0 0-2 2v11" />
      <rect x="9" y="6" width="11" height="15" rx="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.6-3.6" />
    </>
  ),
  outline: (
    <>
      <path d="M4 6h16" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4.5 12h.01" />
      <path d="M4.5 18h.01" />
    </>
  ),
  issues: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.2h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h8" />
      <path d="M18 7h2" />
      <circle cx="15" cy="7" r="2.2" />
      <path d="M4 17h2" />
      <path d="M12 17h8" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.7v.4" />
      <path d="M12 17h.01" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
    </>
  ),
  'split-h': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  'split-v': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 12h18" />
    </>
  ),

  /* ------------------------------------------------------------- actions */
  plus: (
    <>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.8 6.2l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5.5 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="M8 12l4 4 4-4" />
      <path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.5 4v4h-4" />
    </>
  ),
  check: <path d="M5 13l4 4L19 7" />,
  x: (
    <>
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="17.5" cy="6" r="2.4" />
      <circle cx="17.5" cy="18" r="2.4" />
      <path d="M8.2 10.9l7.1-3.7" />
      <path d="M8.2 13.1l7.1 3.7" />
    </>
  ),
  export: (
    <>
      <path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5" />
      <path d="M9.5 8.5L6 12l3.5 3.5" />
      <path d="M6 12h9" />
    </>
  ),
  wand: (
    <>
      <path d="M4.5 19.5L14.5 9.5" />
      <path d="M13.5 8.5l2 2" />
      <path d="M17.5 3l.9 2.1L20.5 6l-2.1.9L17.5 9l-.9-2.1L14.5 6l2.1-.9z" />
    </>
  ),
  play: <path d="M7.5 4.6l12 7.4-12 7.4z" />,
  undo: (
    <>
      <path d="M9 14l-5-5 5-5" />
      <path d="M4 9h9a6.5 6.5 0 0 1 0 13h-2.5" />
    </>
  ),
  redo: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9h-9a6.5 6.5 0 0 0 0 13h2.5" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M4.5 12h14" />
      <path d="M13 6.5l5.5 5.5-5.5 5.5" />
    </>
  ),
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'chevron-left': <path d="M14.5 6l-6 6 6 6" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),

  /* ------------------------------------------------------------- objects */
  file: (
    <>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13 3v6h6" />
    </>
  ),
  folder: (
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l2 2h7.8A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 15.5l-4.5-4.5-5.5 5.5-3-3L3 18.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="M3.5 13l8.5 4.5 8.5-4.5" />
    </>
  ),

  /* ---------------------------------------------------------------- view */
  'zoom-in': (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.6-3.6" />
      <path d="M11 8.8v4.4" />
      <path d="M8.8 11h4.4" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.6-3.6" />
      <path d="M8.8 11h4.4" />
    </>
  ),
  'fit-width': (
    <>
      <path d="M3 12h18" />
      <path d="M7 8.5L3.5 12 7 15.5" />
      <path d="M17 8.5L20.5 12 17 15.5" />
    </>
  ),
  'fit-height': (
    <>
      <path d="M12 3v18" />
      <path d="M8.5 7L12 3.5 15.5 7" />
      <path d="M8.5 17L12 20.5 15.5 17" />
    </>
  ),
  'fit-page': (
    <>
      <path d="M4 9.5V6a2 2 0 0 1 2-2h3.5" />
      <path d="M20 9.5V6a2 2 0 0 0-2-2h-3.5" />
      <path d="M4 14.5V18a2 2 0 0 0 2 2h3.5" />
      <path d="M20 14.5V18a2 2 0 0 1-2 2h-3.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2" />
      <path d="M12 19.5v2" />
      <path d="M5.2 5.2l1.4 1.4" />
      <path d="M17.4 17.4l1.4 1.4" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="M5.2 18.8l1.4-1.4" />
      <path d="M17.4 6.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z" />,

  /* --------------------------------------------------------- formatting */
  bold: (
    <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="700" {...GLYPH}>
      B
    </text>
  ),
  italic: (
    <text
      x="12"
      y="17.5"
      textAnchor="middle"
      fontSize="15"
      fontStyle="italic"
      {...GLYPH}
      fontFamily="Georgia, 'Times New Roman', serif"
    >
      I
    </text>
  ),
  underline: (
    <>
      <text x="12" y="16.5" textAnchor="middle" fontSize="15" {...GLYPH}>
        U
      </text>
      <path d="M7 19.5h10" />
    </>
  ),
  heading: (
    <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="700" {...GLYPH}>
      H
    </text>
  ),
  list: (
    <>
      <path d="M9 6.5h11" />
      <path d="M9 12h11" />
      <path d="M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  'ordered-list': (
    <>
      <path d="M10 6.5h10" />
      <path d="M10 12h10" />
      <path d="M10 17.5h10" />
      <text x="4.5" y="8.6" textAnchor="middle" fontSize="7.5" {...GLYPH}>
        1
      </text>
      <text x="4.5" y="14.1" textAnchor="middle" fontSize="7.5" {...GLYPH}>
        2
      </text>
      <text x="4.5" y="19.6" textAnchor="middle" fontSize="7.5" {...GLYPH}>
        3
      </text>
    </>
  ),
  math: (
    <text x="12" y="17" textAnchor="middle" fontSize="16" {...GLYPH} fontFamily="Georgia, serif">
      ∑
    </text>
  ),
  code: (
    <>
      <path d="M9 8l-4 4 4 4" />
      <path d="M15 8l4 4-4 4" />
    </>
  ),
  link: (
    <>
      <path d="M10.5 13.5a3.8 3.8 0 0 0 5.4 0l2.8-2.8a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4" />
      <path d="M13.5 10.5a3.8 3.8 0 0 0-5.4 0l-2.8 2.8a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4" />
    </>
  ),
  comment: (
    <path d="M20 14.5a2 2 0 0 1-2 2H8.5L4.5 20V6a2 2 0 0 1 2-2h11.5a2 2 0 0 1 2 2z" />
  ),
  text: (
    <>
      <path d="M5 6h14" />
      <path d="M12 6v12.5" />
      <path d="M9 18.5h6" />
    </>
  ),

  /* ------------------------------------------------------- search flags */
  case: (
    <>
      <text x="7.5" y="17" textAnchor="middle" fontSize="12" fontWeight="600" {...GLYPH}>
        A
      </text>
      <text x="16" y="17" textAnchor="middle" fontSize="9" {...GLYPH}>
        a
      </text>
    </>
  ),
  regex: (
    <text x="12" y="16.5" textAnchor="middle" fontSize="12" {...GLYPH} fontFamily="var(--mono)">
      .*
    </text>
  ),
  word: (
    <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontWeight="600" {...GLYPH}>
      W
    </text>
  ),

  /* -------------------------------------------------------------- alerts */
  alert: (
    <>
      <path d="M12 4.2l9 15.6H3z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8h.01" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01" />
      <path d="M10 10h.01" />
      <path d="M13.5 10h.01" />
      <path d="M17 10h.01" />
      <path d="M8 14h8" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : 'icon'}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}
