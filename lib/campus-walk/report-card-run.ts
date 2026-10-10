// lib/campus-walk/report-card-run.ts
// ============================================================================
// Campus Walk — the Monday report card: the reads, and the weekly bells.
//
// The numbers are computed by the pure lib/campus-walk/report-card.ts. This
// file does the I/O around it, and is shared by two callers:
//   * app/(routes)/campus-walk/report-card/page.tsx — reads only;
//   * app/api/cron/weekly-report-card/route.ts     — reads, then bells.
// It exists as its own file because Next.js forbids extra exports from a
// route.ts, and the cron's idempotency and no-head fallback must be testable.
//
// ── WHO IS A COLLEGE HEAD ───────────────────────────────────────────────────
// The existing recipient lookup, reused rather than restated:
// resolvePrincipalsByInstitution (lib/services/academic/intake-readiness-alarm.ts)
// — active holders of the `principal` role in Role Management plus the legacy
// profiles.role = 'principal', per institution. A college with nobody there
// gets NO bell (an empty recipient list would leave an orphan notification);
// it is listed instead in the Director's bell under "No head on record".
//
// ── WHO IS THE DIRECTOR ─────────────────────────────────────────────────────
// resolveDirectors (lib/services/director-desk/handover-chase-service.ts), the
// same three-path lookup the handover chase uses. It falls back to super admins
// when no Director role holder exists; that fallback is reported, not hidden.
//
// ── ONCE PER COLLEGE PER WEEK ───────────────────────────────────────────────
// Key `campus-walk-report-card:<monday>:<institution_id>` (and `:director`).
// Checked before sending so a re-run can report "already sent" separately from
// "failed"; the key also rides on the insert, so the database's partial unique
// index on notifications.idempotency_key stays the final arbiter of a race.
//
// No email, no WhatsApp — the bell only.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { resolvePrincipalsByInstitution } from '@/lib/services/academic/intake-readiness-alarm';
import type { WalkTaskRow } from '@/lib/campus-walk/scoreboard';
import {
  buildReportCards,
  directorBellBody,
  headBellBody,
  headBellTitle,
  placeTask,
  placementIdsOf,
  type College,
  type PlacementLookups,
  type TaskPlacement,
  type ComplaintRow,
  type ReportCardBoard,
  type ReportWeek
} from '@/lib/campus-walk/report-card';
import { logger } from '@/lib/utils/enhanced-logger';
import { leaveOutAboutJointMd, readLeavingOutAboutJointMd } from '@/lib/grievance/about-joint-md-filter';

const LOG_MODULE = 'campus-walk/report-card';

export const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';
export const REPORT_CARD_PATH = '/campus-walk/report-card';
export const REPORT_CARD_CATEGORY = 'campus-walk:report-card';

/** Same bound the scoreboards use: a campus-ops backlog is hundreds, not millions. */
const TASK_LIMIT = 2000;
const COMPLAINT_LIMIT = 5000;
/** The next edition lands in 7 days; the bell restates, so it may lapse after 8. */
const BELL_TTL_MS = 8 * 24 * 60 * 60 * 1000;

export function reportCardUrl(weekStart: string): string {
  return `${REPORT_CARD_PATH}?week=${weekStart}`;
}

export function collegeBellKey(weekStart: string, institutionId: string): string {
  return `campus-walk-report-card:${weekStart}:${institutionId}`;
}

export function directorBellKey(weekStart: string): string {
  return `campus-walk-report-card:${weekStart}:director`;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Colleges: active institutions whose entity_type is 'institution'. */
export async function loadColleges(admin: SupabaseClient): Promise<College[]> {
  const { data, error } = await admin
    .from('institutions')
    .select('id, name')
    .eq('is_active', true)
    .eq('entity_type', 'institution')
    .order('name', { ascending: true });
  if (error) throw new Error(`college_read_failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; name: string }>).map((r) => ({
    id: r.id,
    name: r.name
  }));
}

/** Every campus walk job under CAMPUS-OPS, open and closed. */
export async function loadCampusWalkTasks(admin: SupabaseClient): Promise<WalkTaskRow[]> {
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id')
    .eq('code', CAMPUS_OPS_PROJECT_CODE)
    .maybeSingle();
  if (projectError) throw new Error(`project_read_failed: ${projectError.message}`);
  if (!project?.id) return [];

  const { data, error } = await admin
    .from('project_tasks')
    .select(
      'id, title, status_key, is_blocked, due_date, completed_at, created_at, owner_staff_id, metadata'
    )
    .eq('project_id', project.id)
    .eq('metadata->>source', 'campus-walk')
    .order('created_at', { ascending: false })
    .limit(TASK_LIMIT);
  if (error) throw new Error(`task_read_failed: ${error.message}`);
  return (data ?? []) as WalkTaskRow[];
}

// ── Which college each job belongs to ────────────────────────────────────────

/** `.in()` rides in the URL; keep each list short enough for any proxy. */
const IN_CHUNK = 200;

async function readById<T extends { id: string }>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  ids: string[]
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .in('id', unique.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`${table}_read_failed: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}

/**
 * The rows placeTask needs, read in batches. THE SELECT LISTS ARE THE
 * ENFORCEMENT: ids, institution and department only — no names, no text.
 */
export async function loadPlacementLookups(
  admin: SupabaseClient,
  tasks: WalkTaskRow[]
): Promise<PlacementLookups> {
  const wanted = tasks.map(placementIdsOf);
  type Placed = { id: string; institution_id: string | null; department_id: string | null };

  const [resources, staff, profiles] = await Promise.all([
    readById<Placed>(admin, 'resources', 'id, institution_id, department_id', wanted.map((w) => w.resourceId)),
    readById<Placed>(admin, 'staff', 'id, institution_id, department_id', wanted.map((w) => w.ownerStaffId)),
    readById<{ id: string; institution_id: string | null }>(
      admin,
      'profiles',
      'id, institution_id',
      wanted.map((w) => w.reporterProfileId)
    )
  ]);

  const departmentIds = [
    ...wanted.map((w) => w.departmentId),
    ...resources.map((r) => r.department_id),
    ...staff.map((r) => r.department_id)
  ];
  const departments = await readById<{ id: string; institution_id: string | null }>(
    admin,
    'departments',
    'id, institution_id',
    departmentIds
  );

  return {
    resources: new Map(resources.map((r) => [r.id, { institution_id: r.institution_id, department_id: r.department_id }])),
    staff: new Map(staff.map((r) => [r.id, { institution_id: r.institution_id, department_id: r.department_id }])),
    departments: new Map(departments.map((r) => [r.id, r.institution_id])),
    profiles: new Map(profiles.map((r) => [r.id, r.institution_id]))
  };
}

export function placeTasks(tasks: WalkTaskRow[], lookups: PlacementLookups): Map<string, TaskPlacement> {
  return new Map(tasks.map((t) => [t.id, placeTask(t, lookups)]));
}

/**
 * Complaints that were alive at some point in the week: filed before it ended
 * and not resolved before it began.
 *
 * ── THE SELECT LIST IS THE ENFORCEMENT ──────────────────────────────────────
 * Status and dates only. No subject, no description, no name, no phone. ICC
 * complaints are filtered out here AND ignored again in buildReportCards.
 */
export async function loadComplaintRows(
  admin: SupabaseClient,
  week: ReportWeek
): Promise<{ rows: ComplaintRow[]; truncated: boolean }> {
  const weekStartIso = new Date(week.startMs).toISOString();
  const weekEndIso = new Date(week.endMs).toISOString();
  // Complaints marked "about the Joint MD" are left out of every college's
  // counts: this read is the service role, and the cards are seen widely.
  const { data, error } = await readLeavingOutAboutJointMd(admin, (leaveOut) => {
    const base = admin
      .from('grievance_tickets')
      .select('institution_id, status, created_at, resolved_at, sla_deadline, withdrawn_at, is_icc_only')
      .eq('is_icc_only', false);
    return (leaveOut ? leaveOutAboutJointMd(base) : base)
      .lt('created_at', weekEndIso)
      .or(`resolved_at.is.null,resolved_at.gte."${weekStartIso}"`)
      // Newest first, so if the limit is ever hit it is the oldest backlog that
      // is cut — and the cut is reported, never silent.
      .order('created_at', { ascending: false })
      .limit(COMPLAINT_LIMIT);
  });
  if (error) throw new Error(`complaint_read_failed: ${error.message}`);
  const rows = (data ?? []) as ComplaintRow[];
  const truncated = rows.length >= COMPLAINT_LIMIT;
  if (truncated) {
    logger.warn(LOG_MODULE, 'complaint read hit its limit — complaint counts may be short', {
      limit: COMPLAINT_LIMIT,
      weekStart: week.weekStart
    });
  }
  return { rows, truncated };
}

export interface LoadedReportCards {
  colleges: College[];
  board: ReportCardBoard;
}

export async function loadReportCards(
  admin: SupabaseClient,
  week: ReportWeek,
  now: Date
): Promise<LoadedReportCards> {
  const [colleges, tasks, complaints] = await Promise.all([
    loadColleges(admin),
    loadCampusWalkTasks(admin),
    loadComplaintRows(admin, week)
  ]);
  const placements = placeTasks(tasks, await loadPlacementLookups(admin, tasks));
  return {
    colleges,
    board: buildReportCards({
      colleges,
      tasks,
      complaints: complaints.rows,
      complaintsTruncated: complaints.truncated,
      placements,
      week,
      now
    })
  };
}

// ── Who may see which card ───────────────────────────────────────────────────

/**
 * A flat shape rather than a discriminated union: this repo compiles with
 * strictNullChecks off, which stops TypeScript narrowing a union on a flag
 * (same reason as GateResult in the scoreboard pages).
 */
export interface ReportCardViewer {
  /** 'all' = Director / super admin; 'college' = that college's head; 'none' = refused. */
  scope: 'all' | 'college' | 'none';
  /** Set when scope is 'college'; empty string otherwise. */
  institutionId: string;
}

/**
 * The Director (any of resolveDirectors' three paths) and super admins see
 * every college. A principal of a college sees that college's card, with the
 * other colleges in the comparison table. Everyone else is refused — in words,
 * by the page, never by a redirect.
 */
export async function resolveReportCardViewer(
  admin: SupabaseClient,
  userId: string,
  deps: Pick<ReportCardRunDeps, 'resolveHeads' | 'resolveDirectorIds'> = defaultReportCardRunDeps
): Promise<ReportCardViewer> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id, institution_id, is_super_admin')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return { scope: 'none', institutionId: '' };
  if (profile.is_super_admin === true) return { scope: 'all', institutionId: '' };

  const directors = await deps.resolveDirectorIds(admin);
  if (directors.source === 'director' && directors.ids.includes(userId)) {
    return { scope: 'all', institutionId: '' };
  }

  const institutionId = (profile.institution_id as string | null) ?? null;
  if (!institutionId) return { scope: 'none', institutionId: '' };
  const heads = await deps.resolveHeads(admin, [institutionId]);
  return (heads.get(institutionId) ?? []).includes(userId)
    ? { scope: 'college', institutionId }
    : { scope: 'none', institutionId: '' };
}

// ── Weekly bells ─────────────────────────────────────────────────────────────

type BellOptions = Parameters<typeof createBellNotification>[1];

export interface ReportCardRunDeps {
  loadReportCards: (admin: SupabaseClient, week: ReportWeek, now: Date) => Promise<LoadedReportCards>;
  resolveHeads: (admin: SupabaseClient, institutionIds: string[]) => Promise<Map<string, string[]>>;
  resolveDirectorIds: (admin: SupabaseClient) => Promise<{ ids: string[]; source: string }>;
  alreadySent: (admin: SupabaseClient, idempotencyKey: string) => Promise<boolean>;
  sendBell: (admin: SupabaseClient, opts: BellOptions) => Promise<string | null>;
}

export const defaultReportCardRunDeps: ReportCardRunDeps = {
  loadReportCards,
  resolveHeads: resolvePrincipalsByInstitution,
  resolveDirectorIds: async (admin) => {
    // Loaded on demand: the handover chase module is large and only the
    // Director's bell needs it.
    const { resolveDirectors } = await import('@/lib/services/director-desk/handover-chase-service');
    const r = await resolveDirectors(admin);
    return { ids: r.ids, source: r.source };
  },
  alreadySent: async (admin, idempotencyKey) => {
    const { data, error } = await admin
      .from('notifications')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .limit(1);
    if (error) throw new Error(`idempotency_read_failed: ${error.message}`);
    return (data ?? []).length > 0;
  },
  sendBell: createBellNotification
};

export interface ReportCardRunResult {
  weekStart: string;
  dryRun: boolean;
  colleges: number;
  /** College bells delivered this run. */
  collegeBellsSent: number;
  /** College bells skipped because this week's key was already used. */
  collegeBellsAlreadySent: number;
  /** College bells a dry run would have sent. */
  collegeBellsWouldSend: number;
  collegeBellsFailed: number;
  /** Colleges with no principal on record — named in the Director's bell. */
  collegesWithoutHead: string[];
  /** Jobs touching the week that no source could place in any institution. */
  collegeNotKnownJobs: number;
  directorBell: 'sent' | 'already_sent' | 'would_send' | 'failed' | 'no_recipient';
  directorSource: string;
  errors: string[];
}

export async function runWeeklyReportCard(
  admin: SupabaseClient,
  opts: { week: ReportWeek; now: Date; dryRun?: boolean },
  deps: ReportCardRunDeps = defaultReportCardRunDeps
): Promise<ReportCardRunResult> {
  const { week, now } = opts;
  const dryRun = Boolean(opts.dryRun);
  const expiresAt = new Date(now.getTime() + BELL_TTL_MS).toISOString();
  const url = reportCardUrl(week.weekStart);

  const { colleges, board } = await deps.loadReportCards(admin, week, now);
  const heads = await deps.resolveHeads(admin, colleges.map((c) => c.id));
  const directors = await deps.resolveDirectorIds(admin);

  const result: ReportCardRunResult = {
    weekStart: week.weekStart,
    dryRun,
    colleges: colleges.length,
    collegeBellsSent: 0,
    collegeBellsAlreadySent: 0,
    collegeBellsWouldSend: 0,
    collegeBellsFailed: 0,
    collegesWithoutHead: [],
    collegeNotKnownJobs: board.collegeNotKnown.jobs,
    directorBell: 'no_recipient',
    directorSource: directors.source,
    errors: []
  };

  const withoutHead: College[] = [];

  for (const card of board.cards) {
    const recipients = [...new Set(heads.get(card.institutionId) ?? [])];
    if (recipients.length === 0) {
      withoutHead.push({ id: card.institutionId, name: card.name });
      continue;
    }

    const key = collegeBellKey(week.weekStart, card.institutionId);
    if (await deps.alreadySent(admin, key)) {
      result.collegeBellsAlreadySent += 1;
      continue;
    }
    if (dryRun) {
      result.collegeBellsWouldSend += 1;
      continue;
    }

    const id = await deps.sendBell(admin, {
      recipientIds: recipients,
      createdBy: directors.ids[0] ?? recipients[0],
      title: headBellTitle(card),
      body: headBellBody(card, board.rankedOnTimeCount),
      url,
      category: REPORT_CARD_CATEGORY,
      metadata: {
        source: 'campus-walk',
        kind: 'weekly-report-card',
        week_start: week.weekStart,
        institution_id: card.institutionId
      },
      idempotencyKey: key,
      expiresAt
    });
    if (id) {
      result.collegeBellsSent += 1;
    } else if (await deps.alreadySent(admin, key)) {
      // Lost a race with a parallel run: the other run's bell stands.
      result.collegeBellsAlreadySent += 1;
    } else {
      result.collegeBellsFailed += 1;
      result.errors.push(`bell not delivered for ${card.name}`);
    }
  }

  result.collegesWithoutHead = withoutHead.map((c) => c.name);

  // ── The Director's all-college summary ─────────────────────────────────────
  if (directors.ids.length === 0) {
    result.errors.push('no Director and no super admin on record — the summary bell had nobody to go to');
    logger.warn(LOG_MODULE, 'no director recipient', { weekStart: week.weekStart });
    return result;
  }
  if (directors.source !== 'director') {
    logger.warn(LOG_MODULE, 'no director role holder — summary goes to the fallback', {
      source: directors.source
    });
  }

  const directorKey = directorBellKey(week.weekStart);
  if (await deps.alreadySent(admin, directorKey)) {
    result.directorBell = 'already_sent';
    return result;
  }
  if (dryRun) {
    result.directorBell = 'would_send';
    return result;
  }

  const totalFixed = board.cards.reduce((n, c) => n + c.fixed, 0);
  const totalLate = board.cards.reduce((n, c) => n + c.lateNow, 0);
  const id = await deps.sendBell(admin, {
    recipientIds: directors.ids,
    createdBy: directors.ids[0],
    title: `Colleges' week: ${totalFixed} fixed, ${totalLate} late`,
    body: directorBellBody(board, withoutHead),
    url,
    category: REPORT_CARD_CATEGORY,
    metadata: {
      source: 'campus-walk',
      kind: 'weekly-report-card-summary',
      week_start: week.weekStart,
      colleges_without_head: withoutHead.map((c) => c.id)
    },
    idempotencyKey: directorKey,
    expiresAt
  });
  if (id) {
    result.directorBell = 'sent';
  } else if (await deps.alreadySent(admin, directorKey)) {
    result.directorBell = 'already_sent';
  } else {
    result.directorBell = 'failed';
    result.errors.push('the Director summary bell was not delivered');
  }
  return result;
}
