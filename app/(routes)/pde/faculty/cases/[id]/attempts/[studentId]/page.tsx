'use client';

// Per-student transcript drill — every attempt, every Q, every answer, every AI reply,
// per-domain scores. Includes Grant Attempts action.

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BeatLoader } from 'react-spinners';
import { AlertCircle, MessageSquareText, Award, Plus } from 'lucide-react';
import {
  useFacultyCaseDetail,
  useFacultyCaseTranscript,
} from '@/hooks/pde/use-faculty-cases';
import { GrantAttemptsDialog } from '../../../_components/GrantAttemptsDialog';

const OSCE_DOMAIN_LABELS: Record<string, string> = {
  data_gathering: 'Data Gathering',
  hypothesis_generation: 'Hypothesis Gen.',
  management_planning: 'Mgmt Planning',
  patient_communication: 'Patient Comm.',
  professionalism: 'Professionalism',
};

export default function FacultyTranscriptDrillPage() {
  const params = useParams<{ id: string; studentId: string }>();
  const id = params?.id;
  const studentId = params?.studentId;
  const { data: detail } = useFacultyCaseDetail(id);
  const { data, isLoading, error } = useFacultyCaseTranscript(id, studentId);
  const [grantOpen, setGrantOpen] = useState(false);

  if (isLoading) {
    return (
      <ContentLayout title="Student Transcript">
        <div className="flex justify-center p-8">
          <BeatLoader color="#0b6d41" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !data?.data) {
    return (
      <ContentLayout title="Student Transcript">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error?.message || 'Transcript unavailable.'}</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const transcripts = data.data;
  const c = detail?.data;
  const learnerName = transcripts[0]?.learner_name || 'Student';
  const rollNumber = transcripts[0]?.learner_roll_number;
  const attemptsUsed = transcripts.length;

  return (
    <ContentLayout title={`Transcript — ${learnerName}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Clinical Cases', href: '/pde/faculty/cases' },
          {
            label: c?.title?.slice(0, 36) || 'Case',
            href: `/pde/faculty/cases/${id}/edit`,
          },
          { label: 'Cohort', href: `/pde/faculty/cases/${id}/attempts` },
          { label: learnerName },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
              {learnerName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {rollNumber ? `Roll ${rollNumber} · ` : ''}
              {attemptsUsed} attempt{attemptsUsed === 1 ? '' : 's'} on{' '}
              <em>{c?.title}</em>
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setGrantOpen(true)}
            className="text-orange-600 hover:text-orange-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Grant attempts
          </Button>
        </div>

        {transcripts.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This student has not attempted the case yet.
            </AlertDescription>
          </Alert>
        ) : null}

        {transcripts.map((t) => (
          <Card key={t.submission_id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-baseline flex-wrap gap-2">
                <div className="flex gap-2 flex-wrap items-baseline">
                  <h3 className="text-lg font-semibold">Attempt #{t.attempt_number}</h3>
                  <Badge variant="outline">v{t.assessment_version}</Badge>
                  {t.passed === true ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-200">
                      Passed
                    </Badge>
                  ) : t.passed === false ? (
                    <Badge variant="secondary">Did not pass</Badge>
                  ) : (
                    <Badge variant="outline">In progress</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {t.final_score !== null ? (
                    <span className="flex items-center gap-1">
                      <Award className="h-4 w-4" />
                      {t.final_score.toFixed(0)}%
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">
                    Started {new Date(t.started_at).toLocaleString()}
                    {t.completed_at
                      ? ` · Completed ${new Date(t.completed_at).toLocaleString()}`
                      : ''}
                  </span>
                </div>
              </div>

              {/* Per-domain scores */}
              {t.per_domain_scores && Object.keys(t.per_domain_scores).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 border rounded p-2 bg-muted/20">
                  {Object.entries(t.per_domain_scores).map(([k, v]) => (
                    <div key={k} className="text-center">
                      <p className="text-[10px] text-muted-foreground">
                        {OSCE_DOMAIN_LABELS[k] || k}
                      </p>
                      <p className="text-sm font-semibold">{v.toFixed(0)}%</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Q&A walk-through */}
              {t.answers.map((a) => (
                <div key={a.question_id} className="border rounded p-3 space-y-2 bg-card">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">Q{a.question_order}</Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {a.question_type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {OSCE_DOMAIN_LABELS[a.osce_domain] || a.osce_domain}
                    </Badge>
                    {a.domain_score !== null && a.domain_score !== undefined ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        domain: {a.domain_score.toFixed(0)}%
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium">{a.question_text}</p>

                  <div className="rounded bg-muted/40 p-2 text-sm">
                    <p className="text-[11px] uppercase text-muted-foreground mb-1">
                      Student answer
                    </p>
                    <p className="whitespace-pre-wrap">{a.learner_answer || '(no answer)'}</p>
                  </div>

                  {a.ai_feedback ? (
                    <div className="rounded bg-[#fbfbee] dark:bg-muted/20 p-2 text-sm border border-yellow-200/40">
                      <p className="text-[11px] uppercase text-muted-foreground mb-1 flex items-center gap-1">
                        <MessageSquareText className="h-3 w-3" /> AI coach feedback
                      </p>
                      <p className="whitespace-pre-wrap">{a.ai_feedback}</p>
                    </div>
                  ) : null}
                </div>
              ))}

              {t.answers.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No answers recorded for this attempt.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {slug && studentId ? (
        <GrantAttemptsDialog
          open={grantOpen}
          onClose={() => setGrantOpen(false)}
          caseId={slug}
          caseTitle={c?.title || 'Case'}
          learnerId={studentId}
          learnerName={learnerName}
          attemptsUsed={attemptsUsed}
        />
      ) : null}
    </ContentLayout>
  );
}
