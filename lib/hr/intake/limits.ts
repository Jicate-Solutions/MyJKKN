/**
 * HR intake helper — upload limits, shared by the route and the screen.
 */

/** The CVViZ export itself (under Vercel's ~4.5 MB request body cap, with margin). */
export const MAX_EXPORT_BYTES = 4 * 1024 * 1024;
/** One resume, whether uploaded directly or found inside a .zip. */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
/** Resume files in one batch (and per upload-urls call), after any .zip is expanded. */
export const MAX_RESUME_FILES = 100;

/** What a resume upload may be, by extension. A .zip is expanded on the server. */
export const UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  zip: 'application/zip',
};
/** Content types browsers send for the same files. */
export const UPLOAD_MIME_ALIASES: Record<string, string> = {
  'application/x-zip-compressed': 'application/zip',
  'application/x-zip': 'application/zip',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};
/**
 * Resumes read by the AI per batch; the rest are proposed from the export alone.
 * Sized to fit the prepare route's 300-second limit even in the worst case: every
 * read takes the full 30-second timeout, three at a time -> 24 / 3 x 30 s = 240 s,
 * leaving 60 s for the downloads, the zip and the row writes. (Was 60, which could
 * take 600 s and be killed midway, losing the whole preparation.)
 */
export const MAX_EXTRACTIONS_PER_BATCH = 24;
/** Resumes read at the same time. */
export const EXTRACTION_CONCURRENCY = 3;
/** Rows filed into MyJKKN at the same time (each is a Drive upload). */
export const APPLY_CONCURRENCY = 3;

const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;
export const LIMITS_TEXT = {
  export: mb(MAX_EXPORT_BYTES),
  resume: mb(MAX_RESUME_BYTES),
  files: String(MAX_RESUME_FILES),
};
