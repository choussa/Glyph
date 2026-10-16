/**
 * The in-worker renderer: one warm `NodeCompiler`, reused for every request.
 *
 * Why this shape:
 *
 * - **The compiler is expensive to build and cheap to reuse.** Building it
 *   parses ~6 MB of fonts (~1.5 s cold, ~25–70 ms once the process has the font
 *   data cached); a warm compile + PDF of a one-page document is ~1–2 ms. So
 *   the compiler lives for the lifetime of the worker.
 * - **Requests are isolated with shadow files.** The engine's virtual file
 *   system is populated with `mapShadow` for the duration of one request and
 *   torn down with `resetShadow`, so two requests can never see each other's
 *   sources — and nothing accumulates across requests.
 * - **Everything resolves under one workspace root.** The engine refuses to
 *   compile an entry outside its workspace, and resolves both `import "x.typ"`
 *   and `import "/x.typ"` against it, so every request path is mapped beneath
 *   {@link WORKSPACE_ROOT}.
 */
import { NodeCompiler, type NodeTypstDocument } from '@myriaddreamin/typst-ts-node-compiler';
import { FONTS_DIR, WORKSPACE_ROOT, config } from './config.ts';
import { normalizeDiagnostics, type Diagnostic } from './diagnostics.ts';
import { SourceError, toRequestPath, toWorkspacePath, validateBundlePaths } from './paths.ts';
import { splitSvgPages } from './svg.ts';
import type {
  PagesArtifact,
  QueryOutcome,
  QueryRequest,
  RenderArtifact,
  RenderOutcome,
  RenderRequest,
} from './types.ts';

export { SourceError };

export class Renderer {
  #compiler: NodeCompiler | null = null;
  #compiles = 0;

  /** Build the compiler on first use. */
  #engine(): NodeCompiler {
    if (this.#compiler === null) {
      this.#compiler = NodeCompiler.create({
        workspace: WORKSPACE_ROOT,
        fontArgs: [{ fontPaths: [FONTS_DIR] }],
      });
    }
    return this.#compiler;
  }

  /** Warm the engine so the first real request does not pay font parsing. */
  warm(): number {
    const started = performance.now();
    const compiler = this.#engine();
    const entry = `${WORKSPACE_ROOT}/warmup.typ`;
    compiler.mapShadow(entry, Buffer.from('= warmup\n'));
    try {
      compiler.compile({ mainFilePath: entry });
    } finally {
      compiler.resetShadow();
    }
    return performance.now() - started;
  }

  /** Install a request's sources as shadow files for the duration of a call. */
  #mount(
    compiler: NodeCompiler,
    files: Record<string, string>,
    assets?: Record<string, string>,
  ): void {
    for (const [path, source] of Object.entries(files)) {
      compiler.mapShadow(toWorkspacePath(WORKSPACE_ROOT, path), Buffer.from(source, 'utf8'));
    }
    for (const [path, base64] of Object.entries(assets ?? {})) {
      compiler.mapShadow(toWorkspacePath(WORKSPACE_ROOT, path), Buffer.from(base64, 'base64'));
    }
  }

  /** Collect diagnostics, translating engine paths back to request paths. */
  #diagnostics(
    error: { shortDiagnostics: unknown } | null,
    warnings: { shortDiagnostics: unknown } | null,
  ): Diagnostic[] {
    const all = [
      ...normalizeDiagnostics(error?.shortDiagnostics, 'error'),
      ...normalizeDiagnostics(warnings?.shortDiagnostics, 'warning'),
    ];
    for (const diagnostic of all) {
      if (diagnostic.file !== undefined) diagnostic.file = toRequestPath(diagnostic.file);
    }
    return all;
  }

  #maybeEvict(compiler: NodeCompiler): void {
    if (config.evictEvery <= 0) return;
    if (++this.#compiles % config.evictEvery !== 0) return;
    compiler.evictCache(config.evictMaxAge);
  }

  render(request: RenderRequest): RenderOutcome {
    const { entryKey, files, assets } = validateBundlePaths(
      request.entry,
      request.files,
      request.assets,
    );
    const compiler = this.#engine();
    const entry = toWorkspacePath(WORKSPACE_ROOT, entryKey);
    const started = performance.now();

    this.#mount(compiler, files, assets);
    try {
      const args = { mainFilePath: entry, inputs: request.inputs };
      // HTML is a different compilation target, not just a different export.
      const compiled =
        request.format === 'html' ? compiler.compileHtml(args) : compiler.compile(args);

      const diagnostics = this.#diagnostics(compiled.takeError(), compiled.takeWarnings());

      const document = compiled.result;
      if (document === null) {
        return { artifact: null, diagnostics, pages: 0, ms: performance.now() - started };
      }

      const artifact = this.#export(compiler, document, request);
      this.#maybeEvict(compiler);

      return {
        artifact,
        diagnostics,
        pages: document.numOfPages,
        ms: performance.now() - started,
      };
    } finally {
      // Never leak one request's files into the next.
      compiler.resetShadow();
    }
  }

  #export(
    compiler: NodeCompiler,
    document: NodeTypstDocument,
    request: RenderRequest,
  ): RenderArtifact {
    switch (request.format) {
      case 'pdf':
        return compiler.pdf(document, {
          pdfStandard: request.pdfStandard,
          pdfTags: request.pdfTags,
        });
      case 'svg':
        return compiler.svg(document);
      case 'pages': {
        const split = splitSvgPages(compiler.svg(document));
        return {
          kind: 'pages',
          width: split.width,
          height: split.height,
          pages: split.pages,
        } satisfies PagesArtifact;
      }
      case 'html':
        return compiler.html(document) ?? '';
      case 'vector':
        return compiler.vector(document);
    }
  }

  query(request: QueryRequest): QueryOutcome {
    const { entryKey, files, assets } = validateBundlePaths(
      request.entry,
      request.files,
      request.assets,
    );
    const compiler = this.#engine();
    const entry = toWorkspacePath(WORKSPACE_ROOT, entryKey);
    const started = performance.now();

    this.#mount(compiler, files, assets);
    try {
      const compiled = compiler.compile({ mainFilePath: entry, inputs: request.inputs });
      const diagnostics = this.#diagnostics(compiled.takeError(), compiled.takeWarnings());
      const document = compiled.result;
      if (document === null) {
        return { result: null, diagnostics, ms: performance.now() - started };
      }
      const result = compiler.query(document, {
        selector: request.selector,
        field: request.field,
      });
      return { result, diagnostics, ms: performance.now() - started };
    } finally {
      compiler.resetShadow();
    }
  }
}
