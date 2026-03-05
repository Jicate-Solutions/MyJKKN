'use client';

import { use, useMemo } from 'react';
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
import { Lock, Send, BarChart3, Trophy } from 'lucide-react';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations';
import { useMySubmission, useSubmitProject, useUpdateSubmission, useUpdateMetrics } from '@/hooks/startup-studio/use-event-submissions';
import { EventSubmissionService } from '@/lib/services/startup-studio/event-submission-service';
import type { EventConfig } from '@/types/startup-studio';
import Link from 'next/link';

const projectSchema = z.object({
  app_name: z.string().min(2, 'App name required'),
  github_url: z.string().url('Must be a valid URL').refine(
    (url) => url.startsWith('https://github.com/'),
    'Must be a GitHub URL'
  ),
  live_app_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  description: z.string().optional(),
  category: z.string().optional(),
});

const metricsSchema = z.object({
  mrr_amount: z.coerce.number().min(0).default(0),
  paying_users_count: z.coerce.number().min(0).default(0),
  user_count: z.coerce.number().min(0).default(0),
  proof_urls: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;
type MetricsFormValues = z.infer<typeof metricsSchema>;

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
  const { data: event, isLoading: eventLoading } = useEvent(id);
  const { data: registration, isLoading: regLoading } = useMyRegistration(id);
  const { data: submission, isLoading: subLoading } = useMySubmission(id);

  const now = new Date();
  const submissionLocked = event?.submission_deadline
    ? new Date(event.submission_deadline) < now
    : false;
  const metricsLocked = event?.metrics_deadline
    ? new Date(event.metrics_deadline) < now
    : false;

  if (eventLoading || regLoading || subLoading) {
    return (
      <ContentLayout>
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: 'Event', href: `/startup-studio/events/${id}` },
          { label: 'Submit Project' },
        ]} />
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </ContentLayout>
    );
  }

  if (!registration) {
    return (
      <ContentLayout>
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: 'Event', href: `/startup-studio/events/${id}` },
          { label: 'Submit Project' },
        ]} />
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

  return (
    <ContentLayout>
      <PageBreadcrumb items={[
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'Submit Project' },
      ]} />

      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold">Submit Project</h2>
          <p className="text-muted-foreground">Team: {registration.team_name}</p>
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
        />
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

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      app_name: submission?.app_name || '',
      github_url: submission?.github_url || '',
      live_app_url: submission?.live_app_url || '',
      description: submission?.description || '',
      category: submission?.category || '',
    },
  });

  const onSubmit = (values: ProjectFormValues) => {
    if (submission) {
      updateSubmission.mutate({ submissionId: submission.id, dto: values });
    } else {
      submitProject.mutate({
        event_id: eventId,
        registration_id: registrationId,
        app_name: values.app_name,
        github_url: values.github_url,
        live_app_url: values.live_app_url || undefined,
        description: values.description || undefined,
        category: values.category || undefined,
      });
    }
  };

  const isPending = submitProject.isPending || updateSubmission.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Project Details
          </span>
          {locked && (
            <Badge variant="destructive" className="gap-1">
              <Lock className="h-3 w-3" /> Submission Locked
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="app_name" render={({ field }) => (
              <FormItem>
                <FormLabel>App Name *</FormLabel>
                <FormControl><Input {...field} disabled={locked} placeholder="My Awesome App" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="github_url" render={({ field }) => (
              <FormItem>
                <FormLabel>GitHub URL *</FormLabel>
                <FormControl><Input {...field} disabled={locked} placeholder="https://github.com/user/repo" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="live_app_url" render={({ field }) => (
              <FormItem>
                <FormLabel>Live App URL</FormLabel>
                <FormControl><Input {...field} disabled={locked} placeholder="https://myapp.com" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} disabled={locked} placeholder="Describe your project..." rows={3} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={locked}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
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

            {!locked && (
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : submission ? 'Update Submission' : 'Submit Project'}
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function MetricsSection({
  submission, locked, config,
}: {
  submission: any;
  locked: boolean;
  config: EventConfig;
}) {
  const updateMetrics = useUpdateMetrics();

  const form = useForm<MetricsFormValues>({
    resolver: zodResolver(metricsSchema),
    defaultValues: {
      mrr_amount: submission?.mrr_amount || 0,
      paying_users_count: submission?.paying_users_count || 0,
      user_count: submission?.user_count || 0,
      proof_urls: submission?.proof_urls?.join(', ') || '',
    },
  });

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
  }, [watchedValues.mrr_amount, watchedValues.paying_users_count, watchedValues.user_count, submission?.live_app_url, config]);

  const onSubmit = (values: MetricsFormValues) => {
    if (!submission) return;
    const proofUrls = values.proof_urls
      ? values.proof_urls.split(',').map((u) => u.trim()).filter(Boolean)
      : [];
    updateMetrics.mutate({
      submissionId: submission.id,
      dto: {
        mrr_amount: values.mrr_amount,
        paying_users_count: values.paying_users_count,
        user_count: values.user_count,
        proof_urls: proofUrls,
      },
      config,
    });
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <FormLabel>Total Users</FormLabel>
                  <FormControl><Input type="number" {...field} disabled={locked} min={0} /></FormControl>
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
