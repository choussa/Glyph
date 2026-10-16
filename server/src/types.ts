import type { Diagnostic } from './diagnostics.ts';

export type RenderFormat = 'pdf' | 'svg' | 'pages' | 'html' | 'vector';

/** Files to compile: text sources plus optional base64 binary assets. */
export interface SourceBundle {
  /** Project-relative path (`/main.typ`) to UTF-8 source. */
  files: Record<string, string>;
  /** Project-relative path to base64-encoded bytes (images, data files). */
  assets?: Record<string, string>;
  /** Entry file. Defaults to `/main.typ`. */
  entry?: string;
  /** `sys.inputs` visible to the document. */
  inputs?: Record<string, string>;
}

export interface RenderRequest extends SourceBundle {
  format: RenderFormat;
  /** PDF standard, e.g. `a-2b`. @see PdfStandard */
  pdfStandard?: string;
  /** Tag the PDF for accessibility. The engine defaults to `true`. */
  pdfTags?: boolean;
}

export interface QueryRequest extends SourceBundle {
  selector: string;
  field?: string;
}

export interface SvgPagePayload {
  index: number;
  width: number;
  height: number;
  svg: string;
}

export interface PagesArtifact {
  kind: 'pages';
  width: number;
  height: number;
  pages: SvgPagePayload[];
}

export type RenderArtifact = Uint8Array | string | PagesArtifact;

export interface RenderOutcome {
  /** `null` when the document produced nothing renderable (hard failure). */
  artifact: RenderArtifact | null;
  diagnostics: Diagnostic[];
  /** Page count of the compiled document. */
  pages: number;
  ms: number;
}

export interface QueryOutcome {
  result: unknown;
  diagnostics: Diagnostic[];
  ms: number;
}

/** Content types per render format. */
export const FORMAT_CONTENT_TYPE: Record<RenderFormat, string> = {
  pdf: 'application/pdf',
  svg: 'image/svg+xml; charset=utf-8',
  pages: 'application/json; charset=utf-8',
  html: 'text/html; charset=utf-8',
  vector: 'application/octet-stream',
};

export const RENDER_FORMATS = Object.keys(FORMAT_CONTENT_TYPE) as RenderFormat[];
