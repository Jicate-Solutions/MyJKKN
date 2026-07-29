/**
 * GET /api/proof-record
 *
 * The learner's own Verified Skills Record ("My Proof") in one call:
 *   record — fn_vsr_my_record (self-scoped SECURITY DEFINER; also stamps the
 *            "learner has seen their record" precondition for sharing)
 *   marks  — COE internal-assessment overlay gated by the exam-audit
 *            provenance verdicts (server-only; see marks-layer.ts)
 *   share  — fn_vsr_my_share_panel (college dial + preconditions + tokens)
 *
 * SELF-SCOPED by construction: both RPCs read only the caller's own learner
 * rows; a caller with no learner profile gets { record: null } — an explicit
 * state the page explains, never a silent redirect.
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { buildProofMarksLayer } from '@/lib/services/proof-record/marks-layer';
import type { ProofRecordResponse, ProofRecord, ProofSharePanel } from '@/types/proof-record';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [recordRes, shareRes] = await Promise.all([
      supabase.rpc('fn_vsr_my_record'),
      supabase.rpc('fn_vsr_my_share_panel'),
    ]);
    if (recordRes.error) {
      return NextResponse.json(
        { error: `Could not load your record: ${recordRes.error.message}` },
        { status: 500 },
      );
    }

    const record = (recordRes.data ?? null) as ProofRecord | null;
    const share = (shareRes.data ?? null) as ProofSharePanel | null;

    let marks: ProofRecordResponse['marks'] = {
      status: 'unavailable',
      program_verdict: null,
      sessions: [],
    };
    if (record) {
      // learner_id + register_number for the COE overlay — resolved
      // server-side from the caller's own profile, never from the request.
      const admin = createServiceRoleClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('learner_id')
        .eq('id', user.id)
        .single();
      if (profile?.learner_id && record.learner.register_number && record.learner.institution_id) {
        try {
          marks = await buildProofMarksLayer({
            learnerId: profile.learner_id,
            registerNumber: record.learner.register_number,
            institutionId: record.learner.institution_id,
          });
        } catch (err) {
          // Marks are one layer of four — the record never 500s because the
          // exam system is down; the section reads 'unavailable' instead.
          console.warn('[proof-record] marks overlay failed (serving without):', err);
        }
      }
    }

    const body: ProofRecordResponse = { record, marks, share };
    return NextResponse.json(body);
  } catch (error) {
    console.error('[proof-record] error:', error);
    return NextResponse.json({ error: 'Failed to load your record.' }, { status: 500 });
  }
}
