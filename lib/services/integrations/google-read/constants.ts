// lib/services/integrations/google-read/constants.ts
//
// Fixed values for the "let the assistant read my Gmail and Drive" connection.
// Kept dependency-free so tests and client-safe code can import them.

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

/** Requested on the incremental consent screen (include_granted_scopes=true). */
export const GOOGLE_READ_SCOPES = ['openid', 'email', GMAIL_READONLY_SCOPE, DRIVE_READONLY_SCOPE];

/** platform_policies row, seeded FALSE by 20270303090000_ai_google_read.sql. */
export const GOOGLE_READ_POLICY_KEY = 'ai.google_read.enabled';

/** Marks an OAuth state as issued by this flow, never by the calendar flow. */
export const GOOGLE_READ_STATE_PURPOSE = 'google_read';

export const MAX_RESULTS = 10;
export const DEFAULT_RESULTS = 5;
export const MAX_TEXT_CHARS = 20_000;
export const MAX_QUERY_CHARS = 500;

export type GoogleReadTool =
  | 'google_mail_search'
  | 'google_mail_read'
  | 'google_drive_search'
  | 'google_drive_read';

export type GoogleReadAuditTool = GoogleReadTool | 'connect' | 'disconnect';

/** Where the connect card lives; the callback and disconnect return here. */
export const GOOGLE_READ_CARD_PATH = '/meetings/availability';
