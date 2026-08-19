'use client';

// Course Events — share a course's PUBLIC link.
//
// The whole point of a paid course is that a stranger can reach it: the public
// surface (app/(public)/course/[slug]) needs no JKKN account, and anon is
// REVOKEd on every course table so lib/services/courses/public-course-loader.ts
// serves it through a service-role client. Nothing here is privileged — this
// dialog only hands out a URL that is already world-readable — which is why it
// is gated on courses.view (may you SEE this course) rather than on a new
// permission key of its own.
//
// TWO share targets, because a course can have several registration forms:
//   • the course page   /course/<slug>            — visitor reads the fees, picks a form
//   • one named form    /course/<slug>?form=<f>   — straight to that form
// Disabled forms are deliberately absent from the picker: their ?form= link
// silently falls back to the landing page (loadPublicApplyForm filters on
// is_enabled), so offering one would be a dead end dressed up as a choice.
//
// Pattern: components/events/registration/registration-form-share-dialog.tsx.
// Toasts are sonner, not react-hot-toast — every hooks/courses/* module uses
// sonner, and matching the module beats matching the file this was modelled on.

import { useCallback, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { AlertTriangle, Copy, Download, Mail, MessageCircle, Share2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseForms } from '@/hooks/courses/use-course-forms';
import { useCoursePackages } from '@/hooks/courses/use-course-packages';
import { isWindowOpen } from '@/lib/services/courses/application-window';
import type { CourseEvent } from '@/types/courses';

/** Only the fields the share surface needs. Taking a narrow shape rather than a
 *  whole CourseEvent lets the list row and the detail header pass what they
 *  each already hold without either fetching more. */
export type ShareableCourse = Pick<
  CourseEvent,
  'id' | 'title' | 'slug' | 'status' | 'application_opens_at' | 'application_closes_at'
>;

/** Filesystem-safe stem for the downloaded PNG. */
const safeFileStem = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';

/** Sentinel for "the course landing page" in the target radio group. A form's
 *  own id is used for the other options, and a uuid can never collide with it. */
const COURSE_TARGET = 'course';

export function CourseShareDialog({
  open,
  onOpenChange,
  course,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: ShareableCourse | null;
}) {
  const [target, setTarget] = useState<string>(COURSE_TARGET);

  // Passing '' while closed leaves useCourseForms disabled (it is
  // `enabled: Boolean(courseEventId)`), so the twenty closed dialogs the list
  // page renders fire no requests at all. The fetch happens on first open.
  const { data: forms, isLoading: formsLoading } = useCourseForms(
    open && course ? course.id : '',
  );

  // Same lazy gating as the forms above — closed dialogs fetch nothing.
  const { data: packages, isLoading: packagesLoading } = useCoursePackages(
    open && course ? course.id : '',
  );

  const enabledForms = useMemo(
    () => (forms ?? []).filter((f) => f.is_enabled),
    [forms],
  );

  /** A course that defines fees but has no tier on sale cannot price an
   *  application, so its link collects rows that can never become enrollments.
   *  Same check the public loader folds into applicationsOpen. */
  const noPackageOnSale = useMemo(() => {
    const active = (packages ?? []).filter((p) => p.is_active);
    if (active.length === 0) return false;
    return !active.some((p) => isWindowOpen(p.sale_opens_at, p.sale_closes_at));
  }, [packages]);

  const selectedForm = enabledForms.find((f) => f.id === target) ?? null;

  // window.location.origin rather than a configured base URL, so the link is
  // right on localhost, on a preview deployment and in production with no env
  // var to keep in step. Same construction as forms-panel.tsx's publicUrl().
  const url = useMemo(() => {
    if (!course) return '';
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const base = `${origin}/course/${course.slug}`;
    return selectedForm ? `${base}?form=${selectedForm.slug}` : base;
  }, [course, selectedForm]);

  const courseTitle = course?.title ?? 'this course';
  const fileStem = safeFileStem(selectedForm ? `${courseTitle}-${selectedForm.name}` : courseTitle);

  /**
   * CALLBACK REF, not useRef + useEffect. DialogContent renders inside
   * DialogPrimitive.Portal with no forceMount, so Radix's Presence mounts this
   * subtree on a LATER commit than the one where `open` flips to true. An effect
   * keyed on [open, url] therefore reads a null ref, bails — and never re-runs,
   * because neither dep changes again. The QR silently never draws.
   *
   * A callback ref fires when the node actually attaches, whenever that is, and
   * re-fires when `url` changes identity, so switching target redraws.
   */
  const drawQrTo = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !url) return;
      QRCode.toCanvas(canvas, url, { width: 240, margin: 1 }).catch(() => {
        toast.error('Could not render the QR code');
      });
    },
    [url],
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Course link copied');
    } catch {
      toast.error('Could not copy — select the link and copy it manually');
    }
  }, [url]);

  const downloadPng = useCallback(async () => {
    try {
      // Bigger than the on-screen canvas: a QR printed on a poster needs more
      // than 240px to survive scaling.
      const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileStem}-qr.png`;
      a.click();
    } catch {
      toast.error('Could not prepare the QR image');
    }
  }, [url, fileStem]);

  const shareText = selectedForm
    ? `Apply for ${courseTitle} — ${selectedForm.name}`
    : `Apply for ${courseTitle}`;

  /**
   * Uses the OS share sheet where it exists and falls back to copying elsewhere,
   * so the button never dead-ends. Support is probed on CLICK — probing during
   * render would differ between SSR and hydration, and probing in an effect
   * would mean setState-in-effect.
   */
  const shareOrCopy = useCallback(async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareText, text: shareText, url });
      } catch {
        // Dismissing the sheet rejects the promise; that is not an error, and it
        // must NOT fall through to a surprise clipboard write.
      }
      return;
    }
    await copyLink();
  }, [shareText, url, copyLink]);

  // ── the two things that make a shared link useless ──────────────────────
  // 1. loadPublicCourse() filters .eq('status','published'), so any other
  //    status 404s at the URL below right now.
  const notPublished = Boolean(course) && course!.status !== 'published';
  // 2. Published, but nothing to fill in — the same pair of conditions the
  //    loader ANDs into PublicCourseSummary.applicationsOpen. Suppressed while
  //    the forms are still loading, or it would flash on every open.
  const notAccepting =
    !notPublished &&
    Boolean(course) &&
    !formsLoading &&
    !packagesLoading &&
    (!isWindowOpen(course!.application_opens_at, course!.application_closes_at) ||
      enabledForms.length === 0 ||
      noPackageOnSale);

  const windowNotYetOpen =
    Boolean(course?.application_opens_at) &&
    new Date(course!.application_opens_at!) > new Date();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset the target on close so reopening for a different course does
        // not start on a form id that course does not have.
        if (!next) setTarget(COURSE_TARGET);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share {course ? `“${course.title}”` : 'course'}
          </DialogTitle>
          <DialogDescription>
            Anyone with this link or QR code can view the course and apply — no JKKN
            login needed.
          </DialogDescription>
        </DialogHeader>

        {/* A link to an unpublished course does not merely fail to accept
            applications — it 404s. Different problem, louder colour. */}
        {notPublished && (
          <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-500" />
            <p className="text-red-900 dark:text-red-200">
              This course is not published, so the link below shows “Course not available”
              to everyone. Publish it from the Settings tab before you hand it out.
            </p>
          </div>
        )}

        {/* Published but shut: printing a poster now means every scan lands on
            "Applications are closed". Say so before they print it. */}
        {notAccepting && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="text-amber-900 dark:text-amber-200">
              {enabledForms.length === 0
                ? 'This course has no enabled application form, so the link works but nobody can apply through it yet.'
                : noPackageOnSale
                  ? 'None of this course’s packages is on sale right now, so the link works but no application can be priced. Check the sale dates on the Packages tab.'
                  : windowNotYetOpen
                  ? 'The application window has not opened yet, so the link works but will not accept applications until it does.'
                  : 'The application window has closed, so the link works but will not accept applications.'}
            </p>
          </div>
        )}

        {/* Target picker — only shown when there is a genuine choice to make. */}
        {formsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          enabledForms.length > 0 && (
            <div className="space-y-2">
              <Label>Share</Label>
              <RadioGroup value={target} onValueChange={setTarget} className="gap-2">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value={COURSE_TARGET} id="share-target-course" className="mt-0.5" />
                  <Label htmlFor="share-target-course" className="font-normal leading-tight">
                    Course page
                    <span className="block text-xs text-muted-foreground">
                      Fees and details first; the visitor picks a form.
                    </span>
                  </Label>
                </div>
                {enabledForms.map((f) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <RadioGroupItem value={f.id} id={`share-target-${f.id}`} className="mt-0.5" />
                    <Label htmlFor={`share-target-${f.id}`} className="font-normal leading-tight">
                      {f.name}
                      <span className="block text-xs text-muted-foreground">
                        Straight to this application form.
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )
        )}

        <div className="flex flex-col items-center gap-3 py-2">
          {/* bg-white is deliberate and not theme-aware: a QR needs a light quiet
              zone to scan, and a dark card behind a transparent canvas makes it
              unreadable. */}
          <div className="rounded-lg border bg-white p-3">
            <canvas ref={drawQrTo} width={240} height={240} />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Scan with a phone camera to open{selectedForm ? ' the application form' : ' the course page'}.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="course-share-url">Public link</Label>
          <div className="flex gap-2">
            <Input
              id="course-share-url"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyLink}
              title="Copy link"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button type="button" variant="outline" onClick={downloadPng} className="gap-1.5">
            <Download className="h-4 w-4" /> Download QR
          </Button>

          <Button type="button" variant="outline" asChild className="gap-1.5">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </Button>

          <Button type="button" variant="outline" asChild className="gap-1.5">
            <a
              href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`}
            >
              <Mail className="h-4 w-4" /> Email
            </a>
          </Button>

          <Button type="button" variant="outline" onClick={shareOrCopy} className="gap-1.5">
            <Share2 className="h-4 w-4" /> Share…
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
