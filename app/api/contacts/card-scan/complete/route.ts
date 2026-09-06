/**
 * Business-card scanner — finish a card that could not be filed.
 *
 * Three destinations need a parent a business card cannot name: an Event Sponsor
 * must belong to an event, both internship destinations to a site. At the stall
 * the user may always Skip that picker (Director decision 2026-08-05) — the
 * person still saves, and the scan is parked at `routing_status='pending_parent'`.
 *
 * This route is the other half of that promise: it supplies the missing parent
 * later and re-runs the routing, so a skipped card is finishable rather than
 * quietly abandoned. Without it, "we'll leave a to-do" is a to-do nobody can
 * ever close.
 *
 * The contact book is NOT touched here. That write already succeeded when the
 * card was saved; this only completes the module row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { routeCard } from '@/lib/services/contacts/card-routing';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  let body: { job_id?: string; event_id?: string; site_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected JSON' }, { status: 400 });
  }

  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'job_id is required' }, { status: 400 });
  }
  if (!body.event_id && !body.site_id) {
    return NextResponse.json(
      { ok: false, error: 'Choose an event or a site first.' },
      { status: 400 },
    );
  }

  // Read through the SESSION client so RLS decides whether this caller may
  // finish this particular scan — the scanner or an admin, nobody else.
  const { data: scan, error: readErr } = await supabase
    .from('contact_card_scans')
    .select('job_id, final_fields, routed_to, event_label, routing_status, scanned_by')
    .eq('job_id', jobId)
    .maybeSingle();

  if (readErr || !scan) {
    return NextResponse.json({ ok: false, error: 'That scan was not found.' }, { status: 404 });
  }
  if (scan.routing_status === 'routed') {
    return NextResponse.json({
      ok: true,
      already_done: true,
      message: 'This card has already been filed.',
    });
  }

  const f = (scan.final_fields ?? {}) as Record<string, string | null>;
  if (!f.name) {
    return NextResponse.json(
      { ok: false, error: 'This scan has no name recorded; reopen it in the review queue.' },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('institution_id')
    .eq('id', user.id)
    .maybeSingle();

  const routing = await routeCard(
    admin,
    scan.routed_to,
    {
      name: f.name,
      organization: f.organization ?? null,
      role: f.role ?? null,
      email: f.email ?? null,
      phone: f.phone ?? null,
      mobile: f.mobile ?? null,
      website: f.website ?? null,
      city: f.city ?? null,
      note: f.handwritten_note ?? null,
    },
    {
      institutionId: (prof as { institution_id?: string | null } | null)?.institution_id ?? null,
      scannedByProfileId: user.id,
      scannedByEmail: user.email ?? null,
      eventId: body.event_id ?? null,
      siteId: body.site_id ?? null,
      eventLabel: scan.event_label,
    },
  ).catch((e): null => {
    console.error('[card-scan/complete] routing threw:', e instanceof Error ? e.message : String(e));
    return null;
  });

  const status = !routing
    ? 'failed'
    : routing.routed
      ? 'routed'
      : routing.pendingParent
        ? 'pending_parent'
        : routing.error
          ? 'failed'
          : 'none';

  await admin
    .from('contact_card_scans')
    .update({
      routed_table: routing?.table ?? null,
      routed_row_id: routing?.rowId ?? null,
      routing_status: status,
      pending_parent: routing?.pendingParent ?? null,
      missing_fields: routing?.missingFields ?? [],
      routing_error: routing?.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('job_id', jobId);

  return NextResponse.json({
    ok: true,
    status,
    table: routing?.table ?? null,
    updated_existing: routing?.updatedExisting ?? false,
    missing_fields: routing?.missingFields ?? [],
    error: routing?.error ?? null,
  });
}
