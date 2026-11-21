import 'server-only';

export type DetectedType = {
  ext: string;
  mime: string;
  isZipBased: boolean;
};

/**
 * Detect file type from the first bytes (magic numbers).
 * Never trust the extension or client-reported MIME.
 */
export function detectFileType(buffer: Buffer): DetectedType | null {
  if (buffer.length < 4) return null;

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { ext: 'pdf', mime: 'application/pdf', isZipBased: false };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer.length >= 8 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png', isZipBased: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg', isZipBased: false };
  }

  // GIF: GIF87a / GIF89a
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
  ) {
    return { ext: 'gif', mime: 'image/gif', isZipBased: false };
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp', isZipBased: false };
  }

  // ZIP-based: PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Cannot distinguish docx/xlsx/pptx/zip from magic alone.
    return { ext: 'zip', mime: 'application/zip', isZipBased: true };
  }

  // MP4 / MOV: ftyp box at offset 4
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
  ) {
    return { ext: 'mp4', mime: 'video/mp4', isZipBased: false };
  }

  // WebM / Matroska: 1A 45 DF A3
  if (
    buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  ) {
    return { ext: 'webm', mime: 'video/webm', isZipBased: false };
  }

  // MP3: ID3 or FF FB
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xf3))
  ) {
    return { ext: 'mp3', mime: 'audio/mpeg', isZipBased: false };
  }

  return null;
}

/**
 * Check whether the detected type is compatible with the seller's claimed extension.
 * For zip-based formats (docx/xlsx/pptx), we accept if claimed ext is one of those
 * and the file is a valid zip.
 */
export function isCompatibleWithExtension(
  detected: DetectedType,
  claimedExt: string
): boolean {
  const ext = claimedExt.toLowerCase();

  if (detected.isZipBased) {
    return ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(ext);
  }

  // jpg/jpeg are the same
  if ((ext === 'jpg' || ext === 'jpeg') && (detected.ext === 'jpg' || detected.ext === 'jpeg')) {
    return true;
  }

  return detected.ext === ext;
}
