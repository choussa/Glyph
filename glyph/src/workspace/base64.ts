/**
 * Base64 conversion for binary assets.
 *
 * The render service takes a project as JSON, so binary files (images, data
 * files) have to cross the wire as base64 strings. `btoa`/`atob` only speak
 * "binary strings" (one code unit per byte), so the bytes are chunked before
 * encoding: `String.fromCharCode(...bytes)` on a multi-megabyte image would blow
 * the argument limit on some engines.
 *
 * Kept pure and dependency-free so it is trivially testable.
 */

/** Chunk size that stays well under every engine's argument-count ceiling. */
const CHUNK = 0x8000;

/** Encode bytes as a base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += CHUNK) {
    const slice = bytes.subarray(at, at + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** Decode a base64 string back to bytes. Tolerates an empty input. */
export function base64ToBytes(base64: string): Uint8Array {
  if (base64.length === 0) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return bytes;
}
