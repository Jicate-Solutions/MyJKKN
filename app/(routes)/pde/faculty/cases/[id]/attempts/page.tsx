'use client';

// Cohort analytics — aggregate view + per-student row drill.

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BeatLoader } from 'react-spinners';
import { AlertCircle, Users, TrendingUp, CheckCircle2, BarChart3 } from 'lucide-react';
import {
  useFacultyCaseCohort,
  useFacultyCaseDetail,
} from '@/hooks/pde/use-faculty-cases';
import { GrantAttemptsDialog } from '../../_components/GrantAttemptsDialog';

const OSCE_DOMAIN_LABELS: Record<string, string> = {
  data_gathering: 'Data Gathering',
  hypothesis_generation: 'Hypothesis',
  management_planning: 'Mgmt Plan',
  patient_communication: 'Communication',
  professionalism: 'Professionalism',
};

export default function ClinicalCaseCohortPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: detail } = useFacultyCaseDetail(id);
  const { data: cohort, isLoading, error } = useFacultyCaseCohort(id);
  const [grantOpen, setGrantOpen] = useState<{
    learnerId: string;
    learnerName: string;
    attemptsUsed: number;
  } | null>(null);

  if (isLoading) {
    return (
      <ContentLayout title="Cohort Analytics">
        <div className="flex justify-center p-8">
          <BeatLoader color="#0b6d41" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !cohort?.data) {
    return (
      <ContentLayout title="Cohort Analytics">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'Cohort data not available yet.'}
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const data = cohort.data;
  const c = detail?.data;
  const HARD_CAP = 5;

  return (
    <ContentLayout title="Cohort Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Clinical Cases', href: '/pde/faculty/cases' },
          { label: c?.title?.slice(0, 36) || data.case_title, href: `/pde/faculty/cases/${id}/edit` },
          { label: 'Cohort' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
            {data.case_title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Cohort performance · {data.unique_learners} learners ·{' '}
            {data.total_attempts} total attempts
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Learners</p>
                <p className="text-xl font-semibold">{data.unique_learners}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Attempts</p>
                <p className="text-xl font-semibold">{data.total_attempts}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Average Score</p>
                <p className="text-xl font-semibold">
                  {data.average_score === null ? '–' : `${data.average_score.toFixed(1)}%`}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Pass Rate</p>
                <p className="text-xl font-semibold">
                  {data.pass_rate === null ? '–' : `${data.pass_rate.toFixed(0)}%`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Per-domain averages */}
        {data.per_domain_average ? (
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold mb-3">Per-domain cohort averages</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(data.per_domain_average).map(([k, v]) => (
                  <div key={k} className="text-center">
                    <p className="text-xs text-muted-foreground">{OSCE_DOMAIN_LABELS[k] || k}</p>
                    <p className="text-lg font-semibold">{(v as number).toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Attempt distribution */}
        {data.attempt_distribution.length > 0 ? (
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold mb-3">Attempt distribution</h2>
              <div className="flex gap-3 flex-wrap">
                {data.attempt_distribution.map((d) => (
                  <Badge key={d.attempt_number} variant="outline">
                    Attempt {d.attempt_number}: {d.count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Students */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold">Students</h2>
            </div>
            {data.students.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No attempts yet on this case.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Roll No.</TableHead>
                    <TableHead className="text-center">Attempts</TableHead>
                    <TableHead className="text-center">Best Score</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.students.map((s) => {
                    const capReached = s.attempts_used >= HARD_CAP + s.granted_extra;
                    return (
                      <TableRow key={s.learner_id}>
                        <TableCell className="font-medium">{s.learner_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.roll_number || '–'}
                        </TableCell>
                        <TableCell className="text-center">
                          {s.attempts_used} / {HARD_CAP}
                          {s.granted_extra > 0 ? (
                            <span className="ml-1 text-xs text-orange-600">
                              (+{s.granted_extra})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-center">
                          {s.best_score !== null ? `${s.best_score.toFixed(0)}%` : '–'}
                        </TableCell>
                        <TableCell className="text-center">
                          {s.passed === true ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-200">
                              Passed
                            </Badge>
                          ) : s.passed === false ? (
                            <Badge variant="secondary">In progress</Badge>
                          ) : (
                            <Badge variant="outline">Started</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/pde/faculty/cases/${id}/attempts/${s.learner_id}`}>
                              View transcript
                            </Link>
                          </Button>
                          {capReached ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setGrantOpen({
                                  learnerId: s.learner_id,
                                  learnerName: s.learner_name,
                                  attemptsUsed: s.attempts_used,
                                })
                              }
                              className="text-orange-600"
                            >
                              Grant attempts
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {grantOpen && slug ? (
        <GrantAttemptsDialog
          open={!!grantOpen}
          onClose={() => setGrantOpen(null)}
          caseId={slug}
          caseTitle={data.case_title}
          learnerId={grantOpen.learnerId}
          learnerName={grantOpen.learnerName}
          attemptsUsed={grantOpen.attemptsUsed}
          hardCap={HARD_CAP}
        />
      ) : null}
    </ContentLayout>
  );
}
