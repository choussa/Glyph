import { describe, expect, it } from 'vitest';
import {
  FILE_FORMATS,
  FileRejected,
  MAX_UPLOAD_BYTES,
  classifyUpload,
  formatOf,
  isForbiddenPath,
  isTextPath,
} from './formats';

describe('formatOf', () => {
  it('maps the reference app extensions to their formats', () => {
    expect(formatOf('/main.typ')?.name).toBe('Typst');
    expect(formatOf('/refs.bib')?.name).toBe('BibTeX');
    expect(formatOf('/data.csv')?.name).toBe('CSV');
    expect(formatOf('/img/logo.png')?.name).toBe('PNG');
    expect(formatOf('/logo.jpeg')?.name).toBe('JPEG');
    expect(formatOf('/logo.jpe')?.name).toBe('JPEG');
    expect(formatOf('/font.otf')?.name).toBe('OpenType');
    expect(formatOf('/paper.pdf')?.name).toBe('PDF');
  });

  it('is case-insensitive and ignores directories', () => {
    expect(formatOf('/a/B/FILE.TYP')?.name).toBe('Typst');
    expect(formatOf('main.typ')?.name).toBe('Typst');
    expect(formatOf('/a.b/main')?.name).toBeUndefined();
    // A dotfile has no extension, matching the path helpers.
    expect(formatOf('/a/.hidden')).toBeUndefined();
  });

  it('resolves the duplicated `.tex` extension to the first entry', () => {
    // The reference table lists TeX before LaTeX; both are multiplayable.
    expect(formatOf('/paper.tex')?.name).toBe('TeX');
    expect(formatOf('/paper.latex')?.name).toBe('LaTeX');
  });

  it('does not mistake `.xml` for SVG', () => {
    expect(formatOf('/doc.xml')?.name).toBe('XML');
    expect(formatOf('/pic.svg')?.name).toBe('SVG');
  });

  it('returns undefined for an extension the reference table does not list', () => {
    expect(formatOf('/script.css')).toBeUndefined();
    expect(formatOf('/module.js')).toBeUndefined();
    expect(formatOf('/mystery.xyz')).toBeUndefined();
  });

  it('lists every extension exactly once across the registry', () => {
    const seen = new Map<string, number>();
    for (const format of FILE_FORMATS) {
      for (const extension of format.extensions) {
        seen.set(extension, (seen.get(extension) ?? 0) + 1);
      }
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([ext]) => ext);
    // Only `.tex` is intentionally repeated (TeX and LaTeX).
    expect(duplicates).toEqual(['tex']);
  });
});

describe('acceptance classes', () => {
  it('treats multiplayable formats as text and blob formats as binary', () => {
    expect(isTextPath('/main.typ')).toBe(true);
    expect(isTextPath('/notes.md')).toBe(true);
    expect(isTextPath('/refs.bib')).toBe(true);
    expect(isTextPath('/paper.tex')).toBe(true);
    expect(isTextPath('/doc.xml')).toBe(true);
    expect(isTextPath('/data.csv')).toBe(true);
    expect(isTextPath('/image.png')).toBe(false);
    expect(isTextPath('/paper.pdf')).toBe(false);
  });

  it('flags the forbidden formats from the reference table', () => {
    for (const name of ['/tool.exe', '/lib.so', '/bundle.zip', '/archive.tar', '/x.dmg']) {
      expect(isForbiddenPath(name)).toBe(true);
      expect(isTextPath(name)).toBe(false);
    }
    expect(isForbiddenPath('/main.typ')).toBe(false);
  });

  it('keeps BMP forbidden even though it is an image', () => {
    expect(formatOf('/pic.bmp')?.acceptance).toBe('forbidden');
  });

  it('marks only GIF/JPEG/PNG as avatar-capable', () => {
    const avatars = FILE_FORMATS.filter((format) => format.avatar).map((format) => format.name);
    expect(avatars.sort()).toEqual(['GIF', 'JPEG', 'PNG']);
  });
});

describe('classifyUpload', () => {
  it('accepts a Typst source as text', () => {
    const verdict = classifyUpload('main.typ', 10);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.kind).toBe('text');
      expect(verdict.format.name).toBe('Typst');
    }
  });

  it('accepts an image as a binary asset', () => {
    const verdict = classifyUpload('logo.png', 2048);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.kind).toBe('binary');
  });

  it('refuses an unsupported extension', () => {
    expect(classifyUpload('module.js', 10)).toEqual({
      ok: false,
      reason: 'This file type is not supported.',
    });
  });

  it('refuses a forbidden executable by name', () => {
    const verdict = classifyUpload('installer.exe', 10);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('Windows executable files are not allowed.');
  });

  it('refuses an oversized file before looking at anything else', () => {
    const verdict = classifyUpload('photo.png', MAX_UPLOAD_BYTES + 1);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('too large');
  });

  it('refuses a binary container that would need a converter', () => {
    const docx = classifyUpload('thesis.docx', 1024);
    expect(docx.ok).toBe(false);
    if (!docx.ok) expect(docx.reason).toContain('converter');

    const odt = classifyUpload('notes.odt', 1024);
    expect(odt.ok).toBe(false);
  });

  it('still accepts text formats that have a conversion in the reference app', () => {
    // Markdown and TeX convert there, but they are readable text, so they open.
    expect(classifyUpload('README.md', 10).ok).toBe(true);
    expect(classifyUpload('paper.tex', 10).ok).toBe(true);
  });

  it('exposes FileRejected with the same message', () => {
    const error = new FileRejected('nope');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FileRejected');
    expect(error.message).toBe('nope');
  });
});
