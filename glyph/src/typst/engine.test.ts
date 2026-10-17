import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { ENGINE, ENGINE_LABEL } from './engine';

describe('engine manifest', () => {
  it('records a concrete Typst language version', () => {
    expect(ENGINE.typst).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ENGINE.typstTs).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('stays in step with the wrapper declared in package.json', () => {
    // A bump to the dependency must be mirrored in engine.json, or the About
    // dialog would report a version the build is not using.
    const declared = pkg.dependencies[ENGINE.wrapper as keyof typeof pkg.dependencies];
    expect(declared).toBeDefined();
    expect(declared).toContain(ENGINE.wrapperVersion);
  });

  it('summarises both halves in one label', () => {
    expect(ENGINE_LABEL).toContain(ENGINE.wrapper);
    expect(ENGINE_LABEL).toContain(ENGINE.typst);
  });
});
