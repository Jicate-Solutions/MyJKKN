/**
 * Shared Google Drive client.
 *
 * Supports two auth paths:
 *
 * Path A — OAuth2 with refresh token (personal Gmail):
 *   Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
 *   GOOGLE_DRIVE_REFRESH_TOKEN. Files are owned by the Gmail user (uses their
 *   storage quota). Required for personal Gmail accounts.
 *
 * Path B — JWT service account (Google Workspace / Shared Drive):
 *   Set GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY.
 *   Files owned by the service account — only works when quota is provided
 *   via a Workspace domain or Shared Drive membership.
 *
 * Both paths require GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID.
 * Node runtime only.
 */
import { google } from 'googleapis';

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

function hasOAuth2Credentials(): boolean {
  return !!(
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
  );
}

export function isDriveConfigured(): boolean {
  if (!process.env.GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID) return false;
  if (hasOAuth2Credentials()) return true;
  // Fallback: JWT service account
  return !!(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
    drivePrivateKey().includes('PRIVATE KEY')
  );
}

export function createDriveClient() {
  if (hasOAuth2Credentials()) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2 });
  }

  // JWT path — Workspace / Shared Drive
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: drivePrivateKey(),
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: process.env.GOOGLE_DRIVE_IMPERSONATE_SUBJECT || undefined,
  });
  return google.drive({ version: 'v3', auth });
}
