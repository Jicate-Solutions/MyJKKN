export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { recomputeAttendanceDay } from '@/lib/hr/attendance/recompute-day';
import { getErrorMessage } from '@/lib/utils';
import type { ClinicalPunchResult } from '@/types/hr-clinical-duty';

/**
 * Clinical duty punch (2026-10-05).
 *
 * Self-service: opens with the signed-in user, not a permission key. The wall is
 * inside fn_hr_clinical_punch — it derives the staff member from auth.uid(),
 * demands an approved clinical-duty eligibility, takes the time from the server
 * clock and checks the coordinates against the person's allowed duty sites.
 *
 * After an OUT punch the day is re-judged by recomputeAttendanceDay (the same
 * shift-timing evaluator biometric days use) so late / half-day / absent comes
 * from the person's own shift. The IN punch leaves the day provisional ABSENT.
 */
async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as
      | { lat?: unknown; lng?: unknown; accuracy?: unknown }
      | null;
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const accuracy = Number(body?.accuracy);
    if (![lat, lng, accuracy].every(Number.isFinite)) {
      return NextResponse.json({ error: 'Your location could not be read.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('fn_hr_clinical_punch', {
      p_lat: lat,
      p_lng: lng,
      p_accuracy_m: accuracy,
    });
    if (error) {
      // The RPC's RAISE text is written for the person; pass it through.
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 422 });
    }

    const result = data as ClinicalPunchResult;

    let warning: string | undefined;
    if (result.punch_type === 'out') {
      try {
        const verdict = await recomputeAttendanceDay(result.employee_id, result.work_date);
        if (!verdict.changed && verdict.reason) warning = verdict.reason;
      } catch (err) {
        console.error('[hr/attendance/clinical/punch] recompute failed', err);
        warning = 'Punched out, but the day could not be judged yet. HR can re-run it.';
      }
    }

    return NextResponse.json({ data: result, warning });
  } catch (err) {
    console.error('[hr/attendance/clinical/punch] error', err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 400 });
  }
}
