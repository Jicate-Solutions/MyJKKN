export const dynamic = 'force-dynamic';

// GET /api/events/[eventId]/payment-account-status
//
// Answers ONE question for the registration-form builder: "if this form charges
// a fee, will the money reach the host institution's own Razorpay account, or
// fall back to the group's common env account?"
//
// Why a route and not a direct client read: `razorpay_accounts` grants
// privileges to `postgres` and `service_role` ONLY — `authenticated` and `anon`
// have none (verified against the live DB). A browser query returns nothing, so
// the lookup has to happen server-side.
//
// Why not a SECURITY DEFINER RPC: a DEFINER function callable by `authenticated`
// has to self-authorize (a repeatedly-hit trap in this repo), and it would
// permanently widen the credential vault's reachable surface for what is only a
// UI hint. This route is narrower and disappears cleanly if the hint is dropped.
//
// WHAT CROSSES THE BOUNDARY: a boolean and the institution's display name. Never
// the key_id, the MID, the webhook ref, or the account id. The entire point of
// the vault is that credentials stay inside service_role.

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Event fees resolve the host institution's 'tuition' account — the same slot
 * tournament entry fees use. Kept in step with the feeHead passed at order
 * creation in the public-register route; if one changes, so must the other.
 */
const EVENT_FEE_HEAD = 'tuition';

export const GET = withAuth(
  async (
    _request: NextRequest,
    _auth,
    context?: { params?: Promise<Record<string, string>> }
  ) => {
    const params = await context?.params;
    const eventId = params?.eventId;
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    const { data: event } = await (svc as any)
      .from('events')
      .select('id, institution_id, institutions:institution_id (name)')
      .eq('id', eventId)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const institutionName: string | null = event.institutions?.name ?? null;

    // No host institution at all → nothing to resolve; treat as "no account" so
    // the builder still warns rather than implying routing works.
    if (!event.institution_id) {
      return NextResponse.json({ hasAccount: false, institutionName: null });
    }

    // Mirrors fn_get_razorpay_account's best-match rule: an exact fee-head row,
    // else the institution's default (fee_head IS NULL). Anything else means the
    // resolver would fall through to the common env account.
    const { data: accounts } = await (svc as any)
      .from('razorpay_accounts')
      .select('fee_head')
      .eq('institution_id', event.institution_id)
      .eq('is_active', true)
      .not('key_id', 'is', null);

    const hasAccount = (accounts ?? []).some(
      (a: { fee_head: string | null }) => a.fee_head === EVENT_FEE_HEAD || a.fee_head === null
    );

    return NextResponse.json({ hasAccount, institutionName });
  },
  // A read-only hint for anyone who can already open the form builder.
  { requiredPermission: 'read' }
);
