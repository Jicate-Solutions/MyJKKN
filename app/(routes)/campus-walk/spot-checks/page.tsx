// app/(routes)/campus-walk/spot-checks/page.tsx
// ============================================================================
// Campus Walk — spot checks, for college heads and the Director.
// /campus-walk/spot-checks
//
// Director's rulings, 2026-09-30 interview:
//   (3) 1 in 10 jobs closed by a fixer's photo is picked for a spot check
//       (lib/campus-walk/spot-check.ts). The college head checks their
//       college's; the Director checks the jobs he raised. Before and after
//       photos, side by side, and two buttons: "Looks fixed" / "Not fixed".
//   (1) When a reporter says "Not fixed" a second time, the college head is
//       told — and this page is where that bell lands, so it also lists the
//       head's open jobs that have been sent back twice or more.
//
// Reached from those two bells, like the fixer screen is from its own — it has
// no sidebar row, because a row every login could see would put a "Campus
// Walk" group in front of every learner. The MENU_PERMISSIONS key is
// instasolver.view, which every login holds, because principals are not
// guaranteed projects.view. The page itself decides who sees anything.
//
// ── WHO SEES WHAT ───────────────────────────────────────────────────────────
// lib/campus-walk/spot-check.ts `viewerMayCheck` — the same rule the route
// (app/api/campus-walk/spot-check/route.ts) enforces. Everyone else gets a card
// that says why, never a redirect (rule #27).
//
// ── WHY SERVICE ROLE FOR READS ──────────────────────────────────────────────
// Not to widen access — to narrow it. project_* RLS is `auth.uid() IS NOT
// NULL`, so the session client would return every row to anybody; the viewer
// filter here is the boundary. It is also the only way to sign photo URLs in
// the private `campus-walk` bucket (G4).
//
// ── D10 ─────────────────────────────────────────────────────────────────────
// No reporter's or fixer's name leaves the server — rows are built field by
// field.
// ============================================================================

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { HEAD_ALERT_AT_NOT_FIXED, reporterNotFixedCount } from '@/lib/campus-walk/reopen';
import {
  resolveSpotCheckViewer,
  viewerMayCheck,
  type SpotCheck,
  type SpotCheckViewer,
} from '@/lib/campus-walk/spot-check';
import { SpotChecksClient, type FailedTwiceItem, type SpotCheckItem } from './_components/spot-checks-client';

export const dynamic = 'force-dynamic';

const BUCKET = 'campus-walk';
const SIGNED_URL_TTL_SECONDS = 60 * 30;
const LIMIT = 200;
const COLUMNS = 'id, title, status_key, due_date, completed_at, metadata';
const CLOSED = '(done,cancelled,archived)';

type Admin = ReturnType<typeof createServiceRoleClient>;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Spot checks">
      <div className="mt-4">
        <PageHeader
          title="Spot checks"
          description="1 in 10 jobs closed with a fixer's photo is picked at random. Look at the before and after photos and say whether it is really fixed."
        />
      </div>
      {children}
    </ContentLayout>
  );
}

function Notice({ heading, body }: { heading: string; body: string }) {
  return (
    <Card className="mx-auto mt-6 w-full max-w-2xl border-amber-300">
      <CardContent className="flex items-start gap-3 py-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium">{heading}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pending spot checks this viewer may decide. */
async function loadPending(admin: Admin, viewer: SpotCheckViewer): Promise<any[]> {
  const primary = await admin
    .from('project_tasks')
    .select(COLUMNS)
    .eq('metadata->>source', 'campus-walk')
    .eq('status_key', 'done')
    .eq('metadata->spot_check->>state', 'pending')
    .order('completed_at', { ascending: true })
    .limit(LIMIT);

  let rows: any[] = [];
  if (!primary.error) {
    rows = primary.data ?? [];
  } else {
    // A deployed PostgREST that rejects the nested path must not turn into an
    // empty-by-error list: narrow on done + recent, then filter here.
    console.error('[campus-walk/spot-checks] nested filter rejected, falling back:', primary.error.message);
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const fallback = await admin
      .from('project_tasks')
      .select(COLUMNS)
      .eq('metadata->>source', 'campus-walk')
      .eq('status_key', 'done')
      .gte('completed_at', since)
      .order('completed_at', { ascending: true })
      .limit(1000);
    if (fallback.error) throw new Error('spot_check_read_failed');
    rows = fallback.data ?? [];
  }

  return rows.filter((r) => {
    const sc = ((r.metadata ?? {}) as Record<string, any>).spot_check as SpotCheck | undefined;
    return sc?.state === 'pending' && viewerMayCheck(viewer, sc);
  });
}

/** Open jobs of the head's college sent back by a reporter twice or more (ruling 1). */
async function loadFailedTwice(admin: Admin, viewer: SpotCheckViewer): Promise<any[]> {
  const out: any[] = [];
  for (const institutionId of viewer.headOfInstitutionIds) {
    const { data, error } = await admin
      .from('project_tasks')
      .select(COLUMNS)
      .eq('metadata->>source', 'campus-walk')
      .eq('metadata->>institution_id', institutionId)
      .not('status_key', 'in', CLOSED)
      .not('metadata->reopens', 'is', null)
      .order('due_date', { ascending: true })
      .limit(LIMIT);
    if (error) {
      console.error('[campus-walk/spot-checks] failed-twice read failed:', error.message);
      continue;
    }
    for (const r of data ?? []) {
      if (reporterNotFixedCount((r as any).metadata) >= HEAD_ALERT_AT_NOT_FIXED) out.push(r);
    }
  }
  return out;
}

function placeOf(m: Record<string, any>): string | null {
  return typeof m.location === 'string' && m.location.trim() ? m.location.trim() : null;
}

export default async function SpotChecksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Notice heading="You are not signed in" body="Sign in to see the spot checks waiting for you." />
      </Shell>
    );
  }

  const admin = createServiceRoleClient();
  const viewer = await resolveSpotCheckViewer(admin as any, user.id, await isCampusWalkReporter(user.email));

  if (!viewer.isDirector && viewer.headOfInstitutionIds.length === 0) {
    return (
      <Shell>
        <Notice
          heading="Spot checks are for college heads"
          body="This page shows campus jobs picked for a spot check, and it is only for the principal of each college and the Director. If you are a principal and still see this, ask the office to check your principal role in Role Management."
        />
      </Shell>
    );
  }

  let pendingRows: any[] = [];
  let failedRows: any[] = [];
  try {
    [pendingRows, failedRows] = await Promise.all([loadPending(admin, viewer), loadFailedTwice(admin, viewer)]);
  } catch {
    return (
      <Shell>
        <Notice
          heading="We could not load the spot checks"
          body="Please refresh the page in a moment. Nothing has been changed."
        />
      </Shell>
    );
  }

  // ── Photos ────────────────────────────────────────────────────────────────
  const paths = new Set<string>();
  for (const r of [...pendingRows, ...failedRows]) {
    const m = (r.metadata ?? {}) as Record<string, any>;
    if (typeof m.photo_storage_path === 'string' && m.photo_storage_path) paths.add(m.photo_storage_path);
    if (typeof m.fix?.storage_path === 'string' && m.fix.storage_path) paths.add(m.fix.storage_path);
  }
  const signed = new Map<string, string>();
  if (paths.size > 0) {
    const { data: urls } = await admin.storage.from(BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl && !u.error) signed.set(u.path, u.signedUrl);
    }
  }
  const url = (p: unknown) => (typeof p === 'string' && p ? (signed.get(p) ?? null) : null);

  const pending: SpotCheckItem[] = pendingRows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, any>;
    return {
      taskId: r.id as string,
      title: (r.title as string) || 'Campus job',
      place: placeOf(m),
      closedAt: (r.completed_at as string | null) ?? null,
      hasBeforePhoto: Boolean(m.photo_storage_path),
      beforePhotoUrl: url(m.photo_storage_path),
      hasAfterPhoto: Boolean(m.fix?.storage_path),
      afterPhotoUrl: url(m.fix?.storage_path),
      fixNote: typeof m.fix?.note === 'string' && m.fix.note ? m.fix.note : null,
    };
  });

  const failedTwice: FailedTwiceItem[] = failedRows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, any>;
    return {
      taskId: r.id as string,
      title: (r.title as string) || 'Campus job',
      place: placeOf(m),
      notFixedCount: reporterNotFixedCount(m),
      dueDate: (r.due_date as string | null) ?? null,
      hasBeforePhoto: Boolean(m.photo_storage_path),
      beforePhotoUrl: url(m.photo_storage_path),
    };
  });

  return (
    <Shell>
      <SpotChecksClient pending={pending} failedTwice={failedTwice} showFailedTwice={viewer.headOfInstitutionIds.length > 0} />
    </Shell>
  );
}
