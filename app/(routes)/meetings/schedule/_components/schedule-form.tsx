'use client';

// app/(routes)/meetings/schedule/_components/schedule-form.tsx
//
// The host-initiated scheduling form. Three attendee sources in one picker —
// JKKN people (search), past contacts (preloaded), and any typed address —
// because the host does not think in categories, they think of a person.
//
// Everything the picker adds becomes a plain {name, email, profileId} chip, so
// downstream code never branches on where someone came from.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  Users,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  listPastContacts,
  scheduleMeeting,
  searchPeople,
  type PersonOption,
} from '../actions';

type LocationMode = 'in_person' | 'phone' | 'online';

const LOCATIONS: Array<{ value: LocationMode; label: string; icon: typeof Video }> = [
  { value: 'online', label: 'Online (Google Meet)', icon: Video },
  { value: 'in_person', label: 'In person', icon: MapPin },
  { value: 'phone', label: 'Phone call', icon: Phone },
];

const DURATIONS = [15, 30, 45, 60, 90];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Chip {
  name: string;
  email: string;
  profileId: string | null;
}

export function ScheduleForm() {
  const [title, setTitle] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [locationMode, setLocationMode] = useState<LocationMode>('online');
  const [locationText, setLocationText] = useState('');
  const [note, setNote] = useState('');
  const [chips, setChips] = useState<Chip[]>([]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonOption[]>([]);
  const [contacts, setContacts] = useState<PersonOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [booked, setBooked] = useState<{
    uid: string;
    videoUrl: string | null;
    warning: string | null;
  } | null>(null);
  const [isSaving, startSave] = useTransition();

  // Past contacts are a fixed list — load once and filter client-side.
  useEffect(() => {
    listPastContacts().then((r) => {
      if (r.success && r.data) setContacts(r.data);
    });
  }, []);

  // Debounced people search. The ref guards against an older, slower response
  // overwriting a newer one (the classic out-of-order autocomplete bug).
  const seq = useRef(0);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchPeople(term);
      if (mine !== seq.current) return;
      setResults(r.success && r.data ? r.data : []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const chosen = useMemo(() => new Set(chips.map((c) => c.email)), [chips]);

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const fromContacts = term
      ? contacts.filter(
          (c) =>
            c.email.toLowerCase().includes(term) || c.name.toLowerCase().includes(term),
        )
      : contacts.slice(0, 6);
    // Search results first — they are what the host just typed toward.
    const merged = [...results, ...fromContacts];
    const seen = new Set<string>();
    return merged
      .filter((p) => {
        const e = p.email.toLowerCase();
        if (chosen.has(e) || seen.has(e)) return false;
        seen.add(e);
        return true;
      })
      .slice(0, 8);
  }, [results, contacts, query, chosen]);

  // A typed address that matches nobody is still a valid invitee.
  const typedEmail = query.trim().toLowerCase();
  const canAddTyped =
    EMAIL_RE.test(typedEmail) &&
    !chosen.has(typedEmail) &&
    !suggestions.some((s) => s.email.toLowerCase() === typedEmail);

  function addChip(p: { name: string; email: string; profileId: string | null }) {
    const email = p.email.trim().toLowerCase();
    if (!email || chosen.has(email)) return;
    setChips((prev) => [...prev, { ...p, email }]);
    setQuery('');
    setResults([]);
  }

  function removeChip(email: string) {
    setChips((prev) => prev.filter((c) => c.email !== email));
  }

  function onSubmit() {
    if (!chips.length) {
      toast.error('Add at least one person to meet.');
      return;
    }
    startSave(async () => {
      // The action awaits Google Calendar plus one email per attendee. If a
      // provider hangs there is no server-side ceiling, so without this race
      // the button would sit on "Scheduling…" forever with no way to tell.
      // The timeout only ends the WAIT — the booking may still have committed,
      // which is why the message says "check your Inbox" rather than "failed".
      const TIMEOUT_MS = 20_000;
      const timedOut = Symbol('timeout');
      const res = await Promise.race([
        scheduleMeeting({
          title,
          startLocal,
          durationMin,
          locationMode,
          locationText: locationMode === 'in_person' ? locationText : null,
          note,
          attendees: chips.map((c) => ({
            email: c.email,
            name: c.name,
            profileId: c.profileId,
          })),
        }),
        new Promise<typeof timedOut>((r) => setTimeout(() => r(timedOut), TIMEOUT_MS)),
      ]);

      if (res === timedOut) {
        toast.warning(
          'Still working — this is taking longer than usual. Check Meetings → Inbox before trying again, so you do not book it twice.',
        );
        return;
      }

      if (!res.success || !res.data) {
        toast.error(res.error ?? 'The meeting could not be scheduled.');
        return;
      }
      setBooked({
        uid: res.data.uid,
        videoUrl: res.data.videoUrl,
        warning: res.data.warning,
      });
      if (res.data.warning) toast.warning(res.data.warning);
      else toast.success('Meeting scheduled — invitations sent.');
    });
  }

  function reset() {
    setBooked(null);
    setTitle('');
    setStartLocal('');
    setNote('');
    setChips([]);
    setLocationText('');
  }

  // ── Confirmation ─────────────────────────────────────────────────────────
  if (booked) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          {/* The headline must not claim invitations went out when `warning`
              says they did not — a green tick above a contradicting warning is
              exactly the silent-partial-success the service guards against. */}
          {booked.warning ? (
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" aria-hidden />
          ) : (
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
          )}
          <div>
            <h3 className="text-base font-semibold">
              {booked.warning ? 'Meeting saved — but read this' : 'Meeting scheduled'}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {booked.warning
                ? 'The time is booked on your calendar. Something below still needs your attention.'
                : 'Everyone you added has been invited by Google Calendar.'}
            </p>
          </div>

          {booked.warning && (
            <p
              role="alert"
              className="mx-auto max-w-md rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900"
            >
              {booked.warning}
            </p>
          )}

          {booked.videoUrl && (
            <p className="text-sm">
              <a
                href={booked.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-[#0E4D34] underline"
              >
                <Video className="h-4 w-4" aria-hidden />
                {booked.videoUrl}
              </a>
            </p>
          )}

          <div className="flex justify-center gap-2 pt-1">
            <Button size="sm" onClick={reset}>
              Schedule another
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="/meetings/inbox">Go to inbox</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" aria-hidden />
            The meeting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sm-title">What is it about?</Label>
            <Input
              id="sm-title"
              placeholder="e.g. Admission review — Pharmacy"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sm-when">When</Label>
              <Input
                id="sm-when"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>How long</Label>
              <div className="flex flex-wrap gap-1">
                {DURATIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={durationMin === d ? 'default' : 'outline'}
                    onClick={() => setDurationMin(d)}
                  >
                    <Clock className="mr-1 h-3.5 w-3.5" aria-hidden />
                    {d}m
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Where</Label>
            <div className="flex flex-wrap gap-1">
              {LOCATIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={locationMode === opt.value ? 'default' : 'outline'}
                    onClick={() => setLocationMode(opt.value)}
                  >
                    <Icon className="mr-1 h-3.5 w-3.5" aria-hidden />
                    {opt.label}
                  </Button>
                );
              })}
            </div>
            {locationMode === 'online' && (
              <p className="text-xs text-muted-foreground">
                A Google Meet link is created and sent with the invitation.
              </p>
            )}
            {locationMode === 'phone' && (
              <p className="text-xs text-muted-foreground">
                No link is created — you call them.
              </p>
            )}
            {locationMode === 'in_person' && (
              <Input
                className="mt-1"
                placeholder="Where? e.g. Board Room, Admin block"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                aria-label="Meeting place"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sm-note">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="sm-note"
              rows={3}
              placeholder="Anything they should read or bring."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden />
            Who is coming
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <li
                  key={c.email}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#0E4D34]/25 bg-[#0E4D34]/5 py-1 pl-3 pr-1 text-xs"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.email}</span>
                  <button
                    type="button"
                    onClick={() => removeChip(c.email)}
                    aria-label={`Remove ${c.name}`}
                    className="rounded-full p-1 hover:bg-[#0E4D34]/10"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sm-people">Add people</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="sm-people"
                className="pl-8"
                placeholder="Search JKKN people, or type any email address"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canAddTyped) {
                    e.preventDefault();
                    addChip({ name: typedEmail, email: typedEmail, profileId: null });
                  }
                }}
              />
              {searching && (
                <Loader2
                  className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground"
                  aria-hidden
                />
              )}
            </div>
          </div>

          {canAddTyped && (
            <button
              type="button"
              onClick={() => addChip({ name: typedEmail, email: typedEmail, profileId: null })}
              className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Invite <span className="font-medium">{typedEmail}</span>
            </button>
          )}

          {suggestions.length > 0 && (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {suggestions.map((p) => (
                <li key={p.email}>
                  <button
                    type="button"
                    onClick={() =>
                      addChip({ name: p.name, email: p.email, profileId: p.profileId })
                    }
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.email}
                        {p.subtitle ? ` · ${p.subtitle}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.origin === 'jkkn' ? 'JKKN' : 'Contact'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!suggestions.length && !canAddTyped && query.trim().length >= 2 && !searching && (
            <p className="text-xs text-muted-foreground">
              Nobody matched. Type a full email address to invite them anyway.
            </p>
          )}

          <div className="pt-1">
            <Button className="w-full" onClick={onSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Scheduling…
                </>
              ) : (
                `Schedule and invite ${chips.length || ''}`.trim()
              )}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              This books the time on your calendar and emails everyone an invitation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
