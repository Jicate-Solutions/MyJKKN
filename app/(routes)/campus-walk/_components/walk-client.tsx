'use client';

/**
 * Campus Walk — capture screen.
 *
 * Spec: specs/campus-walk-2026-08-17.md (D1-D13, G1-G5). Precedent for the
 * camera + retry-pump pattern: card-scan-client.tsx.
 *
 * Design rule for this screen, stated in the build brief: speed to "he can
 * start walking" is the priority. Every slow or uncertain thing (upload,
 * network, GPS lock) happens behind the shutter — the only things that ever
 * block the next photo are the two guardrails that must never be skippable:
 *   G4  a per-photo "no people in this frame" checkpoint (AlertDialog, not
 *       dismissible by backdrop/Escape — a real gate, not a footnote)
 *   D6  the Unsafe toggle requires a second, explicit confirm before it can
 *       turn on, so a fat-thumb tap in a corridor can't silently downgrade a
 *       same-day escalation into a routine ticket
 *
 * D3 (manual destination confirm) is implemented as a compact two-part
 * decision cluster (kind + category) — AI classification is not wired up
 * yet (see 20261102020000_campus_walk_ai_lane.sql), so this manual
 * picker is the entire routing path today, not a fallback shown only when
 * AI is unavailable.
 *
 * "One line of description... keep it to one field, not a form" (build
 * brief) is reconciled against the endpoint's separate title/description
 * fields by sending the one line as `title` and an empty `description` —
 * campus-walk-service.ts already treats description as optional (`?? ''`).
 *
 * D10: nothing here collects or sends his name. The confirmation copy tells
 * him plainly it will show up as "Management walk".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Clock,
  Copy,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Users,
  WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/utils/compress-image';
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
import {
  discardItem,
  dismissDuplicateFlag,
  enqueueObservation,
  listQueue,
  retryItem,
  startPump,
  subscribe,
  type QueueItem,
  type QueuedGeo,
  type WalkKind
} from '@/lib/campus-walk/offline-queue';

// Static for v1 — no canonical campus-condition category list exists yet
// anywhere in the codebase (checked: no project_task_labels seed for
// CAMPUS-OPS, no lookup table). This is a documented assumption, not a
// discovered enum; revisit once real routing volume shows what to keep.
const CATEGORIES = [
  'Housekeeping / Cleanliness',
  'Electrical',
  'Plumbing / Water',
  'Civil / Structural',
  'Furniture / Fixtures',
  'IT / Network',
  'Security',
  'Landscaping / Grounds',
  'Signage',
  'Safety / Fire',
  'Transport',
  'Other'
] as const;

const MAX_PHOTOS = 3;

interface DraftPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

export function WalkClient() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Draft (not yet queued — in-memory only until "Add to queue") ────────
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([]);
  const [pendingConfirmPhoto, setPendingConfirmPhoto] = useState<{ file: File; previewUrl: string } | null>(
    null
  );
  const [oneLiner, setOneLiner] = useState('');
  const [kind, setKind] = useState<WalkKind>('symptom');
  const [category, setCategory] = useState<string | null>(null);
  const [blocker, setBlocker] = useState('');
  const [unsafe, setUnsafe] = useState(false);
  const [confirmUnsafeOpen, setConfirmUnsafeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Geolocation — captured explicitly, never read back out of EXIF ──────
  const [geo, setGeo] = useState<QueuedGeo | null>(null);
  const [geoStatus, setGeoStatus] = useState<'locating' | 'ok' | 'error'>('locating');
  const [geoError, setGeoError] = useState<string | null>(null);

  const requestGeo = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeo(null);
      setGeoStatus('error');
      setGeoError('Location is not available in this browser.');
      return;
    }
    setGeoStatus('locating');
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined
        });
        setGeoStatus('ok');
      },
      (err) => {
        setGeo(null);
        setGeoStatus('error');
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — this observation will still save without it.'
            : 'Could not get a location fix — this observation will still save without it.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    requestGeo();
  }, [requestGeo]);

  // ── Online indicator — cosmetic reassurance only; IndexedDB is what
  //    actually guarantees survival, not this banner. ──────────────────────
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Queue — persisted in IndexedDB by lib/campus-walk/offline-queue.ts.
  //    startPump() is called on every mount, so a queue built before a
  //    force-close resumes here with no dependency on anything that was
  //    only ever held in memory. ─────────────────────────────────────────
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const refreshQueue = useCallback(async () => {
    setQueue(await listQueue());
  }, []);

  useEffect(() => {
    void refreshQueue();
    const unsubscribe = subscribe(() => void refreshQueue());
    const stopPump = startPump();
    return () => {
      unsubscribe();
      stopPump();
    };
  }, [refreshQueue]);

  // Warns against an accidental reload/navigation while something has not
  // reached the server yet. This is a courtesy, NOT the safety mechanism —
  // it cannot stop a genuine force-close (that bypasses JS entirely), which
  // is exactly why every queued item is durable in IndexedDB regardless.
  useEffect(() => {
    const hasInFlight = queue.some((q) => q.status === 'pending' || q.status === 'uploading');
    if (!hasInFlight) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [queue]);

  // ── Capture (G4 enforced per-photo, not as a policy note) ────────────────

  const onCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset immediately so the same button re-invokes the camera for the next shot
    if (!file) return;
    setPendingConfirmPhoto({ file, previewUrl: URL.createObjectURL(file) });
  };

  const confirmNoPeople = async () => {
    if (!pendingConfirmPhoto) return;
    const raw = pendingConfirmPhoto;
    setPendingConfirmPhoto(null); // close the gate immediately — compression must not block the shutter

    // Re-encode to a small JPEG. This matches the server's expected pipeline
    // (app/api/campus-walk/observations/route.ts sniffs JPEG magic bytes and
    // rejects anything else — its own comment states compressImage() is the
    // intended client step) and, as a side effect of a canvas re-encode,
    // never carries EXIF into the output. That is defense-in-depth only:
    // the server's strip-and-fail-closed check is the actual G4 boundary,
    // per this build's own instructions ("never read location back out of
    // EXIF — the server strips EXIF deliberately").
    let finalFile = raw.file;
    try {
      const compressed = await compressImage(raw.file);
      finalFile = new File([compressed], 'observation.jpg', { type: 'image/jpeg' });
    } catch {
      // Compression failing (e.g. an exotic format createImageBitmap can't
      // decode) must not lose a confirmed photo. Fall back to the original
      // bytes — if the server's own JPEG check then rejects it, that surfaces
      // as a clear, actionable queue error rather than a silent drop here.
    }
    const previewUrl = URL.createObjectURL(finalFile);
    URL.revokeObjectURL(raw.previewUrl);
    setDraftPhotos((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, file: finalFile, previewUrl }]);
  };

  const retakeForPeople = () => {
    if (!pendingConfirmPhoto) return;
    URL.revokeObjectURL(pendingConfirmPhoto.previewUrl);
    setPendingConfirmPhoto(null);
    toast({
      title: 'Photo discarded',
      description: 'Retake it so no one is recognisable — background people included.'
    });
  };

  const removeDraftPhoto = (id: string) => {
    setDraftPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  // ── Unsafe toggle — protected from a fat-thumb tap by a second explicit
  //    confirm. Turning it OFF is always instant; only turning it ON asks. ──

  const onUnsafeChange = (next: boolean) => {
    if (next) {
      setConfirmUnsafeOpen(true);
    } else {
      setUnsafe(false);
    }
  };

  // ── Submit — writes straight into the durable IndexedDB queue. Nothing
  //    here waits for the network. ────────────────────────────────────────

  const canSubmit =
    oneLiner.trim().length > 0 && draftPhotos.length > 0 && category !== null && blocker.trim().length > 0;

  const addToQueue = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await enqueueObservation({
        title: oneLiner.trim(),
        description: '',
        kind,
        isUnsafe: unsafe,
        category: category as string,
        blocker: blocker.trim(),
        geo,
        photos: draftPhotos.map((p) => p.file)
      });

      draftPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setDraftPhotos([]);
      setOneLiner('');
      setKind('symptom');
      setCategory(null);
      setBlocker('');
      setUnsafe(false);

      toast({
        title: 'Added to your queue',
        description: online
          ? 'Sending now — shown to the team as "Management walk".'
          : 'Saved on the phone — it will send the moment signal returns.'
      });

      requestGeo(); // refresh the fix for whatever he photographs next
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = queue.filter((q) => q.status === 'pending' || q.status === 'uploading').length;
  const failedCount = queue.filter((q) => q.status === 'error').length;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 mt-4">
      {/* ── Connectivity + queue summary — honest state, always visible ──── */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {online ? (
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Online
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <WifiOff className="h-3.5 w-3.5" /> Offline — capturing safely, will send later
          </span>
        )}
        {pendingCount > 0 && <Badge variant="secondary">{pendingCount} waiting to send</Badge>}
        {failedCount > 0 && (
          <Badge variant="destructive">
            {failedCount} need{failedCount === 1 ? 's' : ''} attention
          </Badge>
        )}
      </div>

      {/* ── G4 reminder — passive banner PLUS the per-photo gate below;
             the banner alone is deliberately not treated as sufficient. ──── */}
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 py-3">
          <Users className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Photograph the <strong>condition</strong> only. If anyone is recognisable in frame
            — including in the background — you&rsquo;ll be asked to confirm or retake before
            the photo is kept.
          </p>
        </CardContent>
      </Card>

      {/* ── Capture ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onCameraChange}
          />

          {draftPhotos.length > 0 && (
            <div className="flex gap-2">
              {draftPhotos.map((p) => (
                <div key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.previewUrl} alt="" className="h-20 w-20 object-cover rounded border" />
                  <button
                    type="button"
                    onClick={() => removeDraftPhoto(p.id)}
                    className="absolute -top-2 -right-2 bg-background border rounded-full p-1 shadow"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full h-16 text-base"
            disabled={draftPhotos.length >= MAX_PHOTOS}
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-5 w-5 mr-2" />
            {draftPhotos.length === 0
              ? 'Photograph the condition'
              : draftPhotos.length >= MAX_PHOTOS
                ? 'Photo limit reached (3)'
                : `Add another angle (${draftPhotos.length}/${MAX_PHOTOS})`}
          </Button>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {geoStatus === 'locating' && 'Getting your location…'}
            {geoStatus === 'ok' && geo && `Location captured (±${Math.round(geo.accuracy ?? 0)}m)`}
            {geoStatus === 'error' && (
              <>
                {geoError}{' '}
                <button type="button" className="underline" onClick={requestGeo}>
                  Try again
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── The rest of the observation — only shown once there's a photo,
             so the first thing on screen is always the shutter. ──────────── */}
      {draftPhotos.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label htmlFor="one-liner" className="text-xs">
                What do you see?
              </Label>
              <Input
                id="one-liner"
                value={oneLiner}
                onChange={(e) => setOneLiner(e.target.value)}
                placeholder="e.g. Broken tap, Block C ground floor washroom"
                className="mt-1"
                maxLength={300}
                autoFocus
              />
            </div>

            {/* D6 — Unsafe. Visually separated, distinctly coloured, and
                protected by a second explicit confirm so a fat-thumb tap in
                a corridor can't silently trigger the same-day escalation. */}
            <div
              className={
                unsafe
                  ? 'rounded-md border-2 border-red-400 bg-red-50 dark:bg-red-950/30 p-3'
                  : 'rounded-md border p-3'
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className={unsafe ? 'h-5 w-5 text-red-600 mt-0.5' : 'h-5 w-5 text-muted-foreground mt-0.5'} />
                  <div>
                    <p className="text-sm font-medium">This is unsafe</p>
                    <p className="text-xs text-muted-foreground">
                      Exposed wire, gas smell, broken stair — creates a same-day alert.
                    </p>
                  </div>
                </div>
                <Switch checked={unsafe} onCheckedChange={onUnsafeChange} aria-label="Mark as unsafe" />
              </div>
            </div>

            {/* D3 — manual destination confirm. AI classification is not
                wired up yet; this tap is the whole routing path today. */}
            <div>
              <Label className="text-xs">One action, or a bigger gap?</Label>
              <div className="flex gap-2 mt-1.5">
                <Button
                  type="button"
                  variant={kind === 'symptom' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setKind('symptom')}
                >
                  One-off issue
                </Button>
                <Button
                  type="button"
                  variant={kind === 'system_gap' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setKind('system_gap')}
                >
                  No process exists
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kind === 'symptom'
                  ? '"This toilet is dirty" — one thing to fix.'
                  : '"No cleaning SOP for this block at all" — a bigger, rarer gap.'}
              </p>
            </div>

            <div>
              <Label className="text-xs">Where does this route?</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {CATEGORIES.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={category === c ? 'default' : 'outline'}
                    onClick={() => setCategory(category === c ? null : c)}
                  >
                    {category === c && <Check className="h-3.5 w-3.5 mr-1" />}
                    {c}
                  </Button>
                ))}
              </div>
            </div>

            {/* G3 — the guardrail question. Required: an observation that
                only says "this is dirty" must not silently blame whoever's
                assigned there. */}
            <div>
              <Label htmlFor="blocker" className="text-xs">
                What is blocking you? <span className="text-muted-foreground">(so the fix, not a person, gets ticketed)</span>
              </Label>
              <Input
                id="blocker"
                value={blocker}
                onChange={(e) => setBlocker(e.target.value)}
                placeholder="e.g. no supplies stocked, nobody assigned here, first time noticing"
                className="mt-1"
                maxLength={300}
              />
            </div>

            <Button className="w-full h-12" onClick={() => void addToQueue()} disabled={!canSubmit || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
              Add to queue
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Shown to the team as &ldquo;Management walk&rdquo; — never your name.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── G4 gate — a real modal, not a policy note. Not dismissible by
             backdrop click or Escape (AlertDialog default); one of the two
             explicit buttons is the only way out. ────────────────────────── */}
      <AlertDialog open={pendingConfirmPhoto !== null} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check the photo before it&rsquo;s added</AlertDialogTitle>
            <AlertDialogDescription>
              Campus Walk photos must show the condition only. If anyone is recognisable — even
              in the background — retake it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingConfirmPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingConfirmPhoto.previewUrl} alt="Photo just taken" className="w-full rounded border" />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={retakeForPeople}>People are in it — retake</AlertDialogCancel>
            <AlertDialogAction onClick={confirmNoPeople}>No people — use this photo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── D6 second confirm before Unsafe can turn on ──────────────────── */}
      <AlertDialog open={confirmUnsafeOpen} onOpenChange={setConfirmUnsafeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" /> Mark this UNSAFE?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This creates a same-day deadline and an immediate phone alert — reserve it for
              exposed wiring, a gas smell, a broken stair, or similar. Ordinary wear and tear is
              not unsafe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                setUnsafe(true);
                setConfirmUnsafeOpen(false);
              }}
            >
              Yes, mark unsafe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Queue — honest state: pending, failed, and sent ──────────────── */}
      {queue.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Your queue</h2>
              <Button variant="ghost" size="sm" onClick={() => void refreshQueue()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <ul className="divide-y">
              {queue.map((item) => (
                <li key={item.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.photoCount} photo{item.photoCount === 1 ? '' : 's'} ·{' '}
                        {item.status === 'uploading' && 'Sending…'}
                        {item.status === 'pending' &&
                          (item.attempts > 0
                            ? `Retrying — ${item.lastError ?? 'no connection'}`
                            : 'Waiting to send')}
                        {item.status === 'done' && 'Sent'}
                        {item.status === 'error' && (item.lastError ?? 'Failed')}
                      </p>
                    </div>
                    {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                    {item.status === 'pending' && item.attempts === 0 && (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    {item.status === 'pending' && item.attempts > 0 && (
                      <WifiOff className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    {item.status === 'done' && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                    {item.status === 'error' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <Button size="sm" variant="outline" onClick={() => void retryItem(item.id)}>
                          Retry
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void discardItem(item.id)}>
                          Discard
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Ruling 2 — the server's "this looks like a resend"
                      signal. Lives in the queue, never in the shutter path.
                      Flagging is not deleting: the ticket the server already
                      created is untouched either way — this only dismisses
                      the notice, one tap. */}
                  {item.duplicate && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1.5">
                      <Copy className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                      <p className="text-xs text-amber-900 dark:text-amber-200 flex-1">
                        This looks like the one you just sent.
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs shrink-0"
                        onClick={() => void dismissDuplicateFlag(item.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}

                  {/* D6 — the phone alert reached nobody. Deliberately NOT
                      dismissible, unlike the duplicate notice above: that one
                      is information, this one is an instruction. The ticket
                      was filed and the row reads "Sent", so without this the
                      only person who knows a hazard was reported is the one
                      person who now assumes it is handled. He is standing at
                      it and can go and tell somebody. */}
                  {item.urgentAlertFailure && (
                    <div className="mt-2 flex items-start gap-2 rounded-md border-2 border-red-400 bg-red-50 dark:bg-red-950/30 px-2.5 py-2">
                      <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-900 dark:text-red-200 flex-1">
                        <span className="font-semibold">Nobody was phoned about this.</span>{' '}
                        The unsafe alert could not be delivered ({item.urgentAlertFailure.reason}).
                        Tell someone who can act on it now — the ticket on its own will not reach
                        them today.
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              Photos are saved on the phone the moment you add them — closing or losing signal
              does not lose them.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
