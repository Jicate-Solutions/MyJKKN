'use client';

/**
 * My photograph — staff self-capture.
 *
 * The person photographs themselves on their own phone and sends it to HR. It
 * is NOT their card photograph until somebody approves it, and this screen says
 * so plainly rather than showing a success tick and leaving them to find out at
 * the counter.
 *
 * WHY THIS IS NOT UNDER /hr
 *   A route under /hr with no MENU_PERMISSIONS entry falls through to
 *   '/hr' -> 'hr.view', which most staff do not hold — the menu row would have
 *   been hidden from exactly the people it exists for. Same shape as
 *   /my-event-feedback: top level, no MENU_PERMISSIONS entry, self-scoped by
 *   the function it calls (fn_submit_my_staff_photo reads auth.uid() and can
 *   only ever act on the caller), so someone with no staff record gets an
 *   explanation rather than a refusal.
 *
 * Why the wait is stated so bluntly: the Director ruled on 2026-09-03 that a
 * self-supplied picture is not evidence the institution photographed anyone, so
 * an unapproved photograph is treated exactly like no photograph by the card
 * printer. A screen that implied otherwise would be lying about a queue.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Clock, Info, Loader2, XCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Mine = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  image_url: string | null;
  current_photo: string | null;
};

export default function MyStaffPhotoPage() {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Mine | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The queue endpoint is scoped by RLS, so for an ordinary staff member it
      // returns exactly their own submissions and nothing else.
      // Rejected as well as pending. A photograph that was turned down and
      // then vanished from this screen is how somebody ends up sending the
      // same unusable picture twice — and HR reviewing it twice.
      const res = await fetch('/api/hr/staff-photo/queue?status=pending,rejected', {
        cache: 'no-store',
      });
      const body = await res.json();
      const rows: Mine[] = body?.submissions ?? [];
      // The endpoint returns oldest first for a reviewer's queue; a person
      // wants their latest.
      const latest = rows.length
        ? [...rows].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0]
        : null;
      setMine(latest);
    } catch {
      // A failed read is not a failed submission — say nothing and let them try.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 900, // a card print wants a little more than a thumbnail
        useWebWorker: true,
      });
      const fd = new FormData();
      fd.append('photo', compressed);
      const res = await fetch('/api/hr/staff-photo/submit', { method: 'POST', body: fd });
      const body = await res.json();
      if (res.status === 403) {
        // Having no staff record is a standing condition, not a transient
        // failure, so it becomes a banner rather than a toast that vanishes.
        setBlocked(body?.error ?? 'This login has no staff record.');
        return;
      }
      if (!res.ok || !body?.success) throw new Error(body?.error ?? 'Could not send the photograph.');
      toast.success('Sent to HR. You will see it on your card once it is approved.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the photograph.');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <ContentLayout title="My photograph">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>My photograph</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-lg space-y-4">
        {blocked ? (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="pt-6 text-sm">{blocked}</CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Your identity card photograph</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Take a photograph of your face, looking straight at the camera, in good light.
                  Someone in HR checks it before it goes on your card.
                </p>

                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                  </div>
                ) : mine?.status === 'pending' ? (
                  <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50/50 p-3">
                    <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900">Waiting for HR to approve</p>
                      <p className="text-amber-800">
                        Sent {new Date(mine.submitted_at).toLocaleDateString('en-IN')}. Until it is
                        approved, your card still uses whatever photograph is already on file.
                      </p>
                    </div>
                  </div>
                ) : mine?.status === 'rejected' ? (
                  <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50/50 p-3">
                    <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-700" />
                    <div className="text-sm">
                      <p className="font-medium text-red-900">Not accepted — please send another</p>
                      {/* The reason, verbatim from the reviewer. Without it people
                          resend the same picture and nothing improves. */}
                      <p className="text-red-800">
                        {mine.review_note?.trim()
                          ? mine.review_note
                          : 'No reason was given. Take another photograph following the guidance below.'}
                      </p>
                    </div>
                  </div>
                ) : null}

                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    // Front camera: this is explicitly a picture of yourself.
                    capture="user"
                    onChange={handleFile}
                    className="hidden"
                    disabled={busy}
                  />
                  <Button asChild type="button" className="h-12 w-full" disabled={busy}>
                    <span>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                      {mine ? 'Take a different photograph' : 'Take my photograph'}
                    </span>
                  </Button>
                </label>
                {mine ? (
                  <p className="text-xs text-muted-foreground">
                    A new photograph replaces the one waiting. HR only ever sees one from you.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardContent className="space-y-3 pt-6 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Info className="h-4 w-4" />
                  What HR is looking for
                </div>
                {/* Passport style, by standing decision. Written out rather than
                    left to judgement so that 764 people are held to one rule and
                    a rejected photograph can name which line it missed. */}
                <ul className="ml-1 list-inside list-disc space-y-1 text-muted-foreground">
                  <li>Head and shoulders, filling most of the picture</li>
                  <li>Looking straight at the camera, eyes open, plain expression</li>
                  <li>Plain, light background — a wall is ideal</li>
                  <li>No sunglasses, no cap or hat</li>
                  <li>Even light on your face, no strong shadow and no glare</li>
                  <li>Nobody else in the picture</li>
                </ul>
                <p className="text-muted-foreground">
                  Your photograph is what a person at a gate looks at to check the card belongs to
                  you. That is why someone approves it rather than it going straight on.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
