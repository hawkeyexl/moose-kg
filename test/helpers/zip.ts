/**
 * A minimal ZIP reader for asserting on `.iirds` packages.
 *
 * Deliberately hand-rolled rather than a dependency: the export path writes
 * ZIPs with dockg's own deterministic writer (`src/core/zip.ts`), and a test
 * that read them back through the same code could not catch a writer bug.
 * Reading the central directory directly keeps the two independent.
 *
 * Not collected as a suite: vitest's `include` is `test/ ** / *.test.ts`.
 */
import { inflateRawSync } from "node:zlib";

/** Entries by name → decompressed bytes, via the central directory. */
export function readZip(zip: Buffer): Map<string, Buffer> {
  const eocd = zip.length - 22;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = zip.readUInt16LE(localOffset + 26);
    const lExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = zip.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + nameLen;
  }
  return out;
}

/** Entry names in stored (central-directory) order. */
export function zipOrder(zip: Buffer): string[] {
  const eocd = zip.length - 22;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = zip.readUInt16LE(p + 28);
    names.push(zip.toString("utf8", p + 46, p + 46 + nameLen));
    p += 46 + nameLen;
  }
  return names;
}
