// app/api/admission/enquiries/[id]/activities/route.ts
//
// Activities feed for the enquiry page. Single source of truth is
// admission_lead_activities — we look up the lead via learner_profile_id
// and read/write its activity rows. Both lead view and enquiry view see
// the same complete history.
//
// Permissions:
//   GET   → admission.enquiries.activities.view
//   POST  → admission.enquiries.activities.create
//
// Super admin bypasses both checks (handled inside user_has_permission RPC).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface ActivityRow {
  id: string;
  lead_id: string;
  activity_type: string;
  subject: string | null;
  description: string | null;
  outcome: string | null;
  voice_memo_url: string | null;
  voice_memo_duration_sec: number | null;
  created_by: string | null;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: learnerProfileId } = await params;

  // 1. Auth
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Permission gate
  const { data: canView } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.enquiries.activities.view',
  });
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Lookup the lead via learner_profile_id (service-role to bypass RLS;
  // permission was already checked above)
  const svc = createServiceRoleClient();
  const { data: leadRow, error: leadErr } = await (svc as any)
    .from('admission_leads')
    .select('id')
    .eq('learner_profile_id', learnerProfileId)
    .maybeSingle();
  if (leadErr) {
    console.error('[enquiry-activities GET] lead lookup failed:', leadErr);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!leadRow) {
    // No admission_leads row linked — could be a legacy learner created
    // outside the lead-conversion flow. Return empty timeline gracefully.
    return NextResponse.json({ activities: [] });
  }

  // 4. Fetch activities. The hand-rolled creator join below avoids needing a
  //    FK constraint between admission_lead_activities.created_by and
  //    profiles.id (PostgREST embed syntax requires the FK to exist; ours
  //    doesn't yet, by design — created_by is a soft reference).
  const { data: activities, error: actErr } = await (svc as any)
    .from('admission_lead_activities')
    .select(
      'id, lead_id, activity_type, subject, description, outcome, voice_memo_url, voice_memo_duration_sec, created_by, created_at',
    )
    .eq('lead_id', leadRow.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (actErr) {
    console.error('[enquiry-activities GET] activities fetch failed:', actErr);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  // 5. Look up creator profiles in one batched query, then merge in JS. One
  //    extra round-trip vs. PostgREST embed — negligible for an audit
  //    timeline that typically holds <200 rows per learner.
  const rows = (activities ?? []) as Array<{
    created_by: string | null;
    [key: string]: unknown;
  }>;
  const creatorIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id)),
  );

  let creatorById: Record<string, { full_name?: string | null; email?: string | null }> = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await (svc as any)
      .from('profiles')
      .select('id, full_name, email')
      .in('id', creatorIds);
    creatorById = Object.fromEntries(
      ((creators ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (c) => [c.id, { full_name: c.full_name, email: c.email }],
      ),
    );
  }

  const enriched = rows.map((r) => ({
    ...r,
    creator: r.created_by ? creatorById[r.created_by] ?? null : null,
  }));

  return NextResponse.json({ activities: enriched });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: learnerProfileId } = await params;

  // 1. Auth
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Permission gate — separate key for write
  const { data: canCreate } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.enquiries.activities.create',
  });
  if (!canCreate) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Parse body
  let body: {
    note?: string;
    voice_memo_url?: string;
    voice_memo_duration_sec?: number;
    activity_type?: string;
    subject?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasNote = !!body.note && body.note.trim().length > 0;
  const hasMemo = !!body.voice_memo_url;
  if (!hasNote && !hasMemo) {
    return NextResponse.json(
      { error: 'Provide at least a note or a voice memo' },
      { status: 400 },
    );
  }

  // 4. Lookup lead
  const svc = createServiceRoleClient();
  const { data: leadRow, error: leadErr } = await (svc as any)
    .from('admission_leads')
    .select('id')
    .eq('learner_profile_id', learnerProfileId)
    .maybeSingle();
  if (leadErr || !leadRow) {
    return NextResponse.json(
      { error: 'No admission lead linked to this enquiry' },
      { status: 404 },
    );
  }

  // 5. Insert the activity row
  const activityType =
    body.activity_type ?? (hasMemo ? 'voice_memo' : 'note');
  const subject =
    body.subject ??
    (hasMemo && hasNote ? 'Note + voice memo'
      : hasMemo ? 'Voice memo'
      : 'Note');

  const { data: inserted, error: insErr } = await (svc as any)
    .from('admission_lead_activities')
    .insert({
      lead_id: leadRow.id,
      activity_type: activityType,
      subject,
      description: body.note?.trim() || null,
      voice_memo_url: body.voice_memo_url ?? null,
      voice_memo_duration_sec: body.voice_memo_duration_sec ?? null,
      created_by: user.id,
    })
    .select('id, created_at')
    .single();
  if (insErr) {
    console.error('[enquiry-activities POST] insert failed:', insErr);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id, created_at: inserted?.created_at });
}
