'use client';

// components/events/registration/registration-form-share-dialog.tsx
//
// Share ONE registration form: its QR code and its link.
//
// Per FORM, not per event — an event holds many forms (one per monthly run) and
// each has its own public URL, so a single event-level QR would send everyone to
// whichever form happened to be first.
//
// The QR encodes the same URL the Copy Link action gives out, built by the
// caller so the tournament/general routing lives in exactly one place.

import { useCallback } from 'react';
import QRCode from 'qrcode';
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
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Copy, Download, Mail, MessageCircle, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  formRegistrationState,
  FORM_STATE_LABELS,
  type EventRegistrationFormSummary,
} from '@/types/tournament';

/** Filesystem-safe stem for the downloaded PNG. */
const safeFileStem = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'registration-form';

export function RegistrationFormShareDialog({
  open,
  onOpenChange,
  form,
  url,
  eventName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EventRegistrationFormSummary | null;
  /** Public registration URL for THIS form, already routed by event type. */
  url: string;
  eventName?: string;
}) {
  // Read once per render rather than held in state: a `navigator.share` probe in
  // an effect means setState-in-effect (cascading render), and probing during
  // render would disagree between SSR and hydration. WhatsApp + Email are
  // rendered unconditionally instead — wa.me works on desktop and mobile — and
  // native share is offered only as an extra where it exists.
  const formName = form?.name ?? 'form';

  /**
   * CALLBACK REF, not useRef + useEffect. DialogContent renders inside
   * DialogPrimitive.Portal with no forceMount, so Radix's Presence mounts this
   * subtree on a LATER commit than the one where `open` flips to true. An effect
   * keyed on [open, url] therefore fired while the <canvas> was still unmounted,
   * read a null ref, bailed — and never re-ran, because neither dep changed
   * again. The QR silently never drew, with no error to show for it.
   *
   * A callback ref fires exactly when the node attaches, whenever that is. When
   * `url` changes its identity changes too, so React detaches and reattaches and
   * the code redraws for the new URL.
   */
  const drawQrTo = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !url) return;
      QRCode.toCanvas(canvas, url, { width: 240, margin: 1 }).catch(() => {
        toast.error('Could not render the QR code');
      });
    },
    [url]
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Registration link copied');
    } catch {
      toast.error('Could not copy — select the link and copy it manually');
    }
  }, [url]);

  const downloadPng = useCallback(async () => {
    try {
      // Bigger than the on-screen canvas: a QR that will be printed on a poster
      // needs more than 240px to survive scaling.
      const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${safeFileStem(formName)}-qr.png`;
      a.click();
    } catch {
      toast.error('Could not prepare the QR image');
    }
    // formName, not form?.name — an optional chain in a dep array defeats
    // memoization (the React compiler cannot prove it stable).
  }, [url, formName]);

  const shareText = `Register for ${eventName ?? 'our event'}${form ? ` — ${form.name}` : ''}`;

  /**
   * Uses the OS share sheet where it exists (phones, some desktops) and falls
   * back to copying elsewhere, so the button never dead-ends. Support is probed
   * on CLICK — probing during render would differ between SSR and hydration,
   * and probing in an effect would mean setState-in-effect.
   */
  const shareOrCopy = useCallback(async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareText, text: shareText, url });
        return;
      } catch {
        // Dismissing the sheet rejects the promise; that is not an error, and
        // it must NOT fall through to a surprise clipboard write.
        return;
      }
    }
    await copyLink();
  }, [shareText, url, copyLink]);

  const state = form ? formRegistrationState(form) : null;
  const notAcceptingNow = state !== null && state !== 'active';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share {form ? `“${form.name}”` : 'registration form'}
          </DialogTitle>
          <DialogDescription>
            Anyone with this link or QR code can register — no login needed.
          </DialogDescription>
        </DialogHeader>

        {/* Sharing a link that cannot currently be used is a real footgun: the
            organizer prints a poster and every scan lands on "Registration
            closed". Say so before they do. */}
        {notAcceptingNow && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="text-amber-900 dark:text-amber-200">
              This form is{' '}
              <Badge variant="outline" className="mx-0.5 align-middle">
                {state ? FORM_STATE_LABELS[state] : ''}
              </Badge>
              , so the link works but will not accept registrations right now.
            </p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 py-2">
          {/* bg-white is deliberate and not theme-aware: a QR needs a light
              quiet zone to scan, and a dark-mode card behind a transparent
              canvas makes it unreadable. */}
          <div className="rounded-lg border bg-white p-3">
            <canvas ref={drawQrTo} width={240} height={240} />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Scan with a phone camera to open the registration form.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="share-url">Registration link</Label>
          <div className="flex gap-2">
            <Input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" size="icon" onClick={copyLink} title="Copy link">
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
