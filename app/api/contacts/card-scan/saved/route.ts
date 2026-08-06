/**
 * Business-card scanner — "where did my scans go?"
 *
 * Five of the nine destinations a scanned card can land in have NO screen of
 * their own: sh_prospects, industry_partners, ss_mentors, ims_suppliers and
 * internship_site_contacts. Measured 2026-08-06 — `industry_partners` held
 * exactly one row, written by a card scanned from a phone, and there was
 * nowhere in the product to see it.
 *
 * Rather than five new module pages, this serves ONE screen (Director decision
 * 2026-08-06): every card you have saved, grouped by where it went, plus the
 * ones that could not be filed. `contact_card_scans` already records the
 * outcome of every confirmed card, so this needs no joins into the nine tables
 * — and that matters, because a viewer allowed to see their own scans is NOT
 * necessarily allowed to read `admission_leads`.
 *
 * Session client on purpose: the table's RLS gives a scanner their own rows and
 * admins everything, so the scoping is the database's decision, not this
 * route's.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Table name → what a human calls it. */
const TABLE_LABEL: Record<string, string> = {
  admission_leads: 'Admission leads',
  cdc_recruiters: 'Recruiters',
  sh_prospects: 'Solutions prospects',
  internship_site_contacts: 'Internship site contacts',
  internship_preceptors: 'Internship preceptors',
  industry_partners: 'Industry partners',
  ss_mentors: 'Mentors',
  event_sponsors: 'Event sponsors',
  ims_suppliers: 'Suppliers',
};

/** Where a module actually has a screen, link to it. Five deliberately do not. */
const TABLE_HREF: Record<string, string> = {
  admission_leads: '/admission/leads',
  cdc_recruiters: '/cdc/admin/recruiters',
  event_sponsors: '/events',
  internship_preceptors: '/internships/sites',
};

interface ScanRow {
  job_id: string;
  final_fields: Record<string, unknown> | null;
  routed_to: string | null;
  event_label: string | null;
  routed_table: string | null;
  routed_row_id: string | null;
  routing_status: string;
  pending_parent: string | null;
  missing_fields: string[] | null;
  routing_error: string | null;
  networker_contact_id: string | null;
  created_at: string;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('contact_card_scans')
    .select(
      'job_id, final_fields, routed_to, event_label, routed_table, routed_row_id, routing_status, pending_parent, missing_fields, routing_error, networker_contact_id, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    // A missing table means migration 20260811090300 has not been applied in
    // this environment. Say so rather than showing an empty screen that looks
    // like "you have never scanned anything".
    if (error.code === '42P01') {
      return NextResponse.json({
        ok: true,
        groups: [],
        attention: [],
        unavailable: 'Scan history is not set up on this environment yet.',
      });
    }
    console.error('[card-scan/saved] read failed:', error.message);
    return NextResponse.json({ ok: false, error: 'Could not load your scans.' }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ScanRow[];

  const person = (r: ScanRow) => ({
    job_id: r.job_id,
    name: (r.final_fields?.name as string) ?? 'Unnamed',
    organization: (r.final_fields?.organization as string) ?? null,
    role: (r.final_fields?.role as string) ?? null,
    email: (r.final_fields?.email as string) ?? null,
    phone: ((r.final_fields?.mobile ?? r.final_fields?.phone) as string) ?? null,
    event: r.event_label,
    routed_to: r.routed_to,
    saved_at: r.created_at,
    in_contact_book: Boolean(r.networker_contact_id),
  });

  // ── Needs attention ───────────────────────────────────────────────────────
  // Anything that could not be filed, or was filed with gaps. This IS the
  // module owner's to-do queue (decision 18) — it must be the first thing on
  // the screen, not a footnote, or a skipped card is simply forgotten.
  const attention = rows
    .filter(
      (r) =>
        r.routing_status === 'pending_parent' ||
        r.routing_status === 'failed' ||
        (r.missing_fields?.length ?? 0) > 0,
    )
    .map((r) => ({
      ...person(r),
      status: r.routing_status,
      needs: r.pending_parent,
      table: r.routed_table,
      table_label: r.routed_table ? (TABLE_LABEL[r.routed_table] ?? r.routed_table) : null,
      missing_fields: r.missing_fields ?? [],
      error: r.routing_error,
      /** What a human should do about it, in words. */
      what_to_do: r.pending_parent
        ? `Choose which ${r.pending_parent} they belong to`
        : r.routing_status === 'failed'
          ? 'Could not be added to its list'
          : `Missing ${(r.missing_fields ?? []).join(', ')}`,
    }));

  // ── Grouped by destination ────────────────────────────────────────────────
  const byTable = new Map<string, ReturnType<typeof person>[]>();
  for (const r of rows) {
    if (r.routing_status !== 'routed' || !r.routed_table) continue;
    const list = byTable.get(r.routed_table) ?? [];
    list.push(person(r));
    byTable.set(r.routed_table, list);
  }

  const groups = [...byTable.entries()]
    .map(([table, people]) => ({
      table,
      label: TABLE_LABEL[table] ?? table,
      href: TABLE_HREF[table] ?? null,
      /** No href = this list has no screen of its own; this page is the only view. */
      only_view_here: !TABLE_HREF[table],
      count: people.length,
      people,
    }))
    .sort((a, b) => b.count - a.count);

  // Saved to the contact book but not routed anywhere ("Just a contact").
  const contactBookOnly = rows
    .filter((r) => r.routing_status === 'none' && r.networker_contact_id)
    .map(person);

  return NextResponse.json({
    ok: true,
    total: rows.length,
    attention,
    groups,
    contact_book_only: contactBookOnly,
  });
}
