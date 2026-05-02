import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';
import {
  istToday,
  resolveRoundDates,
} from '@/types/internal-marks';
import type {
  CiaMarksSyncRequest,
  CiaMarksSyncResponse,
  CiaReportResponse,
  CiaSettings,
} from '@/types/internal-marks';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(scope, searchParams.get('institutionId'));
    const examSessionId = searchParams.get('examSessionId');
    const courseCode = searchParams.get('courseCode');
    const ciaRound = searchParams.get('ciaRound');
    const programCode = searchParams.get('programCode');

    if (!institutionId || !examSessionId || !courseCode || !ciaRound) {
      return NextResponse.json({ error: 'institutionId, examSessionId, courseCode, ciaRound are required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const data = await client.get<CiaReportResponse>('/api/v1/cia-marks/report', {
      institutions_id: coeInstitutionId,
      examination_session_id: examSessionId,
      course_code: courseCode,
      cia_round: ciaRound,
      program_code: programCode ?? undefined,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[internal-marks/marks] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await resolveInternalMarksAccess(user.id);

    const body = (await request.json()) as CiaMarksSyncRequest;
    if (!body.records?.length) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }

    // Resolve COE institution + set audit fields from authenticated user
    const myjkknInstId = body.records[0].institutions_id;
    const coeId = myjkknInstId ? await resolveCoeInstitutionId(myjkknInstId) : null;

    for (const record of body.records) {
      if (coeId) record.institutions_id = coeId;
      // Set audit fields from authenticated MyJKKN user
      // Requires COE to drop FK constraints on these columns (or sync MyJKKN users)
      record.created_by = user.id;
      record.updated_by = user.id;
      record.submitted_by = user.id;
    }

    const errors: string[] = [];
    for (const record of body.records) {
      if (record.total_internal_marks > record.max_internal_marks) {
        errors.push(`Student ${record.student_id}: total (${record.total_internal_marks}) exceeds max (${record.max_internal_marks})`);
      }
    }
    if (errors.length) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
    }

    const client = CoeRestClient.create();

    // Server-side IST cutoff enforcement — INCLUSIVE deadline (today > entry_to → reject),
    // matching getEntryWindowStatus(). Deliberately deviates from COE spec §6.1.
    // See types/internal-marks.ts for rationale. COE's /api/v1/cia-marks/sync
    // still uses the strict rule, so a borderline save (today === entry_to)
    // will pass MyJKKN gates but COE may reject — coordinate with COE team.
    if (coeId) {
      const examSessionId = body.records[0].examination_session_id;
      const ciaRoundNum = body.records[0].cia_round;
      try {
        const settings = await client.get<CiaSettings[]>('/api/v1/cia-settings', {
          institutions_id: coeId,
          examination_session_id: examSessionId,
        });
        const round = (settings ?? [])
          .flatMap((s) => s.cia_rounds ?? [])
          .find((r) => r.round === ciaRoundNum);
        if (round) {
          const { entryFrom, entryTo } = resolveRoundDates(round);
          const today = istToday();
          if (entryFrom && today < entryFrom) {
            return NextResponse.json(
              { error: `Entry window not open yet — opens ${entryFrom} (IST)` },
              { status: 403 }
            );
          }
          if (entryTo && today > entryTo) {
            return NextResponse.json(
              { error: `Entry window closed after ${entryTo} (IST)` },
              { status: 403 }
            );
          }
        }
      } catch (windowErr) {
        // Don't block submission if the settings fetch fails — COE will enforce.
        console.warn('[internal-marks/marks] entry-window precheck skipped:', windowErr);
      }
    }

    let totalInserted = 0;
    let totalUpdated = 0;

    // Log first record for debugging
    console.log('[internal-marks/marks] POST sample record:', JSON.stringify(body.records[0], null, 2));
    console.log('[internal-marks/marks] Total records:', body.records.length);

    for (let i = 0; i < body.records.length; i += 500) {
      const chunk = body.records.slice(i, i + 500);
      const result = await client.post<CiaMarksSyncResponse & { results?: unknown[]; failed?: number }>(
        '/api/v1/cia-marks/sync',
        { records: chunk }
      );
      console.log('[internal-marks/marks] COE response:', JSON.stringify(result, null, 2));
      totalInserted += result.inserted ?? 0;
      totalUpdated += result.updated ?? 0;
    }

    return NextResponse.json({
      success: true, inserted: totalInserted, updated: totalUpdated,
      total: body.records.length,
      message: `Saved marks: ${totalInserted} new, ${totalUpdated} updated`,
    });
  } catch (error) {
    if (error instanceof CoeApiError) {
      console.error('[internal-marks/marks] COE rejected:', error.status, error.message, error.details);
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[internal-marks/marks] POST error:', error);
    return NextResponse.json({ error: 'Failed to submit marks' }, { status: 500 });
  }
}
