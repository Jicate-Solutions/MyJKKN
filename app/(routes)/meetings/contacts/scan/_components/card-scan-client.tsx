'use client';

/**
 * Business-card scanner — capture + review.
 *
 * The whole screen is built around one rule: NEVER BLOCK THE SHUTTER.
 * At a fair the person is standing in front of you and the worst possible
 * outcome is losing their card (Director decisions 13, 21). So every slow or
 * failing thing — the upload, the reader, the network — happens behind the
 * camera, and the camera is always ready.
 *
 * Decisions discharged here:
 *   5  confirm-before-save: extracted form beside the photo, human edits, Save
 *   6  duplicates warn and show the match; the human picks. Never auto-merge
 *   7  weak-internet queue; handwritten scribbles land in the note
 *   13 rapid-fire capture — snap ten in a minute, review later
 *   20 unreadable → "Couldn't read it — retake?", nothing saved
 *   21 reader offline → keep accepting, warn only after a delay
 *   22 the waiting count is always visible so cards are not forgotten
 *   23 "already saved by someone else" → offer to ADD what's new
 *   24 matches against MyJKKN's own people, not just the contact book
 *   25 doubtful cards FIRST (the server sorts; this screen must not re-sort)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Save,
  Users,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

// ── Types ───────────────────────────────────────────────────────────────────

type Confidence = 'low' | 'medium' | 'high' | null;

interface ScanFields {
  name?: string | null;
  organization?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  linkedin?: string | null;
  address?: string | null;
  city?: string | null;
  handwritten_note?: string | null;
  confidence?: string | null;
  languages_seen?: string[] | null;
}

interface Scan {
  job_id: string;
  status: string;
  fields: ScanFields | null;
  confidence: Confidence;
  error: string | null;
  event: string | null;
  photo_url: string | null;
  requested_at: string;
}

interface CardMatch {
  source: 'networker' | 'profiles' | 'team' | 'admission_leads';
  id: string;
  name: string;
  detail: string | null;
  matched_on: 'phone' | 'email' | 'name';
}

/** A photo taken but not yet accepted by the server. */
interface PendingShot {
  key: string;
  file: File;
  previewUrl: string;
  attempts: number;
  lastError: string | null;
}

// "Who is this?" — one question, then the save writes the module's own table
// too (decisions 17/18). Wording is deliberately plain: a counsellor at a stall
// should not have to think about which database table anything lives in.
const WHO_OPTIONS = [
  'Parent / student',
  'Employer / recruiter',
  'Hospital / internship site',
  'Industry partner',
  'Event sponsor',
  'Vendor',
  'Just a contact',
] as const;

// Destinations that need a parent row a card cannot name, and the follow-up
// choices where one "Who is this?" answer serves two different module tables.
// Both are refinements UNDER decision 17's seven locked options — not new ones.
const NEEDS_PARENT: Record<string, 'event' | 'site'> = {
  'Event sponsor': 'event',
  'Hospital / internship site': 'site',
};

const SUB_CHOICES: Record<string, Array<{ key: string; label: string }>> = {
  'Hospital / internship site': [
    { key: '', label: 'Office contact' },
    { key: 'preceptor', label: 'Supervising doctor' },
  ],
  'Industry partner': [
    { key: '', label: 'Partner only' },
    { key: 'mentor', label: 'Also mentors students' },
  ],
  'Employer / recruiter': [
    { key: '', label: 'Hiring only' },
    { key: 'prospect', label: 'Interested in our services' },
  ],
};

const EDITABLE_LABELS: Array<[keyof ScanFields, string]> = [
  ['name', 'Name'],
  ['organization', 'Organisation'],
  ['role', 'Title / role'],
  ['mobile', 'Mobile'],
  ['phone', 'Other phone'],
  ['email', 'Email'],
  ['website', 'Website'],
  ['city', 'City'],
  ['address', 'Address'],
];

const SOURCE_LABEL: Record<CardMatch['source'], string> = {
  networker: 'Contact book',
  profiles: 'Already in MyJKKN',
  team: 'Team member',
  admission_leads: 'Admission lead',
};

/** A card is unreadable when the reader gave up, or gave back nothing usable. */
function isUnreadable(scan: Scan): boolean {
  if (scan.status === 'error') return true;
  if (scan.status !== 'done') return false;
  const f = scan.fields;
  if (!f) return true;
  return !f.name && !f.email && !f.mobile && !f.phone && !f.organization;
}

export function CardScanClient({ userEmail }: { userEmail: string | null }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [eventLabel, setEventLabel] = useState('');
  const [pending, setPending] = useState<PendingShot[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScanFields>({});
  const [who, setWho] = useState<string>('');
  const [subChoice, setSubChoice] = useState<string>('');
  const [parentId, setParentId] = useState<string>('');
  const [parentSkipped, setParentSkipped] = useState(false);
  const [parentOptions, setParentOptions] = useState<
    Array<{ id: string; label: string; hint: string | null }> | null
  >(null);
  const [matches, setMatches] = useState<CardMatch[] | null>(null);
  const [matchWarning, setMatchWarning] = useState<string | null>(null);
  const [enrichTarget, setEnrichTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A ref mirror of the pending list so the upload pump can read the latest
  // state without being re-created on every render (which would restart it).
  const pendingRef = useRef<PendingShot[]>([]);
  pendingRef.current = pending;

  const active = scans.find((s) => s.job_id === activeId) ?? null;

  // ── Queue ─────────────────────────────────────────────────────────────────

  const refreshQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts/card-scan', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setQueueError(json.error ?? 'Could not load your cards.');
        return;
      }
      // The server already sorted doubtful-first (decision 25). Re-sorting here
      // would quietly undo it, so the order is used exactly as received.
      setScans(json.scans as Scan[]);
      setQueueError(null);
    } catch {
      setQueueError('You appear to be offline. Your photos are safe.');
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  // Poll only while something is still being read.
  const stillReading = scans.some((s) => s.status !== 'done' && s.status !== 'error');
  useEffect(() => {
    if (!stillReading && pending.length === 0) return;
    const t = setInterval(() => void refreshQueue(), 4000);
    return () => clearInterval(t);
  }, [stillReading, pending.length, refreshQueue]);

  // ── Upload pump ───────────────────────────────────────────────────────────
  // Runs behind the camera. A failure never removes a shot from the queue — it
  // backs off and tries again, because dropping it would lose the card.

  const uploadOne = useCallback(
    async (shot: PendingShot): Promise<'done' | 'retry'> => {
      const form = new FormData();
      form.append('photo', shot.file);
      if (eventLabel.trim()) form.append('event', eventLabel.trim());

      try {
        const res = await fetch('/api/contacts/card-scan', { method: 'POST', body: form });
        const json = await res.json().catch(() => ({}));

        if (res.ok && json.ok) return 'done';

        // 403 is a closed door, not a blip — retrying forever would spin.
        if (res.status === 403) {
          toast({
            title: 'No access to card scanning',
            description: json.error ?? 'Ask an administrator to grant the permission.',
            variant: 'destructive',
          });
          return 'done';
        }
        // 413/415 — this photo will never be accepted; tell the user plainly.
        if (res.status === 413 || res.status === 415) {
          toast({ title: 'Photo not accepted', description: json.error, variant: 'destructive' });
          return 'done';
        }
        // A 429 is only retryable when the route SAYS so. The busy/in-flight
        // ceiling clears in seconds; a daily-cap 429 never will, and retrying it
        // forever would spin a card silently instead of telling the user.
        if (res.status === 429 && json.code !== 'busy') {
          toast({
            title: 'Scanning limit reached',
            description: json.error ?? 'You have reached today’s scanning limit.',
            variant: 'destructive',
          });
          return 'done';
        }
        // Everything else (busy 429, 500, 503) is transient: keep the card.
        setPending((prev) =>
          prev.map((p) =>
            p.key === shot.key
              ? { ...p, attempts: p.attempts + 1, lastError: json.error ?? `HTTP ${res.status}` }
              : p,
          ),
        );
        return 'retry';
      } catch {
        setPending((prev) =>
          prev.map((p) =>
            p.key === shot.key
              ? { ...p, attempts: p.attempts + 1, lastError: 'No connection' }
              : p,
          ),
        );
        return 'retry';
      }
    },
    [eventLabel, toast],
  );

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const pump = async () => {
      if (stopped) return;
      const next = pendingRef.current[0];
      if (next) {
        const outcome = await uploadOne(next);
        if (outcome === 'done') {
          setPending((prev) => prev.filter((p) => p.key !== next.key));
          URL.revokeObjectURL(next.previewUrl);
          void refreshQueue();
        }
      }
      // Backoff grows with the failure count of the head item, capped at 15s —
      // long enough not to hammer a dead network, short enough that a card goes
      // through within seconds of the signal returning.
      const attempts = pendingRef.current[0]?.attempts ?? 0;
      const delay = next ? Math.min(1000 * 2 ** Math.min(attempts, 4), 15000) : 1500;
      timer = setTimeout(() => void pump(), next && attempts === 0 ? 150 : delay);
    };

    void pump();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [uploadOne, refreshQueue]);

  // Losing a card is the worst outcome (decision 21) — so warn before a reload
  // discards photos that have not reached the server yet.
  useEffect(() => {
    if (pending.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pending.length]);

  // ── Capture ───────────────────────────────────────────────────────────────

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPending((prev) => [
      ...prev,
      ...files.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        previewUrl: URL.createObjectURL(file),
        attempts: 0,
        lastError: null,
      })),
    ]);
    // Reset immediately so the very next tap reopens the camera. This is what
    // makes rapid-fire actually rapid (decision 13).
    e.target.value = '';
  };

  // ── Review ────────────────────────────────────────────────────────────────

  const openCard = useCallback(
    async (scan: Scan) => {
      setActiveId(scan.job_id);
      setDraft({ ...(scan.fields ?? {}) });
      setWho('');
      setSubChoice('');
      setParentId('');
      setParentSkipped(false);
      setParentOptions(null);
      setMatches(null);
      setMatchWarning(null);
      setEnrichTarget(null);

      if (isUnreadable(scan)) return;

      try {
        // Without a deadline this fetch can hang, leaving `matches` null and no
        // warning on screen — and Save is deliberately NOT blocked (decision 21),
        // so a contact would be created having never been checked. Bounded, so a
        // stall becomes a visible "couldn't check" instead of silence.
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 8000);
        const res = await fetch('/api/contacts/card-scan/match', {
          signal: ctl.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: scan.fields?.name ?? '',
            email: scan.fields?.email ?? '',
            phone: scan.fields?.phone ?? '',
            mobile: scan.fields?.mobile ?? '',
          }),
        });
        clearTimeout(timer);
        const json = await res.json();
        if (json.ok) {
          setMatches(json.matches as CardMatch[]);
          if (json.networker_unavailable) {
            // An empty result from a check that could not run is NOT "no
            // duplicates" — saying so would manufacture the twin this exists
            // to prevent.
            setMatchWarning(
              'The contact book could not be checked just now, so this may already exist.',
            );
          }
        } else {
          setMatches([]);
          setMatchWarning('The duplicate check did not run.');
        }
      } catch {
        setMatches([]);
        setMatchWarning('The duplicate check did not run.');
      }
    },
    [],
  );

  // Load the picker only when the chosen type actually needs one — most scans
  // never see it, and a fair-ground connection should not fetch what it cannot use.
  useEffect(() => {
    const kind = NEEDS_PARENT[who];
    if (!kind) {
      setParentOptions(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/contacts/card-scan/options?kind=${kind}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!cancelled) setParentOptions(json.ok ? json.options : []);
      } catch {
        // An unreachable picker must not trap the user: an empty list falls
        // through to Skip, which is always allowed.
        if (!cancelled) setParentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [who]);

  const save = async () => {
    if (!active) return;
    if (!draft.name?.trim()) {
      toast({
        title: 'A name is needed',
        description: 'Type the name from the card before saving.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/contacts/card-scan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: active.job_id,
          fields: draft,
          mode: enrichTarget ? 'enrich' : 'create',
          target_id: enrichTarget ?? undefined,
          routed_to: who ? (subChoice ? `${who}::${subChoice}` : who) : undefined,
          event_id: NEEDS_PARENT[who] === 'event' ? parentId || undefined : undefined,
          site_id: NEEDS_PARENT[who] === 'site' ? parentId || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({
          title: 'Not saved',
          description: json.error ?? 'Something went wrong. The card is still in your queue.',
          variant: 'destructive',
        });
        return;
      }

      // PATCH is fill-only: it refuses to overwrite what a human already
      // recorded and names those fields. Show them — a partial save must not
      // look like a clean one.
      const skipped: string[] = json.skipped ?? [];
      const routing = json.routing;
      const routingNote =
        routing?.status === 'pending_parent'
          ? ` Saved as a contact — a to-do was left to attach them to a ${routing.needs}.`
          : routing?.status === 'routed' && routing.missing_fields?.length
            ? ` Added to ${routing.table?.replace(/_/g, ' ')} — needs completion, ${routing.missing_fields.length} field(s) missing.`
            : routing?.status === 'routed'
              ? ` Also added to ${routing.table?.replace(/_/g, ' ')}.`
              : '';
      toast({
        title: json.mode === 'enriched' ? 'Contact updated' : 'Contact saved',
        description: skipped.length
          ? `Kept the existing ${skipped.join(', ')} — the card disagreed, so nothing was overwritten.${routingNote}`
          : json.mode === 'no_change'
            ? `Everything on this card was already recorded.${routingNote}`
            : `Added to the contact book.${routingNote}`,
      });

      setActiveId(null);
      setScans((prev) => prev.filter((s) => s.job_id !== active.job_id));
      void refreshQueue();
    } finally {
      setSaving(false);
    }
  };

  // ── Reader-delay notice (decision 21) ─────────────────────────────────────
  // Only after a real wait, and never as a blocker.
  const stalled = scans.filter(
    (s) =>
      s.status !== 'done' &&
      s.status !== 'error' &&
      Date.now() - new Date(s.requested_at).getTime() > 90_000,
  ).length;

  const waiting = scans.filter((s) => s.status === 'done' || s.status === 'error').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 mt-4">
      {/* ── Capture ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div>
            <Label htmlFor="event" className="text-sm">
              Where are you? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="event"
              value={eventLabel}
              onChange={(e) => setEventLabel(e.target.value)}
              placeholder="e.g. Tiruppur Exporters meet, Aug 2026"
              className="mt-1"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Saved with every card you scan here, so you can find them by event later.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={onFiles}
          />
          <Button
            type="button"
            size="lg"
            className="w-full h-16 text-base"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-5 w-5 mr-2" />
            Snap a card
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Keep snapping — you don&rsquo;t have to wait. Check them all later.
          </p>

          {pending.length > 0 && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>
                {pending.length} photo{pending.length === 1 ? '' : 's'} uploading
              </span>
              {pending[0]?.lastError && (
                <span className="text-muted-foreground text-xs ml-auto flex items-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  retrying — your photos are safe
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Reader delayed (decision 21) ─────────────────────────────────── */}
      {stalled > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Card reading is delayed</p>
              <p className="text-muted-foreground">
                {stalled} card{stalled === 1 ? ' is' : 's are'} still being read. Your photos
                are safe — keep scanning.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Review queue ─────────────────────────────────────────────────── */}
      {!active && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">
                {waiting > 0 ? `${waiting} card${waiting === 1 ? '' : 's'} to check` : 'Your cards'}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => void refreshQueue()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {queueError && (
              <p className="text-sm text-amber-700 flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4" /> {queueError}
              </p>
            )}

            {loadingQueue ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : scans.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No cards yet. Snap one above.
              </p>
            ) : (
              <ul className="divide-y">
                {scans.map((s) => {
                  const unreadable = isUnreadable(s);
                  const reading = s.status !== 'done' && s.status !== 'error';
                  return (
                    <li key={s.job_id}>
                      <button
                        type="button"
                        onClick={() => void openCard(s)}
                        disabled={reading}
                        className="w-full flex items-center gap-3 py-3 text-left disabled:opacity-60"
                      >
                        {s.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.photo_url}
                            alt=""
                            className="h-12 w-20 object-cover rounded border shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-20 rounded border bg-muted shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {unreadable
                              ? 'Couldn’t read this one'
                              : (s.fields?.name ?? 'Unnamed card')}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {reading
                              ? 'Reading…'
                              : (s.fields?.organization ?? s.event ?? '—')}
                          </p>
                        </div>
                        {reading ? (
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        ) : unreadable ? (
                          <Badge variant="destructive" className="shrink-0">
                            Retake
                          </Badge>
                        ) : s.confidence === 'low' ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-400 text-amber-700"
                          >
                            Check this
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            Ready
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {scans.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Doubtful cards are listed first so a blurry one doesn&rsquo;t sink under the
                clean ones.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── One card: photo beside the form (decision 5) ──────────────────── */}
      {active && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setActiveId(null)}>
              ← Back to the list
            </Button>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                {active.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={active.photo_url}
                    alt="The scanned card"
                    className="w-full rounded border"
                  />
                ) : (
                  <div className="w-full aspect-[16/10] rounded border bg-muted" />
                )}
                {active.fields?.languages_seen?.length ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Script read: {active.fields.languages_seen.join(', ')}
                  </p>
                ) : null}
              </div>

              {/* Unreadable → retake, and NOTHING is saved (decision 20) */}
              {isUnreadable(active) ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">Couldn&rsquo;t read it — retake?</p>
                      <p className="text-muted-foreground">
                        Nothing has been saved. If they&rsquo;re still with you, one more photo
                        in better light usually does it.
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setActiveId(null);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Camera className="h-4 w-4 mr-2" /> Take another photo
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {active.confidence === 'low' && (
                    <p className="text-xs text-amber-700 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Some of this was hard to read — please check every line.
                    </p>
                  )}

                  {EDITABLE_LABELS.map(([key, label]) => (
                    <div key={key}>
                      <Label htmlFor={`f-${key}`} className="text-xs">
                        {label}
                      </Label>
                      <Input
                        id={`f-${key}`}
                        value={(draft[key] as string) ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  ))}

                  <div>
                    <Label htmlFor="f-note" className="text-xs">
                      Note <span className="text-muted-foreground">(what you agreed)</span>
                    </Label>
                    <Textarea
                      id="f-note"
                      rows={2}
                      value={draft.handwritten_note ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, handwritten_note: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {!isUnreadable(active) && (
              <>
                {/* ── Duplicate warning (decisions 6, 23, 24) ─────────────── */}
                {matchWarning && (
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {matchWarning}
                  </p>
                )}

                {matches && matches.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      We may already have this person
                    </p>
                    {matches.map((m) => (
                      <div
                        key={`${m.source}:${m.id}`}
                        className="flex items-center gap-2 text-sm bg-background rounded border p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {SOURCE_LABEL[m.source]}
                            {m.detail ? ` · ${m.detail}` : ''} · same {m.matched_on}
                          </p>
                        </div>
                        {m.source === 'networker' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={enrichTarget === m.id ? 'default' : 'outline'}
                            onClick={() =>
                              setEnrichTarget(enrichTarget === m.id ? null : m.id)
                            }
                          >
                            {enrichTarget === m.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 mr-1" /> Adding to them
                              </>
                            ) : (
                              'Add what’s new'
                            )}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="shrink-0">
                            in MyJKKN
                          </Badge>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Choose &ldquo;Add what&rsquo;s new&rdquo; to fill in their blanks, or just
                      Save to keep this as a separate person. Nothing is ever merged for you.
                    </p>
                  </div>
                )}

                {/* ── Who is this? (decision 17) ──────────────────────────── */}
                <div>
                  <Label className="text-xs">Who is this?</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {WHO_OPTIONS.map((opt) => (
                      <Button
                        key={opt}
                        type="button"
                        size="sm"
                        variant={who === opt ? 'default' : 'outline'}
                        onClick={() => {
                          const next = who === opt ? '' : opt;
                          setWho(next);
                          setSubChoice('');
                          setParentId('');
                          setParentSkipped(false);
                        }}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>

                  {/* One follow-up only where two module tables genuinely differ
                      and a card cannot tell them apart. */}
                  {SUB_CHOICES[who] && (
                    <div className="flex flex-wrap gap-2 mt-2 pl-1">
                      {SUB_CHOICES[who].map((sc) => (
                        <Button
                          key={sc.key || 'default'}
                          type="button"
                          size="sm"
                          variant={subChoice === sc.key ? 'secondary' : 'ghost'}
                          className="text-xs"
                          onClick={() => setSubChoice(sc.key)}
                        >
                          {sc.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* The parent a card cannot name. ALWAYS skippable — at a stall
                      the person is still standing there (decisions 13, 18). */}
                  {NEEDS_PARENT[who] && !parentSkipped && (
                    <div className="mt-2 rounded-md border p-2 space-y-2">
                      <p className="text-xs font-medium">
                        Which {NEEDS_PARENT[who]}?
                      </p>
                      {parentOptions === null ? (
                        <p className="text-xs text-muted-foreground">Loading…</p>
                      ) : parentOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No {NEEDS_PARENT[who]}s are set up yet — skip for now and
                          someone can attach them later.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {parentOptions.map((o) => (
                            <Button
                              key={o.id}
                              type="button"
                              size="sm"
                              variant={parentId === o.id ? 'default' : 'outline'}
                              className="text-xs"
                              onClick={() => setParentId(parentId === o.id ? '' : o.id)}
                            >
                              {o.label}
                              {o.hint ? ` · ${o.hint}` : ''}
                            </Button>
                          ))}
                        </div>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => {
                          setParentId('');
                          setParentSkipped(true);
                        }}
                      >
                        I don&rsquo;t know — skip
                      </Button>
                    </div>
                  )}

                  {NEEDS_PARENT[who] && parentSkipped && (
                    <p className="text-xs text-muted-foreground mt-2 pl-1">
                      Skipped. They&rsquo;ll be saved as a contact and someone will be
                      asked to attach them to a {NEEDS_PARENT[who]}.
                    </p>
                  )}
                </div>

                <Button
                  className="w-full h-12"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {enrichTarget ? 'Add to the existing contact' : 'Save to contact book'}
                </Button>
                {userEmail && (
                  <p className="text-xs text-muted-foreground text-center">
                    Saved as scanned by {userEmail}.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
