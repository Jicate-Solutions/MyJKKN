// lib/ai-tools/run-as-user.ts
//
// A Supabase client that acts AS one existing person — their own signed-in
// session, so every auth.uid()-pinned function and every RLS policy sees them,
// exactly as if they had asked in the app.
//
// How: getUserById -> admin.generateLink({ type: 'magiclink' }) -> verifyOtp
// with the link's token_hash -> a client carrying that session's access token.
// The same precedent as scripts/persona-harness/*.
//
// SAFETY
//   - The person is fetched BY ID first. generateLink CREATES an auth user when
//     the email has none, so we never hand it an email we did not just read
//     from an existing account.
//   - An account MyJKKN has switched off is refused, on EVERY call (see
//     assertAccountIsOn below): banned in auth, account_disabled in its auth
//     metadata, profiles.is_active = false, profiles.is_login_disabled = true,
//     a missing profile row, or a learner whose lifecycle status would be
//     turned away at sign-in. The minted session skips app/auth/callback and
//     proxy.ts, so this file re-applies their account-off rules itself.
//   - The returned client carries the person's token and the PUBLIC anon key —
//     never the service-role key. The service-role client is used only to mint.
//   - generateLink sends no email. verifyOtp does record a sign-in on the
//     account (auth last_sign_in_at), once per cache window.
//
// CACHE: one session per person, reused for up to 5 minutes (and never past a
// minute before the token itself expires). In-memory, per server instance.
// The ACCOUNT is re-read on every call, cached session or not, so an account
// that is blocked (or deleted) after a session was minted stops working at
// once, not up to 5 minutes later.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';

const CACHE_MS = 5 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

interface CachedSession {
  client: SupabaseClient;
  expiresAtMs: number;
}

const cache = new Map<string, CachedSession>();
const inFlight = new Map<string, Promise<CachedSession>>();

export class RunAsUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunAsUserError';
  }
}

/**
 * The account has been switched off in MyJKKN. One generic message on purpose:
 * callers must not tell an outside AI (or whoever holds a key) WHY.
 */
export class AccountOffError extends RunAsUserError {
  constructor() {
    super('Account is not active');
    this.name = 'AccountOffError';
  }
}

/**
 * Mirrors the account-off rules MyJKKN applies at sign-in and on every page
 * (app/auth/callback/route.ts and proxy.ts), which a minted session never
 * passes through:
 *   - profiles.is_active === false            (callback + proxy)
 *   - profiles.is_login_disabled === true     (set with is_active=false by the
 *     sync_staff_to_profiles trigger for view-only staff; checked here in its
 *     own right, as user_has_permission() does)
 *   - a learner (profiles.role 'student') is refused unless proxy.ts would give
 *     them FULL access: the student portal flag must be on AND
 *     StudentValidationService.validateStudentAccess must say allowed. An
 *     induction-only learner is refused too (the door is not on their
 *     whitelist). proxy.ts's lti.* test-account bypass is NOT mirrored.
 * Fails closed: an unreadable or missing profile row refuses.
 */
async function assertAccountIsOn(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string
): Promise<void> {
  const { data, error } = await admin
    .from('profiles')
    .select('is_active, is_login_disabled, role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) throw new AccountOffError();
  const profile = data as { is_active: boolean | null; is_login_disabled: boolean | null; role: string | null };
  if (profile.is_active === false) throw new AccountOffError();
  if (profile.is_login_disabled === true) throw new AccountOffError();
  if (profile.role === 'student') {
    if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) throw new AccountOffError();
    const validation = await StudentValidationService.validateStudentAccess(userId);
    if (validation.allowed !== true) throw new AccountOffError();
  }
}

/**
 * Reads the account by id; throws unless it exists, has an email and is
 * switched on in MyJKKN (see assertAccountIsOn). Runs on EVERY call.
 */
async function loadActiveAccount(userId: string): Promise<{ email: string }> {
  const admin = createServiceRoleClient();
  const { data: found, error: findError } = await admin.auth.admin.getUserById(userId);
  const user = found?.user;
  if (findError || !user) throw new RunAsUserError('Account not found');
  if (!user.email) throw new RunAsUserError('Account has no email to sign in with');
  // GoTrue returns banned_until; this supabase-js version's User type omits it.
  const bannedUntil = (user as { banned_until?: string | null }).banned_until;
  if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) throw new AccountOffError();
  // proxy.ts refuses this flag on every page (set by app/api/users/manage-auth).
  if (user.user_metadata?.account_disabled === true) throw new AccountOffError();
  await assertAccountIsOn(admin, userId);
  return { email: user.email };
}

async function mint(userId: string): Promise<CachedSession> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new RunAsUserError('Supabase URL or anon key is not configured');

  const admin = createServiceRoleClient();
  const user = await loadActiveAccount(userId);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new RunAsUserError('Could not start a session for this account');

  const minter = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verified, error: verifyError } = await minter.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  const session = verified?.session;
  if (verifyError || !session?.access_token) {
    throw new RunAsUserError('Could not start a session for this account');
  }
  // Belt and braces: the session must belong to the person we looked up.
  if (session.user?.id !== userId) throw new RunAsUserError('Session does not match the account');

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tokenExpiryMs = session.expires_at ? session.expires_at * 1000 - EXPIRY_MARGIN_MS : Infinity;
  return { client, expiresAtMs: Math.min(Date.now() + CACHE_MS, tokenExpiryMs) };
}

/**
 * Returns a Supabase client signed in as `userId`. Throws RunAsUserError when
 * the account does not exist, is blocked, or a session cannot be started.
 */
export async function getUserSessionClient(userId: string): Promise<SupabaseClient> {
  if (!userId) throw new RunAsUserError('No account given');

  const hit = cache.get(userId);
  if (hit && hit.expiresAtMs > Date.now()) {
    try {
      await loadActiveAccount(userId);
    } catch (err) {
      cache.delete(userId);
      throw err;
    }
    return hit.client;
  }
  cache.delete(userId);

  let pending = inFlight.get(userId);
  if (!pending) {
    pending = mint(userId).finally(() => inFlight.delete(userId));
    inFlight.set(userId, pending);
  }
  const fresh = await pending;
  cache.set(userId, fresh);
  return fresh.client;
}

/** @internal — tests only. */
export function _resetRunAsUserCacheForTesting(): void {
  cache.clear();
  inFlight.clear();
}
