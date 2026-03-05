'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
} from 'lucide-react';
import { useSubmission, useSubmitForReview } from '@/hooks/startup-studio';

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

export function SubmissionDetail({ id }: SubmissionDetailProps) {
  const { data: submissionRaw, isLoading, error } = useSubmission(id);
  const submitForReview = useSubmitForReview();

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
    </div>
  );
}
