// app/api/bos/members/refresh/route.ts
//
// POST /api/bos/members/refresh
// Manually re-pull the denormalized snapshot columns on bos_members from their
// source row — `staff` for internal members, `bos_external_experts` for external
// experts.
//
// WHY MANUAL (and not a trigger)
//   bos_members.display_* / email / contact_no are deliberate point-in-time
//   snapshots (schema comment, 20260306_create_bos_tables.sql L148). Meeting
//   notices, minutes, attendance sheets and TA/DA claims all render from the
//   snapshot, so a member who signed a 2025 meeting as "Assistant Professor"
//   must keep reading "Assistant Professor" on that meeting's papers even after
//   they are promoted to Associate Professor in 2026. An AFTER UPDATE trigger on
//   `staff` would silently rewrite that history across every past composition.
//
//   So the refresh is (a) explicit, (b) scoped to ONE composition, and
//   optionally (c) scoped to a subset of member rows (the committee-wise
//   button sends that committee's member ids). The operator decides which
//   roster should adopt the new designation.
//
// Body: { composition_id: string, member_ids?: string[] }
//   member_ids omitted → every member of the composition.
//   member_ids present  → only those rows, and only if they belong to
//                         composition_id (so a tampered list can't reach
//                         another board's roster).
//
// Authorization mirrors POST /api/bos/members exactly: super-admin, the
// composition's chairman, or its creator (bootstrap); council bodies
// (Academic Council / Governing Body) authorize the principal instead.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { guardRosterWrite } from '@/lib/utils/bos/roster-write-guard';

/** Columns the refresh owns. Anything else on bos_members is left untouched. */
const SNAPSHOT_FIELDS = [
  'display_name',
  'display_designation',
  'display_department',
  'display_institution',
  'email',
  'contact_no',
  'address',
] as const;

type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];
type Snapshot = Partial<Record<SnapshotField, string | null>>;

interface MemberRow {
  id: string;
  staff_id: string | null;
  expert_id: string | null;
  committee_id: string | null;
  display_name: string | null;
  display_designation: string | null;
  display_department: string | null;
  display_institution: string | null;
  email: string | null;
  contact_no: string | null;
  address: string | null;
}

/** Empty strings on the source rows normalise to NULL, matching Add Member. */
const norm = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : String(v);
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      composition_id?: string;
      member_ids?: string[];
    };
    const compositionId = body.composition_id;
    if (!compositionId) {
      return NextResponse.json(
        { error: 'composition_id is required' },
        { status: 400 },
      );
    }
    const memberIds =
      Array.isArray(body.member_ids) && body.member_ids.length > 0
        ? body.member_ids.filter((id) => typeof id === 'string')
        : null;

    // ── Authorization (same gate as POST /api/bos/members) ──────────────────
    const gate = await guardRosterWrite(supabase, user.id, compositionId);
    if (gate.deny) {
      return NextResponse.json({ error: gate.deny.error }, { status: gate.deny.status });
    }

    // ── Load the target member rows ─────────────────────────────────────────
    // Service-role read: route-level authz above is the source of truth, and a
    // principal managing a council roster holds no bos_members SELECT grant.
    const readDb = createServiceRoleClient();
    let memberQuery = readDb
      .from('bos_members')
      .select(
        'id, staff_id, expert_id, committee_id, display_name, display_designation, ' +
          'display_department, display_institution, email, contact_no, address',
      )
      .eq('composition_id', compositionId);
    // Scoping by id is also the tamper guard — composition_id is still applied,
    // so ids belonging to another composition simply don't come back.
    if (memberIds) memberQuery = memberQuery.in('id', memberIds);

    const { data: memberData, error: memberErr } = await memberQuery;
    if (memberErr) throw memberErr;
    const members = (memberData ?? []) as unknown as MemberRow[];

    if (members.length === 0) {
      return NextResponse.json({ updated: 0, unchanged: 0, skipped: 0, changes: [] });
    }

    // ── Load the source rows ────────────────────────────────────────────────
    const staffIds = [...new Set(members.map((m) => m.staff_id).filter(Boolean))] as string[];
    const expertIds = [...new Set(members.map((m) => m.expert_id).filter(Boolean))] as string[];

    // staff RLS keys on user_institution_access, which is issued per CAS sibling
    // — a chairman refreshing a CAS board would lose half the staff rows under
    // the user-context client. Same service-role rationale as
    // /api/bos/lookup/facilitators.
    const staffById = new Map<string, Snapshot>();
    if (staffIds.length > 0) {
      const { data: staffRows, error: staffErr } = await readDb
        .from('staff')
        .select(
          `id, first_name, last_name, designation, email, institution_email, phone,
           institution:institutions!staff_institution_id_fkey ( name ),
           department:departments ( department_name )`,
        )
        .in('id', staffIds);
      if (staffErr) throw staffErr;
      for (const raw of staffRows ?? []) {
        const s = raw as unknown as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          designation: string | null;
          email: string | null;
          institution_email: string | null;
          phone: string | null;
          institution: { name: string | null } | { name: string | null }[] | null;
          department:
            | { department_name: string | null }
            | { department_name: string | null }[]
            | null;
        };
        // PostgREST returns an embedded to-one as an object, but the generated
        // types (and some join shapes) surface an array — normalise both.
        const inst = Array.isArray(s.institution) ? s.institution[0] : s.institution;
        const dept = Array.isArray(s.department) ? s.department[0] : s.department;
        staffById.set(s.id, {
          // Mirrors add-member-dialog.tsx::handleSelectFacilitator — internal
          // members carry NO title prefix (the title lives inside first_name
          // for staff records that have one).
          display_name: norm(`${s.first_name ?? ''} ${s.last_name ?? ''}`),
          display_designation: norm(s.designation),
          display_department: norm(dept?.department_name),
          display_institution: norm(inst?.name),
          email: norm(s.institution_email) ?? norm(s.email),
          contact_no: norm(s.phone),
          // staff has no address column — leave the member's address alone.
        });
      }
    }

    const expertById = new Map<string, Snapshot>();
    if (expertIds.length > 0) {
      const { data: expertRows, error: expertErr } = await readDb
        .from('bos_external_experts')
        .select(
          'id, title, name, designation, institution_name, department_name, email, contact_no, address',
        )
        .in('id', expertIds);
      if (expertErr) throw expertErr;
      for (const raw of expertRows ?? []) {
        const e = raw as {
          id: string;
          title: string | null;
          name: string | null;
          designation: string | null;
          institution_name: string | null;
          department_name: string | null;
          email: string | null;
          contact_no: string | null;
          address: string | null;
        };
        const title = norm(e.title);
        const name = norm(e.name) ?? '';
        expertById.set(e.id, {
          // Same "{title} {name}" convention as the expert sync trigger
          // (20260521_sync_bos_members_from_expert.sql) and the experts table.
          display_name: title ? `${title} ${name}`.trim() : name,
          display_designation: norm(e.designation),
          display_department: norm(e.department_name),
          display_institution: norm(e.institution_name),
          email: norm(e.email),
          contact_no: norm(e.contact_no),
          address: norm(e.address),
        });
      }
    }

    // ── Diff + write ────────────────────────────────────────────────────────
    // Council roster writes bypass the board-keyed RLS (route-level authz is the
    // source of truth). BoS writes stay on the user-context client so RLS
    // remains a second gate — same split as POST/PUT.
    const writeDb =
      gate.isCouncil || gate.isSuperAdmin ? createServiceRoleClient() : supabase;

    const changes: {
      id: string;
      display_name: string | null;
      fields: { field: SnapshotField; from: string | null; to: string | null }[];
    }[] = [];
    let unchanged = 0;
    let skipped = 0;
    const failures: string[] = [];
    /** Rows that actually need a write — issued in parallel batches below. */
    const pending: {
      member: MemberRow;
      patch: Snapshot;
      diffs: { field: SnapshotField; from: string | null; to: string | null }[];
    }[] = [];

    for (const m of members) {
      const next = m.staff_id
        ? staffById.get(m.staff_id)
        : m.expert_id
          ? expertById.get(m.expert_id)
          : undefined;

      // No source link (hand-entered row), or the source row is gone /
      // out of reach — never blank out a snapshot we can't re-derive.
      if (!next) {
        skipped += 1;
        continue;
      }

      const patch: Snapshot = {};
      const diffs: { field: SnapshotField; from: string | null; to: string | null }[] = [];
      for (const field of SNAPSHOT_FIELDS) {
        if (!(field in next)) continue; // e.g. address for staff-linked rows
        const to = next[field] ?? null;
        const from = m[field] ?? null;
        if (from !== to) {
          patch[field] = to;
          diffs.push({ field, from, to });
        }
      }

      if (diffs.length === 0) {
        unchanged += 1;
        continue;
      }

      pending.push({ member: m, patch, diffs });
    }

    // Writes go out in parallel batches: a 30-member roster used to cost 30
    // sequential round trips (and the FIRST refresh after this feature shipped
    // touches nearly every row). The cap keeps a large council from opening
    // dozens of simultaneous connections through the pooler.
    const WRITE_CONCURRENCY = 8;
    const now = new Date().toISOString();
    let updated = 0;

    for (let i = 0; i < pending.length; i += WRITE_CONCURRENCY) {
      const batch = pending.slice(i, i + WRITE_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ({ member, patch }) => {
          const { data: updRows, error: updErr } = await writeDb
            .from('bos_members')
            .update({ ...patch, updated_at: now })
            .eq('id', member.id)
            .select('id');
          if (updErr) throw updErr;
          // An RLS-denied UPDATE returns zero rows WITHOUT an error — treat
          // that as a failure rather than silently reporting success.
          return (updRows?.length ?? 0) > 0;
        })
      );
      results.forEach((ok, idx) => {
        const { member, diffs } = batch[idx];
        if (!ok) {
          failures.push(member.display_name ?? member.id);
          return;
        }
        updated += 1;
        changes.push({
          id: member.id,
          display_name: member.display_name,
          fields: diffs,
        });
      });
    }

    if (failures.length > 0 && updated === 0) {
      return NextResponse.json(
        {
          error:
            'Not permitted to update these member records. Only the board chairman (or the composition creator) can refresh the roster.',
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      updated,
      unchanged,
      skipped,
      failed: failures.length,
      changes,
    });
  } catch (error) {
    console.error('[bos/members/refresh] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh member details' },
      { status: 500 },
    );
  }
}
