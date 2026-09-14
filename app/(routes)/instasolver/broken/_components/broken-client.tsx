'use client';

// app/(routes)/instasolver/broken/_components/broken-client.tsx
//
// The phone-first "something is broken" form. Decisions I1 (anyone with a
// login) and I4 (it lands in Campus Walk's fix lane) —
// specs/instasolver-2026-09-14.md.
//
// Shape and tone are borrowed from Campus Walk's capture screen
// (app/(routes)/campus-walk/_components/walk-client.tsx) on purpose: the same
// amber G4 notice, the same big touch targets, the same brand primitives. The
// differences are deliberate:
//   - the photo is OPTIONAL here. The G4 gate is NOT optional though: an
//     attached photo goes through the same blocking "no people in frame"
//     AlertDialog the capture screen uses, because G4 is locked as "enforced
//     in the capture UI, non-negotiable" and a banner is not enforcement — it
//     is a notice you can scroll past. Optional-photo only means the dialog
//     never appears when no photo is attached.
//   - no offline queue in this lane (out of scope for this PR)
//   - "dangerous" is a plain checkbox rather than a switch plus a confirm
//     dialog, because the audience is everyone, not one trained walker

import { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  MapPin,
  ShieldAlert,
  Trash2,
  Users
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const LOCATION_MIN = 3;
const LOCATION_MAX = 120;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 500;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

interface SuccessState {
  /** Null when routing resolved nobody — then `notice` carries the truth. */
  routedTo: string | null;
  notice: string | null;
  dueDate: string | null;
  dangerous: boolean;
  urgentDelivered: boolean | null;
  /** True when a page was deliberately not sent (per-college cap, or no ledger). */
  pageSuppressed: boolean;
}

/** "2026-09-16" -> "Tue, 16 Sep". Falls back to the raw value if unparseable. */
function formatDue(iso: string | null): string {
  if (!iso) return 'soon';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}

export function BrokenClient() {
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // G4: a photo the reporter has taken but not yet confirmed is free of
  // people. It is NOT attached to the report while it sits here.
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; previewUrl: string } | null>(
    null
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setLocation('');
    setDescription('');
    setDangerous(false);
    setPhoto(null);
    setPhotoPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setPendingPhoto((pending) => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
      return null;
    });
    setCoords(null);
    setLocationNote(null);
    setError(null);
    setSuccess(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const requestGeo = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNote('This device cannot share its location. Just type where it is.');
      return;
    }
    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setLocationNote('Location added. Still type the place in your own words.');
      },
      () => {
        setLocating(false);
        setLocationNote('Could not get your location. Just type where it is.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }, []);

  const onPickPhoto = useCallback((file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setError('That photo is bigger than 10 MB. Take a smaller one, or send without a photo.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    // Straight into the G4 gate — never onto the report. Only confirmNoPeople
    // attaches it.
    setPendingPhoto({ file, previewUrl: URL.createObjectURL(file) });
  }, []);

  /** G4 gate passed: the reporter states nobody is recognisable in the frame. */
  const confirmNoPeople = useCallback(() => {
    setPendingPhoto((pending) => {
      if (!pending) return null;
      setPhoto(pending.file);
      setPhotoPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return pending.previewUrl;
      });
      if (fileRef.current) fileRef.current.value = '';
      return null;
    });
  }, []);

  /** G4 gate refused: discard the bytes and say why, per the capture screen. */
  const retakeForPeople = useCallback(() => {
    setPendingPhoto((pending) => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
      if (fileRef.current) fileRef.current.value = '';
      return null;
    });
    setError('Photo discarded. Retake it so no one is recognisable — background people included.');
  }, []);

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setPhotoPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const locationOk = location.trim().length >= LOCATION_MIN && location.trim().length <= LOCATION_MAX;
  const descriptionOk =
    description.trim().length >= DESCRIPTION_MIN && description.trim().length <= DESCRIPTION_MAX;
  const canSubmit = locationOk && descriptionOk && !submitting;

  const submit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set('location', location.trim());
      body.set('description', description.trim());
      body.set('dangerous', dangerous ? 'true' : 'false');
      if (coords) {
        body.set('lat', String(coords.lat));
        body.set('lng', String(coords.lng));
      }
      if (photo) body.set('photo', photo);

      const res = await fetch('/api/instasolver/broken', { method: 'POST', body });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

      if (!res.ok || !json || json.success !== true) {
        setError(
          (typeof json?.error === 'string' && json.error) ||
            'Could not send your report. Please try again.'
        );
        return;
      }

      const urgent =
        json.urgent_alert && typeof json.urgent_alert === 'object'
          ? (json.urgent_alert as Record<string, unknown>)
          : null;

      setSuccess({
        routedTo: typeof json.routed_to === 'string' ? json.routed_to : null,
        notice: typeof json.notice === 'string' ? json.notice : null,
        dueDate: typeof json.due_date === 'string' ? json.due_date : null,
        dangerous: json.dangerous === true,
        urgentDelivered: urgent ? Boolean(urgent.delivered) : null,
        pageSuppressed: urgent ? urgent.page_suppressed === true : false
      });
    } catch {
      setError('Could not reach MyJKKN. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [location, description, dangerous, coords, photo]);

  // ── Sent ──────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="space-y-4 mt-4 max-w-2xl">
        <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
          <CardContent className="py-6 space-y-3">
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-700 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-green-900 dark:text-green-200">
                  {success.routedTo ? `Sent to ${success.routedTo}.` : 'Report recorded.'}
                </p>
                {success.notice && (
                  <p className="text-sm text-green-900/80 dark:text-green-200/80">
                    {success.notice}
                  </p>
                )}
                <p className="text-sm text-green-900/80 dark:text-green-200/80">
                  Due {formatDue(success.dueDate)}. You&rsquo;ll get a notification here when
                  it&rsquo;s marked fixed.
                </p>
              </div>
            </div>

            {/* A page that was deliberately not sent is NOT a failure, and must
                not be worded as one — but the reporter still needs to know the
                phone stayed quiet, because that changes what they do next. */}
            {success.dangerous && success.pageSuppressed && (
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
                <AlertCircle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  This is logged as urgent and due today, but no phone alert was sent — enough
                  urgent alerts have already gone out here in the last day. If someone could get
                  hurt right now, tell the office in person as well.
                </p>
              </div>
            )}

            {success.dangerous && !success.pageSuppressed && success.urgentDelivered === false && (
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
                <AlertCircle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  You marked this dangerous, but we could not reach anyone by phone. If someone
                  could get hurt right now, tell the office in person as well.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Button className="w-full h-12" variant="outline" onClick={resetForm}>
          Report another
        </Button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 mt-4 max-w-2xl">
      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Where */}
          <div>
            <Label htmlFor="location" className="text-sm font-medium">
              Where is it?
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value.slice(0, LOCATION_MAX))}
              placeholder="Block A, second floor washroom"
              className="mt-1.5 h-11"
              autoComplete="off"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={requestGeo}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />
                )}
                Use my location
              </Button>
              {coords && (
                <span className="text-xs text-muted-foreground">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
              )}
            </div>
            {locationNote && (
              <p className="text-xs text-muted-foreground mt-1.5">{locationNote}</p>
            )}
          </div>

          {/* What */}
          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              What&rsquo;s wrong?
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="The tap will not turn off and water is running all day."
              rows={4}
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {description.trim().length < DESCRIPTION_MIN
                ? `At least ${DESCRIPTION_MIN} characters.`
                : `${description.length} of ${DESCRIPTION_MAX} characters.`}
            </p>
          </div>

          {/* Dangerous */}
          <div
            className={
              dangerous
                ? 'rounded-md border border-red-300 bg-red-50 p-3 dark:bg-red-950/20'
                : 'rounded-md border p-3'
            }
          >
            <div className="flex items-start gap-3">
              <Checkbox
                id="dangerous"
                checked={dangerous}
                onCheckedChange={(v) => setDangerous(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="dangerous" className="text-sm font-medium leading-snug">
                  <ShieldAlert
                    className={
                      dangerous
                        ? 'h-4 w-4 text-red-600 inline mr-1.5 -mt-0.5'
                        : 'h-4 w-4 text-muted-foreground inline mr-1.5 -mt-0.5'
                    }
                  />
                  This is dangerous (exposed wire, fire risk, someone could get hurt)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Tick this only if someone could be harmed. Dangerous reports are due the same
                  day and someone is called straight away.
                </p>
              </div>
            </div>
          </div>

          {/* Photo */}
          <div>
            <Label className="text-sm font-medium">Add a photo (optional)</Label>

            <Card className="mt-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="flex items-start gap-3 py-3">
                <Users className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  Photograph the <strong>condition</strong> only. If anyone is recognisable in
                  frame &mdash; including in the background &mdash; take it again. You&rsquo;ll be
                  asked to confirm this before the photo is attached.
                </p>
              </CardContent>
            </Card>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
            />

            {photoPreview ? (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="The photo you picked"
                  className="h-20 w-20 object-cover rounded border"
                />
                <Button type="button" variant="outline" size="sm" onClick={clearPhoto}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Remove photo
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 mt-3"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-4 w-4 mr-2" />
                Add a photo
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">
              JPEG only, up to 10 MB. Camera and location details are removed before it is saved.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-3 dark:bg-red-950/20">
              <AlertCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
              <p className="text-sm text-red-900 dark:text-red-200">{error}</p>
            </div>
          )}

          <Button className="w-full h-12" onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Send report
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            You can send up to 10 reports in any 24 hours.
          </p>
        </CardContent>
      </Card>

      {/* ── G4 gate — a real modal, not a policy note ─────────────────────────
          Guardrail G4 is locked "enforced in the capture UI, non-negotiable",
          and the Campus Walk capture screen enforces it exactly this way
          (walk-client.tsx). A banner is not enforcement: it is a sentence you
          can scroll past while the bytes upload anyway. The same AlertDialog
          primitives are used here rather than a copy of that screen's
          component, because the gate is inline local state there and there is
          nothing importable to reuse.

          Not dismissible by backdrop click or Escape (AlertDialog default with
          a no-op onOpenChange); one of the two explicit buttons is the only way
          out, so a photo is never attached without an answer. The server still
          strips and fail-closes on every byte — that is the other half of G4,
          not a substitute for this half. */}
      <AlertDialog open={pendingPhoto !== null} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check the photo before it&rsquo;s added</AlertDialogTitle>
            <AlertDialogDescription>
              This photo must show the broken thing only. If anyone is recognisable &mdash; even
              in the background &mdash; retake it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pendingPhoto.previewUrl}
              alt="The photo you just picked"
              className="w-full rounded border"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={retakeForPeople}>
              People are in it &mdash; retake
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmNoPeople}>
              No people &mdash; use this photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
