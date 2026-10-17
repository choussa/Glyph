import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64', () => {
  it('matches a known vector that exercises the high byte values', () => {
    expect(bytesToBase64(Uint8Array.from([0, 1, 2, 253, 254, 255]))).toBe('AAEC/f7/');
  });

  it('round-trips an empty payload', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect([...base64ToBytes('')]).toEqual([]);
  });

  it('round-trips a payload larger than one chunk', () => {
    const size = 0x8000 * 2 + 7;
    const bytes = new Uint8Array(size);
    for (let at = 0; at < size; at++) bytes[at] = at % 251;
    const decoded = base64ToBytes(bytesToBase64(bytes));
    expect(decoded.length).toBe(size);
    expect(decoded[0]).toBe(0);
    expect(decoded[size - 1]).toBe((size - 1) % 251);
  });

  it('round-trips a real PNG header', () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(bytesToBase64(png)).toBe('iVBORw0KGgo=');
    expect([...base64ToBytes('iVBORw0KGgo=')]).toEqual([...png]);
  });
});
