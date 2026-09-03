// app/(routes)/campus-walk/fix/page.tsx
// ============================================================================
// Campus Walk — the fixer's screen. /campus-walk/fix?task=<uuid>
//
// Spec: specs/campus-walk-2026-08-17.md (D4, D8, D10; guardrails G4, G5).
//
// Closure verification IS the product (G5). This is the half of it the
// housekeeping or maintenance staff member sees: the reported condition, the
// deadline, and one button to send a photo of the finished work.
//
// ── NO SILENT REDIRECTS (rule #27) ──────────────────────────────────────────
// Every refusal on this page RENDERS. Not signed in, not staff, wrong ticket,
// nobody assigned — each one is a card that states the actual reason and names
// who to go to. A `redirect('/dashboard')` here would produce the bounce-loop
// that has already cost this project debugging time: tap the ticket, land on the
// dashboard, tap again, same thing, with nothing on screen to explain it.
//
// ── THE GATE IS DUPLICATED, ON PURPOSE ──────────────────────────────────────
// The same rules live in app/api/campus-walk/fix/route.ts. Two reasons, both
// deliberate. Structurally, a Next route file cannot export helpers without
// breaking its generated route-export type check, and this lane owns only three
// files (no shared lib module). Securely, this copy is UX and that copy is
// enforcement: a hand-rolled POST never renders a page, so the route's check has
// to stand alone regardless of what this file does.
//
// ── WHY SERVICE ROLE FOR READS ──────────────────────────────────────────────
// Not to widen access — to narrow it. project_* RLS is `auth.uid() IS NOT NULL`
// for read AND write (20260528000000_pm_projects_foundation.sql:842, 847-848),
// so the session client would happily return the same rows to anybody signed in.
// The gate below is the real boundary, and the service client is also the only
// way to mint signed URLs for the private `campus-walk` bucket (G4).
// ============================================================================

import { AlertCircle, ClipboardList, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { FixClient, type ApprovalState, type FixTicket } from './_components/fix-client';

export const dynamic = 'force-dynamic';

const BUCKET = 'campus-walk';
const SIGNED_URL_TTL_SECONDS = 60 * 30; // long enough to finish the job, short enough to expire
const CLOSED_STATUSES = new Set(['done', 'cancelled', 'archived']);

function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface PageProps {
  searchParams: Promise<{ task?: string }>;
}

// ── Shells ───────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Breadcrumbs are rendered globally by <AutoBreadcrumbs /> in the routes
    // layout; PageBreadcrumb is a deprecated no-op shim, so nothing is added here.
    <ContentLayout title="Close a campus job">
      <div className="mt-4">
        <PageHeader
          title="Close a campus job"
          description="Show the finished work and send it for approval."
        />
      </div>
      {children}
    </ContentLayout>
  );
}

/**
 * The explicit refusal. Says what happened, why, and who to talk to.
 * `contact` is a department head or the Campus Operations owner — never the
 * person who filed the report (D10: the ticket is a "Management walk").
 */
function DeniedCard({
  heading,
  reason,
  contact,
}: {
  heading: string;
  reason: string;
  contact?: string | null;
}) {
  return (
    <Card className="mx-auto mt-6 w-full max-w-2xl border-amber-300">
      <CardContent className="flex items-start gap-3 py-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="font-medium">{heading}</p>
          <p className="text-sm text-muted-foreground">{reason}</p>
          {contact ? (
            <p className="text-sm text-muted-foreground">
              Please speak to <span className="font-medium text-foreground">{contact}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Please speak to the Campus Operations desk.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Contact resolution ───────────────────────────────────────────────────────

async function resolveContact(
  admin: ReturnType<typeof createServiceRoleClient>,
  departmentId: string | null
): Promise<string | null> {
  if (departmentId) {
    const { data: dept } = await admin
      .from('departments')
      .select('department_name, head_of_department_id')
      .eq('id', departmentId)
      .maybeSingle();
    if (dept?.head_of_department_id) {
      const { data: head } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', dept.head_of_department_id)
        .maybeSingle();
      if (head?.full_name) {
        return dept.department_name
          ? `${head.full_name} (${dept.department_name})`
          : head.full_name;
      }
    }
    if (dept?.department_name) return `the ${dept.department_name} department head`;
  }

  const { data: project } = await admin
    .from('projects')
    .select('owner_staff_id')
    .eq('code', 'CAMPUS-OPS')
    .maybeSingle();
  if (project?.owner_staff_id) {
    const { data: owner } = await admin
      .from('staff')
      .select('first_name, last_name')
      .eq('id', project.owner_staff_id)
      .maybeSingle();
    const name = [owner?.first_name, owner?.last_name].filter(Boolean).join(' ').trim();
    if (name) return `${name} (Campus Operations)`;
  }
  return null;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CampusWalkFixPage({ searchParams }: PageProps) {
  const { task: taskId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <DeniedCard
          heading="You are not signed in"
          reason="Sign in with your JKKN account to see the job that was assigned to you."
          contact={null}
        />
      </Shell>
    );
  }

  const admin = createServiceRoleClient();

  // The caller must be an active staff member. Students and parents have real
  // authenticated accounts on this platform, and open project_* RLS means the
  // database would happily serve them a maintenance ticket.
  const { data: staffRows } = await admin
    .from('staff')
    .select('id, first_name, last_name, department_id, is_active')
    .eq('profile_id', user.id);
  const callerStaff = (staffRows ?? []).find((s: any) => s.is_active) ?? null;

  if (!callerStaff) {
    return (
      <Shell>
        <DeniedCard
          heading="You don't have access to this screen"
          reason="This screen is for the team member a campus job was assigned to, and your account is not linked to an active personnel record."
          contact={await resolveContact(admin, null)}
        />
      </Shell>
    );
  }

  // ── No ticket named: show this person's open jobs ─────────────────────────
  // A dead-end empty state would be the same bounce-loop by another route, so
  // the bare URL lists what the fixer actually has open.
  if (!taskId) {
    return (
      <Shell>
        <MyOpenJobs admin={admin} staffId={callerStaff.id} />
      </Shell>
    );
  }

  const { data: task, error: taskErr } = await admin
    .from('project_tasks')
    .select(
      'id, project_id, title, description, due_date, status_key, is_blocked, owner_staff_id, completed_at, metadata'
    )
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr) {
    return (
      <Shell>
        <DeniedCard
          heading="We could not open that job"
          reason="Something went wrong loading the ticket. Please pull down to refresh, or try again in a moment."
          contact={null}
        />
      </Shell>
    );
  }
  if (!task) {
    return (
      <Shell>
        <DeniedCard
          heading="That job no longer exists"
          reason="The ticket may have been removed, or the link may be out of date."
          contact={await resolveContact(admin, callerStaff.department_id ?? null)}
        />
      </Shell>
    );
  }

  const metadata = (task.metadata ?? {}) as Record<string, any>;
  if (metadata.source !== 'campus-walk') {
    return (
      <Shell>
        <DeniedCard
          heading="This is not a campus walk job"
          reason="This screen only closes jobs raised from a campus walk. That ticket belongs somewhere else."
          contact={null}
        />
      </Shell>
    );
  }

  // Accountable in RACI owns the fix. owner_staff_id is checked as a fallback
  // because campus-walk-service writes the assignee rows best-effort — a failed
  // insert there must not lock the fixer out of their own job.
  const { data: accountable } = await admin
    .from('project_task_assignees')
    .select('staff_id')
    .eq('task_id', taskId)
    .eq('role', 'accountable')
    .maybeSingle();

  const accountableStaffId = (accountable?.staff_id as string | null) ?? task.owner_staff_id;

  if (!accountableStaffId) {
    return (
      <Shell>
        <DeniedCard
          heading="This job has nobody responsible yet"
          reason="Nobody has been made responsible for this ticket, so it cannot be closed from here until somebody is."
          contact={await resolveContact(admin, callerStaff.department_id ?? null)}
        />
      </Shell>
    );
  }

  let actingAsDepartmentHead = false;

  if (accountableStaffId !== callerStaff.id) {
    // Second door: the department head of whoever is accountable. A supervisor
    // legitimately closes out for a cleaner who has no smartphone.
    const { data: accountableStaff } = await admin
      .from('staff')
      .select('department_id')
      .eq('id', accountableStaffId)
      .maybeSingle();

    const deptId = (accountableStaff?.department_id as string | null) ?? null;
    let isHead = false;
    if (deptId) {
      const { data: dept } = await admin
        .from('departments')
        .select('head_of_department_id')
        .eq('id', deptId)
        .maybeSingle();
      isHead = Boolean(dept?.head_of_department_id && dept.head_of_department_id === user.id);
    }

    if (!isHead) {
      return (
        <Shell>
          <DeniedCard
            heading="This job is assigned to someone else"
            reason="Only the person responsible for this job, or their department head, can close it."
            contact={await resolveContact(admin, deptId)}
          />
        </Shell>
      );
    }
    actingAsDepartmentHead = true;
  }

  // ── Photos ────────────────────────────────────────────────────────────────
  // The observation path is written by campus-walk-service into
  // metadata.photo_storage_path; the version-1 attachment row is the fallback
  // for a task whose attachment insert succeeded but whose metadata was trimmed.
  let problemPath: string | null =
    typeof metadata.photo_storage_path === 'string' ? metadata.photo_storage_path : null;
  let fixPath: string | null =
    typeof metadata.fix?.storage_path === 'string' ? metadata.fix.storage_path : null;

  if (!problemPath || !fixPath) {
    const { data: attachments } = await admin
      .from('project_task_attachments')
      .select('id, storage_path, version, is_final_report')
      .eq('task_id', taskId)
      .order('version', { ascending: true });
    const rows = attachments ?? [];
    if (!problemPath) problemPath = (rows[0]?.storage_path as string | undefined) ?? null;
    if (!fixPath) {
      const finalRow = [...rows].reverse().find((r: any) => r.is_final_report);
      fixPath = (finalRow?.storage_path as string | undefined) ?? null;
    }
  }

  const wanted = [problemPath, fixPath].filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (wanted.length > 0) {
    const { data: urls } = await admin.storage
      .from(BUCKET)
      .createSignedUrls([...new Set(wanted)], SIGNED_URL_TTL_SECONDS);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }

  const approvalState = (metadata.fix?.approval?.state as ApprovalState | undefined) ?? null;

  // Built field by field rather than spread: metadata.raised_by_profile_id must
  // never reach the browser. D10 — the fixer sees "Management walk", not a name.
  const ticket: FixTicket = {
    taskId: task.id as string,
    title: (task.title as string) ?? 'Campus job',
    description: (task.description as string | null) || null,
    category: typeof metadata.category === 'string' ? metadata.category : null,
    kind: typeof metadata.kind === 'string' ? metadata.kind : null,
    unsafe: Boolean(metadata.unsafe),
    dueDate: (task.due_date as string | null) ?? null,
    statusKey: (task.status_key as string) ?? 'todo',
    isBlocked: Boolean(task.is_blocked),
    problemPhotoUrl: problemPath ? (signed.get(problemPath) ?? null) : null,
    fixPhotoUrl: fixPath ? (signed.get(fixPath) ?? null) : null,
    fix: metadata.fix
      ? {
          submittedAt: (metadata.fix.submitted_at as string | null) ?? null,
          submittedByName: (metadata.fix.submitted_by_name as string | null) ?? null,
          note: (metadata.fix.note as string | null) ?? null,
          approvalState,
          approvalNote: (metadata.fix.approval?.note as string | null) ?? null,
          decidedAt: (metadata.fix.approval?.decided_at as string | null) ?? null,
        }
      : null,
    blocked: metadata.blocked
      ? {
          at: (metadata.blocked.at as string | null) ?? null,
          reasonCode: (metadata.blocked.reason_code as string | null) ?? null,
          reason: (metadata.blocked.reason as string | null) ?? null,
        }
      : null,
    slaPausedDays: Number(metadata.sla?.paused_days_total ?? 0) || 0,
    actingAsDepartmentHead,
  };

  return (
    <Shell>
      <div className="mt-2">
        <FixClient ticket={ticket} />
      </div>
    </Shell>
  );
}

// ── The fixer's own open jobs ────────────────────────────────────────────────

async function MyOpenJobs({
  admin,
  staffId,
}: {
  admin: ReturnType<typeof createServiceRoleClient>;
  staffId: string;
}) {
  const { data: assigned } = await admin
    .from('project_task_assignees')
    .select('task_id')
    .eq('staff_id', staffId)
    .eq('role', 'accountable');

  const ids = [...new Set((assigned ?? []).map((r: any) => r.task_id).filter(Boolean))] as string[];

  const collected = new Map<string, any>();

  if (ids.length > 0) {
    const { data } = await admin
      .from('project_tasks')
      .select('id, title, due_date, status_key, is_blocked, metadata')
      .in('id', ids);
    for (const t of data ?? []) collected.set(t.id, t);
  }

  // Same fallback as the gate: the assignee insert is best-effort upstream.
  const { data: owned } = await admin
    .from('project_tasks')
    .select('id, title, due_date, status_key, is_blocked, metadata')
    .eq('owner_staff_id', staffId);
  for (const t of owned ?? []) collected.set(t.id, t);

  const jobs = [...collected.values()]
    .filter((t: any) => (t.metadata ?? {}).source === 'campus-walk')
    .filter((t: any) => !CLOSED_STATUSES.has(t.status_key))
    .sort((a: any, b: any) => {
      const au = Boolean((a.metadata ?? {}).unsafe);
      const bu = Boolean((b.metadata ?? {}).unsafe);
      if (au !== bu) return au ? -1 : 1; // D6 — unsafe first, always
      return String(a.due_date ?? '9999-12-31').localeCompare(String(b.due_date ?? '9999-12-31'));
    });

  if (jobs.length === 0) {
    return (
      <Card className="mx-auto mt-6 w-full max-w-2xl">
        <CardContent className="flex items-start gap-3 py-6">
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Nothing open for you</p>
            <p className="text-sm text-muted-foreground">
              You have no campus jobs waiting. When one is assigned to you it will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto mt-2 w-full max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">
        {jobs.length} job{jobs.length === 1 ? '' : 's'} waiting on you. Tap one to close it.
      </p>
      {jobs.map((t: any) => {
        const meta = (t.metadata ?? {}) as Record<string, any>;
        return (
          <Link key={t.id} href={`/campus-walk/fix?task=${t.id}`} className="block">
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Management walk</Badge>
                  {meta.unsafe && (
                    <Badge variant="destructive" className="gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      Safety
                    </Badge>
                  )}
                  {t.is_blocked && <Badge variant="outline">Held up</Badge>}
                  {t.status_key === 'review' && <Badge variant="outline">Waiting for approval</Badge>}
                </div>
                <p className="font-medium leading-snug">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.due_date ? `Due ${formatDay(t.due_date)}` : 'No deadline set'}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
