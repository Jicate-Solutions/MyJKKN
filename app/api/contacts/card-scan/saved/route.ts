/**
 * Business-card scanner — "where did my scans go?"
 *
 * Five of the nine destinations a scanned card can land in had NO screen of
 * their own: sh_prospects, industry_partners, ss_mentors, ims_suppliers and
 * internship_site_contacts. Measured 2026-08-06 — `industry_partners` held
 * exactly one row, written by a card scanned from a phone, and there was
 * nowhere in the product to see it.
 *
 * Three of those five turned out to have a full module page all along and were
 * invisible only because TABLE_HREF did not name them (2026-08-07):
 * sh_prospects → /solutions/pipeline/list, ims_suppliers →
 * /ims/settings/suppliers and ss_mentors → /startup-studio/mentors. A fourth,
 * industry_partners, got its screen from #2910 and is wired here (2026-08-13).
 * See the map below for the one that stays link-less, and why.
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
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';

export const dynamic = 'force-dynamic';

/**
 * Table name → what a human calls it.
 *
 * `ss_` is Startup Studio: every reference to `ss_mentors` in the codebase
 * lives under `app/(routes)/startup-studio` / `lib/services/startup-studio`,
 * and the mentor service queries that table thirteen times. The destination
 * picker in `lib/services/contacts/card-routing.ts` labels it as a support
 * mentor, which reads like a different module entirely — so the label here
 * names Startup Studio, matching the page the link now opens. A label that
 * disagrees with its own link is its own kind of dead end.
 *
 * Exported for the test that pins this map.
 */
export const TABLE_LABEL: Record<string, string> = {
  admission_leads: 'Admission leads',
  cdc_recruiters: 'Recruiters',
  sh_prospects: 'Solutions prospects',
  internship_site_contacts: 'Internship site contacts',
  internship_preceptors: 'Internship preceptors',
  industry_partners: 'Industry partners',
  ss_mentors: 'Startup Studio mentors',
  event_sponsors: 'Event sponsors',
  ims_suppliers: 'Suppliers',
};

/**
 * Where a module has a screen the SCANNER can actually open, link to it.
 *
 * The bar is deliberately "openable by the people who scan cards", not "a page
 * exists". A link to a page the viewer is denied turns this read-only screen
 * into a dead end, which is worse than the honest "Only viewable here".
 * Measured against production `custom_roles` / `user_roles` on 2026-08-07,
 * against the 197 accounts that hold `meetings.contacts.scan` (or are one of
 * the 14 super admins):
 *
 *   sh_prospects   → /solutions/pipeline/list
 *       `solutions.pipeline.view`, 5 holders, ALL 5 can scan. The subtree is
 *       wrapped in RoutePermissionGuard, so anyone else gets an explicit
 *       permission page rather than a silent bounce. LINKED.
 *
 *   ss_mentors     → /startup-studio/mentors
 *       `startup_studio.analytics.view`, 5 holders, ALL 5 can scan. Same
 *       RoutePermissionGuard treatment. LINKED.
 *
 * Three stay deliberately link-less:
 *
 *   ims_suppliers  — /ims/settings/suppliers exists, but its declared
 *       permission `ims.settings.suppliers.manage` has 3 holders and NOT ONE of
 *       them can scan a card, so for every non-super-admin scanner this link
 *       would point at a page they are not authorised to open. It happens to
 *       render for the 105 scanners who hold the broader `ims.view`, because
 *       the IMS layout gates on that key instead of the declared one — an
 *       absent page-layer check is not a permission, and wiring a link on top
 *       of it would break the moment that gate is tightened. On top of which,
 *       only 3 of 14 institutions have an IMS store, so most of those 105 land
 *       on "No Store Assigned" regardless.
 *
 *   internship_site_contacts — `internship_external_sites/[id]` mentions
 *       "contact" eight times, but every one of them is the site's own
 *       `emergency_contact_*` column; the page lists PRECEPTORS, not site
 *       contacts. `useSiteContacts` exists in hooks/internships/useSites.ts and
 *       has zero consumers app-wide, so these rows render nowhere. A deep link
 *       would also have to be per-row (each contact's own `site_id`), which
 *       this map cannot express — it is keyed by table alone.
 *
 * `industry_partners` was on this list until #2910 built it a screen; it now
 * links to /industry-partners. It is the only destination a real scanned card
 * has actually landed in, so it was also the only group on this page carrying
 * live data with nowhere to go.
 *
 * That leaves `internship_site_contacts` as the single remaining link-less
 * destination, for the per-row reason given above.
 *
 * Exported for the test that pins this map.
 */
export const TABLE_HREF: Record<string, string> = {
  admission_leads: '/admission/leads',
  cdc_recruiters: '/cdc/admin/recruiters',
  event_sponsors: '/events',
  internship_preceptors: '/internships/sites',
  sh_prospects: '/solutions/pipeline/list',
  ims_suppliers: '/ims/settings/suppliers',
  ss_mentors: '/startup-studio/mentors',
  // Added once #2910 gave this destination a screen. It was the last routing
  // target with no module page anywhere, and — being the only one any real card
  // has actually landed in — the only group on this screen carrying live data.
  industry_partners: '/industry-partners',
};

/**
 * Whether THIS viewer may open each destination's screen.
 *
 * The link is rendered TO the people who scan cards, so the property that has
 * to hold is "every scanner who sees this link can open it" — not the reverse.
 * Checking the reverse is what made the first attempt at this wrong: it
 * confirmed that everyone holding `solutions.pipeline.view` could scan a card,
 * which is true and irrelevant. Measured against production on 2026-08-07,
 * 197 accounts can scan a card and about 20 hold that key, so ~177 people were
 * being handed a link into a PermissionError page — the dead end this feature
 * exists to prevent.
 *
 * Deciding it per viewer instead of once for everybody dissolves the problem
 * and, incidentally, makes `ims_suppliers` wireable: the question stops being
 * "do most scanners hold this key" and becomes "does THIS scanner hold it".
 *
 * The key comes from MENU_PERMISSIONS, keyed by the same href — one source of
 * truth, so a route whose permission is retuned there cannot drift from this
 * map. `route-matcher`, `manifest-pages` and the permissions-audit service
 * already import it server-side, so this is a used path, not a new one.
 *
 * A destination whose href has NO MENU_PERMISSIONS entry is not gated by the
 * route trie at all (`RouteMatcher.hasAccess` returns true for anything it
 * cannot match), so the link is shown — that is the status quo, and silently
 * removing a link that works today would be its own regression.
 * `/cdc/admin/recruiters` is currently the one such route; that missing entry
 * is the same class of gap `/system` had before #2887 and is worth closing
 * separately.
 */
async function viewerCanOpen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tables: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>();

  // One lookup per DISTINCT key, not per row.
  const keyForTable = new Map<string, string>();
  for (const table of tables) {
    const href = TABLE_HREF[table];
    if (!href) continue;
    const key = MENU_PERMISSIONS[href];
    if (!key) {
      allowed.add(table); // ungated route — see docstring
      continue;
    }
    keyForTable.set(table, key);
  }

  const distinct = [...new Set(keyForTable.values())];
  const verdicts = new Map<string, boolean>();
  await Promise.all(
    distinct.map(async (key) => {
      try {
        const { data, error } = await supabase.rpc('user_has_permission', {
          permission_name: key,
        });
        // Fail CLOSED. A missing link is safe; a link into a denial page is not.
        verdicts.set(key, !error && data === true);
      } catch {
        verdicts.set(key, false);
      }
    }),
  );

  for (const [table, key] of keyForTable) {
    if (verdicts.get(key)) allowed.add(table);
  }
  return allowed;
}

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

  const openable = await viewerCanOpen(supabase, [...byTable.keys()]);

  const groups = [...byTable.entries()]
    .map(([table, people]) => {
      // Both conditions must hold: the destination has a screen at all, AND
      // this viewer may open it. Either way the answer below is true FOR THEM.
      const href = TABLE_HREF[table] && openable.has(table) ? TABLE_HREF[table] : null;
      return {
        table,
        label: TABLE_LABEL[table] ?? table,
        href,
        /** No href = there is no screen you can open; this page is your only view. */
        only_view_here: href === null,
        count: people.length,
        people,
      };
    })
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
