'use client';

// app/(public)/book-interview/_components/interview-booking-form.tsx
//
// The shared interview booking link (#3), three steps:
//   1. details  — which post, who, and the four questions (#2)
//   2. time     — open interview times, or "ask the office to call" (#14)
//   3. confirm  — book; answer "which of these is you?" if asked (#7)
//
// The server decides everything that matters (host, post still open, identity,
// which candidate). This form only asks, and explains each answer in plain
// words. It never shows a raw error string.
//
// Deliberately NOT here: any recording notice (#9), and any warning about a
// missing application (#15) or an earlier outcome (#6) — those are for the host,
// on the meeting page, never for the candidate.

import { useCallback, useState, type ReactNode } from 'react';
import {
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  PhoneCall,
  UserRoundCheck,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InterviewSlotPicker, istFull } from './interview-slot-picker';

export type InterviewBookingViewer =
  /** Active staff booking on a candidate's behalf (#1). */
  | { kind: 'office'; name: string }
  /** Anyone else signed in — they book as themselves, as on /meet. */
  | { kind: 'self'; name: string; email: string };

interface PostOption {
  id: string;
  title: string;
  institutionName: string | null;
}

interface InterviewBookingFormProps {
  posts: PostOption[];
  durationMin: number;
  locationMode: 'in_person' | 'phone' | 'online';
  viewer: InterviewBookingViewer | null;
}

type Step = 'details' | 'time' | 'confirm' | 'done' | 'callback-done';

type SlotsState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; days: Record<string, Array<{ start: string }>> }
  | { state: 'empty' }
  | { state: 'not_open' }
  | { state: 'error' };

interface Match {
  id: string;
  label: string;
}

const WHY_MIN = 20;
// "*" and "%" are refused: the address is matched with a PostgREST ilike, where
// "*" is a wildcard that cannot be escaped (review finding, 2026-09-24).
const EMAIL_RE = /^[^\s@*%]+@[^\s@*%]+\.[^\s@*%]+$/;
const LOGIN_HREF = `/auth/login?redirectedFrom=${encodeURIComponent('/book-interview')}`;
const NEW_PERSON = '__new__';
const GENERIC_ERROR = 'We could not book that just now. Please try again.';
const NOT_OPEN = 'Interview booking is not open right now. Please contact the office.';
const SLOT_TAKEN = 'That time was just taken — please pick another.';
const POST_CLOSED = 'That post has just closed.';

const LOCATION_LABEL: Record<InterviewBookingFormProps['locationMode'], string> = {
  online: 'Online — the video link comes with the invitation',
  in_person: 'In person',
  phone: 'By phone — we call the number you give',
};

const STEPS: Array<{ key: 'details' | 'time' | 'confirm'; label: string }> = [
  { key: 'details', label: 'Details' },
  { key: 'time', label: 'Time' },
  { key: 'confirm', label: 'Confirm' },
];

/** A server message is shown only when it is one of ours written as a sentence. */
function readableServerError(status: number, error: unknown): string {
  if ((status === 400 || status === 429) && typeof error === 'string' && error.includes(' ')) {
    return error;
  }
  return GENERIC_ERROR;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function InterviewBookingForm({ posts, durationMin, locationMode, viewer }: InterviewBookingFormProps) {
  const staffMode = viewer?.kind === 'office';
  const selfMode = viewer?.kind === 'self';

  const [step, setStep] = useState<Step>('details');
  const [openPosts, setOpenPosts] = useState<PostOption[]>(posts);
  const [form, setForm] = useState({
    jobId: posts.length === 1 ? posts[0].id : '',
    // Staff mode: the fields are the CANDIDATE's and start empty — never the
    // staff member's own name or email (#1).
    name: viewer?.kind === 'self' ? viewer.name : '',
    email: viewer?.kind === 'self' ? viewer.email : '',
    phone: '',
    currentJob: '',
    payExpectation: '',
    whyThisRole: '',
  });
  const [honeypot, setHoneypot] = useState('');
  const [touched, setTouched] = useState(false);

  const [slots, setSlots] = useState<SlotsState>({ state: 'idle' });
  const [selectedStart, setSelectedStart] = useState<string | null>(null);

  const [matches, setMatches] = useState<Match[] | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [loginGate, setLoginGate] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ start: string; videoUrl: string | null } | null>(null);

  const post = openPosts.find((p) => p.id === form.jobId) ?? null;
  const whyLength = form.whyThisRole.trim().length;

  const problems = {
    jobId: !post ? 'Choose the post.' : null,
    name: !form.name.trim() ? 'Enter the full name.' : null,
    email: !EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address.' : null,
    phone: !form.phone.trim() ? 'Enter a phone number — the office calls this number if anything changes.' : null,
    whyThisRole:
      whyLength < WHY_MIN ? `Write at least ${WHY_MIN} characters (${whyLength} so far).` : null,
  };
  const detailsValid = Object.values(problems).every((p) => p === null);

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    // A "which of these is you?" answer belonged to the old email.
    if (key === 'email') {
      setMatches(null);
      setChoice('');
      setLoginGate(false);
    }
  };

  const loadSlots = useCallback(async () => {
    setSlots({ state: 'loading' });
    try {
      const res = await fetch('/api/public/interview-booking/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        days?: Record<string, Array<{ start: string }>>;
        error?: string;
      };
      if (res.status === 404 && json.error === 'not_open') {
        setSlots({ state: 'not_open' });
        return;
      }
      if (!res.ok) {
        setSlots({ state: 'error' });
        return;
      }
      const days = json.days ?? {};
      const any = Object.values(days).some((list) => list.length > 0);
      // No times back is NOT "we're full": the engine fails closed when Google
      // does not answer, and that looks identical from here (#14).
      setSlots(any ? { state: 'ready', days } : { state: 'empty' });
    } catch {
      setSlots({ state: 'error' });
    }
  }, []);

  function goToTime() {
    setTouched(true);
    if (!detailsValid) return;
    setError(null);
    setStep('time');
    if (slots.state !== 'ready') void loadSlots();
  }

  function pickTime(start: string) {
    setSelectedStart(start);
    setError(null);
    setStep('confirm');
  }

  async function requestCallback() {
    if (!post) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/public/interview-booking/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: post.id,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          honeypot,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (res.ok && json.success) {
        setStep('callback-done');
        return;
      }
      if (json.error === 'post_closed') {
        closePost(post.id);
        return;
      }
      setError(readableServerError(res.status, json.error));
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  /** The post closed while they were filling the form: take it off the list. */
  function closePost(jobId: string) {
    setOpenPosts((list) => list.filter((p) => p.id !== jobId));
    setForm((f) => ({ ...f, jobId: '' }));
    setMatches(null);
    setChoice('');
    setStep('details');
    setError(POST_CLOSED);
  }

  async function book() {
    if (!post || !selectedStart) return;
    if (matches && !choice) {
      setError('Please choose which of these is you.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const candidateChoice = !matches
        ? undefined
        : choice === NEW_PERSON
          ? { kind: 'new' as const }
          : { kind: 'existing' as const, candidateId: choice };
      const res = await fetch('/api/public/interview-booking/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: post.id,
          start: selectedStart,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          currentJob: form.currentJob.trim(),
          payExpectation: form.payExpectation.trim(),
          whyThisRole: form.whyThisRole.trim(),
          candidateChoice,
          honeypot,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        start?: string;
        videoUrl?: string | null;
        error?: string;
        matches?: Match[];
      };

      if (res.ok && json.success) {
        setBooked({ start: json.start ?? selectedStart, videoUrl: json.videoUrl ?? null });
        setStep('done');
        return;
      }
      switch (json.error) {
        case 'needs_choice':
          // Only the labels the server sent: an initial and a post, never a name (#7).
          setMatches(Array.isArray(json.matches) ? json.matches : []);
          setChoice('');
          return;
        case 'invalid_choice':
          setChoice('');
          setError('Please choose again.');
          return;
        case 'login_required':
          setLoginGate(true);
          return;
        case 'slot_taken':
        case 'venue_taken':
          setSelectedStart(null);
          setStep('time');
          setError(SLOT_TAKEN);
          void loadSlots();
          return;
        case 'post_closed':
          closePost(post.id);
          return;
        case 'not_open':
          setError(NOT_OPEN);
          return;
        default:
          setError(readableServerError(res.status, json.error));
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  /** Staff book one candidate after another from the same screen (#1). */
  function startAnother() {
    setForm({
      jobId: openPosts.length === 1 ? openPosts[0].id : '',
      name: '',
      email: '',
      phone: '',
      currentJob: '',
      payExpectation: '',
      whyThisRole: '',
    });
    setTouched(false);
    setSelectedStart(null);
    setMatches(null);
    setChoice('');
    setLoginGate(false);
    setBooked(null);
    setError(null);
    setSlots({ state: 'idle' });
    setStep('details');
  }

  const stepIndex = step === 'details' ? 0 : step === 'time' ? 1 : step === 'confirm' ? 2 : 3;
  const show = (key: keyof typeof problems) => (touched ? problems[key] : null);
  const who = staffMode ? form.name.trim() || 'The candidate' : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            JKKN · Interviews
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Book an interview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {durationMin}-minute conversation · {LOCATION_LABEL[locationMode]}
          </p>
        </header>

        {step !== 'done' && step !== 'callback-done' && (
          <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.key} aria-current={i === stepIndex ? 'step' : undefined}>
                <div className={`h-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`} />
                <span
                  className={`mt-1.5 block text-xs ${
                    i === stepIndex ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        )}

        {/* The slip: what has been chosen so far, carried through every step. */}
        {(step === 'time' || step === 'confirm') && post && (
          <div className="mt-6 rounded-md border border-dashed border-border px-4 py-3 text-sm">
            <p className="font-medium">{post.title}</p>
            {post.institutionName && <p className="text-xs text-muted-foreground">{post.institutionName}</p>}
            {step === 'confirm' && selectedStart && (
              <p className="mt-1.5 tabular-nums">{istFull(selectedStart)} (IST)</p>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-red-700/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {error}
          </div>
        )}

        {/* Invisible to people; bots fill it in. */}
        <div aria-hidden className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="ib-website">Website</label>
          <input
            id="ib-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* ── Step 1: details ─────────────────────────────────────────── */}
        {step === 'details' && (
          <form
            className="mt-6 flex flex-col gap-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              goToTime();
            }}
          >
            {staffMode && viewer?.kind === 'office' && (
              <div className="flex items-start gap-3 rounded-md border border-amber-700/30 bg-amber-500/10 px-4 py-3 text-sm">
                <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                <p className="text-foreground">
                  You&apos;re signed in as <span className="font-medium">{viewer.name}</span>. You&apos;re
                  booking for a candidate — enter THEIR details below.
                </p>
              </div>
            )}

            <Field id="ib-post" label="Which post?">
              <Select value={form.jobId} onValueChange={(v) => update('jobId', v)}>
                <SelectTrigger id="ib-post" className="rounded-md" aria-invalid={!!show('jobId')}>
                  <SelectValue placeholder="Choose the post" />
                </SelectTrigger>
                <SelectContent>
                  {openPosts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.institutionName ? `${p.title} — ${p.institutionName}` : p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {show('jobId') && <p className="text-xs text-red-700 dark:text-red-400">{show('jobId')}</p>}
            </Field>

            {selfMode ? (
              <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booking as</p>
                <p className="mt-0.5 font-medium">{form.name}</p>
                <p className="text-xs text-muted-foreground">{form.email}</p>
              </div>
            ) : (
              <>
                <Field id="ib-name" label={staffMode ? "Candidate's full name" : 'Full name'}>
                  <Input
                    id="ib-name"
                    value={form.name}
                    maxLength={200}
                    autoComplete={staffMode ? 'off' : 'name'}
                    onChange={(e) => update('name', e.target.value)}
                    aria-invalid={!!show('name')}
                  />
                  {show('name') && <p className="text-xs text-red-700 dark:text-red-400">{show('name')}</p>}
                </Field>
                <Field
                  id="ib-email"
                  label={staffMode ? "Candidate's email" : 'Email'}
                  hint="The calendar invitation goes here."
                >
                  <Input
                    id="ib-email"
                    type="email"
                    inputMode="email"
                    value={form.email}
                    maxLength={254}
                    autoComplete={staffMode ? 'off' : 'email'}
                    onChange={(e) => update('email', e.target.value)}
                    aria-invalid={!!show('email')}
                  />
                  {show('email') && <p className="text-xs text-red-700 dark:text-red-400">{show('email')}</p>}
                </Field>
              </>
            )}

            <Field id="ib-phone" label={staffMode ? "Candidate's phone" : 'Phone'}>
              <Input
                id="ib-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                maxLength={20}
                autoComplete={staffMode ? 'off' : 'tel'}
                onChange={(e) => update('phone', e.target.value)}
                aria-invalid={!!show('phone')}
              />
              {show('phone') && <p className="text-xs text-red-700 dark:text-red-400">{show('phone')}</p>}
            </Field>

            <Field id="ib-current-job" label="Current job, and where" hint="Leave blank if not working now.">
              <Input
                id="ib-current-job"
                value={form.currentJob}
                maxLength={200}
                placeholder="e.g. Accounts assistant at a textile firm, Erode"
                onChange={(e) => update('currentJob', e.target.value)}
              />
            </Field>

            <Field id="ib-pay" label="Pay expectation">
              <Input
                id="ib-pay"
                value={form.payExpectation}
                maxLength={100}
                placeholder="e.g. ₹45,000 a month"
                onChange={(e) => update('payExpectation', e.target.value)}
              />
            </Field>

            <Field id="ib-why" label="Why this role?" hint={staffMode ? 'In the candidate’s own words.' : 'In your own words.'}>
              <Textarea
                id="ib-why"
                value={form.whyThisRole}
                maxLength={2000}
                rows={4}
                onChange={(e) => update('whyThisRole', e.target.value)}
                aria-invalid={!!show('whyThisRole')}
              />
              {show('whyThisRole') && (
                <p className="text-xs text-red-700 dark:text-red-400">{show('whyThisRole')}</p>
              )}
            </Field>

            <Button type="submit" className="w-full rounded-md">
              Choose a time
            </Button>
          </form>
        )}

        {/* ── Step 2: time ────────────────────────────────────────────── */}
        {step === 'time' && (
          <div className="mt-6 flex flex-col gap-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit rounded-md px-2"
              onClick={() => {
                setError(null);
                setStep('details');
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Back to details
            </Button>

            {slots.state === 'loading' || slots.state === 'idle' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Finding open interview times…
              </p>
            ) : slots.state === 'ready' ? (
              <InterviewSlotPicker days={slots.days} selectedStart={selectedStart} onPick={pickTime} />
            ) : slots.state === 'not_open' ? (
              <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm">{NOT_OPEN}</p>
            ) : (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-muted px-4 py-4 text-sm">
                <p>
                  {slots.state === 'error'
                    ? 'We could not load interview times just now.'
                    : 'No interview times are showing right now.'}{' '}
                  We can ask the office to call you instead.
                </p>
                <Button type="button" className="w-full rounded-md" disabled={busy} onClick={requestCallback}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <PhoneCall className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Ask the office to call {staffMode ? form.name.trim() || 'the candidate' : 'me'}
                </Button>
                {slots.state === 'error' && (
                  <Button type="button" variant="outline" className="w-full rounded-md" onClick={() => void loadSlots()}>
                    Try loading times again
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: confirm ─────────────────────────────────────────── */}
        {step === 'confirm' && selectedStart && (
          <div className="mt-6 flex flex-col gap-5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit rounded-md px-2"
              onClick={() => {
                setError(null);
                setStep('time');
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Pick another time
            </Button>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="min-w-0 break-words">{form.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="min-w-0 break-all">{form.email}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="min-w-0 break-words">{form.phone}</dd>
            </dl>

            {matches && (
              <fieldset className="flex flex-col gap-3 rounded-md border border-border px-4 py-4">
                <legend className="px-1 text-sm font-medium">
                  This email is already on file. Which of these is {staffMode ? 'the candidate' : 'you'}?
                </legend>
                <RadioGroup value={choice} onValueChange={setChoice} className="gap-3">
                  {matches.map((m) => (
                    <div key={m.id} className="flex items-start gap-2.5">
                      <RadioGroupItem id={`ib-match-${m.id}`} value={m.id} className="mt-0.5" />
                      <Label htmlFor={`ib-match-${m.id}`} className="text-sm font-normal leading-snug">
                        {m.label}
                      </Label>
                    </div>
                  ))}
                  <div className="flex items-start gap-2.5">
                    <RadioGroupItem id="ib-match-new" value={NEW_PERSON} className="mt-0.5" />
                    <Label htmlFor="ib-match-new" className="text-sm font-normal leading-snug">
                      Someone else — this is a new application
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>
            )}

            {loginGate && (
              <div
                role="status"
                className="flex flex-col gap-2 rounded-md border border-amber-700/30 bg-amber-500/10 px-4 py-3 text-sm"
              >
                <p className="font-medium text-amber-700 dark:text-amber-400">This email has a MyJKKN account.</p>
                <p className="text-foreground">
                  Please sign in with that account to book, or go back and use a different email.
                </p>
                <a
                  href={LOGIN_HREF}
                  className="w-fit text-sm font-medium text-primary underline underline-offset-4"
                >
                  Sign in
                </a>
              </div>
            )}

            <Button
              type="button"
              className="w-full rounded-md"
              disabled={busy || loginGate || (!!matches && !choice)}
              onClick={book}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Book this interview
            </Button>
          </div>
        )}

        {/* ── Done ────────────────────────────────────────────────────── */}
        {step === 'done' && booked && (
          <div className="mt-8 flex flex-col gap-4">
            <CheckCircle2 className="h-10 w-10 text-green-700 dark:text-emerald-400" aria-hidden />
            <h2 className="text-xl font-semibold tracking-tight">
              {staffMode ? `Interview booked for ${form.name.trim()}` : 'Your interview is booked'}
            </h2>
            <div className="rounded-md border border-border px-4 py-3 text-sm">
              {post && <p className="font-medium">{post.title}</p>}
              <p className="mt-1 flex items-center gap-2 tabular-nums">
                <CalendarCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {istFull(booked.start)} (IST)
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {staffMode
                ? `${who} will get a calendar invitation by email with links to move or cancel it.`
                : "You'll get a calendar invitation by email with links to move or cancel it."}
            </p>
            {booked.videoUrl && (
              <a
                href={booked.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
              >
                <Video className="h-4 w-4" aria-hidden /> Video link
              </a>
            )}
            {staffMode && (
              <Button type="button" variant="outline" className="w-full rounded-md" onClick={startAnother}>
                Book another candidate
              </Button>
            )}
          </div>
        )}

        {step === 'callback-done' && (
          <div className="mt-8 flex flex-col gap-4">
            <PhoneCall className="h-10 w-10 text-green-700 dark:text-emerald-400" aria-hidden />
            <h2 className="text-xl font-semibold tracking-tight">Request sent</h2>
            <p className="text-sm">
              {staffMode
                ? `The office will call ${who} on ${form.phone.trim()}.`
                : `The office will call you on ${form.phone.trim()}.`}
            </p>
            {staffMode && (
              <Button type="button" variant="outline" className="w-full rounded-md" onClick={startAnother}>
                Book another candidate
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
