// ============================================================================
// POST /api/hr/disciplinary/cases — initiate a new disciplinary case
// ============================================================================
// T6.2 — super_admin only. Body:
//   { staff_id, alleged_misconduct, evidence_memo_ids?, evidence_notes? }
// Response: { id, case_number, ... } (the created case row).
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HRDisciplinaryService } from '@/lib/services/hr/disciplinary-service';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    staff_id?: string;
    alleged_misconduct?: string;
    evidence_memo_ids?: string[];
    evidence_notes?: string;
    organization_id?: string;
  };

  if (!body.staff_id) {
    return NextResponse.json({ error: 'staff_id required' }, { status: 400 });
  }
  if (!body.alleged_misconduct || body.alleged_misconduct.trim().length < 10) {
    return NextResponse.json(
      { error: 'alleged_misconduct must be at least 10 characters' },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = new HRDisciplinaryService(supabase);
  try {
    const created = await service.initiateCase({
      staffId: body.staff_id,
      allegedMisconduct: body.alleged_misconduct.trim(),
      evidenceMemoIds: Array.isArray(body.evidence_memo_ids)
        ? body.evidence_memo_ids.filter((x) => typeof x === 'string')
        : [],
      evidenceNotes: body.evidence_notes?.trim() ?? '',
      organizationId: body.organization_id ?? null,
      initiatedBy: user.id,
    });
    return NextResponse.json(created);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
