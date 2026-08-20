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

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import {
  groupPurposes,
  purposeDurationLabel,
  LOCATION_MODE_LABEL,
  type PurposeChoice,
  type PurposeLocationMode,
} from '@/lib/services/meetings/group-purposes';
import { routingFormLinkLabel } from '@/lib/services/meetings/public-host-service';

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

/**
 * One choice on step 1. `options` holds every format that purpose is offered
 * in — usually one, but two when a purpose is bookable both in person and
 * online (which is what the original Calendly "invitee chooses" events meant).
 */
type PurposeOption = PurposeChoice<MeetingTypeOption>;

interface MeetBookingWidgetProps {
  handle: string;
  name: string;
  designation: string | null;
  departmentName: string | null;
  institutionName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  meetingTypes: MeetingTypeOption[];
  /** Signed-in MyJKKN viewer (Director identity flow 2026-06-20). When present
   *  the email step is skipped and the booking is bound to their account. */
  viewer: { name: string; email: string } | null;
  /**
   * The host's active routing form (/r/<slug>), rendered as one quiet link
   * above the purpose cards for a visitor who cannot tell which purpose is
   * theirs. Absent/null on every page that should not offer it, so nothing is
   * rendered — no empty state, no dead link.
   *
   * DELIBERATELY NOT WIRED INTO THE EMBED SIBLING
   * (app/(public)/embed/[handle]/_components/embed-booking-widget.tsx): an
   * embed runs inside someone else's page, and this link navigates the visitor
   * away from it. Leaving it out of the embed is the correct behaviour, not an
   * oversight — please do not "fix" it there.
   *
   * Also absent on the single-type deep link /meet/<handle>/<type>: that
   * visitor arrived on a link that already made the choice for them.
   */
  routingForm?: { slug: string; questionCount: number } | null;
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

type Step = 'purpose' | 'format' | 'time' | 'details' | 'done';

/**
 * Earliest bookable slot per meeting type, loaded in the background so each
 * card can say when it is next free.
 *
 * Neither 'none' nor 'error' ever claims the host has no availability.
 *
 * NativeSchedulingService.loadBusy fails CLOSED: if the Google free/busy call
 * fails it returns one busy block covering the whole window, so the slots API
 * answers 200 with days:{}. That is indistinguishable at this layer from a
 * host who genuinely has nothing free — 'none' means "no slots came back",
 * NOT "no slots exist". Only 'ready' is ever stated as fact.
 *
 * (Observed for real: a dev server without Google credentials returns 0 slots
 * for every type while production returns 175.)
 */
type Earliest =
  | { state: 'loading' }
  | { state: 'ready'; start: string }
  | { state: 'none' }
  | { state: 'error' };

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

/**
 * "Earliest: Tue, 4 Aug 9:20 am" so the booker can compare options without
 * entering each one.
 *
 * Only 'ready' renders. Both 'none' and 'error' render nothing at all — see
 * the note at the return below for why absence can never be stated from here.
 */
function EarliestLine({ earliest }: { earliest: Earliest }) {
  if (earliest.state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-[#1C2B24]/45">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> checking times…
      </span>
    );
  }
  if (earliest.state === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 text-[#0E4D34]/80">
        <CalendarDays className="h-3 w-3" aria-hidden /> Earliest{' '}
        {istDayLabel(earliest.start)} {istTime(earliest.start)}
      </span>
    );
  }
  // 'none' deliberately renders NOTHING rather than "no times available".
  //
  // An empty slot response is ambiguous and cannot be disambiguated here: when
  // GoogleCalendarService.busyForHost fails, NativeSchedulingService.loadBusy
  // returns a single busy block spanning the whole window (fail closed, D19),
  // so the API answers 200 with days:{} — byte-identical to a host who really
  // has nothing free. Asserting "no times" would therefore be a coin-flip
  // between a fact and a lie about someone's availability.
  //
  // Saying nothing is true under both readings; the booker learns the real
  // answer on the time step, which owns that message already. Making this card
  // able to state absence honestly needs the engine to distinguish the two —
  // a slot-engine change, deliberately not made here.
  return null;
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

const MODE_ICON: Record<PurposeLocationMode, typeof Video> = {
  in_person: MapPin,
  online: Video,
  phone: Phone,
};

/**
 * The formats a grouped purpose is offered in, shown on the FIRST screen.
 *
 * Before this, a grouped card said only "N ways to meet", so a booker could
 * not tell whether one of those ways was online without clicking in — the
 * exact thing that made the module look like it had no online option at all.
 * The count is kept alongside the formats because it still tells the booker
 * there is a choice of length behind the card.
 */
function PurposeFormats({ choice }: { choice: PurposeChoice<MeetingTypeOption> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {choice.locationModes.map((mode, i) => {
        const Icon = MODE_ICON[mode];
        return (
          <span key={mode} className="inline-flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-[#1C2B24]/30">·</span>}
            <Icon className="h-3.5 w-3.5" aria-hidden /> {LOCATION_MODE_LABEL[mode]}
          </span>
        );
      })}
      <span className="text-[#1C2B24]/45">({choice.options.length} to choose from)</span>
    </span>
  );
}

export function MeetBookingWidget(props: MeetBookingWidgetProps) {
  const loggedIn = !!props.viewer;
  const [step, setStep] = useState<Step>('purpose');
  const [selectedPurpose, setSelectedPurpose] = useState<PurposeOption | null>(null);
  const [selectedType, setSelectedType] = useState<MeetingTypeOption | null>(null);
  const [earliest, setEarliest] = useState<Record<string, Earliest>>({});
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: props.viewer?.name ?? '',
    email: props.viewer?.email ?? '',
    phone: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    {
      uid: string;
      start: string;
      videoUrl: string | null;
      venueStatus: 'pending' | 'confirmed' | null;
    } | null
  >(null);
  // Identity gate (Director 2026-06-20): a JKKN account must log in to book.
  // 'jkkn_email' is detected client-side (domain match, no probe); 'account_exists'
  // comes back from the server (403) for a non-JKKN email that owns an account.
  const [loginGate, setLoginGate] = useState<null | 'jkkn_email' | 'account_exists'>(null);

  const isJkknEmail =
    !loggedIn && form.email.trim().toLowerCase().endsWith('@jkkn.ac.in');
  const gated = isJkknEmail || loginGate !== null;
  const loginHref = `/auth/login?redirectedFrom=${encodeURIComponent(`/meet/${props.handle}`)}`;

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

  /** Shared with the embed widget so the two surfaces cannot drift. */
  const purposes = useMemo(
    () => groupPurposes(props.meetingTypes),
    [props.meetingTypes],
  );

  /**
   * Ask each type when it is next free, so a card can say so before the booker
   * commits to it. Deliberately fire-and-forget per type: cards render at once
   * and fill in as answers land. A failure records 'error', never 'none' —
   * see the Earliest type for why that distinction is load-bearing.
   */
  useEffect(() => {
    let cancelled = false;
    setEarliest(
      Object.fromEntries(props.meetingTypes.map((mt) => [mt.id, { state: 'loading' } as Earliest])),
    );
    for (const mt of props.meetingTypes) {
      void (async () => {
        try {
          const res = await fetch(`/api/public/meet/${props.handle}/${mt.slug}/slots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const json = (await res.json()) as SlotsResponse;
          if (cancelled) return;
          if (!res.ok) {
            setEarliest((prev) => ({ ...prev, [mt.id]: { state: 'error' } }));
            return;
          }
          const starts = Object.values(json.days ?? {})
            .flat()
            .map((s) => s.start)
            .sort();
          setEarliest((prev) => ({
            ...prev,
            [mt.id]: starts.length ? { state: 'ready', start: starts[0] } : { state: 'none' },
          }));
        } catch {
          if (!cancelled) setEarliest((prev) => ({ ...prev, [mt.id]: { state: 'error' } }));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [props.meetingTypes, props.handle]);

  /** Soonest across every format a purpose is offered in. */
  function earliestForPurpose(p: PurposeOption): Earliest {
    const all = p.options.map((o) => earliest[o.id] ?? { state: 'loading' as const });
    const ready = all.filter((e): e is { state: 'ready'; start: string } => e.state === 'ready');
    if (ready.length) return ready.reduce((a, b) => (a.start <= b.start ? a : b));
    if (all.some((e) => e.state === 'loading')) return { state: 'loading' };
    if (all.some((e) => e.state === 'error')) return { state: 'error' };
    return { state: 'none' };
  }

  /**
   * Step 1 → step 2. A purpose offered in a single format has no choice to
   * make, so we skip straight to the times rather than showing a one-button
   * page. `goBack` mirrors this so the skipped step is skipped in reverse too.
   */
  function pickPurpose(p: PurposeOption) {
    setSelectedPurpose(p);
    setError(null);
    if (p.options.length === 1) {
      void pickType(p.options[0]);
      return;
    }
    setStep('format');
  }

  function goBack() {
    setSelectedStart(null);
    if (step === 'time' && selectedPurpose && selectedPurpose.options.length > 1) {
      setStep('format');
      return;
    }
    setSelectedPurpose(null);
    setSelectedType(null);
    setStep('purpose');
  }

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
      // PR2: distinguish the host's time being taken from the room being taken.
      setError(
        json.error === 'venue_taken'
          ? 'The room for this meeting is already booked at this time — please pick another time.'
          : 'That time was just taken — please pick another slot.',
      );
      await pickType(selectedType); // refresh slots, stay on time step
      return;
    }
    // Server identity gate (#1524): this email owns a JKKN account → must log in.
    // Re-homed here from submitBooking when #1516 extracted finalizeBooking, so
    // both free and paid (deposit) bookings honour the login gate.
    if (res.status === 403 && json.error === 'login_required') {
      setLoginGate(json.reason === 'jkkn_email' ? 'jkkn_email' : 'account_exists');
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
      venueStatus:
        json.venueStatus === 'pending' || json.venueStatus === 'confirmed'
          ? json.venueStatus
          : null,
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
    // PR1: a prep note is required so the host can prepare for the meeting.
    if (!form.note.trim()) {
      setError('Please add a short note on what you’d like to cover.');
      return;
    }
    if (gated) return; // a JKKN account must log in — submit is disabled anyway
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
      // Identity gate also fires on the order step (server checks it before
      // creating a Razorpay order) — show the login gate, don't throw.
      if (orderRes.status === 403 && orderJson.error === 'login_required') {
        setLoginGate(orderJson.reason === 'jkkn_email' ? 'jkkn_email' : 'account_exists');
        return;
      }
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

  /**
   * Which progress dot a step lights. Purpose and format share dot 0: format
   * is only sometimes shown, and a bar that grows a segment mid-flow reads as
   * a glitch. Three dots throughout — choose, time, details.
   */
  const DOT_OF: Record<Step, number> = {
    purpose: 0,
    format: 0,
    time: 1,
    details: 2,
    done: 3,
  };

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
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                DOT_OF[step] >= i ? 'bg-[#0E4D34]' : 'bg-[#0E4D34]/15'
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
        {step === 'purpose' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">What do you need?</p>
            {props.routingForm && (
              <Link
                href={`/r/${props.routingForm.slug}`}
                className="-mt-1.5 w-fit text-xs text-[#1C2B24]/65 underline decoration-[#0E4D34]/30 underline-offset-4 transition-colors hover:text-[#0E4D34] hover:decoration-[#0E4D34]"
              >
                {routingFormLinkLabel(props.routingForm.questionCount)}
              </Link>
            )}
            {purposes.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                onClick={() => pickPurpose(p)}
                className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-3.5 text-left transition-colors hover:border-[#0E4D34]/60 disabled:opacity-60"
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
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#1C2B24]/60">
                  {p.options.length === 1 ? (
                    <LocationLine mt={p.options[0]} />
                  ) : (
                    <PurposeFormats choice={p} />
                  )}
                  <EarliestLine earliest={earliestForPurpose(p)} />
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

        {/* ── Step 2: format (only when the purpose offers more than one) ── */}
        {step === 'format' && selectedPurpose && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex w-fit items-center gap-1 text-xs text-[#0E4D34]/80 hover:text-[#0E4D34]"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {selectedPurpose.label}
            </button>
            <p className="text-sm font-medium">
              {selectedPurpose.hasMixedDurations
                ? 'How long, and how would you like to meet?'
                : 'How would you like to meet?'}
            </p>
            {selectedPurpose.options.map((mt) => (
              <button
                key={mt.id}
                type="button"
                disabled={busy}
                onClick={() => pickType(mt)}
                className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-3.5 text-left transition-colors hover:border-[#0E4D34]/60 disabled:opacity-60"
              >
                <span className="block text-sm font-semibold">
                  {/* The purpose card lists every length this purpose offers,
                      so each option has to say which one IT is — otherwise the
                      booker picks a length without being told. */}
                  {selectedPurpose.hasMixedDurations && <>{mt.durationMin} min · </>}
                  <LocationLine mt={mt} />
                </span>
                <span className="mt-1.5 block text-xs text-[#1C2B24]/60">
                  <EarliestLine earliest={earliest[mt.id] ?? { state: 'loading' }} />
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
              onClick={goBack}
              className="inline-flex w-fit items-center gap-1 text-xs text-[#0E4D34]/80 hover:text-[#0E4D34]"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />{' '}
              {selectedPurpose?.label ?? selectedType.title}
            </button>
            {/* Carry the chosen format into the time step — with two formats a
                page of bare times gives no clue which one is being booked. */}
            <p className="-mt-2 text-xs text-[#1C2B24]/60">
              <LocationLine mt={selectedType} />
            </p>
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

            {loggedIn ? (
              <div className="rounded-md border border-[#0E4D34]/25 bg-[#0E4D34]/5 px-3 py-2.5 text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#0E4D34]/70">
                  Booking as
                </span>
                <span className="mt-0.5 block font-medium">{form.name}</span>
                <span className="block text-xs text-[#1C2B24]/65">{form.email}</span>
              </div>
            ) : (
              <>
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
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      if (loginGate) setLoginGate(null);
                    }}
                    maxLength={254}
                    className="w-full rounded-md border border-[#0E4D34]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[#0E4D34] focus:ring-1 focus:ring-[#0E4D34]"
                    autoComplete="email"
                  />
                </label>
                {gated && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900" role="status">
                    <p className="font-medium">You have a JKKN account.</p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      Please log in with your JKKN account to book — it keeps the
                      meeting on your record.
                    </p>
                    <a
                      href={loginHref}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-[#0E4D34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0a3b28]"
                    >
                      Log in &amp; book
                    </a>
                  </div>
                )}
              </>
            )}
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
              <span className="mb-1 block font-medium">
                Anything to share beforehand? <span className="text-[#0E4D34]">*</span>
              </span>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                maxLength={500}
                required
                aria-required="true"
                placeholder="A line on what you'd like to cover helps the host prepare."
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
              disabled={busy || gated}
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
            {confirmation.venueStatus === 'pending' && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Your time is booked. The room is awaiting approval from the venue
                in-charge — you&rsquo;ll be notified once it&rsquo;s confirmed.
              </p>
            )}
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
