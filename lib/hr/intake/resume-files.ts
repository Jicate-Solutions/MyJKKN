/**
 * HR intake helper — pairing the export's "File Name" cells with the files HR
 * uploaded, and telling what a file really is. Pure.
 *
 * CVViZ file names are messy ("DOC_20250830_WA0002pdf.doc-20250830-wa0002pdf",
 * "Image00732_1812345678901.pdf"), and a downloaded file may not keep the exact
 * name. Pairing tries, in order: the exact name (ignoring case), the name with
 * its extension and punctuation removed, then one name containing the other.
 */

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

export const PDF_MIME = 'application/pdf';
export const DOC_MIME = 'application/msword';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const JPEG_MIME = 'image/jpeg';
export const PNG_MIME = 'image/png';
export const ZIP_MIME = 'application/zip';

/** Letters and digits of a file name without its extension, lower case. */
export function fileStem(name: string): string {
  return name.toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^a-z0-9]/g, '');
}

const MIN_CONTAINS_LEN = 6;

/** The stem with any trailing "_<6+ digits>" removed. */
export function stripNumericSuffix(name: string): string {
  const noExt = name.toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, '');
  return noExt.replace(/[_-]\d{6,}$/, '').replace(/[^a-z0-9]/g, '');
}

/** The last path segment: a zip entry "x/Resume.pdf" is compared as "Resume.pdf". */
const baseOf = (name: string) => name.split('/').pop() ?? name;

export interface ResumeMatch<T> {
  /** The one file this row names, or null. */
  file: T | null;
  /**
   * True when more than one uploaded file fits the name equally well. Nothing is
   * paired then: a guess could put one person's resume on another's card.
   */
  ambiguous: boolean;
}

function one<T>(hits: T[]): ResumeMatch<T> | null {
  if (hits.length === 1) return { file: hits[0], ambiguous: false };
  if (hits.length > 1) return { file: null, ambiguous: true };
  return null;
}

/**
 * The uploaded file the export's "File Name" cell refers to. Tiers, strongest
 * first; the first tier with any hit decides, and two hits there = ambiguous.
 * Names are compared on their last path segment, so two zip entries
 * "x/Resume.pdf" and "y/Resume.pdf" are BOTH hits for "Resume.pdf" (ambiguous),
 * never silently the first one.
 */
export function matchResumeFileDetailed<T extends { name: string }>(
  exportName: string | null,
  uploads: T[],
): ResumeMatch<T> {
  const none: ResumeMatch<T> = { file: null, ambiguous: false };
  if (!exportName) return none;
  const wanted = baseOf(exportName.trim());
  const lower = wanted.toLowerCase();
  const exact = one(uploads.filter((u) => baseOf(u.name.trim()).toLowerCase() === lower));
  if (exact) return exact;

  const stem = fileStem(wanted);
  if (!stem) return none;
  const sameStem = one(uploads.filter((u) => fileStem(baseOf(u.name)) === stem));
  if (sameStem) return sameStem;

  // CVViZ sometimes adds "_<long number>" to a name ("Image00732_1812345678901.pdf")
  // that the downloaded file does not carry, or the other way round.
  const bare = stripNumericSuffix(wanted);
  if (bare) {
    const sameBare = one(uploads.filter((u) => stripNumericSuffix(baseOf(u.name)) === bare));
    if (sameBare) return sameBare;
  }

  if (stem.length < MIN_CONTAINS_LEN) return none;
  const contains = one(
    uploads.filter((u) => {
      const s = fileStem(baseOf(u.name));
      return s.length >= MIN_CONTAINS_LEN && (s.includes(stem) || stem.includes(s));
    }),
  );
  return contains ?? none;
}

/** The uploaded file the export's "File Name" cell refers to, or null (also when ambiguous). */
export function matchResumeFile<T extends { name: string }>(exportName: string | null, uploads: T[]): T | null {
  return matchResumeFileDetailed(exportName, uploads).file;
}

/**
 * What the bytes are, read from the first bytes rather than the name: a PDF,
 * an old or new Word file, or a JPEG/PNG photo of a resume. null for anything else
 * (a .zip that is not a Word file included — see isZipBytes).
 */
export function sniffResumeMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return JPEG_MIME;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return PNG_MIME;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return PDF_MIME;
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return DOC_MIME;
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    // A .docx is a zip whose parts include "word/". Look for that name in the
    // first local headers, or the central directory at the end, rather than unzipping.
    const window = 64 * 1024;
    const dec = new TextDecoder('latin1');
    const head = dec.decode(b.subarray(0, Math.min(b.length, window)));
    const tail = dec.decode(b.subarray(Math.max(0, b.length - window)));
    return head.includes('word/') || tail.includes('word/') ? DOCX_MIME : null;
  }
  return null;
}

/** True for any zip archive (a .docx is one too; check sniffResumeMime first). */
export function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** A storage-safe version of a file name: letters, digits, dot, dash, underscore. */
export function safeStorageName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    // "Arun K..pdf" -> "Arun_K.pdf": a storage path never carries "..".
    .replace(/\.{2,}/g, '.')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '');
  return (cleaned || 'resume').slice(0, 120);
}
