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
//   - the photo is OPTIONAL, can come from the camera OR the gallery, and is
//     attached as soon as it is picked. The "no people in frame" confirm step
//     was removed on the Director's instruction (30 Sep 2026: make filing easy).
//     The server still strips camera/location metadata from every photo.
//   - no offline queue in this lane (out of scope for this PR)
//   - "dangerous" is a plain checkbox rather than a switch plus a confirm
//     dialog, because the audience is everyone, not one trained walker
//
// "Fill it for me" (Director, 30 Sep 2026): one box at the top takes the
// problem in ANY words, Tamil included. The AI (app/api/instasolver/ai-fill)
// fills the kind of problem, the place, how urgent, and a clean English
// description — every field stays editable. When it is unsure it asks ONE
// question as tap-to-pick chips; skipping it still lets the report go, marked
// for the estate office to sort. The photo is never sent to the AI. There is
// no voice button: browser speech-to-text always asks for the microphone,
// and phone keyboards already offer voice typing into the box.

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  MapPin,
  ShieldAlert,
  Sparkles,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PHOTO_UNREADABLE, toJpeg } from '@/lib/instasolver/to-jpeg';
import { DUE_IN_DAYS } from '@/lib/campus-walk/due-dates';
import {
  AI_FILL_FALLBACK_MESSAGE,
  AI_FILL_LIMITS,
  FALLBACK_TRADE,
  INSTASOLVER_TRADES,
  SKIPPED_PLACE_TEXT,
  isInstaSolverTrade,
  type AiFillQuestion,
  type InstaSolverTrade
} from '@/lib/instasolver/ai-fill';

const LOCATION_MIN = 3;
const LOCATION_MAX = 120;
const DESCRIPTION_MIN = 3;
const DESCRIPTION_MAX = 500;

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

/** Chip label for an urgency answer — the wire value stays 'normal' | 'dangerous'. */
function urgencyLabel(v: string): string {
  return v === 'dangerous' ? 'Dangerous — someone could get hurt' : 'Not dangerous';
}

export function BrokenClient() {
  const [aiText, setAiText] = useState('');
  const [filling, setFilling] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState(false);
  const [question, setQuestion] = useState<AiFillQuestion | null>(null);
  const [needsSorting, setNeedsSorting] = useState(false);
  const [trade, setTrade] = useState<InstaSolverTrade | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setAiText('');
    setFillNote(null);
    setAiFilled(false);
    setQuestion(null);
    setNeedsSorting(false);
    setTrade(null);
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

  // Any picked image (gallery or camera, any format the phone can open) is
  // re-encoded to a JPEG here and attached straight away.
  const onPickPhoto = useCallback(async (file: File | null) => {
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setPreparingPhoto(true);
    try {
      const ready = await toJpeg(file);
      setPhoto(ready);
      setPhotoPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(ready);
      });
    } catch {
      setError(PHOTO_UNREADABLE);
    } finally {
      setPreparingPhoto(false);
    }
  }, []);

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setPhotoPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  // ── "Fill it for me" ──────────────────────────────────────────────────────
  // Sends ONLY the typed text. Any failure — network, timeout, a reply that
  // does not parse, the hourly cap — leaves the form as it was and says so in
  // one line; the person fills it by hand exactly as before.
  const fillForMe = useCallback(async () => {
    const text = aiText.trim();
    if (text.length < AI_FILL_LIMITS.inputMin) return;
    setFilling(true);
    setFillNote(null);
    setError(null);
    try {
      const res = await fetch('/api/instasolver/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const fill =
        json && json.success === true && json.fill && typeof json.fill === 'object'
          ? (json.fill as Record<string, unknown>)
          : null;
      if (!res.ok || !fill) {
        setFillNote(
          res.status === 429 && typeof json?.error === 'string'
            ? json.error
            : AI_FILL_FALLBACK_MESSAGE
        );
        return;
      }

      if (isInstaSolverTrade(fill.trade)) setTrade(fill.trade);
      if (typeof fill.place === 'string' && fill.place.trim()) {
        setLocation(fill.place.slice(0, LOCATION_MAX));
      }
      if (typeof fill.description === 'string' && fill.description.trim()) {
        setDescription(fill.description.slice(0, DESCRIPTION_MAX));
      }
      setDangerous(fill.urgency === 'dangerous');
      const q = fill.one_question;
      setQuestion(
        q && typeof q === 'object' && Array.isArray((q as AiFillQuestion).options)
          ? (q as AiFillQuestion)
          : null
      );
      setNeedsSorting(false);
      setAiFilled(true);
      setFillNote('Filled in below. Check it and change anything that is wrong.');
    } catch {
      setFillNote(AI_FILL_FALLBACK_MESSAGE);
    } finally {
      setFilling(false);
    }
  }, [aiText]);

  const answerQuestion = useCallback(
    (option: string) => {
      if (!question) return;
      if (question.field === 'trade' && isInstaSolverTrade(option)) setTrade(option);
      if (question.field === 'place') setLocation(option.slice(0, LOCATION_MAX));
      if (question.field === 'urgency') setDangerous(option === 'dangerous');
      setQuestion(null);
    },
    [question]
  );

  // Skipping still lets the report go: it is marked for the estate office to
  // sort, and a missing kind or place gets a plain placeholder the person can
  // still overwrite.
  const skipQuestion = useCallback(() => {
    if (!question) return;
    if (question.field === 'trade') setTrade(FALLBACK_TRADE);
    if (question.field === 'place') {
      setLocation((cur) => (cur.trim().length >= LOCATION_MIN ? cur : SKIPPED_PLACE_TEXT));
    }
    setNeedsSorting(true);
    setQuestion(null);
  }, [question]);

  const locationOk = location.trim().length >= LOCATION_MIN && location.trim().length <= LOCATION_MAX;
  const descriptionOk =
    description.trim().length >= DESCRIPTION_MIN && description.trim().length <= DESCRIPTION_MAX;
  const canSubmit = locationOk && descriptionOk && !submitting && !preparingPhoto;

  const submit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set('location', location.trim());
      body.set('description', description.trim());
      body.set('dangerous', dangerous ? 'true' : 'false');
      // From the checkbox as it is NOW, never from the AI's reply.
      body.set('urgency', dangerous ? 'dangerous' : 'normal');
      if (trade) body.set('trade', trade);
      if (needsSorting) body.set('needs_sorting', 'true');
      if (aiFilled) {
        body.set('ai_filled', 'true');
        if (aiText.trim()) body.set('reporter_words', aiText.trim());
      }
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
  }, [location, description, dangerous, coords, photo, trade, needsSorting, aiFilled, aiText]);

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

        <Button asChild className="w-full h-12">
          <Link href="/instasolver/my-reports">See my reports</Link>
        </Button>

        <Button className="w-full h-12" variant="outline" onClick={resetForm}>
          Report another
        </Button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 mt-4 max-w-2xl">
      {/* Fill it for me */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label htmlFor="ai-text" className="text-sm font-medium">
            Tell us what&rsquo;s wrong (any language)
          </Label>
          <Textarea
            id="ai-text"
            value={aiText}
            onChange={(e) => setAiText(e.target.value.slice(0, AI_FILL_LIMITS.inputMax))}
            placeholder="The fan in the library, first floor, is making a burning smell."
            rows={3}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full h-12"
            onClick={() => void fillForMe()}
            disabled={filling || aiText.trim().length < AI_FILL_LIMITS.inputMin}
          >
            {filling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {filling ? 'Filling it in…' : 'Fill it for me'}
          </Button>
          {fillNote && <p className="text-xs text-muted-foreground">{fillNote}</p>}

          {question && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-sm font-medium">{question.text}</p>
              <div className="flex flex-wrap gap-2">
                {question.options.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => answerQuestion(opt)}
                  >
                    {question.field === 'urgency' ? urgencyLabel(opt) : opt}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10"
                  onClick={skipQuestion}
                >
                  Skip — let the estate office sort it
                </Button>
              </div>
            </div>
          )}
          {needsSorting && !question && (
            <p className="text-xs text-muted-foreground">
              Skipped. The estate office will sort this one.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Kind of problem */}
          <div>
            <Label className="text-sm font-medium">What kind of problem? (optional)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {INSTASOLVER_TRADES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={trade === t ? 'default' : 'outline'}
                  aria-pressed={trade === t}
                  onClick={() => setTrade(trade === t ? null : t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

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
                  Due today, and someone is called straight away.
                </p>
              </div>
            </div>
          </div>

          {/* Photo */}
          <div>
            <Label className="text-sm font-medium">Add a photo (optional)</Label>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
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
                disabled={preparingPhoto}
              >
                {preparingPhoto ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-2" />
                )}
                {preparingPhoto ? 'Getting the photo ready…' : 'Add a photo'}
              </Button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-3 dark:bg-red-950/20">
              <AlertCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
              <p className="text-sm text-red-900 dark:text-red-200">{error}</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {dangerous
              ? 'Dangerous reports are due today.'
              : `Usually fixed in about ${DUE_IN_DAYS.symptom} days.`}
          </p>

          <Button className="w-full h-12" onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Send report
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
