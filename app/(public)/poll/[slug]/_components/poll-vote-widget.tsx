'use client';

// app/(public)/poll/[slug]/_components/poll-vote-widget.tsx
//
// Public meeting-poll voting flow (Universal Booking M5):
//   * Open poll:   list candidate times with checkboxes → name/email → submit.
//   * Closed poll: a "voting has closed" panel (explicit state, no redirect).
//
// Same aesthetic as the personal booking widget (evergreen + cream + DM Serif)
// and the same IST display convention (all candidate times shown in IST).
//
// Pattern: app/(public)/meet/[handle]/_components/meet-booking-widget.tsx.

import { useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, Loader2, Lock, Vote } from 'lucide-react';

export interface PollOptionView {
  id: string;
  startTime: string;
  endTime: string;
  orderIndex: number;
  voteCount: number;
}

export interface PollView {
  slug: string;
  title: string;
  description: string | null;
  durationMin: number;
  status: 'open' | 'closed';
  hostName: string;
  options: PollOptionView[];
}

const IST = 'Asia/Kolkata';

const istFull = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export function PollVoteWidget({ poll }: { poll: PollView }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggle(optionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  async function submitVote() {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Please fill in your name and email.');
      return;
    }
    if (selected.size === 0) {
      setError('Please select at least one time that works for you.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/poll/${poll.slug}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          optionIds: [...selected],
          honeypot: '',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not record your vote.');
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record your vote.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]"
      style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      <div className="h-2 w-full bg-[#0E4D34]" />
      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] w-full max-w-md flex-col px-5 pb-10 pt-8">
        {/* Header */}
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0E4D34]/70">
            {poll.hostName} · {poll.durationMin} min meeting
          </p>
          <h1
            className="mt-1 text-[1.7rem] leading-tight text-[#0E4D34]"
            style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
          >
            {poll.title}
          </h1>
          {poll.description && (
            <p className="mt-2 text-sm text-[#1C2B24]/75">{poll.description}</p>
          )}
        </header>

        {error && (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* ── Closed poll ──────────────────────────────────────────────── */}
        {poll.status === 'closed' && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-5 py-6">
            <p className="flex items-center gap-2 text-base font-semibold text-[#0E4D34]">
              <Lock className="h-5 w-5" aria-hidden /> Voting has closed
            </p>
            <p className="mt-3 text-sm text-[#1C2B24]/75">
              {poll.hostName} has confirmed a time for this meeting. If you took
              part, you&apos;ll receive the final details by email.
            </p>
          </div>
        )}

        {/* ── Voted (done) ─────────────────────────────────────────────── */}
        {poll.status === 'open' && done && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-5 py-6">
            <p className="flex items-center gap-2 text-base font-semibold text-[#0E4D34]">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> Thanks for voting!
            </p>
            <p className="mt-3 text-sm text-[#1C2B24]/75">
              Your preferred times are in. {poll.hostName} will confirm the final
              time and send you the meeting details.
            </p>
          </div>
        )}

        {/* ── Open poll: vote form ─────────────────────────────────────── */}
        {poll.status === 'open' && !done && (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Vote className="h-4 w-4 text-[#0E4D34]" aria-hidden /> Which times work
              for you? Pick all that apply.
            </p>

            <div className="flex flex-col gap-2">
              {poll.options.map((opt) => {
                const checked = selected.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    aria-pressed={checked}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      checked
                        ? 'border-[#0E4D34] bg-[#0E4D34]/5'
                        : 'border-[#0E4D34]/20 bg-white hover:border-[#0E4D34]/60'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        checked ? 'border-[#0E4D34] bg-[#0E4D34] text-white' : 'border-[#0E4D34]/40'
                      }`}
                    >
                      {checked && <CheckCircle2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <CalendarDays className="h-3.5 w-3.5 text-[#0E4D34]/70" aria-hidden />
                        {istFull(opt.startTime)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-[#1C2B24]/55">
                        <Clock className="h-3 w-3" aria-hidden /> {poll.durationMin} min · IST
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-1 flex flex-col gap-3">
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
            </div>

            <button
              type="button"
              onClick={submitVote}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0E4D34] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a3b28] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Vote className="h-4 w-4" aria-hidden />
              )}
              {busy ? 'Submitting…' : 'Submit my vote'}
            </button>
            <p className="text-center text-[11px] text-[#1C2B24]/50">
              You can vote again from the same link to change your choices.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
