/**
 * Deterministic ZIP writer.
 *
 * Replaces shelling out to the `zip` binary, which is not installed everywhere
 * (and was not installed here -- `npm run zip` failed with spawnSync ENOENT).
 * Node already ships the only hard part, deflate, so writing the container
 * ourselves removes a system dependency instead of adding one.
 *
 * Every field that would otherwise vary between runs is pinned: entries are
 * sorted by name and timestamps are fixed to the ZIP epoch (1980-01-01). The
 * same input therefore always produces a byte-identical archive, which matters
 * because Mozilla's reviewers rebuild bundled extensions and diff the result.
 */
import { deflateRawSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { crc32 } from './lib/crc32.mjs';

// 1980-01-01 00:00:00, the earliest timestamp the ZIP format can represent.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

/** Bit 11 marks the filename as UTF-8, required for non-ASCII paths. */
const FLAG_UTF8 = 0x0800;
const METHOD_DEFLATE = 8;
const METHOD_STORE = 0;

/** Recursively list files under `dir` as posix-style relative paths. */
export function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

/**
 * Build a ZIP archive from `[{ name, data }]`.
 * Entries are sorted by name so ordering never depends on the filesystem.
 */
export function createZip(entries) {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of sorted) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const deflated = deflateRawSync(data, { level: 9 });

    // Fall back to storing when compression would make the entry larger,
    // which happens for tiny files and already-compressed PNGs.
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length
    locals.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // extra
    central.writeUInt16LE(0, 32);         // comment
    central.writeUInt16LE(0, 34);         // disk number start
    central.writeUInt16LE(0, 36);         // internal attributes
    // External attributes: regular file, 0644, in the high 16 bits.
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(0, 4);                // this disk
  end.writeUInt16LE(0, 6);                // disk with central directory
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);               // comment length

  return Buffer.concat([...locals, centralBuf, end]);
}

/** Zip an entire directory to `outFile`. Returns the byte size written. */
export function zipDirectory(dir, outFile) {
  const entries = listFiles(dir).map((name) => ({ name, data: readFileSync(join(dir, name)) }));
  const buf = createZip(entries);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, buf);
  return buf.length;
}
