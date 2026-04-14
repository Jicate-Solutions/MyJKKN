'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Globe,
  Lock,
  Loader2,
  Megaphone,
  Save,
  Send,
  Target,
  Users,
  Wrench,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations';
import {
  useMyWeeklyCheckin,
  useSubmitWeeklyCheckin,
  useTeamHistory,
} from '@/hooks/startup-studio/use-solve100-weekly';
import {
  APP_STATUS_OPTIONS,
  CHECKIN_DEADLINE_DAY,
  CHECKIN_DEADLINE_HOUR,
  SOLVE100_WEEKS,
} from '@/lib/constants/startup-studio/solve100';
import type { AppStatus, CreateWeeklyCheckinDto } from '@/types/startup-studio';
import { PreviousCommitmentCard } from './previous-commitment-card';

// ── Week-number helper ─────────────────────────────────────────────────────
// Calculates the current week of the Solve for 100 program. The program
// started on April 1, 2026. Falls back to week 1 if we're before that.
const PROGRAM_START = new Date('2026-04-01T00:00:00+05:30');

function getCurrentWeekNumber(): number {
  const now = new Date();
  const diffMs = now.getTime() - PROGRAM_START.getTime();
  if (diffMs < 0) return 1;
  const weeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(Math.max(weeks, 1), SOLVE100_WEEKS);
}

// Returns true if the weekly check-in window has closed for THIS week.
// Window closes at the configured day/hour (Thursday 11:59pm IST by default).
function isDeadlinePassed(): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  // Past Thursday OR Thursday after the cutoff hour
  if (dayOfWeek > CHECKIN_DEADLINE_DAY) return true;
  if (dayOfWeek === CHECKIN_DEADLINE_DAY && hour > CHECKIN_DEADLINE_HOUR) return true;
  return false;
}

// ── Zod schema ─────────────────────────────────────────────────────────────
// Fields for the PREVIOUS week's commitment (recorded against last week's row)
// are conditionally required only when a previous commitment exists.
const schema = z.object({
  // Previous week fields (conditional)
  commitment_met: z.enum(['yes', 'no', 'partial']).optional(),
  commitment_result: z.string().max(500).optional(),

  // This week's new commitment
  commitment: z
    .string()
    .min(20, 'Be specific — at least 20 characters')
    .max(500, 'Keep it under 500 characters'),

  // Customer metrics
  verified_paid_users: z.coerce.number().int().min(0, 'Cannot be negative'),
  total_users: z.coerce.number().int().min(0).default(0),
  active_users: z.coerce.number().int().min(0).default(0),

  // First customer plan
  target_customer_name: z
    .string()
    .min(2, 'Name a real person')
    .max(200, 'Keep it short'),
  target_customer_location: z.string().max(200).optional(),
  problem_description: z.string().max(1000).optional(),
  pricing: z.string().max(100).optional(),
  acquisition_plan: z.string().max(1000).optional(),

  // App status
  app_status: z.enum(['live', 'needs_fixes', 'building', 'pivoting'] as const),
  app_url: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),

  // Blockers
  biggest_blocker: z.string().min(3, 'Tell us the blocker').max(1000),
  blocker_resolved: z.boolean().default(false),
});

type FormValues = z.infer<typeof schema>;

// ── Draft persistence helpers ──────────────────────────────────────────────
function readDraft(key: string): Partial<FormValues> | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = sessionStorage.getItem(key);
    return s ? (JSON.parse(s) as Partial<FormValues>) : null;
  } catch {
    return null;
  }
}
function saveDraft(key: string, values: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(values));
  } catch {
    // swallow — sessionStorage may be disabled in incognito
  }
}
function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // swallow
  }
}

// ── Labels ─────────────────────────────────────────────────────────────────
const APP_STATUS_LABELS: Record<AppStatus, string> = {
  live: 'Live — users can use it right now',
  needs_fixes: 'Needs fixes — working but has bugs',
  building: 'Building — not usable yet',
  pivoting: 'Pivoting — changing direction',
};

interface Props {
  eventId: string;
}

export function WeeklyCheckinForm({ eventId }: Props) {
  const { profile, isLoading: authLoading } = useAuth();
  const { data: registration, isLoading: regLoading } = useMyRegistration(eventId);

  const currentWeek = useMemo(() => getCurrentWeekNumber(), []);
  const previousWeek = currentWeek - 1;
  const locked = useMemo(() => isDeadlinePassed(), []);

  const teamId = registration?.id;
  const isLeader = !!profile && !!registration && registration.owner_id === profile.id;

  // This week's existing check-in (edit mode if already submitted)
  const { data: thisWeekCheckin, isLoading: thisLoading } = useMyWeeklyCheckin(
    eventId,
    teamId,
    currentWeek,
  );

  // All team history — used to find last week's commitment + any other submissions
  const { data: history, isLoading: historyLoading } = useTeamHistory(eventId, teamId);

  const previousCheckin = useMemo(() => {
    if (!history || previousWeek < 1) return null;
    return history.find((c) => c.week_number === previousWeek) ?? null;
  }, [history, previousWeek]);

  const isLoading = authLoading || regLoading || thisLoading || historyLoading;

  // Render guards ──────────────────────────────────────────────────────────
  if (isLoading) {
    return <Skeleton className="h-[600px] w-full rounded-xl" />;
  }

  if (!registration) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="font-medium">You&apos;re not registered for this event</p>
          <p className="text-sm text-muted-foreground">
            Register your team before filling weekly check-ins.
          </p>
          <Button asChild size="sm">
            <Link href={`/startup-studio/events/${eventId}/register`}>Register Now</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isLeader) {
    return (
      <ReadOnlyView
        eventId={eventId}
        week={currentWeek}
        checkin={thisWeekCheckin ?? null}
        teamName={registration.team_name}
      />
    );
  }

  return (
    <LeaderForm
      eventId={eventId}
      teamId={registration.id}
      teamName={registration.team_name}
      currentWeek={currentWeek}
      previousCheckin={previousCheckin}
      existing={thisWeekCheckin ?? null}
      locked={locked}
    />
  );
}

// ── Leader form (editable) ─────────────────────────────────────────────────
function LeaderForm({
  eventId,
  teamId,
  teamName,
  currentWeek,
  previousCheckin,
  existing,
  locked,
}: {
  eventId: string;
  teamId: string;
  teamName: string;
  currentWeek: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previousCheckin: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existing: any | null;
  locked: boolean;
}) {
  const router = useRouter();
  const submitCheckin = useSubmitWeeklyCheckin();
  const [justSubmitted, setJustSubmitted] = useState(false);

  const draftKey = `solve100-weekly-${eventId}-${teamId}-${currentWeek}`;
  const draft = !locked && !existing ? readDraft(draftKey) : null;

  const hasPrevCommitment = !!previousCheckin?.commitment;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      commitment_met:
        (existing?.commitment_met_prev as FormValues['commitment_met']) ??
        draft?.commitment_met ??
        undefined,
      commitment_result: draft?.commitment_result ?? '',
      commitment: draft?.commitment ?? existing?.commitment ?? '',
      verified_paid_users: draft?.verified_paid_users ?? existing?.verified_paid_users ?? 0,
      total_users: draft?.total_users ?? existing?.total_users ?? 0,
      active_users: draft?.active_users ?? existing?.active_users ?? 0,
      target_customer_name:
        draft?.target_customer_name ?? existing?.target_customer_name ?? '',
      target_customer_location:
        draft?.target_customer_location ?? existing?.target_customer_location ?? '',
      problem_description: draft?.problem_description ?? existing?.problem_description ?? '',
      pricing: draft?.pricing ?? existing?.pricing ?? '',
      acquisition_plan: draft?.acquisition_plan ?? existing?.acquisition_plan ?? '',
      app_status:
        (draft?.app_status as FormValues['app_status']) ??
        (existing?.app_status as FormValues['app_status']) ??
        'building',
      app_url: draft?.app_url ?? existing?.app_url ?? '',
      biggest_blocker: draft?.biggest_blocker ?? existing?.biggest_blocker ?? '',
      blocker_resolved: draft?.blocker_resolved ?? false,
    },
  });

  // Auto-save draft on every field change (skip when locked — nothing to draft)
  useEffect(() => {
    if (locked) return;
    const subscription = form.watch((values) => saveDraft(draftKey, values));
    return () => subscription.unsubscribe();
  }, [form, draftKey, locked]);

  const isPending = submitCheckin.isPending;

  async function onSubmit(values: FormValues) {
    // If there's a previous commitment, the team MUST tell us whether they met it
    if (hasPrevCommitment && !values.commitment_met) {
      form.setError('commitment_met', {
        message: 'Tell us whether you met last week\'s commitment',
      });
      return;
    }

    const dto: CreateWeeklyCheckinDto = {
      event_id: eventId,
      team_id: teamId,
      week_number: currentWeek,
      commitment: values.commitment,
      verified_paid_users: values.verified_paid_users,
      total_users: values.total_users,
      active_users: values.active_users,
      target_customer_name: values.target_customer_name,
      target_customer_location: values.target_customer_location || undefined,
      problem_description: values.problem_description || undefined,
      pricing: values.pricing || undefined,
      acquisition_plan: values.acquisition_plan || undefined,
      app_status: values.app_status,
      app_url: values.app_url || undefined,
      biggest_blocker: values.biggest_blocker,
      blocker_resolved: values.blocker_resolved,
      // Previous-week fields — service will apply these to the previous row
      previous_commitment_met:
        hasPrevCommitment && values.commitment_met
          ? values.commitment_met === 'yes'
          : undefined,
      previous_commitment_partial:
        hasPrevCommitment ? values.commitment_met === 'partial' : undefined,
      previous_commitment_result:
        hasPrevCommitment ? values.commitment_result || undefined : undefined,
    };

    try {
      await submitCheckin.mutateAsync(dto);
      clearDraft(draftKey);
      setJustSubmitted(true);
      toast.success(
        existing ? 'Check-in updated' : `Week ${currentWeek} check-in submitted!`,
      );
    } catch {
      // Mutation hook shows its own error toast
    }
  }

  // Success card — shown after submission
  if (justSubmitted) {
    return (
      <Card className="border-green-300 bg-green-50/60 dark:bg-green-950/10">
        <CardContent className="py-10 text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Week {currentWeek} check-in saved</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Now go do what you committed to. See you next Thursday.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" asChild>
              <Link href={`/startup-studio/events/${eventId}/solve-for-100`}>
                View Dashboard
              </Link>
            </Button>
            <Button onClick={() => setJustSubmitted(false)}>Edit Response</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Header: team + week info */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{teamName}</h2>
              <Badge variant="outline">Week {currentWeek} of {SOLVE100_WEEKS}</Badge>
              {existing && (
                <Badge variant="secondary" className="text-xs">Editing</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-saves as you type. Submit by Thursday 11:59 PM.
            </p>
          </div>
        </div>

        {/* Deadline banner */}
        <Alert
          className={
            locked
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-orange-300 bg-orange-50 dark:bg-orange-950/20'
          }
        >
          {locked ? (
            <Lock className="h-4 w-4 text-destructive" />
          ) : (
            <Clock className="h-4 w-4 text-orange-600" />
          )}
          <AlertDescription
            className={locked ? 'text-destructive text-sm' : 'text-orange-700 text-sm'}
          >
            {locked ? (
              <>
                The Week {currentWeek} window closed on Thursday at 11:59 PM. Contact your
                mentor if you need to update.
              </>
            ) : (
              <>Submit your check-in before <strong>Thursday 11:59 PM</strong>.</>
            )}
          </AlertDescription>
        </Alert>

        {/* Section 1: Previous week's result */}
        {hasPrevCommitment && (
          <PreviousCommitmentCard
            previousCommitment={previousCheckin.commitment}
            previousWeek={previousCheckin.week_number}
            form={form}
            disabled={locked}
          />
        )}

        {/* Section 2: This week's commitment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              This Week&apos;s Commitment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="commitment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    By next Thursday we will ___ <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={locked}
                      rows={3}
                      maxLength={500}
                      placeholder="Talk to 3 clinic owners and get 1 to try our app"
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                      Be specific. Not &ldquo;work on app&rdquo;. Measurable action.
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {field.value.length}/500
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section 3: Customer metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Customer Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/10">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
                Be honest. Payment-gateway verified users only. Friends and classmates
                don&apos;t count.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="verified_paid_users"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Verified paid users <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="number" min={0} disabled={locked} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="total_users"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total users</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} disabled={locked} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="active_users"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Active users</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} disabled={locked} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: First customer plan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-primary" />
              First Customer Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="target_customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Target customer name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={locked}
                        placeholder="Rajesh Kumar — clinic owner"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Name ONE real person outside JKKN.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_customer_location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={locked}
                        placeholder="Namakkal, Tamil Nadu"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="problem_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Problem description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={locked}
                      rows={2}
                      maxLength={1000}
                      placeholder="2-3 sentences about the specific problem this person has."
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground">
                      {(field.value ?? '').length}/1000
                    </span>
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="pricing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pricing</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={locked}
                        placeholder="Rs.299/month or Rs.99 one-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="acquisition_plan"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Acquisition plan</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={locked}
                        placeholder="Visit clinic Tuesday, demo in person"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      What conversation will you have this week?
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 5: App status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />
              App Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="app_status"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>
                    Where is the app right now? <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={locked}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    >
                      {APP_STATUS_OPTIONS.map((s) => (
                        <label
                          key={s}
                          className="flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50"
                        >
                          <RadioGroupItem value={s} id={`app-${s}`} className="mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium capitalize">
                              {s.replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {APP_STATUS_LABELS[s as AppStatus]}
                            </p>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="app_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    App URL <span className="text-muted-foreground text-xs">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="url"
                      disabled={locked}
                      placeholder="https://your-app.lovable.app"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section 6: Blockers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" />
              Blockers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="biggest_blocker"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Biggest blocker right now <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={locked}
                      rows={3}
                      maxLength={1000}
                      placeholder="What's stopping you from growing? Technical, mental, interpersonal — be honest."
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground">
                      {field.value.length}/1000
                    </span>
                  </div>
                </FormItem>
              )}
            />

            {previousCheckin?.biggest_blocker && (
              <FormField
                control={form.control}
                name="blocker_resolved"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={locked}
                        className="mt-0.5"
                      />
                    </FormControl>
                    <div className="space-y-0.5 -mt-0.5">
                      <FormLabel className="cursor-pointer">
                        Last week&apos;s blocker is resolved
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        &ldquo;{previousCheckin.biggest_blocker}&rdquo;
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Action buttons */}
        {!locked && (
          <div className="flex items-center justify-between gap-3 sticky bottom-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.back()}
              disabled={isPending}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                <Save className="h-3 w-3" /> Auto-saved
              </span>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isPending
                  ? 'Saving...'
                  : existing
                  ? 'Update Check-in'
                  : 'Submit Week ' + currentWeek}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
}

// ── Read-only view for non-leader team members ─────────────────────────────
function ReadOnlyView({
  eventId,
  week,
  checkin,
  teamName,
}: {
  eventId: string;
  week: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkin: any | null;
  teamName: string;
}) {
  if (!checkin) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="font-medium">No check-in for Week {week} yet</p>
          <p className="text-sm text-muted-foreground">
            Only the team leader of <strong>{teamName}</strong> can submit weekly check-ins.
            Ask them to fill this form before Thursday 11:59 PM.
          </p>
          <Button variant="outline" asChild size="sm">
            <Link href={`/startup-studio/events/${eventId}/solve-for-100`}>
              Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Team', value: teamName },
    { label: 'Commitment', value: checkin.commitment },
    { label: 'Paid users', value: checkin.verified_paid_users ?? 0 },
    { label: 'Total users', value: checkin.total_users ?? 0 },
    { label: 'Active users', value: checkin.active_users ?? 0 },
    { label: 'Target customer', value: checkin.target_customer_name },
    { label: 'App status', value: checkin.app_status?.replace(/_/g, ' ') },
    {
      label: 'App URL',
      value: checkin.app_url ? (
        <a
          href={checkin.app_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {checkin.app_url}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    },
    { label: 'Blocker', value: checkin.biggest_blocker },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Week {week} Check-in
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            Read-only
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows
          .filter((r) => r.value !== null && r.value !== undefined && r.value !== '')
          .map(({ label, value }) => (
            <div key={label} className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <div className="text-sm leading-relaxed">{value}</div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
