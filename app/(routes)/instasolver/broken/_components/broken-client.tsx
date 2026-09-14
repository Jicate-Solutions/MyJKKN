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
//   - the photo is OPTIONAL here, so there is no per-photo G4 modal to gate
//     something that may never be attached; the notice carries the rule and
//     the server still strips and fail-closes on every byte that does arrive
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
  routedTo: string;
  dueDate: string | null;
  dangerous: boolean;
  urgentDelivered: boolean | null;
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
    setPhoto(file);
    setPhotoPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
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

      setSuccess({
        routedTo: typeof json.routed_to === 'string' ? json.routed_to : 'the campus operations team',
        dueDate: typeof json.due_date === 'string' ? json.due_date : null,
        dangerous: json.dangerous === true,
        urgentDelivered:
          json.urgent_alert && typeof json.urgent_alert === 'object'
            ? Boolean((json.urgent_alert as Record<string, unknown>).delivered)
            : null
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
                  Sent to {success.routedTo}.
                </p>
                <p className="text-sm text-green-900/80 dark:text-green-200/80">
                  Due {formatDue(success.dueDate)}. You&rsquo;ll be told when it&rsquo;s fixed.
                </p>
              </div>
            </div>

            {success.dangerous && success.urgentDelivered === false && (
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
                  frame &mdash; including in the background &mdash; take it again before you send
                  it.
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
            You can send up to 10 reports a day.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
