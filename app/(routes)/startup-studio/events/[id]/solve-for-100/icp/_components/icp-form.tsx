'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Handshake,
  Loader2,
  Save,
  Send,
  Sparkles,
  TrendingUp,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations';
import {
  useMyICP,
  useSubmitICP,
  useUpdateICP,
} from '@/hooks/startup-studio/use-solve100-icp';
import {
  INCOME_BRACKETS,
  PHONE_TYPES,
  PROBLEM_FREQUENCY,
  VALIDATION_STATUS_OPTIONS,
} from '@/lib/constants/startup-studio/solve100';
import type {
  CreateICPDto,
  ValidationStatus,
} from '@/types/startup-studio';

// ── Zod schema ─────────────────────────────────────────────────────────────
const schema = z.object({
  // Section 1: The Person
  customer_name: z.string().min(2, 'Name this real person').max(100),
  customer_age_gender: z.string().min(2, 'e.g., 25, Female').max(50),
  customer_role: z.string().min(2, 'What do they do for work?').max(100),
  customer_location: z.string().min(2, 'Where are they?').max(100),
  customer_income: z.string().min(1, 'Select an income bracket'),
  customer_phone_type: z.string().min(1, 'Select a phone type'),

  // Section 2: The Problem
  problem_in_their_words: z
    .string()
    .min(15, 'Use their language — at least 15 chars')
    .max(1000),
  problem_frequency: z.string().min(1, 'How often does it happen?'),
  problem_cost: z.string().max(200).optional(),
  current_solution: z.string().min(5, 'Required').max(500),
  current_spend: z.string().max(200).optional(),

  // Section 3: The Sale
  elevator_pitch: z
    .string()
    .min(20, '2 sentences minimum')
    .max(500, 'Keep it punchy — under 500 chars'),
  proposed_price: z.string().min(1, 'Pick a price'),
  value_justification: z.string().min(10, 'Required').max(500),
  top_objection: z.string().min(5, 'Required').max(500),
  objection_response: z.string().min(5, 'Required').max(500),

  // Section 4: The Market
  market_size_50km: z.string().min(1, 'Required').max(200),
  where_they_gather: z.string().min(5, 'Required').max(500),
  plan_to_reach_10: z
    .string()
    .min(10, 'Be specific — names, places, dates')
    .max(1000),
  has_talked_to_customer: z.enum(
    ['yes_in_person', 'yes_phone', 'no_watched', 'no_guessing'] as const,
  ),
  talk_date: z.string().max(100).optional(),
});

type FormValues = z.infer<typeof schema>;

// ── Draft helpers ──────────────────────────────────────────────────────────
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
    // swallow
  }
}
function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // swallow
  }
}

interface Props {
  eventId: string;
}

export function ICPForm({ eventId }: Props) {
  const { profile, isLoading: authLoading } = useAuth();
  const { data: registration, isLoading: regLoading } = useMyRegistration(eventId);

  const teamId = registration?.id;
  const { data: existing, isLoading: icpLoading } = useMyICP(eventId, teamId);
  const isLeader = !!profile && !!registration && registration.owner_id === profile.id;

  const isLoading = authLoading || regLoading || icpLoading;

  if (isLoading) {
    return <Skeleton className="h-[700px] w-full rounded-xl" />;
  }

  if (!registration) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="font-medium">You&apos;re not registered for this event</p>
          <p className="text-sm text-muted-foreground">
            Register your team before building an ICP.
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
      <ReadOnlyICP
        eventId={eventId}
        icp={existing ?? null}
        teamName={registration.team_name}
      />
    );
  }

  return (
    <EditableICPForm
      eventId={eventId}
      teamId={registration.id}
      teamName={registration.team_name}
      existing={existing ?? null}
    />
  );
}

// ── Editable form (leader only) ────────────────────────────────────────────
function EditableICPForm({
  eventId,
  teamId,
  teamName,
  existing,
}: {
  eventId: string;
  teamId: string;
  teamName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existing: any | null;
}) {
  const router = useRouter();
  const submitICP = useSubmitICP();
  const updateICP = useUpdateICP();
  const [justSubmitted, setJustSubmitted] = useState(false);

  const draftKey = `solve100-icp-${eventId}-${teamId}`;
  const draft = !existing ? readDraft(draftKey) : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_name: draft?.customer_name ?? existing?.customer_name ?? '',
      customer_age_gender:
        draft?.customer_age_gender ?? existing?.customer_age_gender ?? '',
      customer_role: draft?.customer_role ?? existing?.customer_role ?? '',
      customer_location: draft?.customer_location ?? existing?.customer_location ?? '',
      customer_income: draft?.customer_income ?? existing?.customer_income ?? '',
      customer_phone_type:
        draft?.customer_phone_type ?? existing?.customer_phone_type ?? '',
      problem_in_their_words:
        draft?.problem_in_their_words ?? existing?.problem_in_their_words ?? '',
      problem_frequency:
        draft?.problem_frequency ?? existing?.problem_frequency ?? '',
      problem_cost: draft?.problem_cost ?? existing?.problem_cost ?? '',
      current_solution: draft?.current_solution ?? existing?.current_solution ?? '',
      current_spend: draft?.current_spend ?? existing?.current_spend ?? '',
      elevator_pitch: draft?.elevator_pitch ?? existing?.elevator_pitch ?? '',
      proposed_price: draft?.proposed_price ?? existing?.proposed_price ?? '',
      value_justification:
        draft?.value_justification ?? existing?.value_justification ?? '',
      top_objection: draft?.top_objection ?? existing?.top_objection ?? '',
      objection_response:
        draft?.objection_response ?? existing?.objection_response ?? '',
      market_size_50km: draft?.market_size_50km ?? existing?.market_size_50km ?? '',
      where_they_gather: draft?.where_they_gather ?? existing?.where_they_gather ?? '',
      plan_to_reach_10: draft?.plan_to_reach_10 ?? existing?.plan_to_reach_10 ?? '',
      has_talked_to_customer:
        (draft?.has_talked_to_customer as FormValues['has_talked_to_customer']) ??
        (existing?.has_talked_to_customer as FormValues['has_talked_to_customer']) ??
        'no_guessing',
      talk_date: draft?.talk_date ?? existing?.talk_date ?? '',
    },
  });

  // Auto-save draft on every field change
  useEffect(() => {
    const subscription = form.watch((values) => saveDraft(draftKey, values));
    return () => subscription.unsubscribe();
  }, [form, draftKey]);

  const validationStatus = form.watch('has_talked_to_customer');
  const needsTalkDate =
    validationStatus === 'no_watched' || validationStatus === 'no_guessing';

  const isPending = submitICP.isPending || updateICP.isPending;

  async function onSubmit(values: FormValues) {
    const dto: CreateICPDto = {
      event_id: eventId,
      team_id: teamId,
      customer_name: values.customer_name,
      customer_age_gender: values.customer_age_gender,
      customer_role: values.customer_role,
      customer_location: values.customer_location,
      customer_income: values.customer_income,
      customer_phone_type: values.customer_phone_type,
      problem_in_their_words: values.problem_in_their_words,
      problem_frequency: values.problem_frequency,
      problem_cost: values.problem_cost || undefined,
      current_solution: values.current_solution,
      current_spend: values.current_spend || undefined,
      elevator_pitch: values.elevator_pitch,
      proposed_price: values.proposed_price,
      value_justification: values.value_justification,
      top_objection: values.top_objection,
      objection_response: values.objection_response,
      market_size_50km: values.market_size_50km,
      where_they_gather: values.where_they_gather,
      plan_to_reach_10: values.plan_to_reach_10,
      has_talked_to_customer: values.has_talked_to_customer as ValidationStatus,
      talk_date: values.talk_date || undefined,
    };

    try {
      if (existing) {
        await updateICP.mutateAsync({ id: existing.id, dto });
        toast.success('ICP updated — new version saved');
      } else {
        await submitICP.mutateAsync(dto);
        toast.success('ICP submitted!');
      }
      clearDraft(draftKey);
      setJustSubmitted(true);
    } catch {
      // mutation hook shows its own error toast
    }
  }

  // Success card
  if (justSubmitted) {
    return (
      <Card className="border-green-300 bg-green-50/60 dark:bg-green-950/10">
        <CardContent className="py-10 text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">
              {existing ? 'ICP updated' : 'ICP saved'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {existing
                ? 'A new version of your ICP was saved. Keep refining as you learn more.'
                : 'Now go talk to this person. Your ICP is just a hypothesis until they confirm it.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" asChild>
              <Link href={`/startup-studio/events/${eventId}/solve-for-100`}>
                View Dashboard
              </Link>
            </Button>
            <Button onClick={() => setJustSubmitted(false)}>Edit ICP</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{teamName}</h2>
              {existing && (
                <Badge variant="outline">Version {existing.version ?? 1}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-saves as you type. Think of this as a living doc — update as you learn.
            </p>
          </div>
        </div>

        {/* Intro callout */}
        {!existing && (
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/10">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
              <strong>The ONE rule:</strong> Every answer must be about ONE real, specific
              person. Not &ldquo;small business owners&rdquo; — imagine a single name and face.
            </AlertDescription>
          </Alert>
        )}

        {/* Section 1 — The Person */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                1
              </span>
              <User className="h-4 w-4 text-primary" />
              The Person
            </CardTitle>
            <p className="text-xs text-muted-foreground pl-8">
              Think of ONE real person who has the problem your app solves.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Customer name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Rajesh Kumar" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_age_gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Age and gender <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="25, Female" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Role / job <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Clinic owner / Teacher / Farmer" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Work location <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Namakkal, Tamil Nadu" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_income"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Income bracket <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select income range" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INCOME_BRACKETS.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_phone_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Phone type <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="What do they use?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PHONE_TYPES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — The Problem */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                2
              </span>
              <AlertCircle className="h-4 w-4 text-primary" />
              The Problem
            </CardTitle>
            <p className="text-xs text-muted-foreground pl-8">
              Describe their problem in THEIR words — not yours.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="problem_in_their_words"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Problem in their words <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      maxLength={1000}
                      placeholder='&ldquo;I lose 2 hours a day chasing payments from parents because I have no easy way to send reminders.&rdquo;'
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
                name="problem_frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Frequency <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="How often?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROBLEM_FREQUENCY.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="problem_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost of problem</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Rs.2,000/week or 10 hours/week" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Money, time, or both.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="current_solution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Current solution <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      maxLength={500}
                      placeholder="How do they handle this today? Excel? WhatsApp? Paper? Nothing?"
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground">
                      {(field.value ?? '').length}/500
                    </span>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="current_spend"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current spend</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Rs.500/month on existing tool, or Rs.0"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    What do they pay for any solution today?
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section 3 — The Sale */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                3
              </span>
              <Handshake className="h-4 w-4 text-primary" />
              The Sale
            </CardTitle>
            <p className="text-xs text-muted-foreground pl-8">
              Imagine you&apos;re selling to this person RIGHT NOW.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="elevator_pitch"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Elevator pitch <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      maxLength={500}
                      placeholder="2 sentences to make this person want to hear more."
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground">
                      {(field.value ?? '').length}/500
                    </span>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proposed_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Proposed price <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Rs.299/month" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    What price will you ask for?
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="value_justification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Value justification <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      maxLength={500}
                      placeholder="Why would they say YES to that price?"
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground">
                      {(field.value ?? '').length}/500
                    </span>
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="top_objection"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Top objection <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        maxLength={500}
                        placeholder="#1 reason they might say NO"
                      />
                    </FormControl>
                    <div className="flex justify-between items-center">
                      <FormMessage />
                      <span className="text-xs text-muted-foreground">
                        {(field.value ?? '').length}/500
                      </span>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="objection_response"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Objection response <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        maxLength={500}
                        placeholder="How will you respond?"
                      />
                    </FormControl>
                    <div className="flex justify-between items-center">
                      <FormMessage />
                      <span className="text-xs text-muted-foreground">
                        {(field.value ?? '').length}/500
                      </span>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4 — The Market */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                4
              </span>
              <TrendingUp className="h-4 w-4 text-primary" />
              The Market
            </CardTitle>
            <p className="text-xs text-muted-foreground pl-8">
              Scaling beyond one person.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="market_size_50km"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Market size within 50km <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., ~500 clinics, ~200 schools"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    How many more people like this exist?
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="where_they_gather"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Where they gather <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      maxLength={500}
                      placeholder="Physical spots: clinic association meets, Salem markets. Online: Facebook groups, WhatsApp broadcasts."
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground">
                      {(field.value ?? '').length}/500
                    </span>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="plan_to_reach_10"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Plan to reach first 10 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      maxLength={1000}
                      placeholder="Specific names, places, dates. Example: Visit Ragul uncle's clinic Mon. Call sister's school head Tue. Join NK clinics WhatsApp group Wed."
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

            <FormField
              control={form.control}
              name="has_talked_to_customer"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>
                    Have you TALKED to this person?{' '}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="space-y-2"
                    >
                      {VALIDATION_STATUS_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                            field.value === opt.value
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <RadioGroupItem
                            value={opt.value}
                            id={`val-${opt.value}`}
                            className="mt-0.5"
                          />
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium">{opt.label}</p>
                            {opt.helper && (
                              <p className="text-xs text-muted-foreground">
                                {opt.helper}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsTalkDate && (
              <FormField
                control={form.control}
                name="talk_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>When will you talk to them?</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="By Monday April 22 — visiting their office in person"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Give a date. &ldquo;Soon&rdquo; is not a date.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Action buttons */}
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
                ? 'Save as new version'
                : 'Submit ICP'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}

// ── Read-only view for team members ────────────────────────────────────────
function ReadOnlyICP({
  eventId,
  icp,
  teamName,
}: {
  eventId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icp: any | null;
  teamName: string;
}) {
  if (!icp) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="font-medium">{teamName} hasn&apos;t built an ICP yet</p>
          <p className="text-sm text-muted-foreground">
            Only the team leader can create or update the ICP. Ask them to fill out this
            form.
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

  const sections: { title: string; rows: { label: string; value: string | null }[] }[] = [
    {
      title: 'The Person',
      rows: [
        { label: 'Name', value: icp.customer_name },
        { label: 'Age / Gender', value: icp.customer_age_gender },
        { label: 'Role', value: icp.customer_role },
        { label: 'Location', value: icp.customer_location },
        { label: 'Income', value: icp.customer_income },
        { label: 'Phone', value: icp.customer_phone_type },
      ],
    },
    {
      title: 'The Problem',
      rows: [
        { label: 'In their words', value: icp.problem_in_their_words },
        { label: 'Frequency', value: icp.problem_frequency },
        { label: 'Cost', value: icp.problem_cost },
        { label: 'Current solution', value: icp.current_solution },
        { label: 'Current spend', value: icp.current_spend },
      ],
    },
    {
      title: 'The Sale',
      rows: [
        { label: 'Elevator pitch', value: icp.elevator_pitch },
        { label: 'Proposed price', value: icp.proposed_price },
        { label: 'Value justification', value: icp.value_justification },
        { label: 'Top objection', value: icp.top_objection },
        { label: 'Objection response', value: icp.objection_response },
      ],
    },
    {
      title: 'The Market',
      rows: [
        { label: 'Market size (50km)', value: icp.market_size_50km },
        { label: 'Where they gather', value: icp.where_they_gather },
        { label: 'Plan to reach 10', value: icp.plan_to_reach_10 },
        { label: 'Validation', value: icp.has_talked_to_customer?.replace(/_/g, ' ') },
        { label: 'Talk date', value: icp.talk_date },
      ],
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          ICP for {teamName}
          {icp.version && (
            <Badge variant="outline" className="text-xs font-normal">
              Version {icp.version}
            </Badge>
          )}
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            Read-only
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {sections.map((section) => {
          const visible = section.rows.filter((r) => r.value);
          if (visible.length === 0) return null;
          return (
            <div key={section.title} className="space-y-3">
              <h3 className="text-sm font-semibold text-primary border-b pb-1">
                {section.title}
              </h3>
              {visible.map(({ label, value }) => (
                <div key={label} className="space-y-0.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="text-sm leading-relaxed">{value}</p>
                </div>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
