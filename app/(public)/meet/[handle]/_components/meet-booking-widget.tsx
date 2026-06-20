'use client';

// app/(public)/meet/[handle]/_components/meet-booking-widget.tsx
//
// 3-step personal booking flow (Universal Booking U4):
//   Step 1 "type":    pick one of the host's meeting types.
//   Step 2 "time":    live slot grid (IST), 14-day horizon.
//   Step 3 "details": name/email/phone/note → instant confirm → ticket stub.
//
// Pattern: app/(public)/book/[slug]/_components/booking-widget.tsx —
// same aesthetic (evergreen + cream + DM Serif), same IST regrouping rule
// (API returns UTC-date keys; regroup client-side BY IST DATE so an 18:30+
// UTC slot shows under the right day).

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  UserRound,
  Video,
} from 'lucide-react';
import { getBookingPixelConfig } from '@/lib/services/analytics/booking-pixel-service';

interface MeetingTypeOption {
  id: string;
  title: string;
  slug: string;
  durationMin: number;
  description: string | null;
  locationMode: 'in_person' | 'phone' | 'online';
  locationText: string | null;
}

interface MeetBookingWidgetProps {
  handle: string;
  name: string;
  designation: string | null;
  departmentName: string | null;
  institutionName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  meetingTypes: MeetingTypeOption[];
}

interface SlotsResponse {
  days?: Record<string, Array<{ start: string }>>;
  durationMin?: number;
  // Wave-3: variant kind + (group only) remaining seats keyed by ISO start.
  kind?: 'solo' | 'group' | 'collective' | 'round_robin';
  seatsByStart?: Record<string, number> | null;
  // Wave-3 (B): paid bookings — deposit requirement + public Razorpay key.
  requiresDeposit?: boolean;
  depositAmountPaise?: number | null;
  razorpayKeyId?: string | null;
  error?: string;
}

// Razorpay Checkout injects a global constructor when its script loads.
interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (resp: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Load the Razorpay Checkout script once; resolves false if it can't load. */
function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_CHECKOUT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(!!window.Razorpay), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      // Already loaded in a prior attempt.
      if (window.Razorpay) resolve(true);
      return;
    }
    const s = document.createElement('script');
    s.src = RAZORPAY_CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve(!!window.Razorpay);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** Plain ₹ from paise for the deposit label. */
function rupeesFromPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Fire the booking-conversion event into whichever pixels are configured. Uses
 * the shared getBookingPixelConfig() to decide which globals exist; the
 * <BookingTrackingScripts /> loader (mounted by the public layout) injects
 * window.gtag / window.fbq. Safe no-op when nothing is configured — analytics
 * must never break a booking, so every call is wrapped/guarded.
 */
function fireBookingConversion(): void {
  if (typeof window === 'undefined') return;
  try {
    const { ga4MeasurementId, metaPixelId } = getBookingPixelConfig();
    const w = window as unknown as {
      gtag?: (...args: unknown[]) => void;
      fbq?: (...args: unknown[]) => void;
    };
    if (ga4MeasurementId && typeof w.gtag === 'function') {
      w.gtag('event', 'generate_lead', { event_category: 'booking', value: 1 });
    }
    if (metaPixelId && typeof w.fbq === 'function') {
      w.fbq('track', 'Schedule');
    }
  } catch {
    /* never let a pixel error surface to the booker */
  }
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
      <MapPin className="h-3.5 w-3.5" aria-hidden /> {mt.locationText || 'In person'}
    </span>
  );
}

export function MeetBookingWidget(props: MeetBookingWidgetProps) {
  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<MeetingTypeOption | null>(null);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    { uid: string; start: string; videoUrl: string | null } | null
  >(null);

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

  const bookUrl = `/api/public/meet/${props.handle}/${selectedType?.slug ?? ''}/book`;

  /**
   * POST the confirm step. `payment` carries verified Razorpay fields for a
   * deposit type. Handles the slot-taken race, success (pixel + confirmation +
   * redirect), and surfaces errors.
   */
  async function finalizeBooking(payment?: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<void> {
    if (!selectedType || !selectedStart) return;
    const res = await fetch(bookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: selectedStart,
        name: form.name,
        email: form.email,
        phone: form.phone,
        note: form.note,
        honeypot: '',
        ...(payment ?? {}),
      }),
    });
    const json = await res.json();
    if (res.status === 409) {
      setError('That time was just taken — please pick another slot.');
      await pickType(selectedType); // refresh slots, stay on time step
      return;
    }
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Could not complete the booking.');
    }
    // GA4 generate_lead / Meta Schedule (no-op when no pixel is configured).
    fireBookingConversion();
    setConfirmation({
      uid: json.uid,
      start: selectedStart,
      videoUrl: typeof json.videoUrl === 'string' ? json.videoUrl : null,
    });
    setStep('done');
    // Wave-3 lifecycle: if the meeting type defines a post-booking redirect,
    // send the booker there (the API only returns safe http(s)/relative URLs).
    // Show the confirmation stub briefly first so the redirect isn't jarring.
    if (typeof json.redirectUrl === 'string' && json.redirectUrl) {
      const target = json.redirectUrl as string;
      window.setTimeout(() => {
        window.location.href = target;
      }, 1200);
    }
  }

  async function submitBooking() {
    if (!selectedType || !selectedStart) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError('Please fill in your name and email.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Free type → confirm directly. Deposit type → create an order, open
      // Razorpay Checkout, then confirm with the verified payment.
      if (!slots?.requiresDeposit) {
        await finalizeBooking();
        return;
      }

      const orderRes = await fetch(bookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'order',
          start: selectedStart,
          name: form.name,
          email: form.email,
          phone: form.phone,
          note: form.note,
          honeypot: '',
        }),
      });
      const orderJson = await orderRes.json();
      if (!orderRes.ok || !orderJson.success) {
        throw new Error(orderJson.error || 'Could not start payment.');
      }
      // Server decided no payment is needed (e.g. Razorpay unconfigured) →
      // fall back to a free confirm so the booker is never dead-ended.
      if (!orderJson.requiresPayment) {
        await finalizeBooking();
        return;
      }

      const ready = await loadRazorpayCheckout();
      if (!ready || !window.Razorpay) {
        throw new Error('Could not load the payment window. Please try again.');
      }

      // Open Checkout; resolve once the booking is confirmed or the modal closes.
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: orderJson.keyId as string,
          amount: orderJson.amountPaise as number,
          currency: 'INR',
          name: props.institutionName ?? 'JKKN Institutions',
          description: `${selectedType.title} — deposit`,
          order_id: orderJson.orderId as string,
          prefill: { name: form.name, email: form.email, contact: form.phone || undefined },
          theme: { color: '#0E4D34' },
          handler: (resp) => {
            // Verify + confirm server-side. Surface any failure to the booker.
            finalizeBooking({
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            })
              .then(resolve)
              .catch(reject);
          },
          modal: {
            ondismiss: () => {
              // Booker closed Checkout without paying — not an error, just stop.
              reject(new Error('Payment was not completed. Your slot is still open.'));
            },
          },
        });
        rzp.open();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the booking.');
    } finally {
      setBusy(false);
    }
  }

  const STEPS: Step[] = ['type', 'time', 'details', 'done'];

  return (
    <div
      className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]"
      style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      {/* GA4 + Meta Pixel base scripts are mounted once at the page level
          (app/(public)/meet/[handle]/page.tsx). This widget only FIRES the
          conversion event on booking success — see getBookingPixelConfig() use
          below — so it must NOT re-mount <BookingTrackingScripts /> (that would
          double-load the loader and double-count events). */}
      <div className="h-2 w-full bg-[#0E4D34]" />
      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] w-full max-w-md flex-col px-5 pb-10 pt-8">
        {/* Host header */}
        <header className="mb-6 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- external avatar URL */}
          {props.avatarUrl ? (
            <img src={props.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <div
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0E4D34]/10 text-base font-semibold text-[#0E4D34]"
            >
              {props.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0E4D34]/70">
              {props.institutionName ?? 'JKKN Institutions'}
            </p>
            <h1
              className="text-[1.6rem] leading-tight text-[#0E4D34]"
              style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
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
        <div className="mb-7 flex gap-1.5" aria-hidden>
          {STEPS.slice(0, 3).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                STEPS.indexOf(step) >= i ? 'bg-[#0E4D34]' : 'bg-[#0E4D34]/15'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* ── Step 1: meeting type ─────────────────────────────────────── */}
        {step === 'type' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">What would you like to book?</p>
            {props.meetingTypes.map((mt) => (
              <button
                key={mt.id}
                type="button"
                disabled={busy}
                onClick={() => pickType(mt)}
                className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-3.5 text-left transition-colors hover:border-[#0E4D34]/60 disabled:opacity-60"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{mt.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#1C2B24]/60">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> {mt.durationMin} min
                  </span>
                </span>
                {mt.description && (
                  <span className="mt-1 block text-xs text-[#1C2B24]/65">{mt.description}</span>
                )}
                <span className="mt-1.5 block text-xs text-[#1C2B24]/60">
                  <LocationLine mt={mt} />
                </span>
              </button>
            ))}
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
              className="inline-flex w-fit items-center gap-1 text-xs text-[#0E4D34]/80 hover:text-[#0E4D34]"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {selectedType.title}
            </button>
            {istDays.length === 0 ? (
              <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-5 text-sm text-[#1C2B24]/65">
                No times are open in the next two weeks. Please check back later.
              </div>
            ) : (
              istDays.map((day) => (
                <div key={day.key}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#0E4D34]/70">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {istDayLabel(day.starts[0])}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {day.starts.map((start) => {
                      const seats =
                        slots?.kind === 'group' ? slots.seatsByStart?.[start] : undefined;
                      return (
                        <button
                          key={start}
                          type="button"
                          onClick={() => { setSelectedStart(start); setStep('details'); }}
                          className={`flex flex-col items-center rounded-md border px-2 py-2 text-sm leading-tight transition-colors ${
                            selectedStart === start
                              ? 'border-[#0E4D34] bg-[#0E4D34] text-white'
                              : 'border-[#0E4D34]/25 bg-white hover:border-[#0E4D34]/60'
                          }`}
                        >
                          <span>{istTime(start)}</span>
                          {typeof seats === 'number' && (
                            <span
                              className={`text-[10px] ${
                                selectedStart === start ? 'text-white/80' : 'text-[#1C2B24]/55'
                              }`}
                            >
                              {seats} {seats === 1 ? 'seat' : 'seats'} left
                            </span>
                          )}
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
              className="inline-flex w-fit items-center gap-1 text-xs text-[#0E4D34]/80 hover:text-[#0E4D34]"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {istFull(selectedStart)} (IST)
            </button>

            <label className="text-sm">
              <span className="mb-1 block font-medium">Your name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={200}
                className="w-full rounded-md border border-[#0E4D34]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[#0E4D34] focus:ring-1 focus:ring-[#0E4D34]"
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
                className="w-full rounded-md border border-[#0E4D34]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[#0E4D34] focus:ring-1 focus:ring-[#0E4D34]"
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
                className="w-full rounded-md border border-[#0E4D34]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[#0E4D34] focus:ring-1 focus:ring-[#0E4D34]"
                autoComplete="tel"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Anything to share beforehand? (optional)</span>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                maxLength={500}
                className="w-full rounded-md border border-[#0E4D34]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[#0E4D34] focus:ring-1 focus:ring-[#0E4D34]"
              />
            </label>

            {slots?.requiresDeposit && typeof slots.depositAmountPaise === 'number' && (
              <div className="flex items-center gap-2 rounded-md border border-[#0E4D34]/20 bg-[#0E4D34]/5 px-3 py-2.5 text-xs text-[#1C2B24]/80">
                <CreditCard className="h-4 w-4 shrink-0 text-[#0E4D34]" aria-hidden />
                <span>
                  A deposit of{' '}
                  <strong>{rupeesFromPaise(slots.depositAmountPaise)}</strong> is
                  required to confirm. You&rsquo;ll pay securely on the next screen.
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={submitBooking}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0E4D34] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a3b28] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : slots?.requiresDeposit ? (
                <CreditCard className="h-4 w-4" aria-hidden />
              ) : (
                <UserRound className="h-4 w-4" aria-hidden />
              )}
              {busy
                ? 'Booking…'
                : slots?.requiresDeposit && typeof slots.depositAmountPaise === 'number'
                  ? `Pay ${rupeesFromPaise(slots.depositAmountPaise)} & confirm`
                  : 'Confirm booking'}
            </button>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────── */}
        {step === 'done' && confirmation && selectedType && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-5 py-6">
            <p className="flex items-center gap-2 text-base font-semibold text-[#0E4D34]">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> You&apos;re booked!
            </p>
            <p className="mt-3 text-sm text-[#1C2B24]/80">
              <strong>{selectedType.title}</strong> with {props.name}
            </p>
            <p className="mt-1 text-sm text-[#1C2B24]/80">{istFull(confirmation.start)} (IST)</p>
            <p className="mt-1 text-sm text-[#1C2B24]/70">
              <LocationLine mt={selectedType} />
            </p>
            {confirmation.videoUrl && (
              <a
                href={confirmation.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#0E4D34] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0a3b28]"
              >
                <Video className="h-4 w-4" aria-hidden /> Join the meeting
              </a>
            )}
            <p className="mt-3 text-xs text-[#1C2B24]/55">
              A confirmation email with the details
              {confirmation.videoUrl ? ' and the join link' : ''} — and a cancel
              link if your plans change — is on its way to {form.email}.
            </p>
            <p className="mt-2 text-xs text-[#1C2B24]/50">Reference: {confirmation.uid}</p>
          </div>
        )}
      </div>
    </div>
  );
}
