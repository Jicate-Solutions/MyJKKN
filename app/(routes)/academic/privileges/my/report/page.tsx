'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import {
  useLearnerPrivilegeMemberships,
  useSubmitProgressReport,
} from '@/hooks/academic/use-privileges';
import toast from 'react-hot-toast';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Send,
  ShieldOff,
  Award,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

// ============================================================
// Renewal status display helpers
// ============================================================

function getRenewalBadge(status: string) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
          Active
        </Badge>
      );
    case 'pending_report':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
          Renewal Due
        </Badge>
      );
    case 'pending_review':
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">
          Under Review
        </Badge>
      );
    case 'paused':
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
          Paused
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">{status}</Badge>
      );
  }
}

// ============================================================
// Main page component
// ============================================================

export default function PrivilegeReportPage() {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? profile?.id ?? null;

  const {
    data: memberships,
    isLoading,
    error,
  } = useLearnerPrivilegeMemberships(learnerId);

  // Loading
  if (isLoading) {
    return (
      <ContentLayout title="Monthly Progress Report">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </ContentLayout>
    );
  }

  // Error
  if (error) {
    return (
      <ContentLayout title="Monthly Progress Report">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldOff className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Unable to Load</h3>
            <p className="text-muted-foreground">
              Something went wrong while loading your privilege data. Please try again later.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // No memberships
  if (!memberships || memberships.length === 0) {
    return (
      <ContentLayout title="Monthly Progress Report">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Privileges</h3>
            <p className="text-muted-foreground mb-4">
              You currently have no active privilege memberships.
              Progress reports are only available for active privilege holders.
            </p>
            <Link
              href="/academic/privileges/my"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to My Privileges
            </Link>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Monthly Progress Report">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back link */}
        <Link
          href="/academic/privileges/my"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Privileges
        </Link>

        {/* Render a card per membership so multi-group learners can submit for each */}
        {memberships.map((membership: any) => (
          <div key={membership.member_id} className="space-y-4">
            {/* Renewal status banner */}
            <Card className="overflow-hidden">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{membership.group_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Director Order #{membership.reference_code}
                    </p>
                  </div>
                  {getRenewalBadge(membership.renewal_status)}
                </div>
              </CardContent>
            </Card>

            {/* Content based on renewal_status */}
            <ReportContent membership={membership} />
          </div>
        ))}
      </div>
    </ContentLayout>
  );
}

// ============================================================
// Report content based on status
// ============================================================

interface MembershipInfo {
  member_id: string;
  group_id: string;
  group_name: string;
  reference_code: string;
  group_status: string;
  member_status: string;
  renewal_status: string;
  start_date: string;
  end_date: string | null;
}

function ReportContent({ membership }: { membership: MembershipInfo }) {
  const { renewal_status } = membership;

  // Paused - show warning
  if (renewal_status === 'paused') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-red-900 mb-2">
            Privilege Paused
          </h3>
          <p className="text-muted-foreground max-w-md">
            Your privilege is paused. Contact your committee for review.
            Once your standing is recognized again, you will be able to submit progress reports.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Pending review - report already submitted
  if (renewal_status === 'pending_review') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-green-900 mb-2">
            Report Submitted
          </h3>
          <p className="text-muted-foreground max-w-md">
            Your progress report has been submitted and is waiting for committee review.
            You will be notified once the review is complete.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Active or pending_report - show the form
  if (renewal_status === 'active' || renewal_status === 'pending_report') {
    return <ProgressReportForm memberId={membership.member_id} />;
  }

  // Fallback
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No action required at this time.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Progress report form
// ============================================================

function ProgressReportForm({ memberId }: { memberId: string }) {
  const [appUrl, setAppUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [description, setDescription] = useState('');

  const submitMutation = useSubmitProgressReport();

  const canSubmit =
    description.trim().length >= 10 && !submitMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (description.trim().length < 10) {
      toast.error('Please describe what you built (at least 10 characters)');
      return;
    }

    submitMutation.mutate(
      {
        member_id: memberId,
        app_url: appUrl.trim() || undefined,
        github_url: githubUrl.trim() || undefined,
        description: description.trim(),
      },
      {
        onSuccess: () => {
          setAppUrl('');
          setGithubUrl('');
          setDescription('');
          // Page will refresh via query invalidation
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Send className="h-5 w-5 text-amber-600" />
          Submit Progress Report
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Share what you built this month to keep your privilege active.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* App URL */}
          <div className="space-y-2">
            <Label htmlFor="app-url">App URL</Label>
            <Input
              id="app-url"
              type="url"
              placeholder="https://myapp.vercel.app"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Link to your deployed application.
            </p>
          </div>

          {/* GitHub URL */}
          <div className="space-y-2">
            <Label htmlFor="github-url">GitHub URL</Label>
            <Input
              id="github-url"
              type="url"
              placeholder="https://github.com/user/repo"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Link to your repository.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              What I built this month <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Describe what you worked on this month..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="resize-y"
            />
            <div className="flex justify-between">
              <p className="text-xs text-muted-foreground">
                Required. Minimum 10 characters.
              </p>
              <p
                className={`text-xs ${
                  description.trim().length < 10
                    ? 'text-muted-foreground'
                    : 'text-green-600'
                }`}
              >
                {description.trim().length} characters
              </p>
            </div>
          </div>

          {/* Screenshot */}
          <div className="space-y-2">
            <Label htmlFor="screenshot">Screenshot</Label>
            <Input
              id="screenshot"
              type="file"
              accept="image/*"
              disabled
              className="cursor-not-allowed opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Screenshot upload will be available in a future update.
            </p>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            {submitMutation.isPending ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Report
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
