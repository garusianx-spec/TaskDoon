import type { FileKind } from '@taskin/contracts';

/** What the bytes say a file is. */
export interface Sniffed {
  readonly mime: string;
  readonly kind: FileKind;
}

const ascii = (bytes: Buffer, start: number, end: number) => bytes.subarray(start, end).toString('latin1');
const startsWith = (bytes: Buffer, ...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

/** Executables and scripts are never accepted, whatever they claim to be. */
function isExecutable(bytes: Buffer): boolean {
  return (
    startsWith(bytes, 0x4d, 0x5a) || // MZ: Windows PE
    startsWith(bytes, 0x7f, 0x45, 0x4c, 0x46) || // ELF
    startsWith(bytes, 0xcf, 0xfa, 0xed, 0xfe) || // Mach-O 64
    startsWith(bytes, 0xfe, 0xed, 0xfa, 0xcf) ||
    startsWith(bytes, 0xca, 0xfe, 0xba, 0xbe) || // Mach-O universal / Java class
    startsWith(bytes, 0x23, 0x21) // #! script
  );
}

const extension = (fileName: string) => fileName.toLowerCase().split('.').pop() ?? '';

/** ZIP containers are named by what they hold; the extension decides between the Office formats. */
function zipKind(fileName: string): Sniffed {
  switch (extension(fileName)) {
    case 'docx':
      return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' };
    case 'xlsx':
      return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'sheet' };
    case 'pptx':
      return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document' };
    case 'odt':
      return { mime: 'application/vnd.oasis.opendocument.text', kind: 'document' };
    case 'ods':
      return { mime: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'sheet' };
    default:
      return { mime: 'application/zip', kind: 'archive' };
  }
}

/** Valid UTF-8 without NUL bytes: text (plain, CSV, Markdown). */
function isText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, trimToCharBoundary(bytes)));
    return true;
  } catch {
    return false;
  }
}

/** The prefix may cut a multi-byte character in half: end before a sequence that is cut short. */
function trimToCharBoundary(bytes: Buffer): number {
  let index = bytes.length - 1;
  let continuation = 0;
  while (index >= 0 && continuation < 3 && ((bytes[index] ?? 0) & 0xc0) === 0x80) {
    index -= 1;
    continuation += 1;
  }
  if (index < 0) return bytes.length;
  const lead = bytes[index] ?? 0;
  const expected = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : lead >= 0xc0 ? 1 : 0;
  return continuation < expected ? index : bytes.length;
}

/**
 * Identifies a file from its first bytes (at least 64). `null` means it is not a type Taskin
 * stores; executables are always `null`. SVG, HTML and XML are text here, and every download is
 * served as an attachment, so none of them can run in the browser.
 */
export function sniff(bytes: Buffer, fileName: string): Sniffed | null {
  if (bytes.length === 0 || isExecutable(bytes)) return null;
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', kind: 'image' };
  if (startsWith(bytes, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', kind: 'image' };
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return { mime: 'image/gif', kind: 'image' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return { mime: 'image/webp', kind: 'image' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return { mime: 'audio/wav', kind: 'audio' };
  if (ascii(bytes, 0, 5) === '%PDF-') return { mime: 'application/pdf', kind: 'document' };
  if (startsWith(bytes, 0x50, 0x4b, 0x03, 0x04)) return zipKind(fileName);
  if (startsWith(bytes, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) {
    // OLE compound file: legacy Office.
    return extension(fileName) === 'xls' ? { mime: 'application/vnd.ms-excel', kind: 'sheet' } : { mime: 'application/msword', kind: 'document' };
  }
  if (ascii(bytes, 0, 4) === 'Rar!') return { mime: 'application/vnd.rar', kind: 'archive' };
  if (startsWith(bytes, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return { mime: 'application/x-7z-compressed', kind: 'archive' };
  if (startsWith(bytes, 0x1f, 0x8b)) return { mime: 'application/gzip', kind: 'archive' };
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', kind: 'audio' };
  if (ascii(bytes, 0, 4) === 'OggS') return { mime: 'audio/ogg', kind: 'audio' };
  if (startsWith(bytes, 0x1a, 0x45, 0xdf, 0xa3)) return webmKind(bytes);
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand.startsWith('M4A')) return { mime: 'audio/mp4', kind: 'audio' };
    if (brand.startsWith('qt')) return { mime: 'video/quicktime', kind: 'video' };
    return { mime: 'video/mp4', kind: 'video' };
  }
  if (isText(bytes)) {
    return extension(fileName) === 'csv' ? { mime: 'text/csv', kind: 'sheet' } : { mime: 'text/plain', kind: 'document' };
  }
  return null;
}

/**
 * WebM (Matroska) names its tracks' codecs near the start (`V_VP9`, `A_OPUS`, …). A file with an
 * audio track and no video track is audio: that is what a browser's voice recorder produces.
 */
function webmKind(bytes: Buffer): Sniffed {
  const head = bytes.toString('latin1');
  if (/V_(VP8|VP9|AV1|MPEG|THEORA)/.test(head)) return { mime: 'video/webm', kind: 'video' };
  if (/A_(OPUS|VORBIS|AAC|MPEG|FLAC|PCM)/.test(head)) return { mime: 'audio/webm', kind: 'audio' };
  return { mime: 'video/webm', kind: 'video' };
}

/** The kind a claimed Content-Type stands for (for the pending row and the spoofing check). */
export function kindOfMime(mime: string, fileName: string): FileKind {
  const type = mime.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') return 'sheet';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('gzip') || type.includes('tar')) {
    return zipKind(fileName).kind;
  }
  return 'document';
}

/**
 * A claim that disagrees with the bytes: an "image" that is really a PDF, HTML or anything else.
 * `application/octet-stream` claims nothing and takes what the bytes say.
 */
export function isSpoofed(claimed: string, fileName: string, sniffed: Sniffed): boolean {
  if (claimed === '' || claimed === 'application/octet-stream') return false;
  return kindOfMime(claimed, fileName) !== sniffed.kind;
}

/** A filename safe to store and show: NFC, no bidi controls, path separators or control characters. */
export function cleanFileName(raw: string): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(/[‪-‮⁦-⁩‎‏]/g, '')
    .replace(/[\u0000-\u001F\u007F/\\]/g, '_')
    .trim();
  return (cleaned || 'file').slice(0, 255);
}
