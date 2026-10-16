/**
 * A minimal ZIP writer.
 *
 * "Export → Project archive" is a real affordance in the reference editor, and
 * it only needs stored (uncompressed) entries: Typst sources are small, and
 * shipping a deflate implementation to save a few kilobytes is not worth it.
 * Format reference: PKWARE APPNOTE 6.3.10, sections 4.3.7 – 4.3.16.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    c = CRC_TABLE[(c ^ bytes[index]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Archive path, without a leading slash. */
  name: string;
  data: Uint8Array;
}

/** Encode a fixed number of bytes as UTF-8. */
const encoder = new TextEncoder();

export function createZip(entries: ZipEntry[]): Uint8Array {
  // MS-DOS date/time; the epoch is a valid, if unglamorous, timestamp.
  const dosTime = 0;
  const dosDate = 0x21; // 1980-01-01

  interface Prepared {
    name: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }

  const prepared: Prepared[] = [];
  let localSize = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/^\/+/, ''));
    prepared.push({
      name,
      data: entry.data,
      crc: crc32(entry.data),
      offset: localSize,
    });
    localSize += 30 + name.length + entry.data.length;
  }

  let centralSize = 0;
  for (const item of prepared) centralSize += 46 + item.name.length;

  const total = localSize + centralSize + 22;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;

  /* -------------------------------------------------- local file headers */

  for (const item of prepared) {
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, 0, true); // flags
    view.setUint16(at + 8, 0, true); // method: store
    view.setUint16(at + 10, dosTime, true);
    view.setUint16(at + 12, dosDate, true);
    view.setUint32(at + 14, item.crc, true);
    view.setUint32(at + 18, item.data.length, true);
    view.setUint32(at + 22, item.data.length, true);
    view.setUint16(at + 26, item.name.length, true);
    view.setUint16(at + 28, 0, true); // extra length
    at += 30;
    out.set(item.name, at);
    at += item.name.length;
    out.set(item.data, at);
    at += item.data.length;
  }

  /* --------------------------------------------------- central directory */

  const centralStart = at;
  for (const item of prepared) {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, 0, true); // flags
    view.setUint16(at + 10, 0, true); // method
    view.setUint16(at + 12, dosTime, true);
    view.setUint16(at + 14, dosDate, true);
    view.setUint32(at + 16, item.crc, true);
    view.setUint32(at + 20, item.data.length, true);
    view.setUint32(at + 24, item.data.length, true);
    view.setUint16(at + 28, item.name.length, true);
    view.setUint16(at + 30, 0, true); // extra
    view.setUint16(at + 32, 0, true); // comment
    view.setUint16(at + 34, 0, true); // disk number
    view.setUint16(at + 36, 0, true); // internal attributes
    view.setUint32(at + 38, 0, true); // external attributes
    view.setUint32(at + 42, item.offset, true);
    at += 46;
    out.set(item.name, at);
    at += item.name.length;
  }

  /* ------------------------------------------- end of central directory */

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 4, 0, true); // this disk
  view.setUint16(at + 6, 0, true); // disk with central directory
  view.setUint16(at + 8, prepared.length, true);
  view.setUint16(at + 10, prepared.length, true);
  view.setUint32(at + 12, centralSize, true);
  view.setUint32(at + 16, centralStart, true);
  view.setUint16(at + 20, 0, true); // comment length

  return out;
}
