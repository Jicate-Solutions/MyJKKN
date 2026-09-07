// app/(routes)/campus-walk/scoreboard/_lib/scoreboard-page.tsx
// ============================================================================
// Shared plumbing for the three Campus Walk boards — the gate, the reads, and
// the shells. One copy, because three screens getting the access rule slightly
// differently is how a gate quietly stops being a gate.
//
// ── GUARDRAIL G2 LIVES IN THE ROUTING, NOT IN A COMMENT ─────────────────────
// There is no exported function here that returns the fixing board and the
// coverage board together, and there is no index page under /scoreboard that
// could render both. Each board is its own route, reached on its own. The
// spec's words are "never render the two leaderboards side by side — hunters
// and hunted", and the cheapest way to keep that true forever is to never
// build the object that would make it easy.
//
// ── GUARDRAIL G1 ────────────────────────────────────────────────────────────
// Nothing in this file reads `grievance_tickets`. Campus conditions ride
// project_tasks under CAMPUS-OPS precisely so they can never land in the table
// that backs an HOD performance score and the NAAC/UGC grievance export.
//
// ── WHY SERVICE ROLE FOR READS ──────────────────────────────────────────────
// Same reason app/(routes)/campus-walk/review/page.tsx gives: not to widen
// access but to narrow it. project_* RLS is `auth.uid() IS NOT NULL` for read
// AND write, so a session client would hand these rows to anybody signed in.
// The reporter gate below is the real boundary.
// ============================================================================

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import type { StaffDepartmentIndex, StepDay, WalkTaskRow } from '@/lib/campus-walk/scoreboard';

export const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';

/** A campus-ops backlog is hundreds of tickets, not millions. Bounded read. */
const TASK_LIMIT = 2000;

/** Days of step readings the coverage board plots. */
const STEP_WINDOW_DAYS = 60;

type SupabaseAny = ReturnType<typeof createServiceRoleClient>;

// ── Shells ───────────────────────────────────────────────────────────────────

export function BoardShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  // Breadcrumbs are rendered globally by <AutoBreadcrumbs /> in the routes
  // layout; PageBreadcrumb is a deprecated no-op shim, so nothing is added.
  return (
    <ContentLayout title={title}>
      <div className="mt-4">
        <PageHeader title={title} description={description} />
      </div>
      {children}
    </ContentLayout>
  );
}

/**
 * Every refusal RENDERS and names a reason (house rule #27). A
 * redirect('/dashboard') produces a bounce-loop the reader cannot diagnose,
 * and this project has already paid for that once.
 */
export function DeniedCard({ heading, reason }: { heading: string; reason: string }) {
  return (
    <Card className="mx-auto mt-6 w-full max-w-2xl border-amber-300">
      <CardContent className="flex items-start gap-3 py-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="font-medium">{heading}</p>
          <p className="text-sm text-muted-foreground">{reason}</p>
          <p className="text-sm text-muted-foreground">
            Please speak to the Campus Operations desk if you believe you should have access.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Gate ─────────────────────────────────────────────────────────────────────

/**
 * A flat shape rather than a discriminated union, deliberately.
 *
 * `{ ok: true; … } | { ok: false; … }` is the natural way to write this, but
 * this repo compiles with `strictNullChecks: false` (tsconfig.json, marked
 * TEMPORARY for the Next.js 16 migration), and TypeScript cannot narrow a
 * discriminated union on `if (!gate.ok)` with that flag off — every access to
 * `gate.heading` after the guard fails to compile. Rather than sprinkle casts
 * at three call sites, the fields are always present and the unused half is
 * an empty string.
 */
export interface GateResult {
  /** True when the caller may see the board. */
  ok: boolean;
  /** profiles.id of the caller. Empty string when `ok` is false. */
  profileId: string;
  /** Refusal heading. Empty string when `ok` is true. */
  heading: string;
  /** Refusal reason. Empty string when `ok` is true. */
  reason: string;
}

/**
 * D2 — the same configuration-backed gate the capture screen and the approvals
 * queue already use, imported rather than re-typed. It fails CLOSED: if the
 * policy row is missing, unreadable or empty, lib/campus-walk/reporters.ts
 * falls back to the Director alone and never opens up.
 */
export async function gateScoreboard(): Promise<GateResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return {
      ok: false,
      profileId: '',
      heading: 'You are not signed in',
      reason: 'Sign in with your JKKN account to see this board.'
    };
  }

  if (!(await isCampusWalkReporter(user.email))) {
    return {
      ok: false,
      profileId: '',
      heading: "You don't have access to this board",
      reason:
        'Campus walk boards are limited to named people in this release, while routing is being proven before it opens up.'
    };
  }

  return { ok: true, profileId: user.id, heading: '', reason: '' };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function adminClient(): SupabaseAny {
  return createServiceRoleClient();
}

/** The standing CAMPUS-OPS project every campus walk task lives under. */
export async function resolveCampusOpsProjectId(admin: SupabaseAny): Promise<string | null> {
  const { data, error } = await admin
    .from('projects')
    .select('id')
    .eq('code', CAMPUS_OPS_PROJECT_CODE)
    .maybeSingle();
  if (error) {
    console.error('[campus-walk/scoreboard] project lookup failed:', error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * Every campus walk task, open and closed.
 *
 * Closed ones are the entire point of the fixing board — a board of only open
 * work would score a department on its backlog rather than on what it has
 * finished, which is the opposite of the question D9 asks.
 */
export async function loadWalkTasks(
  admin: SupabaseAny,
  projectId: string
): Promise<WalkTaskRow[]> {
  const { data, error } = await admin
    .from('project_tasks')
    .select(
      'id, title, status_key, is_blocked, due_date, completed_at, created_at, owner_staff_id, metadata'
    )
    .eq('project_id', projectId)
    .eq('metadata->>source', 'campus-walk')
    .order('created_at', { ascending: false })
    .limit(TASK_LIMIT);

  if (error) {
    console.error('[campus-walk/scoreboard] task read failed:', error.message);
    throw new Error('task_read_failed');
  }
  return (data ?? []) as WalkTaskRow[];
}

/**
 * staff.id -> department, for the fixing board.
 *
 * ── THE SELECT LIST IS THE ENFORCEMENT ──────────────────────────────────────
 * `id, department_id` and nothing else. Not first_name, not last_name, not
 * email. D9 is "departments, never named people", and the most reliable way to
 * guarantee a name never reaches a tooltip, a sort key or a serialised prop is
 * for no name to be fetched in the first place. If this select list ever grows
 * a name column, that ruling is broken no matter what the rendering does.
 */
export async function loadStaffDepartments(
  admin: SupabaseAny,
  staffIds: string[]
): Promise<StaffDepartmentIndex> {
  const index: StaffDepartmentIndex = new Map();
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (ids.length === 0) return index;

  const { data: staff, error } = await admin
    .from('staff')
    .select('id, department_id')
    .in('id', ids);

  if (error) {
    console.error('[campus-walk/scoreboard] team member read failed:', error.message);
    return index;
  }

  const departmentIds = [
    ...new Set(
      (staff ?? [])
        .map((s: any) => s.department_id as string | null)
        .filter((d): d is string => Boolean(d))
    )
  ];

  const names = new Map<string, string>();
  if (departmentIds.length > 0) {
    const { data: departments, error: deptError } = await admin
      .from('departments')
      .select('id, department_name')
      .in('id', departmentIds);
    if (deptError) {
      console.error('[campus-walk/scoreboard] department read failed:', deptError.message);
    }
    for (const d of departments ?? []) {
      if (d.id && d.department_name) names.set(d.id as string, d.department_name as string);
    }
  }

  for (const s of (staff ?? []) as any[]) {
    const departmentId = (s.department_id as string | null) ?? null;
    index.set(s.id as string, {
      departmentId,
      departmentName: departmentId ? (names.get(departmentId) ?? null) : null
    });
  }

  return index;
}

/**
 * The step readings MyJKKN actually holds for this person.
 *
 * Returns only days that HAVE a reading. It never pads the range with zeroes:
 * an absent day means nobody measured, and a zero would read as having walked
 * nowhere. describeStepFeed() turns whatever comes back — very possibly an
 * empty array — into a sentence the screen can show honestly.
 */
export async function loadStepDays(
  admin: SupabaseAny,
  profileId: string
): Promise<StepDay[]> {
  const since = new Date(Date.now() - STEP_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await admin
    .from('campus_walk_step_days')
    .select('step_date, steps, source, recorded_at')
    .eq('profile_id', profileId)
    .gte('step_date', since)
    .order('step_date', { ascending: true });

  if (error) {
    // Soft-fail on purpose. The coverage board's other half — how much of the
    // campus the walk reached — comes from the observations and is unaffected
    // by anything wrong here. An empty step list renders as "no readings",
    // which is both honest and exactly what is true today.
    console.error('[campus-walk/scoreboard] step read failed:', error.message);
    return [];
  }
  return (data ?? []) as StepDay[];
}
