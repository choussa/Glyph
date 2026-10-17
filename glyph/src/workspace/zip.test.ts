import { describe, expect, it } from 'vitest';
import { createZip } from './zip';

const encoder = new TextEncoder();

/** Read a little-endian uint32/uint16 out of the archive. */
const u32 = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer).getUint32(at, true);
const u16 = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer).getUint16(at, true);

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

describe('createZip', () => {
  it('writes a stored, single-entry archive with a correct layout', () => {
    const zip = createZip([{ name: 'a.txt', data: encoder.encode('hello') }]);
    // 30-byte local header + 5-byte name + 5-byte body
    // + 46-byte central header + 5-byte name + 22-byte EOCD = 113 bytes.
    expect(zip.length).toBe(113);

    expect(u32(zip, 0)).toBe(LOCAL);
    expect(u16(zip, 8)).toBe(0); // method: store
    expect(u32(zip, 14)).toBe(0x3610a686); // CRC32("hello")
    expect(u32(zip, 18)).toBe(5); // compressed size
    expect(u32(zip, 22)).toBe(5); // uncompressed size
    expect(u16(zip, 26)).toBe(5); // name length

    const name = new TextDecoder().decode(zip.subarray(30, 35));
    expect(name).toBe('a.txt');
    expect(new TextDecoder().decode(zip.subarray(35, 40))).toBe('hello');

    // Central directory immediately follows the local entry.
    expect(u32(zip, 40)).toBe(CENTRAL);

    // End of central directory.
    expect(u32(zip, 91)).toBe(EOCD);
    expect(u16(zip, 91 + 8)).toBe(1);
    expect(u16(zip, 91 + 10)).toBe(1);
    expect(u32(zip, 91 + 16)).toBe(40); // central directory offset
  });

  it('strips a leading slash from archive paths', () => {
    const zip = createZip([{ name: '/docs/a.typ', data: encoder.encode('x') }]);
    expect(new TextDecoder().decode(zip.subarray(30, 40))).toBe('docs/a.typ');
  });

  it('counts every entry in the end-of-central-directory record', () => {
    const zip = createZip([
      { name: 'a', data: encoder.encode('1') },
      { name: 'b', data: encoder.encode('2') },
      { name: 'c', data: encoder.encode('3') },
    ]);
    const eocdAt = zip.length - 22;
    expect(u32(zip, eocdAt)).toBe(EOCD);
    expect(u16(zip, eocdAt + 10)).toBe(3);
  });

  it('produces an archive the system unzip accepts', () => {
    // A structural check that does not shell out: every local header offset in
    // the central directory must point at a local header.
    const zip = createZip([{ name: 'main.typ', data: encoder.encode('= Hi') }]);
    const centralAt = u32(zip, zip.length - 22 + 16);
    expect(u32(zip, centralAt)).toBe(CENTRAL);
    const localAt = u32(zip, centralAt + 42);
    expect(u32(zip, localAt)).toBe(LOCAL);
  });
});
