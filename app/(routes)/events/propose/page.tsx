'use client';

// Events Propose Page — chat-bypass §5.1 "single screen, no escape hatch"
// V2 form only — 3 visible fields (title, when+where, audience) + progressive
// disclosure (expected attendance + budget band).
//
// History:
//   - PR #455 — Phase 1A smoke-test form (27 fields, writes to `events`).
//   - PR #510 — V2 redesign (3 fields, writes to `event_proposals`); kept the
//     27-field form as an "Advanced (legacy)" tab.
//   - PR-C of chat-bypass audit remediation (this PR) — removes the legacy
//     tab. Spec §5.1 mandated single-form, no escape hatch. Audit criterion 1.
//     The 27-field smoke-test code remains in git history (PR #455 / PR #510);
//     it does not remain in the user surface.
//
// Submit interface (event_proposals table):
//   institution_id, proposer_id, sender_role, sender_email, contact_phone,
//   title, event_date, venue, audience, expected_attendance, budget_band
// Redirect: /events/propose/<id>/status

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import {
  EventProposalAudience,
  EventProposalBudgetBand,
  EVENT_PROPOSAL_AUDIENCE_OPTIONS,
  EVENT_PROPOSAL_BUDGET_BANDS,
} from '@/types/events';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Next available weekday from today (Mon–Fri) */
function nextWeekday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Propose Form ───────────────────────────────────────────────────────────

function ProposeForm() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  const [submitting, setSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Required visible fields (3)
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(nextWeekday());
  const [venue, setVenue] = useState('');
  const [audience, setAudience] = useState<EventProposalAudience[]>([]);

  // Progressive disclosure fields
  const [expectedAttendance, setExpectedAttendance] = useState('');
  const [budgetBand, setBudgetBand] = useState<EventProposalBudgetBand | ''>('');

  const toggleAudience = (opt: EventProposalAudience) => {
    setAudience(prev =>
      prev.includes(opt) ? prev.filter(a => a !== opt) : [...prev, opt]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Event title is required'); return; }
    if (audience.length === 0) { toast.error('Select at least one audience'); return; }

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sign in first'); setSubmitting(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role, email, phone_number')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      toast.error('Your profile has no institution');
      setSubmitting(false);
      return;
    }

    const payload: Record<string, unknown> = {
      institution_id: profile.institution_id,
      proposer_id: user.id,
      sender_role: profile.role ?? null,
      sender_email: profile.email ?? user.email ?? null,
      contact_phone: profile.phone_number ?? null,
      title: title.trim().slice(0, 80),
      event_date: eventDate || null,
      venue: venue.trim() || null,
      audience,
    };

    if (showDetails) {
      if (expectedAttendance) payload.expected_attendance = parseInt(expectedAttendance, 10);
      if (budgetBand) payload.budget_band = budgetBand;
    }

    const { data, error } = await (supabase as any)
      .from('event_proposals')
      .insert(payload)
      .select('id')
      .single();

    setSubmitting(false);

    if (error) {
      toast.error(`Submit failed: ${error.message}`);
      return;
    }

    toast.success('Proposal submitted — tracking your request');
    router.push(`/events/propose/${data.id}/status`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Field 1: What's the event? */}
      <div className="space-y-1.5">
        <Label htmlFor="title" className="text-base font-medium">
          What&apos;s the event?
        </Label>
        <Input
          id="title"
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 80))}
          placeholder="e.g., Department Industry Visit, Cultural Day 2026"
          maxLength={80}
          required
          className="text-base"
          aria-describedby="title-hint"
        />
        <p id="title-hint" className="text-xs text-muted-foreground">
          {title.length}/80 characters
        </p>
      </div>

      {/* Field 2: When + Where? */}
      <div className="space-y-1.5">
        <Label className="text-base font-medium">When + Where?</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="event-date" className="text-xs text-muted-foreground mb-1 block">
              Date
            </Label>
            <Input
              id="event-date"
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="text-base"
              aria-label="Event date"
            />
          </div>
          <div>
            <Label htmlFor="venue" className="text-xs text-muted-foreground mb-1 block">
              Venue
            </Label>
            <Input
              id="venue"
              value={venue}
              onChange={e => setVenue(e.target.value)}
              placeholder="e.g., Main Auditorium"
              className="text-base"
              aria-label="Event venue"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Date defaults to the next available weekday. Venue defaults to your institution.
        </p>
      </div>

      {/* Field 3: Who's it for? */}
      <div className="space-y-1.5">
        <Label className="text-base font-medium">Who&apos;s it for?</Label>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Audience selection"
        >
          {EVENT_PROPOSAL_AUDIENCE_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => toggleAudience(opt)}
              aria-pressed={audience.includes(opt)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                audience.includes(opt)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-input hover:bg-accent',
              ].join(' ')}
            >
              {opt}
            </button>
          ))}
        </div>
        {audience.length === 0 && (
          <p className="text-xs text-muted-foreground">Select at least one audience group</p>
        )}
      </div>

      {/* Progressive disclosure toggle */}
      <button
        type="button"
        onClick={() => setShowDetails(v => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={showDetails}
        aria-controls="propose-details"
      >
        {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showDetails ? 'Hide details' : 'Add details (optional)'}
      </button>

      {/* Progressive disclosure fields */}
      {showDetails && (
        <div id="propose-details" className="space-y-4 border-l-2 border-muted pl-4">
          <div className="space-y-1.5">
            <Label htmlFor="attendance" className="text-sm font-medium">
              Expected attendance
            </Label>
            <Input
              id="attendance"
              type="number"
              min="1"
              value={expectedAttendance}
              onChange={e => setExpectedAttendance(e.target.value)}
              placeholder="e.g., 200"
              className="max-w-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Budget required</Label>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Budget band selection"
            >
              {EVENT_PROPOSAL_BUDGET_BANDS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBudgetBand(budgetBand === value ? '' : value)}
                  aria-pressed={budgetBand === value}
                  className={[
                    'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    budgetBand === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-accent',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button
          type="submit"
          disabled={submitting || !title.trim() || audience.length === 0}
          className="w-full sm:w-auto"
          size="lg"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting ? 'Submitting…' : 'Submit proposal'}
        </Button>
      </div>
    </form>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProposeEventPage() {
  return (
    <ContentLayout title="Propose Event">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/events">Events</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Propose</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="max-w-2xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/events"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Propose a new event</CardTitle>
            <p className="text-sm text-muted-foreground">
              Fill in the basics and submit. Your proposal goes to the Director for approval.
            </p>
          </CardHeader>

          <CardContent>
            <ProposeForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
