import { describe, expect, it } from 'vitest';
import { RenderClient, RenderError } from './client';

describe('RenderClient share URLs', () => {
  it('normalises a trailing slash on the base URL', () => {
    const client = new RenderClient('http://render.test/');
    expect(client.baseUrl).toBe('http://render.test');
  });

  it('builds the PDF URL under the share route, encoded once', () => {
    const client = new RenderClient('http://render.test');
    expect(client.sharePdfUrl('8oQ2rP0kLm3nXyZa1BcD-_')).toBe(
      'http://render.test/v1/shares/8oQ2rP0kLm3nXyZa1BcD-_/pdf',
    );
  });

  it('cannot be tricked into a different route with a path-shaped token', () => {
    const client = new RenderClient('http://render.test');
    expect(client.sharePdfUrl('../render')).toBe('http://render.test/v1/shares/..%2Frender/pdf');
  });
});

describe('RenderError', () => {
  it('carries the HTTP status so a share view can distinguish 404', () => {
    const error = new RenderError('share not found', 404);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
    expect(error.name).toBe('RenderError');
  });
});
