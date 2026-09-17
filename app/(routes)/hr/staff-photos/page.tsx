'use client';

/**
 * Staff photographs — the approval queue.
 *
 * This screen IS the institutional act. Approving here is what turns a picture
 * somebody took of themselves into the photograph an identity card may print
 * (Director ruling 2026-09-03; see the migration header for the full reasoning).
 *
 * Deliberately shows the photograph already on file beside the new one. A
 * reviewer's real question is "is this the same person, and is it better than
 * what we have" — answering that from the new picture alone is guesswork.
 *
 * THE HONEST LIMIT OF THIS REVIEW (standing decision 2026-09-16: one central
 * HR team reviews all eleven colleges). A reviewer here does not know 764
 * faces. They can establish that a photograph is USABLE — clear, front-on,
 * plain background. They cannot establish WHO IT IS. What binds the picture to
 * the person is that the person was signed in as themselves when they took it
 * (fn_submit_my_staff_photo resolves the staff row from auth.uid() and accepts
 * no person as an argument). That is a real factor and a weaker one than a
 * college clerk recognising somebody, and the screen says so rather than
 * implying an identity check it cannot perform. The record details and the
 * photograph already on file are shown for whatever help they give.
 *
 * What is NOT here: any filtering by institution. The rows arrive already
 * scoped by RLS under the reviewer's own session. Re-filtering in the browser
 * would be a second, weaker copy of that rule.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Check, ImageOff, Inbox, Loader2, UserX, X } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Submission = {
  id: string;
  staff_id: string;
  name: string;
  employee_code: string | null;
  designation: string | null;
  current_photo: string | null;
  submitted_at: string;
  image_url: string | null;
};

/**
 * The reasons a photograph is sent back, written out rather than left to each
 * reviewer's words. Two purposes: the person is told something specific enough
 * to act on, and 764 people are held to one standard instead of whatever the
 * reviewer felt like typing that afternoon.
 */
const SEND_BACK_REASONS = [
  'Face is not clear enough — too dark, blurred, or in shadow',
  'Not looking straight at the camera',
  'Background is busy — please stand against a plain wall',
  'Please remove the cap, hat or sunglasses',
  'Too far away — head and shoulders should fill most of the picture',
  'Somebody else is in the picture',
] as const;

type MissingGroup = {
  institution_id: string;
  institution_name: string;
  total: number;
  missing: { id: string; name: string; employee_code: string | null; designation: string | null }[];
};

export default function StaffPhotoQueuePage() {
  // Two jobs, one screen: decide the photographs that arrived, and see who has
  // not sent one. The second is what makes the first happen — a tool nobody is
  // asked to use produces nothing.
  const [view, setView] = useState<'queue' | 'missing'>('queue');
  const [missing, setMissing] = useState<MissingGroup[] | null>(null);
  const [missingTotals, setMissingTotals] = useState<{ active: number; missing: number } | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  // Which card is currently asking "why?" — a send-back without a reason is
  // the thing this screen exists to prevent.
  const [askingWhy, setAskingWhy] = useState<string | null>(null);
  // Photographs a failed delete left behind. Shown on this screen because it is
  // the screen whose action created them, and because a record nobody renders
  // is the same silence BUG-006145 was about.
  const [orphans, setOrphans] = useState<{ id: string; object: string; name: string; status: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/staff-photo/queue?status=pending', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error ?? 'Could not load the queue.');
      setRows(body.submissions ?? []);
      setOrphans(body.orphans ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMissing = useCallback(async () => {
    setMissingLoading(true);
    try {
      const res = await fetch('/api/hr/staff-photo/missing', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error ?? 'Could not load the list.');
      setMissing(body.groups ?? []);
      setMissingTotals({ active: body.total_active ?? 0, missing: body.total_missing ?? 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the list.');
    } finally {
      setMissingLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Fetched on first switch only — it reads every active staff row and there
    // is no reason to pay for that unless somebody asks to see it.
    if (view === 'missing' && missing === null) void loadMissing();
  }, [view, missing, loadMissing]);

  async function decide(id: string, approve: boolean, note?: string) {
    setWorking(id);
    try {
      const res = await fetch('/api/hr/staff-photo/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: id, approve, note: note ?? null }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error ?? 'The decision did not save.');
      toast.success(approve ? 'Approved — it is on their card now.' : 'Sent back.');
      // Drop the row locally so the reviewer keeps their place in a long list.
      setRows((r) => r.filter((x) => x.id !== id));
      setAskingWhy(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The decision did not save.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <ContentLayout title="Team member photographs">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Team member photographs</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {orphans.length > 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
            <div>
              <p className="font-medium text-amber-900">
                {orphans.length === 1
                  ? 'One photograph could not be deleted and is still stored'
                  : `${orphans.length} photographs could not be deleted and are still stored`}
              </p>
              <p className="text-amber-800">
                The decision was saved, but removing the picture afterwards failed. These are
                photographs of people that nobody agreed to keep. Ask someone with access to the
                file storage to remove them.
              </p>
              <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-amber-900">
                {orphans.map((o) => (
                  <li key={o.id}>
                    {o.name} · {o.status} · {o.object}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant={view === 'queue' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('queue')}
          >
            Waiting for a decision{rows.length ? ` (${rows.length})` : ''}
          </Button>
          <Button
            variant={view === 'missing' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('missing')}
          >
            <UserX className="mr-1 h-4 w-4" />
            Nobody has sent one
            {missingTotals ? ` (${missingTotals.missing})` : ''}
          </Button>
        </div>

        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Approving puts this photograph on that person&apos;s identity card.</p>
          <p className="text-muted-foreground">Approve when all of these are true:</p>
          <ul className="ml-1 list-inside list-disc text-muted-foreground">
            <li>Head and shoulders fill most of the picture</li>
            <li>Looking straight at the camera, eyes open, plain expression</li>
            <li>Plain, light background</li>
            <li>No sunglasses, cap or hat</li>
            <li>Even light, no strong shadow or glare</li>
            <li>Nobody else in the picture</li>
          </ul>
          <p className="text-muted-foreground">
            You are confirming the photograph is usable. You are not confirming who the person is —
            that rests on them having been signed in as themselves when they took it.
          </p>
        </div>

        {view === 'missing' ? (
          missingLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !missing || missing.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nobody to show.
            </div>
          ) : (
            <div className="space-y-4">
              {missingTotals ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{missingTotals.missing}</span> of{' '}
                  {missingTotals.active} active staff have no photograph a card could print.
                </p>
              ) : null}
              {missing.map((g) => (
                <div key={g.institution_id} className="rounded-md border">
                  <div className="flex items-baseline justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <p className="truncate font-medium">{g.institution_name}</p>
                    <p className="flex-shrink-0 text-sm text-muted-foreground">
                      {g.missing.length} of {g.total}
                    </p>
                  </div>
                  {g.missing.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">Everybody has one.</p>
                  ) : (
                    <ul className="divide-y">
                      {g.missing.map((m) => (
                        <li key={m.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                          <span className="truncate">{m.name}</span>
                          <span className="flex-shrink-0 text-xs text-muted-foreground">
                            {[m.employee_code, m.designation].filter(Boolean).join(' · ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center">
            <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      {/* A central reviewer does not know 764 faces. These are
                          the only other things they have to go on — see the
                          honest limit in the header. */}
                      <p className="truncate text-xs text-muted-foreground">
                        {[r.employee_code, r.designation].filter(Boolean).join(' · ') || 'No record details'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Sent {new Date(r.submitted_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <figure className="flex-1 space-y-1">
                      <figcaption className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        New
                      </figcaption>
                      {r.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.image_url}
                          alt={`Photograph submitted by ${r.name}`}
                          className="aspect-[3/4] w-full rounded border object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center rounded border bg-muted text-muted-foreground">
                          <ImageOff className="h-5 w-5" />
                        </div>
                      )}
                    </figure>
                    <figure className="flex-1 space-y-1">
                      <figcaption className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        On file
                      </figcaption>
                      {r.current_photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.current_photo}
                          alt={`Photograph currently on file for ${r.name}`}
                          className="aspect-[3/4] w-full rounded border object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center rounded border border-dashed text-center text-[11px] text-muted-foreground">
                          None
                        </div>
                      )}
                    </figure>
                  </div>

                  {askingWhy === r.id ? (
                    <div className="space-y-2 rounded-md border bg-muted/40 p-2">
                      <p className="text-xs font-medium">Why is it being sent back?</p>
                      {SEND_BACK_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          disabled={working === r.id}
                          onClick={() => decide(r.id, false, reason)}
                          className="block w-full rounded border bg-background px-2 py-1.5 text-left text-xs hover:border-primary/50 disabled:opacity-50"
                        >
                          {reason}
                        </button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        disabled={working === r.id}
                        onClick={() => setAskingWhy(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        disabled={working === r.id || !r.image_url}
                        onClick={() => decide(r.id, true)}
                      >
                        {working === r.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={working === r.id}
                        onClick={() => setAskingWhy(r.id)}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Send back
                      </Button>
                    </div>
                  )}
                  {!r.image_url ? (
                    <p className="text-xs text-muted-foreground">
                      The picture could not be loaded, so this one cannot be approved from here.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
