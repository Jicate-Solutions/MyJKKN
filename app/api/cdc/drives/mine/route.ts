// app/api/cdc/drives/mine/route.ts — the campus drives THIS learner is assigned to.
//
// GET → drives whose audience (institution + program + semester targeting, or the
//       legacy program eligibility list) includes the caller, each carrying the
//       caller's own declaration state. Drives the learner already answered stay
//       visible after the window moves on, so they can always find their response.
//
// Why this exists: the notification dropped when a drive opens is one door; a
// learner who missed it needs a second. /cdc/drives renders this list for
// learners (the coordinator list is gated on cdc.drives.view) and the learner
// dashboard card reads it too.
//
// Eligibility is decided by computeEligibility and the window by
// computeWillingnessWindowState — the SAME predicates the learner's willingness
// page uses — so this list can never offer a drive whose page then says "not in
// this drive's audience" or "the window has shut".
//
// Session client for everything the learner may read under RLS (drives,
// eligibility, own willingness, own profile). The semester lookup runs on the
// service-role client, mirroring the willingness route, because semesters is
// not reliably learner-readable.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { CdcDrive, CdcDriveEligibility, CdcDriveStatus, CdcWillingnessStatus } from '@/types/cdc';
import { computeEligibility, computeWillingnessWindowState } from '@/lib/services/cdc/willingness-service';

/**
 * Lifecycle states that may be shown a drive. Mirrors the targeting filter in
 * drive-targeting.ts — if the notification would not reach them, the list must
 * not imply they can apply.
 */
const ELIGIBLE_LIFECYCLE = ['active', 'graduated'];

/** Drive states a learner may still be shown as "assigned". */
const VISIBLE_STATUSES: CdcDriveStatus[] = [
  'willingness_open',
  'eligibility_locked',
  'attendance_day',
  'results_announced',
];

const DRIVE_COLUMNS =
  'id, title, status, institutions, institution_semesters, drive_date, job_role_title, job_location, expected_package_lpa, willingness_window_open_at, willingness_window_close_at, recruiter_id, drive_type_id';

type DriveRow = Pick<
  CdcDrive,
  | 'id'
  | 'title'
  | 'status'
  | 'institutions'
  | 'institution_semesters'
  | 'drive_date'
  | 'job_role_title'
  | 'job_location'
  | 'expected_package_lpa'
  | 'willingness_window_open_at'
  | 'willingness_window_close_at'
  | 'recruiter_id'
  | 'drive_type_id'
>;

export interface MyCdcDrive {
  id: string;
  title: string;
  status: CdcDriveStatus;
  recruiter_name: string | null;
  drive_type_name: string | null;
  drive_date: string | null;
  job_role_title: string | null;
  job_location: string | null;
  expected_package_lpa: number | null;
  willingness_window_open_at: string | null;
  willingness_window_close_at: string | null;
  /** The caller's own declaration, or null when they have not responded yet. */
  willingness_status: CdcWillingnessStatus | null;
  /** True while the drive accepts willingness responses (status AND window). */
  is_open: boolean;
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const empty = NextResponse.json({ drives: [] }, { headers: { 'Cache-Control': 'no-store' } });

  try {
    // 1. Is the caller a learner at all? Team members have no learner_id and
    //    simply see nothing.
    const { data: profile } = await supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', user.id)
      .maybeSingle();
    const learnerId = (profile as { learner_id: string | null } | null)?.learner_id ?? null;
    if (!learnerId) return empty;

    const { data: learner } = await supabase
      .from('learners_profiles')
      .select('id, program_id, institution_id, semester_id, lifecycle_status')
      .eq('id', learnerId)
      .maybeSingle();
    const row = learner as
      | {
          id: string;
          program_id: string | null;
          institution_id: string | null;
          semester_id: string | null;
          lifecycle_status: string | null;
        }
      | null;
    if (!row) return empty;
    if (!ELIGIBLE_LIFECYCLE.includes(row.lifecycle_status ?? '')) return empty;

    let semesterOrder: number | null = null;
    if (row.semester_id) {
      const { data: sem } = await createServiceRoleClient()
        .from('semesters')
        .select('semester_order')
        .eq('id', row.semester_id)
        .maybeSingle();
      semesterOrder = (sem as { semester_order: number | null } | null)?.semester_order ?? null;
    }
    const learnerInput = {
      program_id: row.program_id,
      institution_id: row.institution_id,
      semester_order: semesterOrder,
    };

    // 2. Candidate drives: currently visible states, plus anything this learner
    //    already answered (so a past response is always findable).
    const { data: myWillingness, error: wErr } = await supabase
      .from('cdc_drive_willingness')
      .select('drive_id, status')
      .eq('learner_id', learnerId);
    if (wErr) throw wErr;
    const myStatus = new Map(
      ((myWillingness ?? []) as { drive_id: string; status: CdcWillingnessStatus }[]).map((w) => [w.drive_id, w.status])
    );

    let q = supabase.from('cdc_drives').select(DRIVE_COLUMNS).order('drive_date', { ascending: true });
    const answered = Array.from(myStatus.keys());
    q = answered.length
      ? q.or(`status.in.(${VISIBLE_STATUSES.join(',')}),id.in.(${answered.join(',')})`)
      : q.in('status', VISIBLE_STATUSES);
    const { data: drivesRaw, error: drivesErr } = await q;
    if (drivesErr) throw drivesErr;
    const drives = (drivesRaw ?? []) as unknown as DriveRow[];
    if (drives.length === 0) return empty;

    // 3. Legacy program eligibility rows (only consulted for drives with no
    //    institution + semester targeting).
    const { data: eligibility, error: eligErr } = await supabase
      .from('cdc_drive_eligibility')
      .select('*')
      .in(
        'drive_id',
        drives.map((d) => d.id)
      );
    if (eligErr) throw eligErr;
    const eligByDrive = new Map(((eligibility ?? []) as CdcDriveEligibility[]).map((e) => [e.drive_id, e]));

    const visible = drives.filter((d) => {
      if (myStatus.has(d.id)) return true; // already answered → always visible
      if (!VISIBLE_STATUSES.includes(d.status)) return false;
      // Still collecting willingness but outside its dates: don't offer a drive
      // whose own page would say the window has shut or not opened (#3769).
      if (d.status === 'willingness_open' && computeWillingnessWindowState(d) !== 'open') return false;
      return computeEligibility(
        { institutions: d.institutions ?? [], institution_semesters: d.institution_semesters ?? [] },
        eligByDrive.get(d.id) ?? null,
        learnerInput
      ).is_eligible;
    });
    if (visible.length === 0) return empty;

    // 4. Recruiter + drive-type names.
    const recruiterIds = Array.from(new Set(visible.map((d) => d.recruiter_id).filter((x): x is string => !!x)));
    const typeIds = Array.from(new Set(visible.map((d) => d.drive_type_id).filter((x): x is string => !!x)));
    const [recruitersRes, typesRes] = await Promise.all([
      recruiterIds.length
        ? supabase.from('cdc_recruiters').select('id, name').in('id', recruiterIds)
        : Promise.resolve({ data: [], error: null }),
      typeIds.length
        ? supabase.from('cdc_drive_types').select('id, display_name').in('id', typeIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const recruiterName = new Map(((recruitersRes.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
    const typeName = new Map(((typesRes.data ?? []) as { id: string; display_name: string }[]).map((t) => [t.id, t.display_name]));

    const result: MyCdcDrive[] = visible.map((d) => ({
      id: d.id,
      title: d.title ?? 'Campus drive',
      status: d.status,
      recruiter_name: d.recruiter_id ? recruiterName.get(d.recruiter_id) ?? null : null,
      drive_type_name: d.drive_type_id ? typeName.get(d.drive_type_id) ?? null : null,
      drive_date: d.drive_date ?? null,
      job_role_title: d.job_role_title ?? null,
      job_location: d.job_location ?? null,
      expected_package_lpa: d.expected_package_lpa ?? null,
      willingness_window_open_at: d.willingness_window_open_at ?? null,
      willingness_window_close_at: d.willingness_window_close_at ?? null,
      willingness_status: myStatus.get(d.id) ?? null,
      // Status alone is not the whole rule: a drive may carry a willingness
      // window and be outside it.
      is_open: computeWillingnessWindowState(d) === 'open',
    }));

    return NextResponse.json({ drives: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/mine] read failed:', err);
    return NextResponse.json({ error: 'Could not load your campus drives.' }, { status: 500 });
  }
}
