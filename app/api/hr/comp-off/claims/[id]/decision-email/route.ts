export const dynamic = 'force-dynamic';

// POST /api/hr/comp-off/claims/:id/decision-email
//
// Comp-off claims are approved and rejected straight from the browser
// (CompOffService.decideClaim), so no server code sees the decision. The
// database queues the claimant's email itself (hr_decision_emails, by trigger);
// the approver's browser calls this afterwards so it goes out now rather than
// at the next 5-minute cron (/api/cron/hr/decision-emails).
//
// It only SENDS what the trigger already queued, and only for a claim the
// caller can see through their own RLS — it cannot make anyone an email.

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HrDecisionEmailService } from '@/lib/services/hr/decision-email-service';
import { getErrorMessage } from '@/lib/utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid claim id' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: claim, error } = await supabase
    .from('hr_comp_off_credits')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

  after(() => HrDecisionEmailService.flush({ compOffCreditId: id }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
