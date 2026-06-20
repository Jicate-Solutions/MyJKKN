// lib/services/meetings/booking-identity-service.ts
//
// Identity resolution for the PUBLIC booking flow (Director requirement
// 2026-06-20). One source of truth for the 3-state rule used by every public
// book route (/meet, /book funnel):
//
//   1. Signed into MyJKKN        → bind the booking to their profile id (the
//      key that lets a meeting brief pull their own data). The typed email is
//      ignored — the session is authoritative.
//   2. Not signed in, @jkkn.ac.in→ a JKKN account exists by definition →
//      require login. This is a DOMAIN match (pure string) — it reveals nothing
//      about whether a specific account exists, so there is NO enumeration
//      oracle on this path.
//   3. Not signed in, other email that matches a real login account → require
//      login. This is the ONLY path that probes the account table, so it runs
//      behind the route's existing per-IP rate limit (5/hr) + we log probes.
//   else                          → genuine external guest → book as today.
//
// SECURITY: the gate is enforced HERE (server), never trusted from the client.
// The client mirror in the widget is UX only.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

const LOG_PREFIX = '[booking-identity]';
const JKKN_DOMAIN = '@jkkn.ac.in';

export type BookingIdentity =
  | {
      kind: 'authenticated';
      profileId: string;
      name: string;
      email: string;
    }
  | {
      kind: 'login_required';
      reason: 'jkkn_email' | 'account_exists';
    }
  | { kind: 'guest' };

export class BookingIdentityService {
  /**
   * Resolve who is booking. `serviceClient` is the route's service-role client
   * (used only for the account-existence probe). `typedEmail` is what the guest
   * entered (ignored when a session exists).
   */
  static async resolve(
    serviceClient: SupabaseClient,
    typedEmail: string,
  ): Promise<BookingIdentity> {
    // ── 1. Signed-in user? The session wins. ────────────────────────────────
    try {
      const ssr = await createServerClient();
      const {
        data: { user },
      } = await ssr.auth.getUser();
      if (user?.id) {
        const { data: profile } = await serviceClient
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .maybeSingle();
        const email = (profile?.email as string | undefined) ?? user.email ?? '';
        const name =
          (profile?.full_name as string | undefined) ?? user.email ?? 'JKKN User';
        return { kind: 'authenticated', profileId: user.id, name, email };
      }
    } catch (err) {
      // No/!invalid session cookie is normal for the public internet — fall
      // through to the guest path. A hard failure must not block booking.
      console.warn(`${LOG_PREFIX} session check skipped:`, (err as Error).message);
    }

    const email = typedEmail.trim().toLowerCase();

    // ── 2. JKKN institutional email → require login (no DB probe). ───────────
    if (email.endsWith(JKKN_DOMAIN)) {
      return { kind: 'login_required', reason: 'jkkn_email' };
    }

    // ── 3. Email matches a real login account → require login (rate-limited
    //    upstream; this is the only enumeration-bearing path). ───────────────
    if (email) {
      const { data: match } = await serviceClient
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (match?.id) {
        console.log(`${LOG_PREFIX} known-account email attempted guest booking`);
        return { kind: 'login_required', reason: 'account_exists' };
      }
    }

    // ── else: genuine external guest. ───────────────────────────────────────
    return { kind: 'guest' };
  }
}
