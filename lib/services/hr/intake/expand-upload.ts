/**
 * HR intake helper — expanding an uploaded .zip of resumes on the server, with
 * the same limits a direct upload has. A limit breach is the uploader's to fix,
 * so it is reported in plain English, never silently truncated.
 */

import JSZip from 'jszip';
import type { UploadedFile } from '@/lib/hr/intake/resume-files';
import { MAX_RESUME_BYTES, MAX_RESUME_FILES, LIMITS_TEXT } from '@/lib/hr/intake/limits';

export class UploadLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadLimitError';
  }
}

const baseName = (path: string) => path.split('/').pop() ?? path;

/** Folders and the debris macOS and Windows add to zips. */
const isJunkEntry = (path: string) => {
  const b = baseName(path);
  return path.startsWith('__MACOSX/') || b.startsWith('._') || b === '.DS_Store' || b === 'Thumbs.db' || b === '';
};

export function checkResumeSize(name: string, size: number): void {
  if (size > MAX_RESUME_BYTES) {
    throw new UploadLimitError(`"${name}" is larger than ${LIMITS_TEXT.resume}. Each resume must be ${LIMITS_TEXT.resume} or smaller.`);
  }
}

/**
 * The files inside one .zip. `budget` is how many more files the batch may
 * take; going over it is refused, not cut short.
 */
export async function expandZip(zipName: string, bytes: Uint8Array, budget: number = MAX_RESUME_FILES): Promise<UploadedFile[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new UploadLimitError(`"${zipName}" could not be opened as a .zip file.`);
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir && !isJunkEntry(e.name));
  if (entries.length > budget) {
    throw new UploadLimitError(`"${zipName}" holds more files than the ${LIMITS_TEXT.files}-resume limit allows. Upload at most ${LIMITS_TEXT.files} at a time.`);
  }
  const out: UploadedFile[] = [];
  for (const entry of entries) {
    // Check the size the zip declares BEFORE inflating, so a small zip that
    // expands to gigabytes is refused without being expanded.
    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof declared === 'number') checkResumeSize(baseName(entry.name), declared);
    const inner = await entry.async('uint8array');
    checkResumeSize(baseName(entry.name), inner.byteLength);
    out.push({ name: baseName(entry.name), bytes: inner });
  }
  return out;
}
