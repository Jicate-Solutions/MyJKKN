'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  ArrowLeft,
  Send,
  FileCode,
  Users,
  Globe,
  Github,
  Star,
  Lightbulb,
  ExternalLink,
  Gavel,
  Pencil,
  IndianRupee,
  TrendingUp,
  ImageIcon,
} from 'lucide-react';
import { useSubmission, useSubmitForReview } from '@/hooks/startup-studio';
import { useAuth } from '@/hooks/use-auth';
import { ScoringForm } from './scoring-form';
import { calculateScore, getTierColor } from '@/lib/utils/tier-calculator';

interface SubmissionDetailProps {
  id: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-amber-100 text-amber-800',
  shortlisted: 'bg-purple-100 text-purple-800',
  winner: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

/** Admin/judge roles that can score submissions */
const JUDGE_ELIGIBLE_ROLES = ['admin', 'super_admin', 'staff', 'administrator'];

export function SubmissionDetail({ id }: SubmissionDetailProps) {
  const { data: submissionRaw, isLoading, error } = useSubmission(id);
  const submitForReview = useSubmitForReview();
  const { profile } = useAuth();
  const [showScoringForm, setShowScoringForm] = useState(false);

  const submission = submissionRaw as any;

  const handleSubmitForReview = async () => {
    await submitForReview.mutateAsync({ id });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load submission details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/submissions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Submissions
          </Link>
        </Button>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Submission not found.</p>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/submissions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Submissions
          </Link>
        </Button>
      </div>
    );
  }

  const scores = submission.scores ?? [];
  const canSubmitForReview =
    submission.status === 'draft' || !submission.status;

  // Determine if current user can judge this submission
  const isAdminRole = profile?.role
    ? JUDGE_ELIGIBLE_ROLES.includes(profile.role)
    : false;

  // Check if user already scored this submission
  const existingUserScore = useMemo(() => {
    if (!profile?.id || !scores.length) return null;
    return scores.find(
      (s: any) => s.judge_id === profile.id || s.judge?.id === profile.id
    ) ?? null;
  }, [profile?.id, scores]);

  // User can judge if they are admin/super_admin OR if they have an existing score (meaning they were assigned as a judge)
  const canJudge = isAdminRole || !!existingUserScore;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold py-1">
            {submission.app_name ?? submission.name ?? 'Untitled Submission'}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            {submission.status && (
              <Badge
                variant="outline"
                className={
                  STATUS_COLORS[submission.status] ??
                  'bg-gray-100 text-gray-800'
                }
              >
                {submission.status.replace('_', ' ')}
              </Badge>
            )}
            {(submission.total_score ?? submission.score) && (
              <Badge variant="outline">
                <Star className="h-3 w-3 mr-1" />
                Score: {submission.total_score ?? submission.score}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/startup-studio/submissions">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          {canSubmitForReview && (
            <Button
              onClick={handleSubmitForReview}
              disabled={submitForReview.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {submitForReview.isPending
                ? 'Submitting...'
                : 'Submit for Review'}
            </Button>
          )}
        </div>
      </div>

      {/* App Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-blue-600" />
            App Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                App Name
              </p>
              <p className="text-base">
                {submission.app_name ?? submission.name ?? '-'}
              </p>
            </div>
            {submission.event?.name && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Event
                </p>
                <p className="text-base">{submission.event.name}</p>
              </div>
            )}
            {submission.submitted_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Submitted At
                </p>
                <p className="text-base">
                  {new Date(submission.submitted_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Problem & Solution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-600" />
            Problem & Solution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {submission.problem_statement && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Problem Statement
              </p>
              <p className="text-base">{submission.problem_statement}</p>
            </div>
          )}
          {submission.solution_summary && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Solution Summary
              </p>
              <p className="text-base">{submission.solution_summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* URLs */}
      {(submission.live_url || submission.lovable_url || submission.github_repo_url || submission.demo_video_url) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-green-600" />
              Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {submission.live_url && (
                <a
                  href={submission.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Globe className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">Live App</span>
                  <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                </a>
              )}
              {submission.lovable_url && (
                <a
                  href={submission.lovable_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Github className="h-4 w-4" />
                  <span className="text-sm font-medium">Lovable Project</span>
                  <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                </a>
              )}
              {submission.github_repo_url && (
                <a
                  href={submission.github_repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Github className="h-4 w-4 text-gray-900" />
                  <span className="text-sm font-medium">GitHub Repo</span>
                  <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                </a>
              )}
              {submission.demo_video_url && (
                <a
                  href={submission.demo_video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <ExternalLink className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium">Demo Video</span>
                  <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier & Revenue Metrics */}
      {(() => {
        const scoring = calculateScore(submission);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Score & Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Tier badge + total score */}
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${getTierColor(scoring.tier.level)}`}>
                  Level {scoring.tier.level}: {scoring.tier.label}
                </span>
                <span className="text-2xl font-bold text-green-700">{scoring.totalScore} pts</span>
                {scoring.mrrBonus > 0 && (
                  <span className="text-sm text-muted-foreground">(tier {scoring.tier.points} + MRR bonus {scoring.mrrBonus})</span>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">MRR</p>
                  <p className="text-2xl font-bold text-green-700">
                    {new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      maximumFractionDigits: 0,
                    }).format(submission.mrr_amount ?? 0)}
                  </p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Paying Users</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {submission.paying_users_count ?? 0}
                  </p>
                </div>
                <div className="text-center p-4 bg-indigo-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Users</p>
                  <p className="text-2xl font-bold text-indigo-700">
                    {submission.total_users ?? 0}
                  </p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Active Users</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {submission.active_users ?? 0}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Last Updated</p>
                  <p className="text-sm font-medium">
                    {submission.metrics_updated_at
                      ? new Date(submission.metrics_updated_at).toLocaleString('en-IN')
                      : 'Not yet submitted'}
                  </p>
                </div>
              </div>
          {submission.proof_urls && submission.proof_urls.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <ImageIcon className="h-4 w-4" />
                Proof of Revenue ({submission.proof_urls.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {submission.proof_urls.map((url: string, index: number) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-md hover:bg-muted/50 transition-colors text-blue-600"
                  >
                    <ImageIcon className="h-3 w-3" />
                    Screenshot {index + 1}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Team Info */}
      {(submission.team_name || submission.team_members) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-600" />
              Team Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {submission.team_name && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Team Name
                </p>
                <p className="text-base">{submission.team_name}</p>
              </div>
            )}
            {submission.team_members && Array.isArray(submission.team_members) && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Members
                </p>
                <div className="flex flex-wrap gap-2">
                  {submission.team_members.map((member: any, index: number) => (
                    <Badge key={index} variant="secondary">
                      {typeof member === 'string' ? member : member.name ?? `Member ${index + 1}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Judge Scores */}
      {scores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-600" />
              Judge Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judge</TableHead>
                    <TableHead className="text-center">Real Problem (25%)</TableHead>
                    <TableHead className="text-center">Working App (25%)</TableHead>
                    <TableHead className="text-center">User Tested (20%)</TableHead>
                    <TableHead className="text-center">Completeness (15%)</TableHead>
                    <TableHead className="text-center">Presentation (15%)</TableHead>
                    <TableHead className="text-right">Weighted Total</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((score: any, index: number) => (
                    <TableRow key={score.id ?? index}>
                      <TableCell className="font-medium">
                        {score.judge?.full_name ?? score.judge_name ?? `Judge ${index + 1}`}
                      </TableCell>
                      <TableCell className="text-center">
                        {score.real_problem ?? '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {score.working_app ?? '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {score.user_tested ?? '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {score.completeness ?? '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {score.presentation ?? '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {score.weighted_score ?? score.total_score ?? '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {score.notes ?? '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Judge This Submission - only visible to admins and assigned judges */}
      {canJudge && profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-indigo-600" />
              Judge This Submission
            </CardTitle>
          </CardHeader>
          <CardContent>
            {existingUserScore && !showScoringForm ? (
              <div className="space-y-4">
                <Alert>
                  <Star className="h-4 w-4" />
                  <AlertDescription>
                    You have already scored this submission. Weighted total:{' '}
                    <span className="font-bold">
                      {existingUserScore.weighted_score ?? existingUserScore.total_score ?? '-'}
                    </span>
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-5 gap-3 text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Real Problem</p>
                    <p className="font-semibold text-lg">{existingUserScore.real_problem ?? '-'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Working App</p>
                    <p className="font-semibold text-lg">{existingUserScore.working_app ?? '-'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">User Tested</p>
                    <p className="font-semibold text-lg">{existingUserScore.user_tested ?? '-'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Completeness</p>
                    <p className="font-semibold text-lg">{existingUserScore.completeness ?? '-'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-xs">Presentation</p>
                    <p className="font-semibold text-lg">{existingUserScore.presentation ?? '-'}</p>
                  </div>
                </div>
                {(existingUserScore.strengths || existingUserScore.improvements || existingUserScore.notes) && (
                  <>
                    <Separator />
                    <div className="space-y-2 text-sm">
                      {existingUserScore.strengths && (
                        <div>
                          <p className="text-muted-foreground font-medium">Strengths</p>
                          <p>{existingUserScore.strengths}</p>
                        </div>
                      )}
                      {existingUserScore.improvements && (
                        <div>
                          <p className="text-muted-foreground font-medium">Areas for Improvement</p>
                          <p>{existingUserScore.improvements}</p>
                        </div>
                      )}
                      {existingUserScore.notes && (
                        <div>
                          <p className="text-muted-foreground font-medium">Notes</p>
                          <p>{existingUserScore.notes}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowScoringForm(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Update Score
                </Button>
              </div>
            ) : (
              <ScoringForm
                submissionId={id}
                judgeId={profile.id}
                existingScore={
                  existingUserScore
                    ? {
                        id: existingUserScore.id,
                        real_problem: existingUserScore.real_problem,
                        working_app: existingUserScore.working_app,
                        user_tested: existingUserScore.user_tested,
                        completeness: existingUserScore.completeness,
                        presentation: existingUserScore.presentation,
                        notes: existingUserScore.notes,
                        strengths: existingUserScore.strengths,
                        improvements: existingUserScore.improvements,
                      }
                    : undefined
                }
                onSuccess={() => setShowScoringForm(false)}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
