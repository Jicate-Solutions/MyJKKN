'use client';

// app/(public)/book/[slug]/_components/booking-widget.tsx
//
// 3-step public booking flow — Path W task #10.
//   Step 1 "details": name/email/phone + config-driven questions.
//   Step 2 "time":    round-robin picked counselor + live slot grid (IST).
//   Step 3 "done":    admission-ticket confirmation stub (screenshot-able).
//
// Aesthetic: institutional evergreen + warm cream + saffron accent; DM Serif
// Display headlines (--font-dm-serif-display, already loaded by the root
// layout) over IBM Plex Sans body. Mobile-first; desktop just centers the
// column. No Tamil strings in v1 — needs native review first (CLAUDE.md #24).
//
// Slot regrouping happens client-side BY IST DATE (the API returns UTC-date
// keys; a 18:30+ UTC slot would otherwise show under the wrong day).

import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, Clock, Loader2, Phone, UserRound } from 'lucide-react';

interface RoutingQuestion {
  q: string;
  type: 'text' | 'select';
  options?: string[];
}

interface BookingWidgetProps {
  slug: string;
  displayName: string;
  durationMin: number;
  questions: RoutingQuestion[];
}

interface SlotsResponse {
  counselor?: { name: string } | null;
  meetingTypeId?: string;
  durationMin?: number;
  days?: Record<string, Array<{ start: string }>>;
  error?: string;
}

type Step = 'details' | 'time' | 'done';

const IST = 'Asia/Kolkata';

const istDateKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );

const istDayLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );

const istTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

const istFull = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export function BookingWidget({ slug, displayName, durationMin, questions }: BookingWidgetProps) {
  const [step, setStep] = useState<Step>('details');

  // step 1 state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState('');

  // step 2 state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCounselors, setNoCounselors] = useState(false);
  const [counselorName, setCounselorName] = useState('');
  const [meetingTypeId, setMeetingTypeId] = useState<string | null>(null);
  const [slotStarts, setSlotStarts] = useState<string[]>([]);
  const [activeDay, setActiveDay] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // step 3 state
  const [bookingUid, setBookingUid] = useState('');
  const [bookedStart, setBookedStart] = useState('');

  /** Slots regrouped by IST date, preserving time order. */
  const dayGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const start of slotStarts) {
      const key = istDateKey(start);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(start);
    }
    return groups;
  }, [slotStarts]);

  const dayKeys = useMemo(() => Array.from(dayGroups.keys()).sort(), [dayGroups]);

  const detailsValid =
    name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    questions.every((q) => (answers[q.q] ?? '').trim().length > 0);

  async function loadSlots() {
    setLoading(true);
    setError(null);
    setNoCounselors(false);
    try {
      const res = await fetch(`/api/public/booking/${slug}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ honeypot }),
      });
      const data: SlotsResponse = await res.json();
      if (res.status === 503 && data.error === 'no_counselors_available') {
        setNoCounselors(true);
        setStep('time');
        return;
      }
      if (!res.ok || !data.meetingTypeId) {
        setError(data.error ?? 'Could not load available times. Please try again.');
        return;
      }
      const starts = Object.values(data.days ?? {})
        .flat()
        .map((s) => s.start)
        .filter((s) => new Date(s).getTime() > Date.now())
        .sort();
      setCounselorName(data.counselor?.name ?? '');
      setMeetingTypeId(data.meetingTypeId);
      setSlotStarts(starts);
      setSelectedSlot('');
      setActiveDay(starts.length ? istDateKey(starts[0]) : '');
      setStep('time');
    } catch {
      setError('Network problem — please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmBooking() {
    if (!selectedSlot || !meetingTypeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/booking/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingTypeId,
          start: selectedSlot,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          answers,
          honeypot,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.error === 'slot_taken') {
        setError('That time was just taken — please pick another slot.');
        await loadSlots();
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Could not complete the booking. Please try again.');
        return;
      }
      setBookingUid(data.uid ?? '');
      setBookedStart(data.start ?? selectedSlot);
      setStep('done');
    } catch {
      setError('Network problem — please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const stepIndex = step === 'details' ? 0 : step === 'time' ? 1 : 2;

  return (
    <div className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]" style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}>
      {/* prospectus binding band */}
      <div className="h-2 w-full bg-[#0E4D34]" />
      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] w-full max-w-md flex-col px-5 pb-10 pt-8">
        {/* masthead */}
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0E4D34]/70">
            JKKN Institutions
          </p>
          <h1
            className="mt-1 text-[1.9rem] leading-tight text-[#0E4D34]"
            style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
          >
            {displayName}
          </h1>
          <p className="mt-2 text-sm text-[#1C2B24]/65">
            Book a free {durationMin}-minute call with an admission counselor. No login needed.
          </p>
        </header>

        {/* step bars */}
        <div className="mb-7 flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= stepIndex ? 'bg-[#C99A2E]' : 'bg-[#0E4D34]/12'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* ───────────────────────── STEP 1 — DETAILS ───────────────────────── */}
        {step === 'details' && (
          <form
            className="flex flex-1 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (detailsValid && !loading) void loadSlots();
            }}
          >
            <Field label="Your name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                className="input-jkkn"
                placeholder="Full name"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="input-jkkn"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="input-jkkn"
                placeholder="+91"
              />
            </Field>

            {questions.map((q) => (
              <Field key={q.q} label={q.q} required>
                {q.type === 'select' && q.options?.length ? (
                  <select
                    value={answers[q.q] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.q]: e.target.value }))}
                    required
                    className="input-jkkn"
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {q.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={answers[q.q] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.q]: e.target.value }))}
                    required
                    className="input-jkkn"
                  />
                )}
              </Field>
            ))}

            {/* honeypot — invisible to humans, bots fill it */}
            <input
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              name="website"
            />

            <button type="submit" disabled={!detailsValid || loading} className="btn-jkkn mt-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
              See available times
            </button>
          </form>
        )}

        {/* ───────────────────────── STEP 2 — TIME ───────────────────────── */}
        {step === 'time' && (
          <div className="flex flex-1 flex-col">
            <button
              type="button"
              onClick={() => setStep('details')}
              className="mb-4 inline-flex items-center gap-1 self-start text-sm font-medium text-[#0E4D34]/70 hover:text-[#0E4D34]"
            >
              <ChevronLeft className="h-4 w-4" /> Edit details
            </button>

            {noCounselors ? (
              <div className="rounded-xl border border-[#0E4D34]/15 bg-white p-6 text-center">
                <Phone className="mx-auto mb-3 h-8 w-8 text-[#C99A2E]" />
                <h2 className="text-lg font-semibold text-[#0E4D34]">All counselors are busy right now</h2>
                <p className="mt-2 text-sm text-[#1C2B24]/65">
                  Please call the admission office directly and we&apos;ll arrange a time for you.
                </p>
                <a
                  href="tel:+914288274741"
                  className="mt-4 inline-block rounded-lg bg-[#0E4D34] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Call admission office
                </a>
              </div>
            ) : (
              <>
                {counselorName && (
                  <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#0E4D34]/15 bg-white px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0E4D34] text-sm font-semibold text-white">
                      {counselorName.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-[#1C2B24]/50">You&apos;ll meet</p>
                      <p className="truncate text-sm font-semibold text-[#0E4D34]">{counselorName}</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#C99A2E]/15 px-2.5 py-1 text-[11px] font-semibold text-[#8A6716]">
                      <Clock className="h-3 w-3" /> {durationMin} min
                    </span>
                  </div>
                )}

                {dayKeys.length === 0 ? (
                  <p className="text-sm text-[#1C2B24]/65">
                    No times are open in the next 7 days. Please call the admission office.
                  </p>
                ) : (
                  <>
                    {/* day chips */}
                    <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
                      {dayKeys.map((day) => {
                        const first = dayGroups.get(day)![0];
                        const active = day === activeDay;
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              setActiveDay(day);
                              setSelectedSlot('');
                            }}
                            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                              active
                                ? 'border-[#0E4D34] bg-[#0E4D34] text-white'
                                : 'border-[#0E4D34]/20 bg-white text-[#1C2B24]/80 hover:border-[#0E4D34]/50'
                            }`}
                          >
                            {istDayLabel(first)}
                          </button>
                        );
                      })}
                    </div>

                    {/* slot grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {(dayGroups.get(activeDay) ?? []).map((start) => {
                        const active = start === selectedSlot;
                        return (
                          <button
                            key={start}
                            type="button"
                            onClick={() => setSelectedSlot(start)}
                            className={`rounded-lg border py-2.5 text-sm font-medium tabular-nums transition-all ${
                              active
                                ? 'border-[#0E4D34] bg-[#0E4D34] text-white shadow-sm'
                                : 'border-[#0E4D34]/20 bg-white text-[#1C2B24]/80 hover:border-[#0E4D34]/60'
                            }`}
                          >
                            {istTime(start)}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => void confirmBooking()}
                      disabled={!selectedSlot || loading}
                      className="btn-jkkn mt-6"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {selectedSlot ? `Confirm ${istTime(selectedSlot)}` : 'Pick a time'}
                    </button>
                    <p className="mt-2 text-center text-xs text-[#1C2B24]/45">All times are in IST.</p>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ───────────────────────── STEP 3 — TICKET ───────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-1 flex-col items-center pt-2">
            <CheckCircle2 className="mb-4 h-12 w-12 text-[#0E4D34]" strokeWidth={1.5} />
            <h2
              className="text-2xl text-[#0E4D34]"
              style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
            >
              You&apos;re booked
            </h2>
            <p className="mt-1 text-sm text-[#1C2B24]/65">A confirmation is on its way to {email.trim()}.</p>

            {/* ticket stub */}
            <div className="relative mt-7 w-full overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(14,77,52,0.12)]">
              <div className="bg-[#0E4D34] px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                  JKKN · Counseling appointment
                </p>
              </div>
              <div className="px-5 pb-2 pt-4">
                <p
                  className="text-xl leading-snug text-[#0E4D34]"
                  style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
                >
                  {istFull(bookedStart)}
                </p>
                <p className="mt-0.5 text-sm text-[#1C2B24]/60">{durationMin} minutes · IST</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-[#1C2B24]/80">
                  <UserRound className="h-4 w-4 text-[#C99A2E]" />
                  {counselorName || 'JKKN admission counselor'}
                </div>
              </div>
              {/* perforation */}
              <div className="relative my-3 flex items-center px-5" aria-hidden>
                <span className="absolute -left-2.5 h-5 w-5 rounded-full bg-[#FAF7F0]" />
                <span className="w-full border-t-2 border-dashed border-[#0E4D34]/15" />
                <span className="absolute -right-2.5 h-5 w-5 rounded-full bg-[#FAF7F0]" />
              </div>
              <div className="flex items-center justify-between px-5 pb-4">
                <p className="text-[11px] uppercase tracking-wider text-[#1C2B24]/45">Booking reference</p>
                <p className="font-semibold tabular-nums text-[#0E4D34]" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>
                  {bookingUid ? bookingUid.slice(0, 8).toUpperCase() : '—'}
                </p>
              </div>
            </div>

            <p className="mt-5 max-w-xs text-center text-xs leading-relaxed text-[#1C2B24]/50">
              Take a screenshot of this ticket. The counselor will call you at the booked time — keep your phone
              reachable.
            </p>
          </div>
        )}

        <footer className="mt-auto pt-10 text-center text-[11px] text-[#1C2B24]/40">
          JKKN Institutions · To be a Leading Global Innovative Solutions provider for the ever changing needs of the
          society.
        </footer>
      </div>

      {/* scoped input/button styles — kept local to the public page */}
      <style jsx global>{`
        .input-jkkn {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid rgba(14, 77, 52, 0.2);
          background: #fff;
          padding: 0.65rem 0.85rem;
          font-size: 0.925rem;
          color: #1c2b24;
          outline: none;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .input-jkkn:focus {
          border-color: #0e4d34;
          box-shadow: 0 0 0 3px rgba(14, 77, 52, 0.12);
        }
        .btn-jkkn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          border-radius: 0.7rem;
          background: #0e4d34;
          padding: 0.8rem 1rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: #fff;
          transition: background 150ms, transform 100ms;
        }
        .btn-jkkn:hover:not(:disabled) {
          background: #0b3f2b;
        }
        .btn-jkkn:active:not(:disabled) {
          transform: scale(0.99);
        }
        .btn-jkkn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#1C2B24]/75">
        {label}
        {required && <span className="ml-0.5 text-[#C99A2E]">*</span>}
      </span>
      {children}
    </label>
  );
}
