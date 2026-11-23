// Streaming store-only ZIP writer. General purpose bit 3 is set on every local
// header, so CRC-32 and sizes live in a data descriptor after the file data.
// Only the central directory metadata is buffered; file bytes are written as
// they are read, with TransformStream backpressure.

const LOCAL_SIGNATURE = 0x04034b50;
const DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const FLAGS = 0x0008 | 0x0800; // data descriptor + UTF-8 names
const VERSION = 20;
const DOS_TIME = 0; // 00:00:00, fixed for deterministic archives
const DOS_DATE = 0x0021; // 1980-01-01

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export const CRC_INITIAL = 0xffffffff;

export function crc32Update(crc: number, bytes: Uint8Array): number {
  let value = crc >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    value = CRC_TABLE[(value ^ bytes[i]) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

export function crc32Finalize(crc: number): number {
  return (crc ^ 0xffffffff) >>> 0;
}

/** Strip path traversal, backslashes, absolute paths and control characters. */
export function sanitizeZipName(raw: string, index: number, used: Set<string>): string {
  let name = typeof raw === 'string' ? raw : '';
  name = name.replace(/\\/g, '/');
  name = name.replace(/[\u0000-\u001f\u007f]/g, '');
  name = name.replace(/^[a-zA-Z]:/, '');
  // Normalize path segments so `..` pops instead of smuggling a directory.
  const segments: string[] = [];
  for (const segment of name.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  name = segments.join('/').replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (!name) name = `file-${index + 1}`;

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${stem}-${counter++}${extension}`;
  }
  used.add(candidate);
  return candidate;
}

function localHeader(name: Uint8Array): Uint8Array {
  const out = new Uint8Array(30 + name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, LOCAL_SIGNATURE, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, FLAGS, true);
  view.setUint16(8, 0, true); // store
  view.setUint16(10, DOS_TIME, true);
  view.setUint16(12, DOS_DATE, true);
  view.setUint32(14, 0, true); // CRC-32 in data descriptor
  view.setUint32(18, 0, true); // compressed size in data descriptor
  view.setUint32(22, 0, true); // uncompressed size in data descriptor
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true); // no extra field
  out.set(name, 30);
  return out;
}

function dataDescriptor(crc: number, size: number): Uint8Array {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, DESCRIPTOR_SIGNATURE, true);
  view.setUint32(4, crc, true);
  view.setUint32(8, size, true);
  view.setUint32(12, size, true);
  return out;
}

interface CentralRecord {
  name: Uint8Array;
  crc: number;
  size: number;
  localOffset: number;
}

function centralHeader(record: CentralRecord): Uint8Array {
  const out = new Uint8Array(46 + record.name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, CENTRAL_SIGNATURE, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, VERSION, true);
  view.setUint16(8, FLAGS, true);
  view.setUint16(10, 0, true); // store
  view.setUint16(12, DOS_TIME, true);
  view.setUint16(14, DOS_DATE, true);
  view.setUint32(16, record.crc, true);
  view.setUint32(20, record.size, true);
  view.setUint32(24, record.size, true);
  view.setUint16(28, record.name.length, true);
  view.setUint16(30, 0, true); // extra
  view.setUint16(32, 0, true); // comment
  view.setUint16(34, 0, true); // disk number
  view.setUint16(36, 0, true); // internal attributes
  view.setUint32(38, 0, true); // external attributes
  view.setUint32(42, record.localOffset, true);
  out.set(record.name, 46);
  return out;
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  const out = new Uint8Array(22);
  const view = new DataView(out.buffer);
  view.setUint32(0, EOCD_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, 0, true); // comment
  return out;
}

export interface ZipEntry {
  name: string;
  stream: ReadableStream<Uint8Array>;
}

export function buildZipStream(
  entries: ZipEntry[],
  onError: (error: unknown) => void = () => {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const usedNames = new Set<string>();
  let offset = 0;

  void (async () => {
    const central: CentralRecord[] = [];
    try {
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const name = sanitizeZipName(entry.name, index, usedNames);
        const nameBytes = encoder.encode(name);
        if (nameBytes.length > 0xffff) throw new Error('ZIP_NAME_TOO_LONG');

        const localOffset = offset;
        const header = localHeader(nameBytes);
        await writer.write(header);
        offset += header.length;

        let crc = CRC_INITIAL;
        let size = 0;
        const reader = entry.stream.getReader();
        let sourceEnded = false;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              sourceEnded = true;
              break;
            }
            if (!value || value.length === 0) continue;
            crc = crc32Update(crc, value);
            size += value.length;
            if (size > 0xffffffff) throw new Error('ZIP_ENTRY_TOO_LARGE');
            await writer.write(value);
            offset += value.length;
          }
        } finally {
          if (!sourceEnded) {
            try {
              await reader.cancel();
            } catch {
              // The source may already be errored; nothing else to clean up.
            }
          }
          reader.releaseLock();
        }

        const finalCrc = crc32Finalize(crc);
        const descriptor = dataDescriptor(finalCrc, size);
        await writer.write(descriptor);
        offset += descriptor.length;
        central.push({ name: nameBytes, crc: finalCrc, size, localOffset });
        if (offset > 0xffffffff) throw new Error('ZIP_TOO_LARGE');
      }

      const centralOffset = offset;
      let centralSize = 0;
      for (const record of central) {
        const chunk = centralHeader(record);
        await writer.write(chunk);
        centralSize += chunk.length;
        offset += chunk.length;
      }
      if (centralSize > 0xffffffff || centralOffset > 0xffffffff || central.length > 0xffff) {
        throw new Error('ZIP_TOO_LARGE');
      }

      await writer.write(endOfCentralDirectory(central.length, centralSize, centralOffset));
      await writer.close();
    } catch (error) {
      onError(error);
      try {
        await writer.abort(error);
      } catch {
        // The consumer may have cancelled already.
      }
    }
  })();

  return readable;
}
