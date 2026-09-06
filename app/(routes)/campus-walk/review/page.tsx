// app/(routes)/campus-walk/review/page.tsx
// ============================================================================
// Campus Walk — the Director's approvals queue. /campus-walk/review
//
// Spec: specs/campus-walk-2026-08-17.md (D2, D4, D10; guardrail G5).
//
// ── WHY A QUEUE AND NOT A DETAIL PAGE ───────────────────────────────────────
// This is the screen that closes the loop. Until it existed, a fixer could
// upload their proof photo, the task moved to 'review', and nothing on the
// platform could take it further (app/api/campus-walk/fix/route.ts stops there
// on purpose — D4). A per-ticket page would have needed the Director to already
// hold a link to every ticket. He does not. He needs one place that shows
// everything waiting on him.
//
// ── G5: CLOSURE VERIFICATION IS THE PRODUCT ─────────────────────────────────
// Both photos, side by side, on every row. Approving from a title alone is not
// verification, and a screen that made that easy would quietly turn the whole
// lane back into a to-do list.
//
// ── D2: DIRECTOR-ONLY ───────────────────────────────────────────────────────
// Gated here via lib/campus-walk/reporters.ts — the one place that
// app/(routes)/campus-walk/page.tsx and app/api/campus-walk/observations/route.ts
// already use — imported, never re-typed. This gate is UX; the enforcement copy
// lives in app/api/campus-walk/review/route.ts and stands alone, because
// project_* RLS is `auth.uid() IS NOT NULL` for read AND write
// (20260528000000_pm_projects_foundation.sql:842, 847-848) and so the database
// enforces nothing at all here.
//
// ── NO SILENT REDIRECTS (rule #27) ──────────────────────────────────────────
// Every refusal RENDERS, names the reason, and names somebody to go to. A
// redirect('/dashboard') would produce the bounce-loop that has already cost
// this project debugging time.
//
// ── WHY SERVICE ROLE FOR READS ──────────────────────────────────────────────
// Not to widen access — to narrow it. The session client would return the same
// rows to anybody signed in. The gate above is the real boundary, and the
// service client is also the only way to mint signed URLs for the private
// `campus-walk` bucket (G4).
// ============================================================================

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { ReviewClient, type ReviewItem } from './_components/review-client';

export const dynamic = 'force-dynamic';

const BUCKET = 'campus-walk';
const SIGNED_URL_TTL_SECONDS = 60 * 30;
const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';
/** A campus-ops backlog is tens of open tickets, not thousands. Bounded read. */
const QUEUE_LIMIT = 200;
/** Statuses a waiting ticket can never legitimately be in. */
const CLOSED_STATUSES = new Set(['done', 'cancelled', 'archived']);

type SupabaseAny = ReturnType<typeof createServiceRoleClient>;

// ── Shells ───────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Breadcrumbs are rendered globally by <AutoBreadcrumbs /> in the routes
    // layout; PageBreadcrumb is a deprecated no-op shim, so nothing is added here.
    <ContentLayout title="Campus walk approvals">
      <div className="mt-4">
        <PageHeader
          title="Campus walk approvals"
          description="Check the fix photo against what was reported, then close the job or send it back."
        />
      </div>
      {children}
    </ContentLayout>
  );
}

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

/**
 * Somebody real to go to. The owner of the standing CAMPUS-OPS project (the
 * Executive Admin Officer) — never the person who filed the report, because
 * D10 says the ticket presents as a "Management walk" and never as a named
 * observer.
 */
async function resolveCampusOpsContact(admin: SupabaseAny): Promise<string | null> {
  const { data: project } = await admin
    .from('projects')
    .select('owner_staff_id')
    .eq('code', CAMPUS_OPS_PROJECT_CODE)
    .maybeSingle();
  if (!project?.owner_staff_id) return null;

  const { data: owner } = await admin
    .from('staff')
    .select('first_name, last_name')
    .eq('id', project.owner_staff_id)
    .maybeSingle();

  const name = [owner?.first_name, owner?.last_name].filter(Boolean).join(' ').trim();
  return name ? `${name} (Campus Operations)` : null;
}

// ── The queue read ───────────────────────────────────────────────────────────

interface QueueRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status_key: string;
  is_blocked: boolean;
  metadata: Record<string, any>;
}

const QUEUE_COLUMNS =
  'id, title, description, due_date, status_key, is_blocked, metadata';

/**
 * Everything awaiting the Director's decision.
 *
 * The definition of the queue is three facts about a row:
 *   · it lives under the standing CAMPUS-OPS project
 *   · metadata.source = 'campus-walk'                (it is in this lane)
 *   · metadata.fix.approval.state = 'awaiting_approval'  (a fixer pressed send)
 *
 * The primary query asks PostgREST for exactly that, nested JSON path and all.
 * The fallback exists because that nested path is the one thing here that
 * depends on the deployed PostgREST accepting a multi-level operator in a
 * filter: if it is rejected, the queue would be empty-by-error and the loop
 * would stay unclosed, which is the precise failure this whole screen exists to
 * prevent. The fallback narrows on status_key = 'review' instead — the status
 * the fixer route writes on every submit, so an awaiting ticket is always in it
 * — and applies the approval predicate in JS. Same set, different route to it.
 */
async function loadQueue(admin: SupabaseAny, projectId: string): Promise<QueueRow[]> {
  const primary = await admin
    .from('project_tasks')
    .select(QUEUE_COLUMNS)
    .eq('project_id', projectId)
    .eq('metadata->>source', 'campus-walk')
    .eq('metadata->fix->approval->>state', 'awaiting_approval')
    .order('due_date', { ascending: true })
    .limit(QUEUE_LIMIT);

  if (!primary.error) {
    return ((primary.data ?? []) as QueueRow[]).filter(
      (t) => !CLOSED_STATUSES.has(t.status_key)
    );
  }

  console.error(
    '[campus-walk/review] nested approval filter rejected, falling back:',
    primary.error.message
  );

  const fallback = await admin
    .from('project_tasks')
    .select(QUEUE_COLUMNS)
    .eq('project_id', projectId)
    .eq('metadata->>source', 'campus-walk')
    .eq('status_key', 'review')
    .order('due_date', { ascending: true })
    .limit(QUEUE_LIMIT);

  if (fallback.error) {
    console.error('[campus-walk/review] queue read failed:', fallback.error.message);
    throw new Error('queue_read_failed');
  }

  return ((fallback.data ?? []) as QueueRow[]).filter(
    (t) => (t.metadata ?? {}).fix?.approval?.state === 'awaiting_approval'
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CampusWalkReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <DeniedCard
          heading="You are not signed in"
          reason="Sign in with your JKKN account to see the jobs waiting for approval."
          contact={null}
        />
      </Shell>
    );
  }

  const admin = createServiceRoleClient();

  const email = (user.email ?? '').toLowerCase();
  if (!(await isCampusWalkReporter(email))) {
    return (
      <Shell>
        <DeniedCard
          heading="You don't have access to this screen"
          reason="Approving campus walk jobs is Director-only in this release — routing is being proven before it opens up. If a job of yours is waiting here, the person below can chase it."
          contact={await resolveCampusOpsContact(admin)}
        />
      </Shell>
    );
  }

  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id')
    .eq('code', CAMPUS_OPS_PROJECT_CODE)
    .maybeSingle();

  if (projectErr) {
    return (
      <Shell>
        <DeniedCard
          heading="We could not load the approvals list"
          reason="Something went wrong reading Campus Operations. Nothing has changed — please refresh in a moment."
          contact={null}
        />
      </Shell>
    );
  }
  if (!project?.id) {
    return (
      <Shell>
        <DeniedCard
          heading="Campus Operations is not set up yet"
          reason="The standing CAMPUS-OPS project does not exist, so there is nothing for campus walk jobs to sit under. No approvals can be shown until it is created."
          contact={null}
        />
      </Shell>
    );
  }

  let rows: QueueRow[];
  try {
    rows = await loadQueue(admin, project.id as string);
  } catch {
    return (
      <Shell>
        <DeniedCard
          heading="We could not load the approvals list"
          reason="Something went wrong reading the waiting jobs. Nothing has changed — please refresh in a moment."
          contact={null}
        />
      </Shell>
    );
  }

  // ── Photo paths ───────────────────────────────────────────────────────────
  // metadata carries both paths in the normal case: photo_storage_path is
  // written at intake by campus-walk-service, fix.storage_path by the fixer
  // route. The attachments table is the fallback for a row whose metadata was
  // trimmed — one batched query for every task still missing either half,
  // never one query per row.
  const problemPaths = new Map<string, string | null>();
  const fixPaths = new Map<string, string | null>();
  const needsAttachments: string[] = [];

  for (const t of rows) {
    const meta = (t.metadata ?? {}) as Record<string, any>;
    const problem = typeof meta.photo_storage_path === 'string' ? meta.photo_storage_path : null;
    const fixed = typeof meta.fix?.storage_path === 'string' ? meta.fix.storage_path : null;
    problemPaths.set(t.id, problem);
    fixPaths.set(t.id, fixed);
    if (!problem || !fixed) needsAttachments.push(t.id);
  }

  if (needsAttachments.length > 0) {
    const { data: attachments } = await admin
      .from('project_task_attachments')
      .select('task_id, storage_path, version, is_final_report')
      .in('task_id', needsAttachments)
      .order('version', { ascending: true });

    const byTask = new Map<string, any[]>();
    for (const a of attachments ?? []) {
      const list = byTask.get(a.task_id) ?? [];
      list.push(a);
      byTask.set(a.task_id, list);
    }
    for (const taskId of needsAttachments) {
      const list = byTask.get(taskId) ?? [];
      if (!problemPaths.get(taskId)) {
        problemPaths.set(taskId, (list[0]?.storage_path as string | undefined) ?? null);
      }
      if (!fixPaths.get(taskId)) {
        const finalRow = [...list].reverse().find((r: any) => r.is_final_report);
        fixPaths.set(taskId, (finalRow?.storage_path as string | undefined) ?? null);
      }
    }
  }

  const wanted = [
    ...new Set(
      [...problemPaths.values(), ...fixPaths.values()].filter((p): p is string => Boolean(p))
    ),
  ];

  const signed = new Map<string, string>();
  if (wanted.length > 0) {
    // One batched call for the whole page. The bucket is private and stays
    // that way (G4) — these URLs expire.
    const { data: urls, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(wanted, SIGNED_URL_TTL_SECONDS);
    if (signErr) {
      console.error('[campus-walk/review] signing photo URLs failed:', signErr.message);
    }
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }

  // ── Serialise ─────────────────────────────────────────────────────────────
  // Field by field, never a spread: metadata.raised_by_profile_id and
  // metadata.fix.approval.decided_by_profile_id must not reach the browser.
  // D10 — the ticket is a "Management walk", not a person.
  const items: ReviewItem[] = rows.map((t) => {
    const meta = (t.metadata ?? {}) as Record<string, any>;
    const problem = problemPaths.get(t.id) ?? null;
    const fixed = fixPaths.get(t.id) ?? null;
    const approval = (meta.fix?.approval ?? {}) as Record<string, any>;

    return {
      taskId: t.id,
      title: (t.title as string) ?? 'Campus job',
      description: (t.description as string | null) || null,
      category: typeof meta.category === 'string' ? meta.category : null,
      kind: typeof meta.kind === 'string' ? meta.kind : null,
      unsafe: Boolean(meta.unsafe),
      dueDate: (t.due_date as string | null) ?? null,
      statusKey: (t.status_key as string) ?? 'review',
      isBlocked: Boolean(t.is_blocked),
      problemPhotoUrl: problem ? (signed.get(problem) ?? null) : null,
      fixPhotoUrl: fixed ? (signed.get(fixed) ?? null) : null,
      submittedAt: (meta.fix?.submitted_at as string | null) ?? null,
      // The person who did the work, shown to the manager approving it. This is
      // the submitter, not the observer — D10 protects the observer's identity,
      // not the fixer's credit.
      submittedByName: (meta.fix?.submitted_by_name as string | null) ?? null,
      fixNote: (meta.fix?.note as string | null) ?? null,
      // What was asked for last time, carried forward by the fixer route on a
      // re-submission — so "has that actually been answered?" is on screen.
      previousAskNote:
        approval.previous_state === 'changes_requested'
          ? ((approval.previous_note as string | null) ?? null)
          : null,
      slaPausedDays: Number(meta.sla?.paused_days_total ?? 0) || 0,
    };
  });

  // D6 — unsafe first, always. Then the one that has been waiting longest, so
  // the queue drains oldest-first rather than by whatever order the DB felt like.
  items.sort((a, b) => {
    if (a.unsafe !== b.unsafe) return a.unsafe ? -1 : 1;
    return String(a.submittedAt ?? '').localeCompare(String(b.submittedAt ?? ''));
  });

  if (items.length === 0) {
    return (
      <Shell>
        <Card className="mx-auto mt-6 w-full max-w-2xl border-green-300 bg-green-50">
          <CardContent className="flex items-start gap-3 py-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
            <div>
              <p className="font-medium text-green-900">Nothing waiting on you</p>
              <p className="text-sm text-green-900/80">
                Every campus walk job that has been sent for approval has been decided. New ones
                appear here the moment a fixer sends their photo.
              </p>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mt-2">
        <ReviewClient items={items} />
      </div>
    </Shell>
  );
}
