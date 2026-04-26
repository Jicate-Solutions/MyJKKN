'use client';

// Events Propose Page — v2 redesign (Stream C, 2026-04-26)
// Extends the Phase-1A smoke-test form (PR #455) with:
//   - New event_proposals workflow: 3 visible fields + progressive disclosure
//   - Existing smoke-test form preserved as a "Advanced (legacy)" tab for
//     backward compatibility — it still writes directly to `events` table.
//
// EXISTING INTERFACE (PR #455 smoke-test — preserved, not replaced):
//   Categories load: supabase.from('events_general_categories')
//   Submit: supabase.from('events').insert({ institution_id, event_type, name,
//     slug, description, event_category_id, status:'draft', scope, visibility,
//     iqac_evidence_status, naac_criteria, venue_text, start_date, end_date,
//     year, is_active, is_public, proposed_by, created_by, config,
//     registration_config, route_config, branding_config })
//
// NEW v2 INTERFACE (event_proposals table):
//   Submit: supabase.from('event_proposals').insert({ institution_id,
//     proposer_id, sender_role, sender_email, contact_phone, title,
//     event_date, venue, audience, expected_attendance, budget_band })
//   Redirect: /events/propose/<id>/status

import { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import {
  EventProposalAudience,
  EventProposalBudgetBand,
  EVENT_PROPOSAL_AUDIENCE_OPTIONS,
  EVENT_PROPOSAL_BUDGET_BANDS,
} from '@/types/events';

// ─── Shared ─────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; slug: string };

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** Next available weekday from today (Mon–Fri) */
function nextWeekday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── v2 Propose Form ────────────────────────────────────────────────────────

function V2ProposeForm() {
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
        <Label htmlFor="v2-title" className="text-base font-medium">
          What&apos;s the event?
        </Label>
        <Input
          id="v2-title"
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 80))}
          placeholder="e.g., Department Industry Visit, Cultural Day 2026"
          maxLength={80}
          required
          className="text-base"
          aria-describedby="v2-title-hint"
        />
        <p id="v2-title-hint" className="text-xs text-muted-foreground">
          {title.length}/80 characters
        </p>
      </div>

      {/* Field 2: When + Where? */}
      <div className="space-y-1.5">
        <Label className="text-base font-medium">When + Where?</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="v2-date" className="text-xs text-muted-foreground mb-1 block">
              Date
            </Label>
            <Input
              id="v2-date"
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="text-base"
              aria-label="Event date"
            />
          </div>
          <div>
            <Label htmlFor="v2-venue" className="text-xs text-muted-foreground mb-1 block">
              Venue
            </Label>
            <Input
              id="v2-venue"
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
        aria-controls="v2-details"
      >
        {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showDetails ? 'Hide details' : 'Add details (optional)'}
      </button>

      {/* Progressive disclosure fields */}
      {showDetails && (
        <div id="v2-details" className="space-y-4 pl-0 border-l-2 border-muted pl-4">
          <div className="space-y-1.5">
            <Label htmlFor="v2-attendance" className="text-sm font-medium">
              Expected attendance
            </Label>
            <Input
              id="v2-attendance"
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

// ─── Legacy Smoke-Test Form (PR #455 — preserved, not replaced) ─────────────

function LegacySmokeTestForm() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [venueText, setVenueText] = useState('');
  const [scope, setScope] = useState<'chapter' | 'institution' | 'all_jkkn'>('institution');
  const [visibility, setVisibility] = useState<'public' | 'all_jkkn' | 'institution' | 'invited'>('institution');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('events_general_categories' as any)
        .select('id, name, slug')
        .eq('is_active', true)
        .order('priority_order');
      if (error) toast.error(`Categories load failed: ${error.message}`);
      else setCategories(((data ?? []) as unknown) as Category[]);
      setLoadingCats(false);
    })();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !categoryId || !startAt || !endAt || !venueText) {
      toast.error('Fill all required fields');
      return;
    }
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sign in first'); setSubmitting(false); return; }

    const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', user.id).single();
    if (!profile?.institution_id) { toast.error('Your profile has no institution'); setSubmitting(false); return; }

    const cat = categories.find(c => c.id === categoryId);
    const year = new Date(startAt).getFullYear();
    const slug = `${slugify(name)}-${year}`;

    const { data, error } = await (supabase as any).from('events').insert({
      institution_id: profile.institution_id,
      event_type: cat?.slug ?? 'general',
      name,
      slug,
      description: description || null,
      event_category_id: categoryId,
      status: 'draft',
      scope,
      visibility,
      iqac_evidence_status: 'draft',
      naac_criteria: [],
      venue_text: venueText,
      start_date: new Date(startAt).toISOString(),
      end_date: new Date(endAt).toISOString(),
      year,
      is_active: true,
      is_public: false,
      proposed_by: user.id,
      created_by: user.id,
      config: {},
      registration_config: {},
      route_config: {},
      branding_config: {},
    }).select('id, slug').single();

    setSubmitting(false);
    if (error) { toast.error(`Submit failed: ${error.message}`); return; }
    toast.success(`Event proposed — id ${data.id.slice(0, 8)}…`);
    router.push(`/events/propose?created=${data.slug}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Event name *</Label>
        <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Annual Cultural Day 2026" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">Category *</Label>
        <Select value={categoryId} onValueChange={setCategoryId} disabled={loadingCats}>
          <SelectTrigger id="category">
            <SelectValue placeholder={loadingCats ? 'Loading…' : 'Select category'} />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="start">Start *</Label>
          <Input id="start" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end">End *</Label>
          <Input id="end" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="venue">Venue *</Label>
        <Input id="venue" value={venueText} onChange={e => setVenueText(e.target.value)} placeholder="e.g., Main Auditorium" required />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="scope">Scope</Label>
          <Select value={scope} onValueChange={v => setScope(v as typeof scope)}>
            <SelectTrigger id="scope"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="chapter">Chapter</SelectItem>
              <SelectItem value="institution">Institution</SelectItem>
              <SelectItem value="all_jkkn">All JKKN</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visibility">Visibility</Label>
          <Select value={visibility} onValueChange={v => setVisibility(v as typeof visibility)}>
            <SelectTrigger id="visibility"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="all_jkkn">All JKKN</SelectItem>
              <SelectItem value="institution">Institution only</SelectItem>
              <SelectItem value="invited">Invited only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="What is this event about?" />
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting ? 'Submitting…' : 'Submit (legacy smoke-test)'}
        </Button>
      </div>
    </form>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProposeEventPage() {
  const [activeTab, setActiveTab] = useState<'v2' | 'legacy'>('v2');

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

            {/* Tab switcher */}
            <div className="flex gap-2 pt-2" role="tablist" aria-label="Form version">
              <button
                role="tab"
                aria-selected={activeTab === 'v2'}
                onClick={() => setActiveTab('v2')}
                className={[
                  'px-3 py-1 rounded text-sm font-medium border transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeTab === 'v2'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-accent',
                ].join(' ')}
              >
                Quick Proposal
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'legacy'}
                onClick={() => setActiveTab('legacy')}
                className={[
                  'px-3 py-1 rounded text-sm font-medium border transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeTab === 'legacy'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-accent',
                ].join(' ')}
              >
                Advanced (legacy)
              </button>
            </div>
          </CardHeader>

          <CardContent>
            {activeTab === 'v2' ? <V2ProposeForm /> : <LegacySmokeTestForm />}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
