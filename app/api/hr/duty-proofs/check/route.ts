export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/duty-proofs/check — record a second check on a done item.
 * Body: { duty, itemId, result: 'confirmed'|'corrected', expectedAmount, correctedAmount?, note? }
 *
 * fn_hr_duty_proof_second_check refuses the item's own approver, a caller
 * without the duty's key in that college, and a correction with no amount or
 * note. A correction is a recorded disagreement: the item is never changed.
 * expectedAmount is the amount the checker was shown (null when none is
 * recorded); when the item's amount differs now the check is refused (409).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DutyProofError, DutyProofService, isUuid } from '@/lib/services/hr/duty-proof-service';
import { DUTY_PROOF_KIND, isDutyProofCode, validateSecondCheck } from '@/types/hr-duty-proof';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const duty = body?.duty;
    const itemId = body?.itemId;
    if (!isDutyProofCode(duty) || DUTY_PROOF_KIND[duty] !== 'second_check' || !isUuid(itemId)) {
      return NextResponse.json({ error: 'A second-check duty and an item are required' }, { status: 400 });
    }

    const result = body?.result;
    const note = typeof body?.note === 'string' ? body.note : null;
    const rawAmount = body?.correctedAmount;
    const correctedAmount = rawAmount === null || rawAmount === undefined || rawAmount === ''
      ? null
      : Number(rawAmount);
    if (result !== 'confirmed' && result !== 'corrected') {
      return NextResponse.json({ error: 'result must be confirmed or corrected' }, { status: 400 });
    }
    const rawExpected = body?.expectedAmount;
    if (rawExpected === undefined || (rawExpected !== null && (typeof rawExpected !== 'number' || !Number.isFinite(rawExpected)))) {
      return NextResponse.json({ error: 'This screen is out of date. Reload the page and check again.' }, { status: 400 });
    }
    const expectedAmount = rawExpected as number | null;
    const invalid = validateSecondCheck({ result, correctedAmount, note });
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const id = await DutyProofService.recordSecondCheck(supabase, {
      duty, itemId, result, expectedAmount, correctedAmount, note,
    });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    if (err instanceof DutyProofError) {
      if (err.status >= 500) console.error('[hr/duty-proofs/check] POST', err);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[hr/duty-proofs/check] POST', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
