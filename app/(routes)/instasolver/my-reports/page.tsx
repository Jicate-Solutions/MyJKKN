// app/(routes)/instasolver/my-reports/page.tsx
//
// InstaSolver — "My reports". Everything the signed-in person has reported as
// broken, newest first, with the before and after photos.
//
// Director's ruling, 2026-09-30: the fixer's after-photo closes the job at
// once, and the person who reported it can say "Not fixed" for 7 days. This is
// where they see the "fixed" and where that button lives. The bell sent on
// closure (lib/campus-walk/closure.ts) links here.
//
// ── WHICH ROWS ──────────────────────────────────────────────────────────────
// Campus Walk tasks (metadata.source = 'campus-walk') where the viewer is the
// recorded reporter: metadata.reporter_id (InstaSolver) or
// metadata.raised_by_profile_id (both doors). Filtered to the viewer's own id
// on the server — nobody else's reports can reach this page.
//
// ── WHY SERVICE ROLE FOR READS ──────────────────────────────────────────────
// Not to widen access — to narrow it and to sign photos. project_* RLS is
// `auth.uid() IS NOT NULL`, so the session client would return anybody's rows;
// the filter below on the viewer's own id is the real boundary. The service
// client is also the only way to mint signed URLs for the private
// `campus-walk` bucket (G4).
//
// ── D10 ─────────────────────────────────────────────────────────────────────
// The reporter sees the job and the photos, never who fixed it: the rows are
// built field by field and no name leaves the server.
//
// Gated like the other InstaSolver pages: signed in, plus the
// MENU_PERMISSIONS entry ('instasolver.view') in lib/sidebarMenuLink.ts.
// A refusal renders; nothing redirects (rule #27).

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  NOT_FIXED_WINDOW_DAYS,
  REPORT_STATUS_LABEL,
  canSayNotFixed,
  fixRoundKeyOf,
  isRateableFix,
  reportStatusOf,
} from '@/lib/campus-walk/my-reports';
import { MyReportsClient, type MyReport } from './_components/my-reports-client';

export const dynamic = 'force-dynamic';

const BUCKET = 'campus-walk';
const SIGNED_URL_TTL_SECONDS = 60 * 30;
const LIMIT = 100;

const SELECT = 'id, title, status_key, due_date, completed_at, created_at, metadata';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="My reports">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'InstaSolver', href: '/instasolver' },
          { label: 'My reports' },
        ]}
      />
      <div className="mt-4">
        <PageHeader
          title="My reports"
          description="Everything you reported as broken, and whether it has been fixed."
        />
      </div>
      {children}
    </ContentLayout>
  );
}

function Notice({ heading, body }: { heading: string; body: string }) {
  return (
    <Card className="mt-6 max-w-2xl">
      <CardContent className="flex items-start gap-3 py-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div>
          <p className="font-medium">{heading}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MyReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Notice heading="You are not signed in" body="Sign in to see the things you reported." />
      </Shell>
    );
  }

  const admin = createServiceRoleClient();

  // Two plain equality filters rather than one OR over two JSON paths: each is
  // a simple, predictable query, and the merge below de-duplicates the rows an
  // InstaSolver report matches on both.
  const [byReporter, byRaiser] = await Promise.all([
    admin
      .from('project_tasks')
      .select(SELECT)
      .eq('metadata->>source', 'campus-walk')
      .eq('metadata->>reporter_id', user.id)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    admin
      .from('project_tasks')
      .select(SELECT)
      .eq('metadata->>source', 'campus-walk')
      .eq('metadata->>raised_by_profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ]);

  if (byReporter.error && byRaiser.error) {
    return (
      <Shell>
        <Notice
          heading="We could not load your reports"
          body="Please refresh the page in a moment. Nothing you reported has been lost."
        />
      </Shell>
    );
  }

  const rowsById = new Map<string, any>();
  for (const r of [...(byReporter.data ?? []), ...(byRaiser.data ?? [])]) {
    rowsById.set(r.id as string, r);
  }
  const rows = [...rowsById.values()]
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, LIMIT);

  // ── Photos ────────────────────────────────────────────────────────────────
  // The photo-retention cron purges old photos, so a path can point at nothing.
  // A missing object comes back with no signed URL and the card says so,
  // rather than showing a broken image.
  const paths = new Set<string>();
  for (const r of rows) {
    const m = (r.metadata ?? {}) as Record<string, any>;
    if (typeof m.photo_storage_path === 'string' && m.photo_storage_path) paths.add(m.photo_storage_path);
    if (typeof m.fix?.storage_path === 'string' && m.fix.storage_path) paths.add(m.fix.storage_path);
  }
  const signed = new Map<string, string>();
  if (paths.size > 0) {
    const { data: urls } = await admin.storage
      .from(BUCKET)
      .createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl && !u.error) signed.set(u.path, u.signedUrl);
    }
  }

  // ── Stars and thanks (Director, 2026-09-30) ─────────────────────────────
  // The viewer's own ratings only (reporter_profile_id = viewer). A fixed job
  // shows the stars row when the viewer has not yet rated THIS fix round. If
  // the ratings table cannot be read (for instance before its migration is
  // applied), the stars row is hidden rather than offered and then refused.
  const rateable = rows.filter((r) => isRateableFix({ status_key: r.status_key, metadata: r.metadata }));
  let ratingsReadable = true;
  const myRatings = new Map<string, { stars: number; thanks: string | null; signed: boolean }>();
  if (rateable.length > 0) {
    const { data: ratingRows, error: ratingErr } = await admin
      .from('campus_walk_task_ratings')
      .select('task_id, fix_round_key, stars, thanks_text, signed')
      .eq('reporter_profile_id', user.id)
      .in('task_id', rateable.map((r) => r.id as string));
    if (ratingErr) {
      ratingsReadable = false;
      console.error('[instasolver/my-reports] ratings read failed:', ratingErr.message);
    }
    for (const x of ratingRows ?? []) {
      myRatings.set(`${x.task_id}:${x.fix_round_key}`, {
        stars: Number(x.stars),
        thanks: (x.thanks_text as string | null) ?? null,
        signed: x.signed === true,
      });
    }
  }

  const reports: MyReport[] = rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, any>;
    const status = reportStatusOf({ status_key: r.status_key, metadata: m });
    const beforePath = typeof m.photo_storage_path === 'string' ? m.photo_storage_path : null;
    const afterPath = typeof m.fix?.storage_path === 'string' ? m.fix.storage_path : null;
    // Nobody thanks themselves: a job the viewer fixed with their own photo
    // gets no stars row (the route refuses it too).
    const rateableHere =
      ratingsReadable &&
      isRateableFix({ status_key: r.status_key, metadata: m }) &&
      m.fix?.submitted_by_profile_id !== user.id;
    const myRating = rateableHere ? (myRatings.get(`${r.id}:${fixRoundKeyOf(m)}`) ?? null) : null;
    return {
      taskId: r.id as string,
      title: (r.title as string) || 'Report',
      place: typeof m.location === 'string' && m.location.trim() ? m.location.trim() : null,
      status,
      statusLabel: REPORT_STATUS_LABEL[status],
      dueDate: (r.due_date as string | null) ?? null,
      reportedAt: (r.created_at as string | null) ?? null,
      fixedAt: status === 'fixed' ? ((r.completed_at as string | null) ?? null) : null,
      hasBeforePhoto: Boolean(beforePath),
      beforePhotoUrl: beforePath ? (signed.get(beforePath) ?? null) : null,
      hasAfterPhoto: Boolean(afterPath) && status !== 'open' && status !== 'reopened',
      afterPhotoUrl:
        afterPath && status !== 'open' && status !== 'reopened' ? (signed.get(afterPath) ?? null) : null,
      canSayNotFixed: canSayNotFixed({ status_key: r.status_key, completed_at: r.completed_at }),
      canRate: rateableHere && myRating === null,
      myRating,
    };
  });

  return (
    <Shell>
      <MyReportsClient reports={reports} windowDays={NOT_FIXED_WINDOW_DAYS} />
    </Shell>
  );
}
