'use client';

export const dynamic = 'force-dynamic';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGDPISessionDetail, useGDPIMutations } from '@/hooks/admission/use-gdpi';
import type { GDPIRecommendation, GDPICandidate } from '@/types/admission';

const RECOMMENDATION_OPTIONS: { value: GDPIRecommendation; label: string; color: string }[] = [
  { value: 'strongly_recommend', label: 'Strongly Recommend', color: 'bg-green-100 text-green-800' },
  { value: 'recommend', label: 'Recommend', color: 'bg-blue-100 text-blue-800' },
  { value: 'consider', label: 'Consider', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'not_recommend', label: 'Not Recommend', color: 'bg-red-100 text-red-800' },
];

function EvaluateContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { session, isLoading } = useGDPISessionDetail(id);
  const { submitScore } = useGDPIMutations();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState<GDPIRecommendation | ''>('');
  const [feedback, setFeedback] = useState('');

  if (isLoading) {
    return (
      <ContentLayout title="Evaluate">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!session) {
    return (
      <ContentLayout title="Evaluate">
        <p className="text-center py-12 text-muted-foreground">Session not found.</p>
      </ContentLayout>
    );
  }

  // Filter present candidates only
  const presentCandidates = (session.candidates || []).filter(
    (c: GDPICandidate) => c.status === 'present' || c.status === 'evaluated'
  );

  if (presentCandidates.length === 0) {
    return (
      <ContentLayout title="Evaluate">
        <div className="text-center py-12 text-muted-foreground">
          <p>No present candidates to evaluate. Mark attendance first.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push(`/admission/gd-pi/${id}`)}>
            Back to Session
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const currentCandidate = presentCandidates[currentIndex];
  const criteria = session.scoring_criteria || [];
  const maxPossible = criteria.reduce((sum, c) => sum + c.max_score, 0);
  const currentTotal = Object.values(scores).reduce((sum, s) => sum + s, 0);

  const resetForm = () => {
    setScores({});
    setRecommendation('');
    setFeedback('');
  };

  const handleSubmit = async () => {
    if (Object.keys(scores).length === 0) return;

    await submitScore.mutateAsync({
      sessionId: id,
      candidate_id: currentCandidate.id,
      scores,
      recommendation: recommendation || undefined,
      feedback: feedback || undefined,
    });

    // Move to next candidate
    if (currentIndex < presentCandidates.length - 1) {
      setCurrentIndex((i) => i + 1);
      resetForm();
    }
  };

  const goTo = (index: number) => {
    setCurrentIndex(index);
    resetForm();
  };

  return (
    <PermissionGuard module="admission" action="edit">
      <ContentLayout title="Evaluate Candidates">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/gd-pi">GD-PI</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/admission/gd-pi/${id}`}>{session.session_name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Evaluate</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/admission/gd-pi/${id}`)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Session
            </Button>
          </div>

          {/* Candidate Navigator */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Candidate {currentIndex + 1} of {presentCandidates.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= presentCandidates.length - 1}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Candidate Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{currentCandidate.lead?.full_name || 'Unknown Candidate'}</span>
                <Badge variant="outline">Lead Score: {currentCandidate.lead?.score || 0}</Badge>
              </CardTitle>
              <CardDescription>
                {currentCandidate.lead?.phone} • {currentCandidate.lead?.email || 'No email'} •
                Source: {currentCandidate.lead?.source || 'Unknown'}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Scoring Form */}
          <Card>
            <CardHeader>
              <CardTitle>Score Card</CardTitle>
              <CardDescription>
                Total: {currentTotal} / {maxPossible}
                {maxPossible > 0 && (
                  <span className="ml-2">({((currentTotal / maxPossible) * 100).toFixed(1)}%)</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {criteria.map((criterion) => (
                <div key={criterion.name} className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">{criterion.name}</Label>
                    <p className="text-xs text-muted-foreground">Weight: {criterion.weight}%</p>
                  </div>
                  <div className="w-32 flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={criterion.max_score}
                      value={scores[criterion.name] ?? ''}
                      onChange={(e) => {
                        const val = Math.min(criterion.max_score, Math.max(0, parseInt(e.target.value) || 0));
                        setScores((prev) => ({ ...prev, [criterion.name]: val }));
                      }}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">/ {criterion.max_score}</span>
                  </div>
                </div>
              ))}

              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Recommendation</Label>
                  <Select value={recommendation} onValueChange={(v) => setRecommendation(v as GDPIRecommendation)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select recommendation..." />
                    </SelectTrigger>
                    <SelectContent>
                      {RECOMMENDATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Feedback / Notes</Label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Optional feedback for this candidate..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={submitScore.isPending || Object.keys(scores).length === 0}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {submitScore.isPending ? 'Submitting...' : 'Submit Score'}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function EvaluatePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AdmissionErrorBoundary>
      <EvaluateContent params={params} />
    </AdmissionErrorBoundary>
  );
}
