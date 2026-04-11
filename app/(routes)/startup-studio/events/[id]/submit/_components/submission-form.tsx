'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Send,
  Globe,
  Video,
  FileText,
  Link as LinkIcon,
  Github,
  IndianRupee,
  Users,
  ImageIcon,
  TrendingUp,
  Target,
  UserCheck,
  Activity,
} from 'lucide-react';
import { calculateScore, getTierColor } from '@/lib/utils/tier-calculator';
import { useSSEvent, useUpdateMetrics } from '@/hooks/startup-studio';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface SubmissionFormProps {
  eventId: string;
}

const CATEGORIES = [
  'Education',
  'Healthcare',
  'Agriculture',
  'Sustainability',
  'Finance',
  'Social Impact',
  'Productivity',
  'Entertainment',
  'Other',
];

function useCreateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/submit`, { ...data, auto_submit: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio'] });
    },
  });
}

/** Fetch the user's existing submissions for this event */
function useMySubmissions(eventId: string) {
  return useQuery({
    queryKey: ['startup-studio', 'submissions', 'mine', eventId],
    queryFn: () =>
      apiClient.get<any>('/api/startup-studio/submissions', {
        params: { event_id: eventId },
      }),
    enabled: !!eventId,
  });
}

/** Metrics Update Card shown when user already has a submission */
function MetricsUpdateCard({ submission }: { submission: any }) {
  const updateMetrics = useUpdateMetrics();
  const queryClient = useQueryClient();

  const [mrrAmount, setMrrAmount] = useState<string>(
    submission.mrr_amount ? String(submission.mrr_amount) : ''
  );
  const [payingUsers, setPayingUsers] = useState<string>(
    submission.paying_users_count ? String(submission.paying_users_count) : ''
  );
  const [totalUsers, setTotalUsers] = useState<string>(
    submission.total_users ? String(submission.total_users) : ''
  );
  const [activeUsers, setActiveUsers] = useState<string>(
    submission.active_users ? String(submission.active_users) : ''
  );
  const [proofUrlsText, setProofUrlsText] = useState<string>(
    (submission.proof_urls || []).join('\n')
  );
  const [metricsError, setMetricsError] = useState('');
  const [metricsSaved, setMetricsSaved] = useState(false);

  // Compute current tier for live preview
  const currentScore = calculateScore({
    live_url: submission.live_url,
    total_users: totalUsers ? parseInt(totalUsers, 10) : 0,
    active_users: activeUsers ? parseInt(activeUsers, 10) : 0,
    mrr_amount: mrrAmount ? parseFloat(mrrAmount) : 0,
    paying_users_count: payingUsers ? parseInt(payingUsers, 10) : 0,
  });

  const handleSaveMetrics = async () => {
    setMetricsError('');

    const mrr = mrrAmount ? parseFloat(mrrAmount) : 0;
    const paying = payingUsers ? parseInt(payingUsers, 10) : 0;
    const total = totalUsers ? parseInt(totalUsers, 10) : 0;
    const active = activeUsers ? parseInt(activeUsers, 10) : 0;

    if (isNaN(mrr) || mrr < 0) {
      setMetricsError('MRR must be a valid non-negative number.');
      return;
    }
    if (isNaN(paying) || paying < 0) {
      setMetricsError('Paying users must be a valid non-negative number.');
      return;
    }
    if (isNaN(total) || total < 0) {
      setMetricsError('Total users must be a valid non-negative number.');
      return;
    }
    if (isNaN(active) || active < 0) {
      setMetricsError('Active users must be a valid non-negative number.');
      return;
    }

    // Parse proof URLs: split by newlines and commas, trim, filter empty
    const urls = proofUrlsText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      await updateMetrics.mutateAsync({
        id: submission.id,
        data: {
          mrr_amount: mrr,
          paying_users_count: paying,
          total_users: total,
          active_users: active,
          proof_urls: urls,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['startup-studio'] });
      setMetricsSaved(true);
      toast.success('Metrics updated successfully');
      setTimeout(() => setMetricsSaved(false), 3000);
    } catch (err: any) {
      setMetricsError(err?.message || 'Failed to update metrics.');
    }
  };

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-600" />
          Update Your Revenue Metrics
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter your real revenue data. The leaderboard ranks teams by MRR -- no judges needed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live Tier Preview */}
        <div className="p-4 bg-white rounded-lg border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-600" />
              <span className="font-semibold">Your Score</span>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${getTierColor(currentScore.tier.level)}`}>
              Level {currentScore.tier.level}: {currentScore.tier.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Tier Points</p>
              <p className="text-xl font-bold">{currentScore.tier.points}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">MRR Bonus</p>
              <p className="text-xl font-bold text-green-600">+{currentScore.mrrBonus}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total Score</p>
              <p className="text-2xl font-bold text-green-700">{currentScore.totalScore}</p>
            </div>
            {submission.metrics_updated_at && (
              <div className="text-center ml-auto">
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(submission.metrics_updated_at).toLocaleString('en-IN')}
                </p>
              </div>
            )}
          </div>
        </div>

        {metricsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{metricsError}</AlertDescription>
          </Alert>
        )}

        {metricsSaved && (
          <Alert className="border-green-300 bg-green-50 text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Metrics saved successfully.</AlertDescription>
          </Alert>
        )}

        {/* User Metrics (for Tier 2 & 3) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="total-users" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Total Users Signed Up
            </Label>
            <Input
              id="total-users"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={totalUsers}
              onChange={(e) => setTotalUsers(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              How many people created an account? (5+ = Level 2)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="active-users" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Users (last 24h)
            </Label>
            <Input
              id="active-users"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={activeUsers}
              onChange={(e) => setActiveUsers(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Users who actually used your app in the last 24 hours (10+ = Level 3)
            </p>
          </div>
        </div>

        {/* Revenue Metrics (for Tier 4 & 5) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mrr-amount" className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Monthly Recurring Revenue (MRR)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                &#8377;
              </span>
              <Input
                id="mrr-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="pl-8"
                value={mrrAmount}
                onChange={(e) => setMrrAmount(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Any revenue = Level 4. ₹100+ MRR = Level 5.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paying-users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Number of Paying Users
            </Label>
            <Input
              id="paying-users"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={payingUsers}
              onChange={(e) => setPayingUsers(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              5+ paying users = Level 5.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="proof-urls" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Proof Screenshots (URLs)
          </Label>
          <Textarea
            id="proof-urls"
            placeholder="Paste screenshot URLs here, one per line.&#10;e.g. https://i.imgur.com/example.png&#10;Screenshots of Razorpay/Stripe dashboard, payment confirmations, etc."
            rows={3}
            value={proofUrlsText}
            onChange={(e) => setProofUrlsText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            One URL per line. Screenshots of payment dashboards (Razorpay, Stripe, UPI, etc.)
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSaveMetrics}
            disabled={updateMetrics.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {updateMetrics.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <TrendingUp className="mr-2 h-4 w-4" />
                {submission.metrics_updated_at ? 'Update Metrics' : 'Submit Metrics'}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SubmissionForm({ eventId }: SubmissionFormProps) {
  const router = useRouter();
  const { data: eventRaw, isLoading: eventLoading, error: eventError } = useSSEvent(eventId);
  const event = eventRaw as any;
  const createSubmission = useCreateSubmission();
  const { data: submissionsRaw, isLoading: subsLoading } = useMySubmissions(eventId);

  // The API returns { data: [...], metadata: {...} } for paginated, or just the array
  const mySubmissions = Array.isArray(submissionsRaw)
    ? submissionsRaw
    : (submissionsRaw as any)?.data ?? [];
  const existingSubmission = mySubmissions.length > 0 ? mySubmissions[0] : null;

  const [formData, setFormData] = useState({
    app_name: '',
    problem_statement: '',
    solution_summary: '',
    live_url: '',
    lovable_url: '',
    github_repo_url: '',
    elevator_pitch: '',
    demo_video_url: '',
    category: '',
  });
  const [validationError, setValidationError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): boolean => {
    if (!formData.app_name.trim()) {
      setValidationError('App name is required.');
      return false;
    }
    if (!formData.problem_statement.trim()) {
      setValidationError('Problem statement is required.');
      return false;
    }
    if (!formData.solution_summary.trim()) {
      setValidationError('Solution summary is required.');
      return false;
    }
    if (!formData.github_repo_url.trim()) {
      setValidationError('GitHub Repository URL is required.');
      return false;
    }
    if (!formData.github_repo_url.trim().startsWith('https://github.com/')) {
      setValidationError('GitHub Repository URL must start with https://github.com/');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const data: Record<string, any> = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (value.trim()) {
        data[key] = value.trim();
      }
    });

    try {
      await createSubmission.mutateAsync({ eventId, data });
      setSubmitted(true);
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to submit. Please try again.');
    }
  };

  if (eventLoading || subsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (eventError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load event details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Project Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Your project &quot;{formData.app_name}&quot; has been submitted successfully.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => router.push(`/startup-studio/events/${eventId}`)}
              >
                Back to Event
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Submit Project</h1>
          {event?.name && (
            <p className="text-sm text-muted-foreground mt-1">
              Event: {event.name}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      {/* If the user already has a submission, show Metrics Update Card prominently */}
      {existingSubmission && (
        <>
          <Alert className="border-blue-200 bg-blue-50">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              You already submitted <strong>{existingSubmission.app_name}</strong>.
              Update your revenue metrics below for the leaderboard.
            </AlertDescription>
          </Alert>

          <MetricsUpdateCard submission={existingSubmission} />
        </>
      )}

      {/* Only show the project submission form if no existing submission */}
      {!existingSubmission && (
        <>
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* App Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Project Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="app-name">App Name *</Label>
                <Input
                  id="app-name"
                  placeholder="Enter your app name"
                  value={formData.app_name}
                  onChange={(e) => updateField('app_name', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => updateField('category', value)}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="problem-statement">Problem Statement *</Label>
                <Textarea
                  id="problem-statement"
                  placeholder="What problem does your app solve?"
                  value={formData.problem_statement}
                  onChange={(e) => updateField('problem_statement', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="solution-summary">Solution Summary *</Label>
                <Textarea
                  id="solution-summary"
                  placeholder="How does your app solve this problem?"
                  value={formData.solution_summary}
                  onChange={(e) => updateField('solution_summary', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="elevator-pitch">Elevator Pitch</Label>
                <Textarea
                  id="elevator-pitch"
                  placeholder="Describe your app in 30 seconds..."
                  value={formData.elevator_pitch}
                  onChange={(e) => updateField('elevator_pitch', e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Project Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="live-url" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Live URL
                </Label>
                <Input
                  id="live-url"
                  type="url"
                  placeholder="https://your-app.lovable.app"
                  value={formData.live_url}
                  onChange={(e) => updateField('live_url', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lovable-url" className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Lovable Project URL
                </Label>
                <Input
                  id="lovable-url"
                  type="url"
                  placeholder="https://lovable.dev/projects/..."
                  value={formData.lovable_url}
                  onChange={(e) => updateField('lovable_url', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="github-repo-url" className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  GitHub Repository URL *
                </Label>
                <Input
                  id="github-repo-url"
                  type="url"
                  placeholder="https://github.com/username/repo"
                  value={formData.github_repo_url}
                  onChange={(e) => updateField('github_repo_url', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Export your Lovable project to GitHub before submitting. This preserves your work after credits expire.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="demo-video" className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Demo Video URL (optional)
                </Label>
                <Input
                  id="demo-video"
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={formData.demo_video_url}
                  onChange={(e) => updateField('demo_video_url', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createSubmission.isPending}
            >
              {createSubmission.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Project
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
