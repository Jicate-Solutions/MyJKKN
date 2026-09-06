/**
 * Google Workspace Admin (Directory API) client — user suspension for offboarding.
 *
 * Reuses the SAME service account already provisioned for Drive
 * (GOOGLE_DRIVE_CLIENT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY), which already has
 * domain-wide delegation configured in the Workspace Admin console.
 *
 * To enable this module, TWO things are required (see
 * docs/architecture/2026-07-24-google-workspace-offboarding.md):
 *   1. Add the scope  https://www.googleapis.com/auth/admin.directory.user
 *      to the service account's domain-wide delegation entry (Google-side).
 *   2. Set GOOGLE_ADMIN_IMPERSONATE_SUBJECT to a Workspace user that holds an
 *      admin role with the "Users" (user management) privilege. The Directory
 *      API refuses user writes unless the impersonated subject is an admin, so
 *      this is deliberately a SEPARATE var from GOOGLE_DRIVE_IMPERSONATE_SUBJECT
 *      (the Drive subject may be a non-admin).
 *
 * Design guarantees:
 *   - suspend only (reversible). No delete path is exposed here on purpose.
 *   - Never suspends a Workspace admin (mirrors the app's own super_admin guard).
 *   - Returns structured results; never throws raw googleapis errors at callers.
 *
 * Node runtime only.
 */
import { google } from 'googleapis';
import type { admin_directory_v1 } from 'googleapis';

const DIRECTORY_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user';

function servicePrivateKey(): string {
  let key = process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? '';
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n').trim();
}

/**
 * True only when both the service-account credentials AND an admin impersonation
 * subject are present. Callers MUST branch on this before invoking any action so
 * an unconfigured deploy fails closed (501) rather than throwing.
 */
export function isWorkspaceAdminConfigured(): boolean {
  return !!(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
    servicePrivateKey().includes('PRIVATE KEY') &&
    process.env.GOOGLE_ADMIN_IMPERSONATE_SUBJECT
  );
}

function createDirectoryClient(): admin_directory_v1.Admin {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: servicePrivateKey(),
    scopes: [DIRECTORY_SCOPE],
    // Domain-wide delegation: act AS this admin. Must hold the Users privilege.
    subject: process.env.GOOGLE_ADMIN_IMPERSONATE_SUBJECT,
  });
  return google.admin({ version: 'directory_v1', auth });
}

export interface WorkspaceUserInfo {
  found: boolean;
  primaryEmail?: string;
  suspended?: boolean;
  isAdmin?: boolean; // super-admin OR delegated-admin
}

export interface WorkspaceActionResult {
  ok: boolean;
  /** Machine-readable reason on failure, for the caller to map to an HTTP code. */
  reason?:
    | 'not_configured'
    | 'not_found'
    | 'is_admin'
    | 'already_in_state'
    | 'api_error';
  message?: string;
  info?: WorkspaceUserInfo;
}

/** Read a Workspace user's current state without mutating anything. */
export async function getWorkspaceUser(
  email: string
): Promise<WorkspaceActionResult> {
  if (!isWorkspaceAdminConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const admin = createDirectoryClient();
    const { data } = await admin.users.get({ userKey: email });
    const info: WorkspaceUserInfo = {
      found: true,
      primaryEmail: data.primaryEmail ?? email,
      suspended: data.suspended ?? false,
      isAdmin: Boolean(data.isAdmin) || Boolean(data.isDelegatedAdmin),
    };
    return { ok: true, info };
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 404) return { ok: false, reason: 'not_found' };
    return {
      ok: false,
      reason: 'api_error',
      message: err instanceof Error ? err.message : 'Directory API error',
    };
  }
}

/**
 * Suspend a Workspace account (reversible). Refuses to suspend a Workspace
 * admin — an admin must be demoted in the Google console first, exactly as the
 * app refuses to deactivate its own super_admin.
 */
export async function suspendWorkspaceUser(
  email: string
): Promise<WorkspaceActionResult> {
  const current = await getWorkspaceUser(email);
  if (!current.ok) return current;
  if (current.info?.isAdmin) {
    return {
      ok: false,
      reason: 'is_admin',
      message:
        'Refusing to suspend a Workspace admin. Demote the account in the Google Admin console first.',
      info: current.info,
    };
  }
  if (current.info?.suspended) {
    return { ok: true, reason: 'already_in_state', info: current.info };
  }
  try {
    const admin = createDirectoryClient();
    await admin.users.update({
      userKey: email,
      requestBody: { suspended: true },
    });
    return { ok: true, info: { ...current.info!, suspended: true } };
  } catch (err: unknown) {
    return {
      ok: false,
      reason: 'api_error',
      message: err instanceof Error ? err.message : 'Directory API error',
    };
  }
}

/** Reverse a suspension (re-onboarding / mistake recovery). */
export async function unsuspendWorkspaceUser(
  email: string
): Promise<WorkspaceActionResult> {
  const current = await getWorkspaceUser(email);
  if (!current.ok) return current;
  if (current.info && !current.info.suspended) {
    return { ok: true, reason: 'already_in_state', info: current.info };
  }
  try {
    const admin = createDirectoryClient();
    await admin.users.update({
      userKey: email,
      requestBody: { suspended: false },
    });
    return { ok: true, info: { ...current.info!, suspended: false } };
  } catch (err: unknown) {
    return {
      ok: false,
      reason: 'api_error',
      message: err instanceof Error ? err.message : 'Directory API error',
    };
  }
}

/**
 * Immediately invalidate all of the user's Google sessions & OAuth tokens.
 * Pair with suspendWorkspaceUser for an instant cut-off: suspend blocks new
 * logins, signOut terminates sessions already open.
 */
export async function signOutWorkspaceUser(
  email: string
): Promise<WorkspaceActionResult> {
  if (!isWorkspaceAdminConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const admin = createDirectoryClient();
    await admin.users.signOut({ userKey: email });
    return { ok: true };
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 404) return { ok: false, reason: 'not_found' };
    return {
      ok: false,
      reason: 'api_error',
      message: err instanceof Error ? err.message : 'Directory API error',
    };
  }
}
