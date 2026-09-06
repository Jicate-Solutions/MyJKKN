'use client';

// app/(public)/embed/[handle]/_components/embed-booking-widget.tsx
//
// Universal Booking M7 — IFRAME-FRIENDLY booking widget.
//
// This is the embeddable sibling of meet-booking-widget.tsx. SAME 3-step flow
// (type → time → details → done) and SAME existing public APIs
// (/api/public/meet/<handle>/<typeSlug>/slots + /book) — it does NOT touch
// either API or the /meet widget. The only differences are presentational:
//
//   • No min-h-screen / no full-viewport background band — it must look right
//     inside a host's page at any iframe height.
//   • The brand color is a CSS variable (--meet-accent) driven by the host's
//     theme_color prop, replacing the hardcoded evergreen. Foreground text on
//     the accent is auto-chosen (light/dark) from the color's luminance so a
//     pale brand color stays readable.
//
// IST regrouping rule is preserved verbatim from the /meet widget: the slots
// API returns UTC-date buckets; we regroup BY IST DATE so a late-evening UTC
// slot shows under the correct local day.

import { useMemo, useState } from 'react';
import { groupPurposes, purposeDurationLabel } from '@/lib/services/meetings/group-purposes';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  MapPin,
  Phone,
  UserRound,
  Video,
} from 'lucide-react';

interface MeetingTypeOption {
  id: string;
  title: string;
  slug: string;
  durationMin: number;
  description: string | null;
  locationMode: 'in_person' | 'phone' | 'online';
  locationText: string | null;
  /** PR1: full directions from the linked room (name + building/floor/room). */
  locationDetails: string | null;
  /** Types sharing a value are ONE purpose card; the value is its label. */
  purposeGroup: string | null;
}

interface EmbedBookingWidgetProps {
  handle: string;
  name: string;
  designation: string | null;
  departmentName: string | null;
  institutionName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  meetingTypes: MeetingTypeOption[];
  /** #RRGGBB brand color (already defaulted server-side). */
  themeColor: string;
}

interface SlotsResponse {
  days?: Record<string, Array<{ start: string }>>;
  durationMin?: number;
  error?: string;
}

type Step = 'type' | 'time' | 'details' | 'done';

const IST = 'Asia/Kolkata';

const istDateKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));

const istDayLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(iso));

const istTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));

const istFull = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));

/** Pick black/white text for readability on the given hex background. */
function readableForeground(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Relative luminance (sRGB) — light backgrounds get dark text.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1C2B24' : '#ffffff';
}

function LocationLine({ mt }: { mt: MeetingTypeOption }) {
  if (mt.locationMode === 'online') {
    return (
      <span className="inline-flex items-center gap-1">
        <Video className="h-3.5 w-3.5" aria-hidden /> Online · Google Meet
      </span>
    );
  }
  if (mt.locationMode === 'phone') {
    return (
      <span className="inline-flex items-center gap-1">
        <Phone className="h-3.5 w-3.5" aria-hidden /> Phone call
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <MapPin className="h-3.5 w-3.5" aria-hidden />{' '}
      {mt.locationDetails || mt.locationText || 'In person'}
    </span>
  );
}

export function EmbedBookingWidget(props: EmbedBookingWidgetProps) {
  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<MeetingTypeOption | null>(null);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    { uid: string; start: string; venueStatus: 'pending' | 'confirmed' | null } | null
  >(null);

  const accent = props.themeColor;
  const accentFg = useMemo(() => readableForeground(accent), [accent]);
  /** Shared with /meet/[handle] so the embed cannot drift from the page. */
  const purposes = useMemo(() => groupPurposes(props.meetingTypes), [props.meetingTypes]);

  // The whole widget is themed off two CSS variables so every accent surface
  // (selected slot, confirm button, header rule, step dots) follows the host's
  // brand color without per-element prop drilling.
  const themeVars = {
    '--meet-accent': accent,
    '--meet-accent-fg': accentFg,
  } as React.CSSProperties;

  // Regroup the API's day buckets BY IST DATE (see header comment).
  const istDays = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const list of Object.values(slots?.days ?? {})) {
      for (const s of list) {
        const key = istDateKey(s.start);
        const arr = grouped.get(key) ?? [];
        arr.push(s.start);
        grouped.set(key, arr);
      }
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, starts]) => ({ key, starts: starts.sort() }));
  }, [slots]);

  async function pickType(mt: MeetingTypeOption) {
    setSelectedType(mt);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/meet/${props.handle}/${mt.slug}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as SlotsResponse;
      if (!res.ok) throw new Error(json.error || 'Could not load available times.');
      setSlots(json);
      setStep('time');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load available times.');
    } finally {
      setBusy(false);
    }
  }

  async function submitBooking() {
    if (!selectedType || !selectedStart) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError('Please fill in your name and email.');
      return;
    }
    // PR1: a prep note is required so the host can prepare for the meeting.
    if (!form.note.trim()) {
      setError('Please add a short note on what you’d like to cover.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/meet/${props.handle}/${selectedType.slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: selectedStart,
          name: form.name,
          email: form.email,
          phone: form.phone,
          note: form.note,
          honeypot: '',
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        // PR2: distinguish the host's time being taken from the room being taken.
        setError(
          json.error === 'venue_taken'
            ? 'The room for this meeting is already booked at this time — please pick another time.'
            : 'That time was just taken — please pick another slot.',
        );
        await pickType(selectedType); // refresh slots, stay on time step
        return;
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not complete the booking.');
      }
      setConfirmation({
        uid: json.uid,
        start: selectedStart,
        venueStatus:
          json.venueStatus === 'pending' || json.venueStatus === 'confirmed'
            ? json.venueStatus
            : null,
      });
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the booking.');
    } finally {
      setBusy(false);
    }
  }

  const STEPS: Step[] = ['type', 'time', 'details', 'done'];

  return (
    <div
      className="min-h-full w-full bg-[#FAF7F0] text-[#1C2B24]"
      style={{ ...themeVars, fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      {/* Brand rule — picks up the host's accent. */}
      <div className="h-2 w-full" style={{ backgroundColor: 'var(--meet-accent)' }} />
      <div className="mx-auto flex w-full max-w-md flex-col px-5 pb-8 pt-6">
        {/* Host header */}
        <header className="mb-5 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- external avatar URL */}
          {props.avatarUrl ? (
            <img src={props.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <div
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold"
              style={{ backgroundColor: 'var(--meet-accent)', color: 'var(--meet-accent-fg)' }}
            >
              {props.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1C2B24]/55">
              {props.institutionName ?? 'JKKN Institutions'}
            </p>
            <h1
              className="text-[1.6rem] leading-tight"
              style={{ fontFamily: 'var(--font-dm-serif-display), serif', color: 'var(--meet-accent)' }}
            >
              {props.name}
            </h1>
            <p className="text-xs text-[#1C2B24]/65">
              {[props.designation, props.departmentName].filter(Boolean).join(' · ')}
            </p>
            {props.headline && (
              <p className="mt-1 text-sm text-[#1C2B24]/75">{props.headline}</p>
            )}
          </div>
        </header>

        {/* Step dots */}
        <div className="mb-6 flex gap-1.5" aria-hidden>
          {STEPS.slice(0, 3).map((s, i) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{
                backgroundColor:
                  STEPS.indexOf(step) >= i ? 'var(--meet-accent)' : 'rgba(28,43,36,0.15)',
              }}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* ── Step 1: purpose (formats inline) ─────────────────────────── */}
        {/* Same grouping as /meet/[handle], but the embed is a narrow iframe,
            so a purpose with two formats offers them as chips on the card
            rather than costing a whole extra step. */}
        {step === 'type' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">What do you need?</p>
            {purposes.map((p) =>
              p.options.length === 1 ? (
                <button
                  key={p.key}
                  type="button"
                  disabled={busy}
                  onClick={() => pickType(p.options[0])}
                  className="rounded-lg border border-[#1C2B24]/15 bg-white px-4 py-3.5 text-left transition-colors hover:border-[var(--meet-accent)] disabled:opacity-60"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{p.label}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#1C2B24]/60">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> {purposeDurationLabel(p)}
                    </span>
                  </span>
                  {p.description && (
                    <span className="mt-1 block text-xs text-[#1C2B24]/65">{p.description}</span>
                  )}
                  <span className="mt-1.5 block text-xs text-[#1C2B24]/60">
                    <LocationLine mt={p.options[0]} />
                  </span>
                </button>
              ) : (
                <div
                  key={p.key}
                  className="rounded-lg border border-[#1C2B24]/15 bg-white px-4 py-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{p.label}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#1C2B24]/60">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> {purposeDurationLabel(p)}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-1 text-xs text-[#1C2B24]/65">{p.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.options.map((mt) => (
                      <button
                        key={mt.id}
                        type="button"
                        disabled={busy}
                        onClick={() => pickType(mt)}
                        className="rounded-md border border-[#1C2B24]/20 px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--meet-accent)] disabled:opacity-60"
                      >
                        {/* When the purpose spans several lengths the card
                            header shows all of them, so each option must say
                            which one IT is — otherwise the booker is choosing
                            a length blind. */}
                        {p.hasMixedDurations && (
                          <span className="mr-1.5 font-medium">{mt.durationMin} min ·</span>
                        )}
                        <LocationLine mt={mt} />
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-[#1C2B24]/60">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading available times…
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: time ─────────────────────────────────────────────── */}
        {step === 'time' && selectedType && (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => { setStep('type'); setSelectedStart(null); }}
              className="inline-flex w-fit items-center gap-1 text-xs text-[#1C2B24]/70 hover:text-[var(--meet-accent)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {selectedType.title}
            </button>
            {istDays.length === 0 ? (
              <div className="rounded-lg border border-[#1C2B24]/15 bg-white px-4 py-5 text-sm text-[#1C2B24]/65">
                No times are open in the next two weeks. Please check back later.
              </div>
            ) : (
              istDays.map((day) => (
                <div key={day.key}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#1C2B24]/55">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {istDayLabel(day.starts[0])}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {day.starts.map((start) => {
                      const selected = selectedStart === start;
                      return (
                        <button
                          key={start}
                          type="button"
                          onClick={() => { setSelectedStart(start); setStep('details'); }}
                          className="rounded-md border px-2 py-2 text-sm transition-colors"
                          style={
                            selected
                              ? {
                                  backgroundColor: 'var(--meet-accent)',
                                  borderColor: 'var(--meet-accent)',
                                  color: 'var(--meet-accent-fg)',
                                }
                              : { borderColor: 'rgba(28,43,36,0.25)', backgroundColor: '#fff' }
                          }
                        >
                          {istTime(start)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <p className="text-center text-[11px] text-[#1C2B24]/50">All times in IST</p>
          </div>
        )}

        {/* ── Step 3: details ──────────────────────────────────────────── */}
        {step === 'details' && selectedType && selectedStart && (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setStep('time')}
              className="inline-flex w-fit items-center gap-1 text-xs text-[#1C2B24]/70 hover:text-[var(--meet-accent)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {istFull(selectedStart)} (IST)
            </button>

            <label className="text-sm">
              <span className="mb-1 block font-medium">Your name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={200}
                className="w-full rounded-md border border-[#1C2B24]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--meet-accent)] focus:ring-1 focus:ring-[var(--meet-accent)]"
                autoComplete="name"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={254}
                className="w-full rounded-md border border-[#1C2B24]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--meet-accent)] focus:ring-1 focus:ring-[var(--meet-accent)]"
                autoComplete="email"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Phone {selectedType.locationMode === 'phone' ? '(we call this number)' : '(optional)'}
              </span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={20}
                className="w-full rounded-md border border-[#1C2B24]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--meet-accent)] focus:ring-1 focus:ring-[var(--meet-accent)]"
                autoComplete="tel"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Anything to share beforehand? <span className="text-[var(--meet-accent)]">*</span>
              </span>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                maxLength={500}
                required
                aria-required="true"
                placeholder="A line on what you'd like to cover helps the host prepare."
                className="w-full rounded-md border border-[#1C2B24]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--meet-accent)] focus:ring-1 focus:ring-[var(--meet-accent)]"
              />
            </label>

            <button
              type="button"
              onClick={submitBooking}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--meet-accent)', color: 'var(--meet-accent-fg)' }}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserRound className="h-4 w-4" aria-hidden />
              )}
              {busy ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────── */}
        {step === 'done' && confirmation && selectedType && (
          <div className="rounded-lg border border-[#1C2B24]/15 bg-white px-5 py-6">
            <p
              className="flex items-center gap-2 text-base font-semibold"
              style={{ color: 'var(--meet-accent)' }}
            >
              <CheckCircle2 className="h-5 w-5" aria-hidden /> You&apos;re booked!
            </p>
            <p className="mt-3 text-sm text-[#1C2B24]/80">
              <strong>{selectedType.title}</strong> with {props.name}
            </p>
            <p className="mt-1 text-sm text-[#1C2B24]/80">{istFull(confirmation.start)} (IST)</p>
            <p className="mt-1 text-sm text-[#1C2B24]/70">
              <LocationLine mt={selectedType} />
            </p>
            {confirmation.venueStatus === 'pending' && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Your time is booked. The room is awaiting approval from the venue
                in-charge — you&rsquo;ll be notified once it&rsquo;s confirmed.
              </p>
            )}
            <p className="mt-3 text-xs text-[#1C2B24]/55">
              A confirmation email with the details — and a cancel link if your
              plans change — is on its way to {form.email}.
            </p>
            <p className="mt-2 text-xs text-[#1C2B24]/50">Reference: {confirmation.uid}</p>
          </div>
        )}
      </div>
    </div>
  );
}
