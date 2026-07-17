export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Auth check — session user must be super_admin
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Super admin access required.' },
        { status: 403 }
      );
    }

    // Compliance rollups are computed org-wide by an exact SECURITY DEFINER RPC.
    // Previously every metric was aggregated in JS over a bare `user_notifications`
    // select (and a bare mandatory-notifications select), both of which PostgREST
    // caps at ~1000 rows — so the headline totals, per-institution/per-notification
    // rollups, HOD responsiveness and worst-offenders were all computed on a
    // truncated slice and reported wrong org-wide numbers. The RPC does every
    // COUNT / GROUP BY in one exact SQL pass. It also computes the headline
    // `total_overdue` and each institution's `overdue` with the SAME
    // past-deadline predicate (acknowledgement deadline < now AND unacknowledged),
    // so the two always agree.
    const { data: rollupData, error: rollupError } = await supabase.rpc(
      'fn_notification_compliance_rollup'
    );

    if (rollupError) {
      console.error('[notifications/compliance] Rollup RPC failed:', rollupError);
      throw rollupError;
    }

    // fn_notification_compliance_rollup returns jsonb (typed as Json). Assert the
    // shape the SQL builds so the client stays fully typed without an `as any`.
    const rollup = rollupData as {
      overall?: Record<string, number>;
      by_institution?: unknown[];
      by_notification?: unknown[];
      hod_responsiveness?: unknown[];
      worst_offenders?: unknown[];
    } | null;

    const response = {
      overall: rollup?.overall ?? {
        total_mandatory_notifications: 0,
        total_required_acknowledgments: 0,
        total_acknowledged: 0,
        overall_compliance_rate: 0,
        total_overdue: 0
      },
      by_institution: rollup?.by_institution ?? [],
      by_notification: rollup?.by_notification ?? [],
      hod_responsiveness: rollup?.hod_responsiveness ?? [],
      worst_offenders: rollup?.worst_offenders ?? []
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    console.error('[notifications/compliance] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
