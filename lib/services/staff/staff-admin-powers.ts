// "Only a super admin can change the record or the role of someone with admin
// powers" (Director, 2026-10-01) — the server-route side of that rule.
//
// The database guards (migration 20271007170139) enforce it for signed-in
// writes. Routes that write with the service-role client skip those guards,
// so they ask the same database helpers and refuse in code:
//   fn_staff_record_has_admin_powers(staff_id) — the existing staff record
//   fn_staff_link_has_admin_powers(profile_id, institution_email) — the person
//     a staff row (or a profile) writes through to
//   fn_staff_role_key_is_privileged(role_key) / fn_custom_role_is_privileged(id)
// Fails closed: if a check cannot run, the caller is refused.
//
// Second ruling, same day: anyone who may edit staff may still change the
// photo, the phone numbers and the attendance machine code on such a record.

export const ADMIN_RECORD_MESSAGE =
  'Only a super admin can change the record of someone with admin powers. Others may change only the photo, phone numbers and attendance machine code.';

export const SELF_ROLE_MESSAGE = 'You cannot change your own roles; ask a super admin.';

export const SELF_EMAIL_MESSAGE = 'You cannot change your own email; ask a super admin.';

export const OWN_COLLEGE_MESSAGE =
  'You cannot move your own team-member record to another college; ask a super admin.';

export const STAFF_EMAIL_MESSAGE =
  'That email belongs to a team-member record. Only a super admin can give it to an account.';

export const EMAIL_TAKEN_MESSAGE =
  'That email belongs to someone with admin powers. Only a super admin can give it to another account.';

export const ADMIN_ROLE_MESSAGE =
  'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.';

/** Staff columns a non-super-admin may still change on the record of someone with admin powers. */
export const ADMIN_RECORD_SMALL_FIELDS: readonly string[] = [
  'profile_picture',
  'phone',
  'emergency_contact_phone',
  'biometric_id',
  'biometric_institution_id'
];

const CHECK_FAILED_MESSAGE =
  'Could not check whether this person has admin powers. Nothing was changed.';

export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type AdminPowersRefusal = { status: 403 | 409 | 500; error: string };

export const IDENTITY_SELF_MESSAGE =
  "Nobody may link a team-member record to, or away from, their own account or the Director's. Ask another super admin.";

export const IDENTITY_SALARY_MESSAGE =
  'This person has a salary revision waiting or approved, so their record cannot be linked to a different account until it is settled.';

async function ask(
  client: RpcClient,
  fn: string,
  args: Record<string, unknown>,
  message: string
): Promise<AdminPowersRefusal | null> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    console.error(`[staff-admin-powers] ${fn} failed:`, error);
    return { status: 500, error: CHECK_FAILED_MESSAGE };
  }
  return data === true ? { status: 403, error: message } : null;
}

/** Refusal when the existing staff record belongs to someone with admin powers. */
export function refuseIfAdminRecord(client: RpcClient, staffId: string) {
  return ask(client, 'fn_staff_record_has_admin_powers', { p_staff_id: staffId }, ADMIN_RECORD_MESSAGE);
}

/** Refusal when a row with this link would write through to someone with admin powers. */
export function refuseIfLinksToAdmin(
  client: RpcClient,
  profileId: string | null | undefined,
  institutionEmail: string | null | undefined,
  message: string = ADMIN_RECORD_MESSAGE
) {
  return ask(
    client,
    'fn_staff_link_has_admin_powers',
    { p_profile_id: profileId ?? null, p_institution_email: institutionEmail ?? null },
    message
  );
}

/** Refusal when this role key is privileged (giving it needs a super admin). */
export function refuseIfPrivilegedRoleKey(client: RpcClient, roleKey: string) {
  return ask(client, 'fn_staff_role_key_is_privileged', { p_role_key: roleKey }, ADMIN_ROLE_MESSAGE);
}

/** Refusal when a team-member record carries this email (giving it to an account needs a super admin). */
export function refuseIfEmailOnStaffRecord(client: RpcClient, email: string) {
  return ask(client, 'fn_email_on_staff_record', { p_email: email }, STAFF_EMAIL_MESSAGE);
}

/** A learner row carrying the uploader's own email (round 15). */
export const LEARNER_OWN_EMAIL_MESSAGE = 'This college email is your own. Only a super admin can give it to a learner.';

const LEARNER_EMAIL_MESSAGES: Record<string, string> = {
  // What a signed-in caller who is not a super admin gets, whatever the
  // reason: the database will not sort emails into kinds for them.
  refused:
    'This college email cannot be a learner\'s: it is your own, a team-member record\'s, or an account that is not a learner\'s. Correct the college email.',
  self: LEARNER_OWN_EMAIL_MESSAGE,
  team_member: 'This college email belongs to a team-member record, so it cannot be a learner\'s. Correct the college email.',
  other_account:
    'This college email belongs to an account that is not a learner\'s, so it cannot be a learner\'s. Correct the college email.'
};

/**
 * For the service-role learner paths, per row, with the caller's own client:
 * refusal when a learner's college email is the caller's own, a team-member
 * record's, or a non-learner account's (2026-10-07). The learner email sync
 * would otherwise turn that account into a student's. Super admins pass;
 * admin powers are each path's own check. Fails closed.
 */
export async function refuseLearnerCollegeEmail(
  client: RpcClient,
  email: string | null | undefined,
  learnerId: string | null | undefined
): Promise<AdminPowersRefusal | null> {
  const { data, error } = await client.rpc('fn_learner_email_refusal', {
    p_email: email ?? null,
    p_learner_id: learnerId ?? null
  });
  if (error) {
    console.error('[staff-admin-powers] fn_learner_email_refusal failed:', error);
    return { status: 500, error: CHECK_FAILED_MESSAGE };
  }
  return typeof data === 'string' ? { status: 403, error: LEARNER_EMAIL_MESSAGES[data] ?? CHECK_FAILED_MESSAGE } : null;
}

/**
 * Every row whose college email a learner may not carry, for paths that write
 * many learners in one insert: the learner email sync refuses such a row and
 * would fail the whole insert. Admin powers first, then the caller's own email,
 * a team-member record's, a non-learner account's (2026-10-07).
 */
export async function refuseLearnerCollegeEmails(
  client: RpcClient,
  rows: Array<{ row: number; email: string | null | undefined; learnerId?: string | null }>
): Promise<Array<{ row: number; error: string }>> {
  const out: Array<{ row: number; error: string }> = [];
  const withEmail = rows.filter((r) => typeof r.email === 'string' && r.email.trim() !== '');
  for (let i = 0; i < withEmail.length; i += 20) {
    const part = withEmail.slice(i, i + 20);
    const refusals = await Promise.all(
      part.map(async (r) =>
        (await refuseIfLinksToAdmin(client, null, r.email, ADMIN_ROLE_MESSAGE)) ??
        (await refuseLearnerCollegeEmail(client, r.email, r.learnerId ?? null))
      )
    );
    part.forEach((r, k) => {
      const refusal = refusals[k];
      if (refusal) out.push({ row: r.row, error: refusal.error });
    });
  }
  return out;
}

/** Refusal when this staff record (profile link or emails) is the caller's own. */
export function refuseIfCallersRecord(
  client: RpcClient,
  record: { profile_id?: unknown; email?: unknown; institution_email?: unknown },
  message: string = SELF_ROLE_MESSAGE
) {
  return ask(
    client,
    'fn_staff_record_is_callers',
    {
      p_profile_id: (record.profile_id as string | null | undefined) ?? null,
      p_email: (record.email as string | null | undefined) ?? null,
      p_institution_email: (record.institution_email as string | null | undefined) ?? null
    },
    message
  );
}

/** Refusal when this custom_roles id is privileged (giving it needs a super admin). */
export function refuseIfPrivilegedRoleId(client: RpcClient, roleId: string) {
  return ask(client, 'fn_custom_role_is_privileged', { p_role_id: roleId }, ADMIN_ROLE_MESSAGE);
}

/**
 * For every caller of a service-role staff write, super admins included
 * (2026-10-03): refuse a write that changes which accounts the record belongs
 * to (profile_id + auth accounts by email) when the caller or a Director-list
 * member is on either side (403), or while the person has a salary revision
 * waiting or approved (409). `staffId` is null for a new record; `after` is
 * the record's link once written.
 */
export async function refuseIdentityChange(
  client: RpcClient,
  staffId: string | null,
  after: { profileId?: string | null; email?: string | null; institutionEmail?: string | null }
): Promise<AdminPowersRefusal | null> {
  const { data, error } = await client.rpc('fn_staff_identity_change_refusal', {
    p_staff_id: staffId,
    p_profile_id: after.profileId ?? null,
    p_email: after.email ?? null,
    p_institution_email: after.institutionEmail ?? null
  });
  if (error) {
    console.error('[staff-admin-powers] fn_staff_identity_change_refusal failed:', error);
    return { status: 500, error: 'Could not check who this record belongs to. Nothing was changed.' };
  }
  if (data === 'self_or_director') return { status: 403, error: IDENTITY_SELF_MESSAGE };
  if (data === 'salary_request') return { status: 409, error: IDENTITY_SALARY_MESSAGE };
  return null;
}

/** True when the signed-in caller holds the super admin flag (is_super_admin()). */
export async function callerIsSuperAdmin(client: RpcClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_super_admin', {});
  return !error && data === true;
}

/**
 * For routes that change who holds which role, or a person's status. Null when
 * the write may go ahead: the caller is a super admin, or the target has no
 * admin powers and none of the roles being given is privileged.
 */
export async function refuseRoleChange(
  client: RpcClient,
  opts: {
    /** The signed-in caller: nobody but a super admin changes their own roles. */
    callerId?: string | null;
    targetUserId?: string | null;
    targetEmail?: string | null;
    grantRoleIds?: string[];
    grantRoleKeys?: string[];
  }
): Promise<AdminPowersRefusal | null> {
  if (await callerIsSuperAdmin(client)) return null;
  if (opts.callerId && opts.targetUserId && opts.callerId === opts.targetUserId) {
    return { status: 403, error: SELF_ROLE_MESSAGE };
  }
  if (opts.targetUserId || opts.targetEmail) {
    const holder = await refuseIfLinksToAdmin(
      client,
      opts.targetUserId ?? null,
      opts.targetEmail ?? null,
      ADMIN_ROLE_MESSAGE
    );
    if (holder) return holder;
  }
  for (const roleId of opts.grantRoleIds ?? []) {
    const refusal = await refuseIfPrivilegedRoleId(client, roleId);
    if (refusal) return refusal;
  }
  for (const roleKey of opts.grantRoleKeys ?? []) {
    const refusal = await refuseIfPrivilegedRoleKey(client, roleKey);
    if (refusal) return refusal;
  }
  return null;
}

// A blank string and nothing at all are the same value: the staff form sends
// '' for empty fields. A date column compares on its date part, because the
// form sends 2020-01-01T00:00:00.000Z for a column that stores 2020-01-01.
function normalise(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return JSON.stringify(sortKeys(value));
  return String(value);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

function sameValue(next: unknown, current: unknown): boolean {
  const a = normalise(next);
  const b = normalise(current);
  if (a === b) return true;
  if (a !== null && b !== null && /^\d{4}-\d{2}-\d{2}$/.test(b) && a.startsWith(b)) return true;
  return false;
}

/** The admin-record refusal, naming the columns beyond the small ones. */
export function adminRecordMessageFor(extraColumns: string[]): string {
  return extraColumns.length > 0
    ? `${ADMIN_RECORD_MESSAGE.slice(0, -1)}; this edit also changes: ${extraColumns.join(', ')}.`
    : ADMIN_RECORD_MESSAGE;
}

/**
 * The columns in `changes` that really differ from `current` and are not one of
 * the small fields. Empty = the write is allowed on the record of someone with
 * admin powers.
 */
export function changedFieldsBeyondSmall(
  changes: Record<string, unknown>,
  current: Record<string, unknown>
): string[] {
  return Object.keys(changes).filter(
    (key) =>
      !ADMIN_RECORD_SMALL_FIELDS.includes(key) &&
      key !== 'updated_at' &&
      key !== 'updated_by' &&
      !sameValue(changes[key], current[key])
  );
}
