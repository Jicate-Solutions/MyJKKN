/**
 * Shared Google Drive service-account client (one Drive for the whole app).
 *
 * Uploads are gated by isDriveConfigured(): all GOOGLE_DRIVE_* env vars must be
 * present AND GOOGLE_DRIVE_PRIVATE_KEY must be a real PEM private key. When the
 * key is missing/placeholder, isDriveConfigured() is false so callers return a
 * clean 503 instead of crashing OpenSSL with ERR_OSSL_UNSUPPORTED.
 *
 * Node runtime only.
 */
import { google } from 'googleapis';

/**
 * Normalize the service-account private key from env:
 *  - strip a single pair of wrapping quotes (dotenv often keeps them),
 *  - convert literal `\n` sequences into real newlines (single-line .env form),
 *  - trim stray CR/whitespace.
 */
function drivePrivateKey(): string {
  let key = process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? '';
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n').trim();
}

export function isDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
    process.env.GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID &&
    // Reject placeholders: a real key is a multi-line PEM block.
    drivePrivateKey().includes('PRIVATE KEY')
  );
}

export function createDriveClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: drivePrivateKey(),
    scopes: ['https://www.googleapis.com/auth/drive'],
    // Path B (domain-wide delegation): when set, the SA impersonates this real
    // Workspace user so uploads use THAT user's Drive quota — required when the
    // target is a My Drive folder (SAs have no storage quota of their own).
    // Leave unset when using a Shared Drive (Path A).
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE_SUBJECT || undefined,
  });
  return google.drive({ version: 'v3', auth });
}
