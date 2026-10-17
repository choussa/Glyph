import { describe, expect, it } from 'vitest';
import { MAX_SCALE, MIN_SCALE, PAGE_GUTTER, PT_TO_PX, computeScale, stepZoom } from './zoom';

const A4 = { width: 595.28, height: 841.89 };

describe('computeScale', () => {
  it('uses the manual scale, clamped, when there is no page to fit', () => {
    expect(computeScale('fit-width', 0.5, { width: 800, height: 600 }, null)).toBe(0.5);
    expect(computeScale('fit-width', 99, { width: 800, height: 600 }, null)).toBe(MAX_SCALE);
    expect(computeScale('manual', 0.001, { width: 800, height: 600 }, null)).toBe(MIN_SCALE);
  });

  it('fits A4 to the container width, allowing for the gutter', () => {
    const container = { width: 800, height: 600 };
    const expected = (800 - PAGE_GUTTER * 2) / (A4.width * PT_TO_PX);
    expect(computeScale('fit-width', 1, container, A4)).toBeCloseTo(expected, 6);
  });

  it('takes the smaller of both axes for fit-page', () => {
    const container = { width: 2000, height: 300 };
    const width = (2000 - PAGE_GUTTER * 2) / (A4.width * PT_TO_PX);
    const height = (300 - PAGE_GUTTER * 2) / (A4.height * PT_TO_PX);
    expect(computeScale('fit-page', 1, container, A4)).toBeCloseTo(Math.min(width, height), 6);
  });

  it('never divides by a degenerate container or exceeds the clamp', () => {
    const scale = computeScale('fit-width', 1, { width: 0, height: 0 }, A4);
    expect(scale).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(scale).toBeLessThanOrEqual(MAX_SCALE);
  });
});

describe('stepZoom', () => {
  it('walks to the next preset in each direction', () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.1, 6);
    expect(stepZoom(1, -1)).toBeCloseTo(0.9, 6);
  });

  it('saturates at the ends', () => {
    expect(stepZoom(10, 1)).toBe(MAX_SCALE);
    expect(stepZoom(0.01, -1)).toBe(MIN_SCALE);
  });
});
