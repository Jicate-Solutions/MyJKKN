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
 * What is NOT here: any filtering by institution. The rows arrive already
 * scoped by RLS under the reviewer's own session. Re-filtering in the browser
 * would be a second, weaker copy of that rule.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, ImageOff, Inbox, Loader2, X } from 'lucide-react';
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
  current_photo: string | null;
  submitted_at: string;
  image_url: string | null;
};

export default function StaffPhotoQueuePage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/staff-photo/queue?status=pending', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error ?? 'Could not load the queue.');
      setRows(body.submissions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, approve: boolean) {
    setWorking(id);
    try {
      const res = await fetch('/api/hr/staff-photo/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: id, approve }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error ?? 'The decision did not save.');
      toast.success(approve ? 'Approved — it is on their card now.' : 'Sent back.');
      // Drop the row locally so the reviewer keeps their place in a long list.
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The decision did not save.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <ContentLayout title="Staff photographs">
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
          <BreadcrumbItem><BreadcrumbPage>Staff photographs</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Approving a photograph puts it on that person&apos;s identity card. Check it is the right
          person, facing the camera, and clear enough to recognise at a gate.
        </p>

        {loading ? (
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
                      onClick={() => decide(r.id, false)}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Send back
                    </Button>
                  </div>
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
