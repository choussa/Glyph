/**
 * The file-format registry.
 *
 * Transcribed from the reference app's production bundle
 * (`typst-app-auth/export/bundle/index-PUyMOzys.js`, `fileFormats`), because
 * "which files can I add to a project" is product behaviour, not a guess. Three
 * acceptance classes exist:
 *
 * - `multiplayable` — a text source the editor can open (Typst, Markdown, CSV,
 *   XML, BibTeX, …).
 * - `blob` — a binary asset the engine can read (`#image`, fonts, PDFs, …).
 * - `forbidden` — refused outright: executables, archives, disk images.
 *
 * Two extensions are intentionally listed twice in the reference table (`.tex`
 * as TeX and LaTeX). The first entry wins here, matching a first-match lookup.
 *
 * `conversionName` marks a format the reference app converts to Typst on import
 * (LaTeX, Markdown, DOCX, ODT). glyph ships no converters yet, so a *binary*
 * container with a conversion (DOCX/ODT) is refused rather than imported as
 * mojibake; text formats with a conversion (Markdown, TeX) open as-is.
 */

export type Acceptance = 'multiplayable' | 'blob' | 'forbidden';

export interface FileFormat {
  name: string;
  /** Lowercase, without the dot. */
  extensions: readonly string[];
  mimeTypes: readonly string[];
  acceptance: Acceptance;
  /** The reference app converts this format to Typst on import. */
  conversionName?: 'latex' | 'markdown' | 'docx' | 'odt';
  /** Usable as a project avatar in the reference app. */
  avatar?: boolean;
}

/** A hard client-side cap, mirroring the server's `FILE_TOO_LARGE` class. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const FILE_FORMATS: readonly FileFormat[] = [
  {
    name: 'PDF',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    acceptance: 'blob',
  },
  {
    name: 'PostScript',
    extensions: ['ps', 'eps', 'ai'],
    mimeTypes: ['application/postscript'],
    acceptance: 'blob',
  },
  {
    name: 'JSON',
    extensions: ['json'],
    mimeTypes: ['application/json'],
    acceptance: 'multiplayable',
  },
  {
    name: 'XML',
    extensions: ['xml', 'csl'],
    mimeTypes: ['application/xml', 'text/xml'],
    acceptance: 'multiplayable',
  },
  {
    name: 'TOML',
    extensions: ['toml'],
    mimeTypes: ['application/toml'],
    acceptance: 'multiplayable',
  },
  {
    name: 'TeX',
    extensions: ['tex'],
    mimeTypes: ['application/x-tex'],
    conversionName: 'latex',
    acceptance: 'multiplayable',
  },
  {
    name: 'LaTeX',
    extensions: ['latex', 'tex'],
    mimeTypes: ['application/x-latex'],
    conversionName: 'latex',
    acceptance: 'multiplayable',
  },
  {
    name: 'BibTeX',
    extensions: ['bib', 'bibtex'],
    mimeTypes: ['application/x-bibtex'],
    acceptance: 'multiplayable',
  },
  {
    name: 'BMP',
    extensions: ['bmp'],
    mimeTypes: ['image/bmp'],
    acceptance: 'forbidden',
  },
  {
    name: 'GIF',
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    acceptance: 'blob',
    avatar: true,
  },
  {
    name: 'JPEG',
    extensions: ['jpg', 'jpeg', 'jpe'],
    mimeTypes: ['image/jpeg'],
    acceptance: 'blob',
    avatar: true,
  },
  {
    name: 'PNG',
    extensions: ['png'],
    mimeTypes: ['image/png'],
    acceptance: 'blob',
    avatar: true,
  },
  {
    name: 'SVG',
    extensions: ['svg'],
    mimeTypes: ['image/svg+xml', 'application/xml'],
    acceptance: 'blob',
  },
  {
    name: 'TIFF',
    extensions: ['tiff', 'tif'],
    mimeTypes: ['image/tiff'],
    acceptance: 'blob',
  },
  {
    name: 'CSV',
    extensions: ['csv', 'tsv'],
    mimeTypes: ['text/csv', 'text/tab-separated-values'],
    acceptance: 'multiplayable',
  },
  {
    name: 'CBOR',
    extensions: ['cbor'],
    mimeTypes: ['application/cbor'],
    acceptance: 'blob',
  },
  {
    name: 'HTML',
    extensions: ['html', 'htm', 'shtml'],
    mimeTypes: ['text/html'],
    acceptance: 'multiplayable',
  },
  {
    name: 'Markdown',
    extensions: ['md', 'markdown'],
    mimeTypes: ['text/markdown'],
    conversionName: 'markdown',
    acceptance: 'multiplayable',
  },
  {
    name: 'Plain Text',
    extensions: ['txt'],
    mimeTypes: ['text/plain'],
    acceptance: 'multiplayable',
  },
  {
    name: 'Typst',
    extensions: ['typ'],
    mimeTypes: ['text/vnd.typst'],
    acceptance: 'multiplayable',
  },
  {
    name: 'YAML',
    extensions: ['yml', 'yaml'],
    mimeTypes: ['application/yaml', 'text/x-yaml'],
    acceptance: 'multiplayable',
  },
  {
    name: 'HEIF',
    extensions: ['heif', 'heic'],
    mimeTypes: ['image/heif'],
    acceptance: 'blob',
  },
  {
    name: 'WebP',
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    acceptance: 'blob',
  },
  {
    name: 'AVIF',
    extensions: ['avif'],
    mimeTypes: ['image/avif'],
    acceptance: 'blob',
  },
  {
    name: 'TrueType',
    extensions: ['ttf', 'ttc'],
    mimeTypes: ['font/ttf'],
    acceptance: 'blob',
  },
  {
    name: 'OpenType',
    extensions: ['otf', 'otc'],
    mimeTypes: ['font/otf'],
    acceptance: 'blob',
  },
  {
    name: 'TextMate Theme',
    extensions: ['tmtheme'],
    mimeTypes: ['text/vnd.tmtheme+xml'],
    acceptance: 'multiplayable',
  },
  {
    name: 'Sublime Text Syntax',
    extensions: ['sublime-syntax'],
    mimeTypes: ['application/vnd.sublime-syntax+yaml'],
    acceptance: 'multiplayable',
  },
  {
    name: 'WebAssembly',
    extensions: ['wasm'],
    mimeTypes: ['application/wasm'],
    acceptance: 'blob',
  },
  {
    name: 'Microsoft Word (.docx)',
    extensions: ['docx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    conversionName: 'docx',
    acceptance: 'blob',
  },
  {
    name: 'OpenDocument Text (.odt)',
    extensions: ['odt'],
    mimeTypes: ['application/vnd.oasis.opendocument.text'],
    conversionName: 'odt',
    acceptance: 'blob',
  },
  {
    name: 'Windows executable',
    extensions: ['exe', 'dll', 'com', 'bat', 'msi'],
    mimeTypes: [
      'application/vnd.microsoft.portable-executable',
      'application/x-msdownload',
    ],
    acceptance: 'forbidden',
  },
  {
    name: 'ELF executable',
    extensions: ['so', 'o'],
    mimeTypes: ['application/x-elf'],
    acceptance: 'forbidden',
  },
  {
    name: 'MacOS app',
    extensions: ['pkg', 'dmg', 'macho'],
    mimeTypes: [
      'application/x-apple-diskimage',
      'application/x-xar',
      'application/x-mach-binary',
    ],
    acceptance: 'forbidden',
  },
  {
    name: 'ZIP archive',
    extensions: ['zip'],
    mimeTypes: ['application/zip'],
    acceptance: 'forbidden',
  },
  {
    name: 'RAR archive',
    extensions: ['rar'],
    mimeTypes: ['application/vnd.rar', 'application/x-rar-compressed'],
    acceptance: 'forbidden',
  },
  {
    name: 'TAR archive',
    extensions: ['tar'],
    mimeTypes: [
      'application/x-tar',
      'application/x-gzip-compressed-tar',
      'application/x-lzip-compressed-tar',
    ],
    acceptance: 'forbidden',
  },
  {
    name: 'GZip archive',
    extensions: ['gz'],
    mimeTypes: ['application/gzip'],
    acceptance: 'forbidden',
  },
  {
    name: 'BZip archive',
    extensions: ['bz'],
    mimeTypes: ['application/x-bzip2'],
    acceptance: 'forbidden',
  },
  {
    name: '7z archive',
    extensions: ['7z'],
    mimeTypes: ['application/x-7z-compressed'],
    acceptance: 'forbidden',
  },
  {
    name: 'Nintendo NES ROM',
    extensions: ['nes'],
    mimeTypes: ['application/x-nintendo-nes-rom'],
    acceptance: 'forbidden',
  },
  {
    name: 'Chrome extension',
    extensions: ['crx'],
    mimeTypes: ['application/x-google-chrome-extension'],
    acceptance: 'forbidden',
  },
  {
    name: 'Cabinet archive',
    extensions: ['cab'],
    mimeTypes: ['application/vnd.ms-cab-compressed'],
    acceptance: 'forbidden',
  },
  {
    name: 'Debian package',
    extensions: ['deb'],
    mimeTypes: ['application/x-deb'],
    acceptance: 'forbidden',
  },
  {
    name: 'UNIX archive',
    extensions: ['ar', 'z'],
    mimeTypes: ['application/x-unix-archive', 'application/x-compress'],
    acceptance: 'forbidden',
  },
  {
    name: 'RPM package',
    extensions: ['rpm'],
    mimeTypes: ['application/x-rpm'],
    acceptance: 'forbidden',
  },
  {
    name: 'LZip archive',
    extensions: ['lz'],
    mimeTypes: ['application/x-lzip'],
    acceptance: 'forbidden',
  },
  {
    name: 'CFB archive',
    extensions: ['cfb'],
    mimeTypes: ['application/x-cfb'],
    acceptance: 'forbidden',
  },
];

const BY_EXTENSION = (() => {
  const map = new Map<string, FileFormat>();
  for (const format of FILE_FORMATS) {
    for (const extension of format.extensions) {
      if (!map.has(extension)) map.set(extension, format);
    }
  }
  return map;
})();

/** The extension of a file name or path, lowercased, without the dot. */
function extensionOfName(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
}

/** The registry entry for a path, or undefined for an unsupported extension. */
export function formatOf(path: string): FileFormat | undefined {
  return BY_EXTENSION.get(extensionOfName(path));
}

/** Whether the editor should treat a path as editable text. */
export function isTextPath(path: string): boolean {
  return formatOf(path)?.acceptance === 'multiplayable';
}

/** Whether a path is an explicitly disallowed format. */
export function isForbiddenPath(path: string): boolean {
  return formatOf(path)?.acceptance === 'forbidden';
}

export type UploadVerdict =
  | { ok: true; kind: 'text' | 'binary'; format: FileFormat }
  | { ok: false; reason: string };

/** Raised by the workspace when a file cannot be adopted. */
export class FileRejected extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FileRejected';
  }
}

/**
 * Decide whether an upload can enter the project, and how to store it.
 *
 * Kept as a pure function so the upload UI and the workspace apply exactly the
 * same rules.
 */
export function classifyUpload(name: string, size: number): UploadVerdict {
  const format = formatOf(name);
  if (!format) {
    return { ok: false, reason: 'This file type is not supported.' };
  }
  if (format.acceptance === 'forbidden') {
    return { ok: false, reason: `${format.name} files are not allowed.` };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `This file is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
    };
  }
  // A converter would turn these into Typst source; without one, importing the
  // container as text would only produce mojibake.
  if (format.conversionName && format.acceptance === 'blob') {
    return {
      ok: false,
      reason: `${format.name} import needs a converter that glyph does not ship yet.`,
    };
  }
  return {
    ok: true,
    kind: format.acceptance === 'multiplayable' ? 'text' : 'binary',
    format,
  };
}
