export const dynamic = 'force-dynamic';

/**
 * /api/social/cadence — Department Instagram Monthly Cadence data layer.
 *
 * The monthly cadence is the chair's per-department, calendar-month loop:
 *   OPEN    → fix an objective + snapshot a reach BASELINE from ig_monthly_audit
 *   ACTION  → record what was done + snapshot the month's feedback (LoopVoice)
 *   CLOSE   → one calendar month later, re-read ig_monthly_audit, compute
 *             reach-vs-baseline, write a one-line learning, finalise the cycle.
 *
 * GET  /api/social/cadence?accountId=<uuid|username>  → { cadences, account, currentReach, readable, enabled }
 * GET  /api/social/cadence?departmentId=<uuid>        → { cadences } for the OKR dept dashboard
 * POST /api/social/cadence  { op:'open'|'action'|'close', ... }  → { cadence }
 *
 * Reach is read ONLY through fn_ig_monthly_reach (ig_monthly_audit); the engine
 * never re-aggregates ig_post_metrics. Mirrors app/api/social/loop/route.ts for
 * auth, client, and error shape.
 *
 * Auth: any authenticated user holding social.departments.view (super-admins
 * short-circuit inside user_has_permission). Writes are additionally gated by
 * the SECURITY DEFINER RPCs (a social.departments.manage check) — a denial
 * surfaces as { success:false, error } with status 403; we do NOT pre-block.
 */

import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  CadenceAccount,
  CadenceMutationBody,
  MonthlyCadence,
  MonthlyReach,
} from '@/lib/types/social-cadence';

const DEFAULT_USERNAME = 'jkknpharmacy';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cadence-list page size. The ledger holds one row per (account, calendar-month),
// so 24 rows ≈ two years of history per page. Use ?offset=N to page further back.
const PAGE_SIZE = 24;

/** Parse a non-negative integer offset from the query (default 0). */
function parseOffset(raw: string | null): number {
  const n = Number(raw ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

interface IgAccountRow {
  id: string;
  username: string | null;
  metrics_source: string | null;
  institution_id: string | null;
}

function firstOfCurrentMonthUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Resolve an account by uuid OR username, defaulting to jkknpharmacy. */
async function resolveAccount(
  db: SupabaseClient,
  accountId?: string | null
): Promise<{ account: IgAccountRow | null; error?: string }> {
  let q = db.from('ig_accounts').select('id, username, metrics_source, institution_id');
  if (accountId && accountId.trim().length > 0) {
    q = UUID_RE.test(accountId.trim())
      ? q.eq('id', accountId.trim())
      : q.eq('username', accountId.trim());
  } else {
    q = q.eq('username', DEFAULT_USERNAME);
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) return { account: null, error: error.message };
  return { account: (data as IgAccountRow) ?? null };
}

/** Shared auth gate: authenticated + social.departments.view. */
async function authGate(supabase: SupabaseClient): Promise<NextResponse | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { data: canView } = await supabase.rpc('user_has_permission', {
    permission_name: 'social.departments.view',
  });
  if (canView !== true) {
    return NextResponse.json(
      {
        success: false,
        error:
          'You do not have access to Department Social cadence. Ask an administrator to grant the Department Social Accounts permission to your role.',
      },
      { status: 403 }
    );
  }
  return null;
}

async function isCadenceEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_get_policy_bool', {
    p_key: 'social.cadence.enabled',
    p_default: false,
  });
  if (error) {
    console.warn('[social-cadence] enabled policy read failed, defaulting off:', error.message);
    return false;
  }
  return data === true;
}

/** Normalise a composite/table RPC result into a single MonthlyCadence row. */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

export async function GET(request: Request) {
  await connection();

  try {
    const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
    const denied = await authGate(supabase);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('departmentId');
    const accountId = searchParams.get('accountId');
    const offset = parseOffset(searchParams.get('offset'));

    // ── Department-scoped list (OKR department dashboard card) ────────────────
    if (departmentId && UUID_RE.test(departmentId.trim())) {
      const { data, error } = await supabase
        .from('social_monthly_cadence')
        .select('*')
        .eq('department_id', departmentId.trim())
        .order('cadence_month', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        cadences: (data as MonthlyCadence[]) ?? [],
      });
    }

    // ── Account-scoped list (loop page) ───────────────────────────────────────
    const { account: acct, error: acctErr } = await resolveAccount(supabase, accountId);
    if (acctErr) {
      return NextResponse.json(
        { success: false, error: `Failed to read ig_accounts: ${acctErr}` },
        { status: 500 }
      );
    }
    if (!acct) {
      return NextResponse.json(
        { success: false, error: 'Instagram account not found' },
        { status: 404 }
      );
    }

    const account: CadenceAccount = {
      id: acct.id,
      username: acct.username,
      metrics_source: acct.metrics_source,
    };

    const [{ data: rows, error: rowsErr }, reachRes, enabled] = await Promise.all([
      supabase
        .from('social_monthly_cadence')
        .select('*')
        .eq('account_id', acct.id)
        .order('cadence_month', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1),
      supabase.rpc('fn_ig_monthly_reach', {
        p_account_id: acct.id,
        p_month: firstOfCurrentMonthUTC(),
      }),
      isCadenceEnabled(supabase),
    ]);

    if (rowsErr) {
      return NextResponse.json({ success: false, error: rowsErr.message }, { status: 500 });
    }

    const currentReach = firstRow<MonthlyReach>(reachRes.data);

    return NextResponse.json({
      success: true,
      account,
      cadences: (rows as MonthlyCadence[]) ?? [],
      currentReach: currentReach ?? null,
      readable: account.metrics_source === 'graph',
      enabled,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected error loading cadences',
      },
      { status: 500 }
    );
  }
}

/** Map a Postgres/PostgREST error to an HTTP status (42501 = RLS/permission → 403). */
function rpcErrorStatus(err: { code?: string; message?: string }): number {
  if (err.code === '42501' || /permission denied|row-level security/i.test(err.message ?? '')) {
    return 403;
  }
  if (err.code === '22023' || err.code === 'P0002') return 400;
  return 500;
}

export async function POST(request: Request) {
  await connection();

  try {
    const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
    const denied = await authGate(supabase);
    if (denied) return denied;

    let body: CadenceMutationBody;
    try {
      body = (await request.json()) as CadenceMutationBody;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.op === 'open') {
      // Ships DARK: opening a NEW cycle requires social.cadence.enabled=true.
      const enabled = await isCadenceEnabled(supabase);
      if (!enabled) {
        return NextResponse.json(
          {
            success: false,
            error:
              'The monthly cadence engine is off (social.cadence.enabled=false). Ask a super-admin to enable it before opening a cycle.',
          },
          { status: 403 }
        );
      }

      const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
      if (!objective) {
        return NextResponse.json(
          { success: false, error: 'An objective is required to open a cadence.' },
          { status: 400 }
        );
      }

      const { account, error: acctErr } = await resolveAccount(supabase, body.accountId);
      if (acctErr) {
        return NextResponse.json(
          { success: false, error: `Failed to read ig_accounts: ${acctErr}` },
          { status: 500 }
        );
      }
      if (!account) {
        return NextResponse.json(
          { success: false, error: 'Instagram account not found' },
          { status: 404 }
        );
      }

      // Round-3 HIGH root fix: no caller-supplied project_id — open ALWAYS
      // auto-creates the cadence's own is_okr objective server-side.
      const { data, error } = await supabase.rpc('fn_social_cadence_open', {
        p_account_id: account.id,
        p_objective: objective,
        p_cadence_month: body.cadenceMonth ?? null,
      });
      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: rpcErrorStatus(error) }
        );
      }
      return NextResponse.json({ success: true, cadence: firstRow<MonthlyCadence>(data) });
    }

    if (body.op === 'action') {
      if (!body.cadenceId || !UUID_RE.test(body.cadenceId)) {
        return NextResponse.json({ success: false, error: 'A valid cadenceId is required.' }, { status: 400 });
      }
      const action = typeof body.action === 'string' ? body.action.trim() : '';
      if (!action) {
        return NextResponse.json({ success: false, error: 'An action description is required.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('fn_social_cadence_record_action', {
        p_cadence_id: body.cadenceId,
        p_action: action,
        p_feedback_summary: body.feedbackSummary ?? null,
      });
      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: rpcErrorStatus(error) }
        );
      }
      return NextResponse.json({ success: true, cadence: firstRow<MonthlyCadence>(data) });
    }

    if (body.op === 'close') {
      if (!body.cadenceId || !UUID_RE.test(body.cadenceId)) {
        return NextResponse.json({ success: false, error: 'A valid cadenceId is required.' }, { status: 400 });
      }
      const learning = typeof body.learning === 'string' ? body.learning.trim() : '';
      if (!learning) {
        return NextResponse.json(
          { success: false, error: 'A one-line learning is required to close the cycle.' },
          { status: 400 }
        );
      }
      const { data, error } = await supabase.rpc('fn_social_cadence_close', {
        p_cadence_id: body.cadenceId,
        p_learning: learning,
      });
      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: rpcErrorStatus(error) }
        );
      }
      return NextResponse.json({ success: true, cadence: firstRow<MonthlyCadence>(data) });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown op — expected one of open | action | close.' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected error',
      },
      { status: 500 }
    );
  }
}
