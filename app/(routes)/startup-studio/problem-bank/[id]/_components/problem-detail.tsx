'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Lightbulb,
  Plus,
  Tag,
  Target,
  Users,
  AlertTriangle,
  Wrench,
  Star,
  FileText,
} from 'lucide-react';
import {
  useProblem,
  useAddAttempt,
  useAddTag,
  useAddScore,
} from '@/hooks/startup-studio';

interface ProblemDetailProps {
  id: string;
}

const THEME_COLORS: Record<string, string> = {
  healthcare: 'bg-red-100 text-red-800',
  education: 'bg-blue-100 text-blue-800',
  agriculture: 'bg-green-100 text-green-800',
  environment: 'bg-emerald-100 text-emerald-800',
  community: 'bg-pink-100 text-pink-800',
  operations: 'bg-amber-100 text-amber-800',
  productivity: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  claimed: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  solved: 'bg-purple-100 text-purple-800',
  archived: 'bg-gray-100 text-gray-800',
};

export function ProblemDetail({ id }: ProblemDetailProps) {
  const { data: problemRaw, isLoading, error } = useProblem(id);
  const addAttempt = useAddAttempt();
  const addTag = useAddTag();
  const addScore = useAddScore();

  const [showAddAttempt, setShowAddAttempt] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [attemptData, setAttemptData] = useState({ approach: '', outcome: '' });
  const [tagData, setTagData] = useState({ label: '' });

  const problem = problemRaw as any;

  const handleAddAttempt = async () => {
    if (!attemptData.approach) return;
    await addAttempt.mutateAsync({ id, data: attemptData });
    setAttemptData({ approach: '', outcome: '' });
    setShowAddAttempt(false);
  };

  const handleAddTag = async () => {
    if (!tagData.label) return;
    await addTag.mutateAsync({ id, data: tagData });
    setTagData({ label: '' });
    setShowAddTag(false);
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
            Failed to load problem details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/problem-bank">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Problem Bank
          </Link>
        </Button>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Problem not found.</p>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/problem-bank">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Problem Bank
          </Link>
        </Button>
      </div>
    );
  }

  const attempts = problem.attempts ?? [];
  const tags = problem.tags ?? [];
  const scores = problem.scores ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold py-1">{problem.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {problem.theme && (
              <Badge
                variant="outline"
                className={THEME_COLORS[problem.theme] ?? 'bg-gray-100 text-gray-800'}
              >
                {problem.theme}
              </Badge>
            )}
            {problem.status && (
              <Badge
                variant="outline"
                className={STATUS_COLORS[problem.status] ?? 'bg-gray-100 text-gray-800'}
              >
                {problem.status.replace('_', ' ')}
              </Badge>
            )}
            {problem.severity_rating != null && (
              <Badge variant="outline">
                Severity: {problem.severity_rating}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/problem-bank">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {/* Problem Statement */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-600" />
            Problem Statement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base">{problem.problem_statement ?? problem.statement ?? 'No description provided.'}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {problem.who_affected && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Who is Affected
                  </p>
                </div>
                <p className="text-base">{problem.who_affected}</p>
              </div>
            )}
            {problem.current_workaround && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Current Workaround
                  </p>
                </div>
                <p className="text-base">{problem.current_workaround}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recommended Tools */}
      {problem.recommended_tools && problem.recommended_tools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-teal-600" />
              Recommended Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {problem.recommended_tools.map((tool: string) => (
                <Badge key={tool} variant="outline" className="border-teal-300 text-teal-800">
                  {tool}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-blue-600" />
              Tags
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddTag(!showAddTag)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Tag
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddTag && (
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Tag label..."
                value={tagData.label}
                onChange={(e) =>
                  setTagData({ label: e.target.value })
                }
                className="max-w-xs"
              />
              <Button
                size="sm"
                onClick={handleAddTag}
                disabled={addTag.isPending || !tagData.label}
              >
                {addTag.isPending ? 'Adding...' : 'Add'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddTag(false)}
              >
                Cancel
              </Button>
            </div>
          )}
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag: any) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.label ?? tag.name ?? tag.tag}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tags added yet</p>
          )}
        </CardContent>
      </Card>

      {/* Attempts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-600" />
              Attempts ({attempts.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddAttempt(!showAddAttempt)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Attempt
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddAttempt && (
            <div className="space-y-3 mb-4 p-4 border rounded-lg">
              <div className="space-y-2">
                <label className="text-sm font-medium">Approach</label>
                <Input
                  placeholder="Describe the approach..."
                  value={attemptData.approach}
                  onChange={(e) =>
                    setAttemptData({ ...attemptData, approach: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Outcome</label>
                <Input
                  placeholder="What was the outcome?"
                  value={attemptData.outcome}
                  onChange={(e) =>
                    setAttemptData({ ...attemptData, outcome: e.target.value })
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddAttempt}
                  disabled={addAttempt.isPending || !attemptData.approach}
                >
                  {addAttempt.isPending ? 'Adding...' : 'Add Attempt'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddAttempt(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {attempts.length > 0 ? (
            <div className="space-y-3">
              {attempts.map((attempt: any, index: number) => (
                <div
                  key={attempt.id ?? index}
                  className="p-3 border rounded-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{attempt.approach ?? attempt.title}</p>
                      {attempt.outcome && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {attempt.outcome}
                        </p>
                      )}
                    </div>
                    {attempt.created_at && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(attempt.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No attempts recorded yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Scores */}
      {scores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-600" />
              Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Criteria</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scores.map((score: any, index: number) => (
                  <TableRow key={score.id ?? index}>
                    <TableCell className="font-medium">
                      {score.criteria ?? score.dimension ?? `Criteria ${index + 1}`}
                    </TableCell>
                    <TableCell>{score.score ?? score.value ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {score.notes ?? '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
