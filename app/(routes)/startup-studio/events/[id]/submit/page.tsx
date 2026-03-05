'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations';
import { useMySubmission, useSubmitProject, useUpdateSubmission, useUpdateMetrics } from '@/hooks/startup-studio/use-event-submissions';
import { EventSubmissionService } from '@/lib/services/startup-studio/event-submission-service';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Lock, Trophy, TrendingUp, DollarSign, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import type { EventConfig } from '@/types/startup-studio';

const projectSchema = z.object({
  app_name: z.string().min(2, 'App name required'),
  github_url: z.string().url('Must be a valid URL').startsWith('https://github.com/', 'Must be a GitHub URL'),
  live_app_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  description: z.string().optional(),
  category: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const metricsSchema = z.object({
  mrr_amount: z.coerce.number().min(0).default(0),
  paying_users_count: z.coerce.number().min(0).default(0),
  user_count: z.coerce.number().min(0).default(0),
  proof_urls: z.string().optional(),
});

type MetricsFormValues = z.infer<typeof metricsSchema>;

const TIER_NAMES: Record<number, string> = {
  0: 'No Submission',
  1: 'Deployed App',
  2: '5+ Users',
  3: '10+ Users',
  4: 'Revenue Generated',
  5: 'Significant Revenue',
};

export default function SubmitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const { data: registration, isLoading: regLoading } = useMyRegistration(eventId);
  const { data: submission, isLoading: subLoading } = useMySubmission(eventId);

  const submitProject = useSubmitProject();
  const updateSubmission = useUpdateSubmission();
  const updateMetrics = useUpdateMetrics();

  const config: EventConfig = event?.config ?? {
    team_max_size: 5,
    categories: [],
    tools: [],
    scoring_type: 'tiered',
    tier_points: {},
    mrr_bonus_brackets: [],
  };

  const submissionDeadlinePassed = event?.submission_deadline
    ? new Date(event.submission_deadline) < new Date()
    : false;

  const metricsDeadlinePassed = event?.metrics_deadline
    ? new Date(event.metrics_deadline) < new Date()
    : false;

  const projectForm = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      app_name: '',
      github_url: '',
      live_app_url: '',
      description: '',
      category: '',
    },
    values: submission
      ? {
          app_name: submission.app_name || '',
          github_url: submission.github_url || '',
          live_app_url: submission.live_app_url || '',
          description: submission.description || '',
          category: submission.category || '',
        }
      : undefined,
  });

  const metricsForm = useForm<MetricsFormValues>({
    resolver: zodResolver(metricsSchema),
    defaultValues: {
      mrr_amount: 0,
      paying_users_count: 0,
      user_count: 0,
      proof_urls: '',
    },
    values: submission
      ? {
          mrr_amount: submission.mrr_amount || 0,
          paying_users_count: submission.paying_users_count || 0,
          user_count: submission.user_count || 0,
          proof_urls: (submission.proof_urls || []).join(', '),
        }
      : undefined,
  });

  const watchedMetrics = metricsForm.watch();
  const watchedLiveUrl = projectForm.watch('live_app_url');

  const scorePreview = useMemo(() => {
    return EventSubmissionService.calculateScore(
      {
        mrr_amount: watchedMetrics.mrr_amount || 0,
        paying_users_count: watchedMetrics.paying_users_count || 0,
        user_count: watchedMetrics.user_count || 0,
        live_app_url: watchedLiveUrl || submission?.live_app_url || null,
      },
      config
    );
  }, [watchedMetrics, watchedLiveUrl, submission?.live_app_url, config]);

  const onSubmitProject = (values: ProjectFormValues) => {
    if (!registration) return;

    if (submission) {
      updateSubmission.mutate({
        id: submission.id,
        dto: {
          app_name: values.app_name,
          github_url: values.github_url,
          live_app_url: values.live_app_url || undefined,
          description: values.description || undefined,
          category: values.category || undefined,
        },
      });
    } else {
      submitProject.mutate({
        event_id: eventId,
        registration_id: registration.id,
        app_name: values.app_name,
        github_url: values.github_url,
        live_app_url: values.live_app_url || undefined,
        description: values.description || undefined,
        category: values.category || undefined,
      });
    }
  };

  const onSubmitMetrics = (values: MetricsFormValues) => {
    if (!submission) return;

    const proofUrls = values.proof_urls
      ? values.proof_urls.split(',').map((u) => u.trim()).filter(Boolean)
      : [];

    updateMetrics.mutate({
      id: submission.id,
      dto: {
        mrr_amount: values.mrr_amount,
        paying_users_count: values.paying_users_count,
        user_count: values.user_count,
        proof_urls: proofUrls,
      },
      config,
    });
  };

  if (eventLoading || regLoading || subLoading) {
    return (
      <ContentLayout title="Submit Project">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Submit Project">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  if (!registration) {
    return (
      <ContentLayout title="Submit Project">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Startup Studio', href: '/startup-studio/events' },
            { label: event.name, href: `/startup-studio/events/${eventId}` },
            { label: 'Submit Project' },
          ]}
        />
        <div className="text-center py-20 space-y-4">
          <p className="text-muted-foreground">You must register before submitting a project.</p>
          <Link href={`/startup-studio/events/${eventId}/register`}>
            <Button>Register Now</Button>
          </Link>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Submit Project - ${event.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event.name, href: `/startup-studio/events/${eventId}` },
          { label: 'Submit Project' },
        ]}
      />

      <div className="space-y-6 mt-4 max-w-3xl">
        {/* Section 1: Project Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Project Details</CardTitle>
              {submissionDeadlinePassed && (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Submission deadline has passed
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Form {...projectForm}>
              <form onSubmit={projectForm.handleSubmit(onSubmitProject)} className="space-y-4">
                <FormField
                  control={projectForm.control}
                  name="app_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>App Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="My Awesome App"
                          disabled={submissionDeadlinePassed}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={projectForm.control}
                  name="github_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GitHub URL *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://github.com/user/repo"
                          disabled={submissionDeadlinePassed}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={projectForm.control}
                  name="live_app_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Live App URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://myapp.vercel.app"
                          disabled={submissionDeadlinePassed}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={projectForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of your project..."
                          rows={3}
                          disabled={submissionDeadlinePassed}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {config.categories && config.categories.length > 0 && (
                  <FormField
                    control={projectForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={submissionDeadlinePassed}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {config.categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <Button
                  type="submit"
                  disabled={
                    submissionDeadlinePassed ||
                    submitProject.isPending ||
                    updateSubmission.isPending
                  }
                >
                  {(submitProject.isPending || updateSubmission.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submission ? 'Update Submission' : 'Submit Project'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Section 2: Metrics (only shown after initial submission) */}
        {submission && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Metrics</CardTitle>
                {metricsDeadlinePassed && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" />
                    Metrics deadline has passed
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Form {...metricsForm}>
                <form onSubmit={metricsForm.handleSubmit(onSubmitMetrics)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FormField
                      control={metricsForm.control}
                      name="mrr_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>MRR Amount ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              disabled={metricsDeadlinePassed}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={metricsForm.control}
                      name="paying_users_count"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Paying Users</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              disabled={metricsDeadlinePassed}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={metricsForm.control}
                      name="user_count"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Users</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              disabled={metricsDeadlinePassed}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={metricsForm.control}
                    name="proof_urls"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proof URLs (comma-separated)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://screenshot1.png, https://screenshot2.png"
                            disabled={metricsDeadlinePassed}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={metricsDeadlinePassed || updateMetrics.isPending}
                  >
                    {updateMetrics.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Update Metrics
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Score Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Score Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Current Tier</p>
                <p className="text-lg font-bold">{scorePreview.tier_level}</p>
                <p className="text-xs text-muted-foreground">{TIER_NAMES[scorePreview.tier_level]}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <Trophy className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Tier Points</p>
                <p className="text-lg font-bold">{scorePreview.tier_points}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <DollarSign className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">MRR Bonus</p>
                <p className="text-lg font-bold">{scorePreview.mrr_bonus_points}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Score</p>
                <p className="text-lg font-bold">{scorePreview.total_score}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
