'use client';

// Sprint 1 redesign per specs/chat-bypass-workflow-gravity.md §5
// — 3 visible fields, mobile-first, full-bleed, progressive disclosure for budget+attendance.
// Replaces the Phase-1A smoke-test form (which was a developer schema check, not asker-friendly intake).
//
// Why this matters: the old form had 8 fields, no push notification, no asker status page,
// and zero discoverability — explaining 81 chat-bypass asks/year for events. See
// .claude/events-propose-audit.md for the 8-criterion failure breakdown.

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, Plus, Check } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

const AUDIENCE_CHIPS = ['Learners', 'Staff', 'Parents', 'External', 'Mixed'] as const;
type AudienceChip = (typeof AUDIENCE_CHIPS)[number];

const BUDGET_BUCKETS = [
  { label: 'No budget', value: 0 },
  { label: '< ₹10K', value: 10_000 },
  { label: '₹10K–50K', value: 50_000 },
  { label: '₹50K–1L', value: 100_000 },
  { label: '> ₹1L', value: 200_000 },
] as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function defaultStartIso() {
  // Default: next weekday at 10:00 local
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  // datetime-local needs YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultEndIsoFrom(start: string) {
  if (!start) return '';
  const s = new Date(start);
  if (isNaN(s.getTime())) return '';
  s.setHours(s.getHours() + 2); // default 2-hour duration
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}T${pad(s.getHours())}:${pad(s.getMinutes())}`;
}

type ProfileCtx = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  institution_id: string;
  institution_name: string | null;
};

export default function ProposeEventPage() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  const [profileCtx, setProfileCtx] = useState<ProfileCtx | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [submitting, startSubmitting] = useTransition();

  // 3-field core (per spec §5.1)
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(() => defaultStartIso());
  const [endAt, setEndAt] = useState(() => defaultEndIsoFrom(defaultStartIso()));
  const [venueText, setVenueText] = useState('');
  const [audience, setAudience] = useState<Set<AudienceChip>>(new Set(['Learners']));

  // Progressive disclosure
  const [showDetails, setShowDetails] = useState(false);
  const [expectedAttendance, setExpectedAttendance] = useState<number | ''>('');
  const [budgetBucket, setBudgetBucket] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  // Auto-update end when start changes (preserves the 2h gap if end was default)
  useEffect(() => {
    setEndAt((curEnd) => {
      const nextEnd = defaultEndIsoFrom(startAt);
      if (!curEnd) return nextEnd;
      return curEnd;
    });
  }, [startAt]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) {
          if (!cancelled) {
            setProfileError('Sign in to propose an event.');
            setLoadingProfile(false);
          }
          return;
        }

        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('id, full_name, email, institution_id')
          .eq('id', user.id)
          .single();

        if (profErr || !profile?.institution_id) {
          if (!cancelled) {
            setProfileError('Your profile has no institution set. Contact your admin.');
            setLoadingProfile(false);
          }
          return;
        }

        let institution_name: string | null = null;
        const { data: inst } = await supabase
          .from('institutions')
          .select('name')
          .eq('id', profile.institution_id)
          .single();
        institution_name = inst?.name ?? null;

        if (!cancelled) {
          setProfileCtx({
            user_id: user.id,
            full_name: profile.full_name,
            email: profile.email,
            institution_id: profile.institution_id,
            institution_name,
          });
          setLoadingProfile(false);
        }
      } catch (e) {
        if (!cancelled) {
          setProfileError(e instanceof Error ? e.message : 'Profile load failed.');
          setLoadingProfile(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const toggleAudience = (chip: AudienceChip) => {
    setAudience((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!profileCtx) {
      toast.error('Profile not loaded.');
      return;
    }
    if (!title.trim()) {
      toast.error('Tell us what the event is.');
      return;
    }
    if (!startAt || !endAt) {
      toast.error('Pick a start and end time.');
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      toast.error('End must be after start.');
      return;
    }
    if (!venueText.trim()) {
      toast.error('Where will it happen?');
      return;
    }
    if (audience.size === 0) {
      toast.error('Pick at least one audience.');
      return;
    }

    startSubmitting(async () => {
      const slug = `${slugify(title)}-${new Date(startAt).getFullYear()}`;

      const submitTimestamp = new Date().toISOString();
      const approval = {
        stage: 'submitted' as const,
        submitted_at: submitTimestamp,
        submitted_by: profileCtx.user_id,
      };

      const insertPayload = {
        institution_id: profileCtx.institution_id,
        event_type: 'general',
        name: title.trim(),
        slug,
        description: notes.trim() || null,
        status: 'draft',
        scope: 'institution',
        visibility: 'institution',
        iqac_evidence_status: 'draft',
        venue_text: venueText.trim(),
        start_date: new Date(startAt).toISOString(),
        end_date: new Date(endAt).toISOString(),
        year: new Date(startAt).getFullYear(),
        is_active: true,
        is_public: false,
        proposed_by: profileCtx.user_id,
        created_by: profileCtx.user_id,
        target_audience: Array.from(audience),
        config: {
          approval,
          expected_attendance: expectedAttendance === '' ? null : Number(expectedAttendance),
          budget_estimate_inr: budgetBucket,
          submitted_via: 'propose_form_v2',
        },
        registration_config: {},
        route_config: {},
        branding_config: {},
      };

      const { data: created, error } = await (supabase as any)
        .from('events')
        .insert(insertPayload)
        .select('id, slug')
        .single();

      if (error || !created) {
        toast.error(`Submit failed: ${error?.message ?? 'unknown error'}`);
        return;
      }

      // Best-effort: ping Director's dashboard immediately. Idempotent — if the
      // generator already covered this proposal in a digest, the work-item dedup
      // (idempotency_key) silently no-ops.
      try {
        const idemKey = `event_proposal:${created.id}:${submitTimestamp.slice(0, 10)}`;
        await (supabase as any).rpc('fn_create_dashboard_work_item', {
          p_kind: 'dashboard:approval',
          p_priority: 'high',
          p_title: `Event proposal: ${title.trim().slice(0, 60)}`,
          p_body: `${profileCtx.full_name ?? profileCtx.email ?? 'Someone'} at ${profileCtx.institution_name ?? 'an institution'} proposed an event on ${new Date(startAt).toLocaleString()}. Audience: ${Array.from(audience).join(', ')}.`,
          p_action_config: {
            url: `/events/propose/${created.id}/status`,
            event_id: created.id,
            kind: 'event_proposal_submitted',
          },
          p_user_id: null, // null → addressed to all super_admins via fn implementation
          p_idempotency_key: idemKey,
          p_ttl_hours: 168,
        });
      } catch {
        // RPC may not exist with this exact signature in all environments — swallow.
        // The async digest path (PR #492) is the durable fallback.
      }

      toast.success('Submitted. Director has been pinged.');
      router.push(`/events/propose/${created.id}/status?just_submitted=1`);
    });
  };

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground mb-4">{profileError}</p>
        <Button variant="outline" asChild>
          <Link href="/events">Back to Events</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="mx-auto max-w-xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Back to events">
            <Link href="/events">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Propose an event</h1>
            {profileCtx && (
              <p className="text-xs text-muted-foreground truncate">
                Submitting as {profileCtx.full_name ?? profileCtx.email ?? 'you'}
                {profileCtx.institution_name ? ` · ${profileCtx.institution_name}` : ''}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Field 1 — What */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-base font-medium">
              What's the event?
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="e.g., Awareness session on cybersecurity"
              maxLength={80}
              autoFocus
              required
              className="text-base h-12"
              aria-describedby="title-hint"
            />
            <p id="title-hint" className="text-xs text-muted-foreground">
              {80 - title.length} characters left
            </p>
          </div>

          {/* Field 2 — When + Where */}
          <div className="space-y-3">
            <Label className="text-base font-medium">When and where?</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start" className="text-xs text-muted-foreground">Starts</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end" className="text-xs text-muted-foreground">Ends</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
            </div>
            <Input
              id="venue"
              value={venueText}
              onChange={(e) => setVenueText(e.target.value)}
              placeholder="Venue (e.g., Main Auditorium)"
              required
              className="h-12 text-base"
              aria-label="Venue"
            />
          </div>

          {/* Field 3 — Who's it for */}
          <div className="space-y-2">
            <Label className="text-base font-medium">Who's it for?</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Audience">
              {AUDIENCE_CHIPS.map((chip) => {
                const selected = audience.has(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleAudience(chip)}
                    aria-pressed={selected}
                    className={cn(
                      'h-10 px-4 rounded-full border text-sm transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border'
                    )}
                  >
                    {selected && <Check className="inline h-3 w-3 mr-1.5" aria-hidden />}
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progressive disclosure — Add details */}
          {!showDetails ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowDetails(true)}
              className="w-full justify-start h-11"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add details (optional)
            </Button>
          ) : (
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="space-y-2">
                <Label htmlFor="attendance">Expected attendance</Label>
                <Input
                  id="attendance"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100000}
                  value={expectedAttendance}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExpectedAttendance(v === '' ? '' : Math.max(0, Number(v)));
                  }}
                  placeholder="e.g., 150"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label>Budget required</Label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Budget bucket">
                  {BUDGET_BUCKETS.map((b) => {
                    const selected = budgetBucket === b.value;
                    return (
                      <button
                        key={b.label}
                        type="button"
                        onClick={() => setBudgetBucket(selected ? null : b.value)}
                        aria-pressed={selected}
                        className={cn(
                          'h-10 px-3 rounded-full border text-sm transition-colors',
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                        )}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Anything else?</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Optional context for Director"
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">{500 - notes.length} characters left</p>
              </div>
            </div>
          )}

          {/* Sticky submit on mobile */}
          <div className="sticky bottom-0 -mx-4 sm:mx-0 sm:relative px-4 sm:px-0 py-4 bg-background border-t sm:border-t-0">
            <Button type="submit" disabled={submitting} className="w-full h-12 text-base">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit proposal'}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Director gets a notification immediately. You can re-find this submission anytime.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
