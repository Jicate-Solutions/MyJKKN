export const dynamic = 'force-dynamic';

/**
 * /api/hr/duty-proofs — proof of done on HR duties (HR staff harness).
 *
 * GET  ?duty=L4[&itemIds=a,b][&since=YYYY-MM-DD]
 *      → { gaps, proofs }: done items still missing proof, and the active
 *        proofs on the given items. 403 when the caller cannot see the duty.
 * POST { duty, itemId, storagePath, fileName }
 *      → records a file the browser has ALREADY uploaded to the private
 *        hr-duty-proofs bucket (the file never passes through this route, so
 *        the request-body limit does not apply to it).
 *
 * The session-scoped client is used throughout: fn_hr_duty_proof_gaps and
 * fn_hr_duty_proof_attach_file check the caller's key and college themselves.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DutyProofError, DutyProofService, isUuid } from '@/lib/services/hr/duty-proof-service';
import { isDutyProofCode } from '@/types/hr-duty-proof';

function fail(err: unknown, where: string) {
  if (err instanceof DutyProofError) {
    if (err.status >= 500) console.error(`[hr/duty-proofs] ${where}`, err);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`[hr/duty-proofs] ${where}`, err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const duty = url.searchParams.get('duty');
    if (!isDutyProofCode(duty)) return NextResponse.json({ error: 'Unknown duty' }, { status: 400 });

    const since = url.searchParams.get('since');
    if (since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      return NextResponse.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 });
    }

    const rawIds = (url.searchParams.get('itemIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (rawIds.length > 200 || !rawIds.every(isUuid)) {
      return NextResponse.json({ error: 'itemIds must be up to 200 ids' }, { status: 400 });
    }

    const allGaps = await DutyProofService.listGaps(supabase, duty, since);
    const gaps = rawIds.length > 0 ? allGaps.filter((g) => rawIds.includes(g.item_id)) : allGaps;
    const proofs = await DutyProofService.listProofs(supabase, duty, rawIds);

    return NextResponse.json({ data: { gaps, proofs } });
  } catch (err) {
    return fail(err, 'GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const duty = body?.duty;
    const itemId = body?.itemId;
    const storagePath = body?.storagePath;
    const fileName = body?.fileName;
    if (!isDutyProofCode(duty) || !isUuid(itemId)
        || typeof storagePath !== 'string' || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'duty, itemId, storagePath and fileName are required' }, { status: 400 });
    }

    const id = await DutyProofService.attachFile(supabase, { duty, itemId, storagePath, fileName });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    return fail(err, 'POST');
  }
}
