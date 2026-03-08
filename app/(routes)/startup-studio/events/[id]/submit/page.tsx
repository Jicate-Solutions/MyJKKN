'use client';

import { use, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Lock, Send, BarChart3, Trophy, Globe, Github, Link2, Video, FileText, Lightbulb, ArrowLeft, Loader2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useMyRegistration, useMyAcceptedMembership } from '@/hooks/startup-studio/use-event-registrations';
import { useMySubmission, useTeamSubmission, useSubmitProject, useUpdateSubmission, useUpdateMetrics } from '@/hooks/startup-studio/use-event-submissions';
import { EventSubmissionService } from '@/lib/services/startup-studio/event-submission-service';
import type { EventConfig } from '@/types/startup-studio';
import Link from 'next/link';
import { useMyTeamMembers } from '@/hooks/startup-studio/use-event-registrations';
import { RoleCardSection } from './_components/role-card-section';

const projectSchema = z.object({
  app_name: z.string().min(2, 'App name is required'),
  category: z.string().optional(),
  problem_statement: z.string().min(10, 'Problem statement is required'),
  solution_summary: z.string().min(10, 'Solution summary is required'),
  elevator_pitch: z.string().optional(),
  live_app_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  lovable_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  github_url: z.string().url('Must be a valid URL').refine(
    (url) => url.startsWith('https://github.com/'),
    'Must be a GitHub URL (https://github.com/...)'
  ),
  demo_video_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

const metricsSchema = z.object({
  mrr_amount: z.coerce.number().min(0).default(0),
  paying_users_count: z.coerce.number().min(0).default(0),
  user_count: z.coerce.number().min(0).default(0),
  active_users_count: z.coerce.number().min(0).default(0),
  proof_urls: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;
type MetricsFormValues = z.infer<typeof metricsSchema>;

// ── Draft persistence helpers ─────────────────────────────────────────────
function readDraft<T>(key: string): Partial<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = sessionStorage.getItem(key);
    return s ? (JSON.parse(s) as Partial<T>) : null;
  } catch { return null; }
}
function saveDraft(key: string, values: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(values)); } catch {}
}
function clearDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch {}
}

const TIER_NAMES: Record<number, string> = {
  0: 'No Submission',
  1: 'Live App',
  2: '5+ Users',
  3: '10+ Users',
  4: 'Revenue',
  5: 'Strong Revenue',
};

export default function SubmitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, isLoading: authLoading } = useAuth();
  const { data: event, isLoading: eventLoading } = useEvent(id);
  const { data: registration, isLoading: regLoading } = useMyRegistration(id);
  const { data: membership, isLoading: memberLoading } = useMyAcceptedMembership(id);
  const { data: submission, isLoading: subLoading } = useMySubmission(id);

  // For accepted members (non-leader): fetch team submission via registration_id from membership
  const membershipAny = membership as any;
  const memberRegistrationId = !registration ? membershipAny?.registration_id : undefined;
  const { data: memberSubmission, isLoading: memberSubLoading } = useTeamSubmission(id, memberRegistrationId);
  // For Role Card Phase 3: fetch team members list for member branch (leader gets them via registration.team_members)
  const { data: memberTeamMembers, isLoading: memberTeamLoading } = useMyTeamMembers(id);

  const now = new Date();
  const submissionLocked = event?.submission_deadline
    ? new Date(event.submission_deadline) < now
    : false;
  const metricsLocked = event?.metrics_deadline
    ? new Date(event.metrics_deadline) < now
    : false;

  if (authLoading || eventLoading || regLoading || memberLoading || subLoading || memberSubLoading || memberTeamLoading) {
    return (
      <ContentLayout title="Submit Project">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  const breadcrumb = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
    { label: 'Submit Project' },
  ];

  // ── Member (non-leader) view: read-only submission ───────────────────────
  if (!registration && membership) {
    const teamName = membershipAny?.team_name;
    return (
      <ContentLayout title="Submit Project">
        <PageBreadcrumb items={breadcrumb} />
        <div className="space-y-6 max-w-5xl py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Project Submission</h2>
              <p className="text-sm text-muted-foreground">{teamName} · {event?.name}</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/startup-studio/events/${id}/my-team`}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
          </div>
          <MemberSubmissionView submission={memberSubmission} />

          {memberSubmission?.metrics_updated_at && profile && (
            <RoleCardSection
              submissionId={memberSubmission.id}
              teamId={memberRegistrationId!}
              profileId={profile.id}
              learnerId={(membershipAny?.learner_id as string | null) ?? null}
              teamMembers={(memberTeamMembers as any) ?? []}
            />
          )}
        </div>
      </ContentLayout>
    );
  }

  // ── Not in any team ──────────────────────────────────────────────────────
  if (!registration) {
    return (
      <ContentLayout title="Submit Project">
        <PageBreadcrumb items={breadcrumb} />
        <Card className="max-w-lg mx-auto mt-8">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-muted-foreground">You must register a team before submitting a project.</p>
            <Button asChild>
              <Link href={`/startup-studio/events/${id}/register`}>Register Now</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // ── Leader (owner) view: full submit/edit form ───────────────────────────
  return (
    <ContentLayout title="Submit Project">
      <PageBreadcrumb items={breadcrumb} />

      <div className="space-y-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Submit Project</h2>
            <p className="text-sm text-muted-foreground">Event: {event?.name}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/startup-studio/events/${id}/my-team`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
        </div>

        <ProjectSection
          eventId={id}
          registrationId={registration.id}
          submission={submission}
          locked={submissionLocked}
          categories={event?.config?.categories || []}
        />

        <MetricsSection
          submission={submission}
          locked={metricsLocked}
          config={event?.config as EventConfig}
          eventId={id}
        />

        {submission?.metrics_updated_at && profile && (
          <RoleCardSection
            submissionId={submission.id}
            teamId={registration.id}
            profileId={profile.id}
            learnerId={
              registration.team_members?.find((m) => m.profile_id === profile.id)
                ?.learner_id ?? null
            }
            teamMembers={registration.team_members ?? []}
          />
        )}
      </div>
    </ContentLayout>
  );
}

function ProjectSection({
  eventId, registrationId, submission, locked, categories,
}: {
  eventId: string;
  registrationId: string;
  submission: any;
  locked: boolean;
  categories: string[];
}) {
  const submitProject = useSubmitProject();
  const updateSubmission = useUpdateSubmission();
  const router = useRouter();

  const draftKey = `startup-submit-${eventId}`;
  const draft = !locked ? readDraft<ProjectFormValues>(draftKey) : null;

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      app_name: draft?.app_name ?? submission?.app_name ?? '',
      category: draft?.category ?? submission?.category ?? '',
      problem_statement: draft?.problem_statement ?? submission?.problem_statement ?? '',
      solution_summary: draft?.solution_summary ?? submission?.solution_summary ?? '',
      elevator_pitch: draft?.elevator_pitch ?? submission?.elevator_pitch ?? '',
      live_app_url: draft?.live_app_url ?? submission?.live_app_url ?? '',
      lovable_url: draft?.lovable_url ?? submission?.lovable_url ?? '',
      github_url: draft?.github_url ?? submission?.github_url ?? '',
      demo_video_url: draft?.demo_video_url ?? submission?.demo_video_url ?? '',
    },
  });

  // Save draft on every field change (skip when locked — nothing to draft)
  useEffect(() => {
    if (locked) return;
    const subscription = form.watch((values) => saveDraft(draftKey, values));
    return () => subscription.unsubscribe();
  }, [form, draftKey, locked]);

  const redirectToTeam = () => router.push(`/startup-studio/events/${eventId}/my-team`);

  const onSubmit = (values: ProjectFormValues) => {
    const onSuccess = () => { clearDraft(draftKey); redirectToTeam(); };
    if (submission) {
      updateSubmission.mutate({ id: submission.id, dto: values }, { onSuccess });
    } else {
      submitProject.mutate(
        {
          event_id: eventId,
          registration_id: registrationId,
          app_name: values.app_name,
          problem_statement: values.problem_statement,
          solution_summary: values.solution_summary,
          elevator_pitch: values.elevator_pitch || undefined,
          github_url: values.github_url,
          live_app_url: values.live_app_url || undefined,
          lovable_url: values.lovable_url || undefined,
          demo_video_url: values.demo_video_url || undefined,
          category: values.category || undefined,
        },
        { onSuccess }
      );
    }
  };

  const isPending = submitProject.isPending || updateSubmission.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {locked && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
            <Lock className="h-4 w-4 shrink-0" /> Submission deadline has passed. Your submission is locked.
          </div>
        )}

        {/* Card 1: Project Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Project Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="app_name" render={({ field }) => (
              <FormItem>
                <FormLabel>App Name <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input {...field} disabled={locked} placeholder="Enter your app name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {categories.length > 0 && (
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={locked}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="problem_statement" render={({ field }) => (
              <FormItem>
                <FormLabel>Problem Statement <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={locked} placeholder="What problem does your app solve?" rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="solution_summary" render={({ field }) => (
              <FormItem>
                <FormLabel>Solution Summary <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={locked} placeholder="How does your app solve this problem?" rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="elevator_pitch" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" /> Elevator Pitch
                </FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={locked} placeholder="Describe your app in 30 seconds..." rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Card 2: Project Links */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" /> Project Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="live_app_url" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Live URL
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={locked} placeholder="https://your-app.lovable.app" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="lovable_url" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" /> Lovable Project URL
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={locked} placeholder="https://lovable.dev/projects/..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="github_url" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Github className="h-3.5 w-3.5" /> GitHub Repository URL <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={locked} placeholder="https://github.com/username/repo" />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Export your Lovable project to GitHub before submitting. This preserves your work after credits expire.
                </p>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="demo_video_url" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" /> Demo Video URL <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={locked} placeholder="https://youtube.com/watch?v=..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {!locked && (
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => { clearDraft(draftKey); router.back(); }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              <Send className="h-4 w-4" />
              {isPending ? 'Saving...' : submission ? 'Update Submission' : 'Submit Project'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}

// ── Read-only view for accepted members (non-leaders) ───────────────────────
function MemberSubmissionView({ submission }: { submission: any }) {
  if (!submission) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">No submission yet</p>
          <p className="text-sm text-muted-foreground">
            Your team leader hasn&apos;t submitted the project yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fields: { label: string; value: string | null | undefined; icon: React.ReactNode }[] = [
    { label: 'App Name', value: submission.app_name, icon: <FileText className="h-4 w-4" /> },
    { label: 'Category', value: submission.category, icon: <BarChart3 className="h-4 w-4" /> },
    { label: 'Problem Statement', value: submission.problem_statement, icon: <Lightbulb className="h-4 w-4" /> },
    { label: 'Solution Summary', value: submission.solution_summary, icon: <Send className="h-4 w-4" /> },
    { label: 'Elevator Pitch', value: submission.elevator_pitch, icon: <FileText className="h-4 w-4" /> },
    { label: 'Live App URL', value: submission.live_app_url, icon: <Globe className="h-4 w-4" /> },
    { label: 'Lovable URL', value: submission.lovable_url, icon: <Link2 className="h-4 w-4" /> },
    { label: 'GitHub URL', value: submission.github_url, icon: <Github className="h-4 w-4" /> },
    { label: 'Demo Video URL', value: submission.demo_video_url, icon: <Video className="h-4 w-4" /> },
  ];

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Project Details
          <Badge variant="secondary" className="ml-auto text-xs font-normal">Read-only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.filter(f => f.value).map(({ label, value, icon }) => (
          <div key={label} className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {icon} {label}
            </div>
            {value?.startsWith('http') ? (
              <a href={value} target="_blank" rel="noopener noreferrer"
                className="text-sm text-primary hover:underline break-all flex items-center gap-1">
                {value} <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <p className="text-sm leading-relaxed">{value}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MetricsSection({
  submission, locked, config, eventId,
}: {
  submission: any;
  locked: boolean;
  config: EventConfig;
  eventId: string;
}) {
  const updateMetrics = useUpdateMetrics();

  const draftKey = `startup-metrics-${eventId}`;
  const draft = !locked ? readDraft<MetricsFormValues>(draftKey) : null;

  const form = useForm<MetricsFormValues>({
    resolver: zodResolver(metricsSchema),
    defaultValues: {
      mrr_amount: draft?.mrr_amount ?? submission?.mrr_amount ?? 0,
      paying_users_count: draft?.paying_users_count ?? submission?.paying_users_count ?? 0,
      user_count: draft?.user_count ?? submission?.user_count ?? 0,
      active_users_count: draft?.active_users_count ?? submission?.active_users_count ?? 0,
      proof_urls: draft?.proof_urls ?? (submission?.proof_urls?.join(', ') || ''),
    },
  });

  // Save metrics draft on every change
  useEffect(() => {
    if (locked) return;
    const subscription = form.watch((values) => saveDraft(draftKey, values));
    return () => subscription.unsubscribe();
  }, [form, draftKey, locked]);

  const watchedValues = form.watch();

  const scorePreview = useMemo(() => {
    if (!config) return null;
    return EventSubmissionService.calculateScore(
      {
        mrr_amount: watchedValues.mrr_amount || 0,
        paying_users_count: watchedValues.paying_users_count || 0,
        user_count: watchedValues.user_count || 0,
        live_app_url: submission?.live_app_url || null,
      },
      config
    );
  }, [watchedValues.mrr_amount, watchedValues.paying_users_count, watchedValues.user_count, watchedValues.active_users_count, submission?.live_app_url, config]);

  const onSubmit = (values: MetricsFormValues) => {
    if (!submission) return;
    const proofUrls = values.proof_urls
      ? values.proof_urls.split(',').map((u) => u.trim()).filter(Boolean)
      : [];
    updateMetrics.mutate(
      {
        id: submission.id,
        dto: {
          mrr_amount: values.mrr_amount,
          paying_users_count: values.paying_users_count,
          user_count: values.user_count,
          active_users_count: values.active_users_count,
          proof_urls: proofUrls,
        },
        config,
      },
      { onSuccess: () => clearDraft(draftKey) }
    );
  };

  if (!submission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Submit your project details first before adding metrics.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Metrics &amp; Scoring
          </span>
          {locked && (
            <Badge variant="destructive" className="gap-1">
              <Lock className="h-3 w-3" /> Metrics Locked
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField control={form.control} name="mrr_amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>MRR Amount</FormLabel>
                  <FormControl><Input type="number" {...field} disabled={locked} min={0} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="paying_users_count" render={({ field }) => (
                <FormItem>
                  <FormLabel>Paying Users</FormLabel>
                  <FormControl><Input type="number" {...field} disabled={locked} min={0} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="user_count" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Users Signed Up</FormLabel>
                  <FormControl><Input type="number" {...field} disabled={locked} min={0} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="active_users_count" render={({ field }) => (
                <FormItem>
                  <FormLabel>Active Users</FormLabel>
                  <FormControl><Input type="number" {...field} disabled={locked} min={0} /></FormControl>
                  <p className="text-xs text-muted-foreground">
                    Users who have performed an action in your app (not just signed up)
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="proof_urls" render={({ field }) => (
              <FormItem>
                <FormLabel>Proof URLs (comma-separated)</FormLabel>
                <FormControl><Input {...field} disabled={locked} placeholder="https://proof1.com, https://proof2.com" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {!locked && (
              <Button type="submit" disabled={updateMetrics.isPending}>
                {updateMetrics.isPending ? 'Saving...' : 'Update Metrics'}
              </Button>
            )}
          </form>
        </Form>

        {/* Score Preview */}
        {scorePreview && (
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span className="font-semibold text-sm">Score Preview</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Tier</div>
                  <div className="font-semibold">
                    {scorePreview.tier_level} — {TIER_NAMES[scorePreview.tier_level] || ''}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tier Points</div>
                  <div className="font-semibold">{scorePreview.tier_points}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">MRR Bonus</div>
                  <div className="font-semibold">{scorePreview.mrr_bonus_points}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Score</div>
                  <div className="font-bold text-lg">{scorePreview.total_score}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
