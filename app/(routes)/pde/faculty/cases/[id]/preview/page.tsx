'use client';

// Preview-as-student mode. Renders the case in a student-style layout but with
// a clear "PREVIEW" banner. Coach calls may use the real provider but client-side
// MUST set `preview=true` in the coach request — server omits persistence in
// preview mode (Agent B contract).

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import { Eye, AlertCircle, ArrowLeft } from 'lucide-react';
import { useFacultyCaseDetail } from '@/hooks/pde/use-faculty-cases';
import type { ClinicalCaseQuestion } from '@/types/pde';

export default function PreviewClinicalCasePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading, error } = useFacultyCaseDetail(id);

  if (isLoading) {
    return (
      <ContentLayout title="Preview Case">
        <div className="flex justify-center p-8">
          <BeatLoader color="#0b6d41" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !data?.data) {
    return (
      <ContentLayout title="Preview Case">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error?.message || 'Case not found.'}</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const c = data.data;
  const scenario = c.case_scenario;

  return (
    <ContentLayout title="Preview Case (as student)">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Clinical Cases', href: '/pde/faculty/cases' },
          { label: c.title.slice(0, 40) + (c.title.length > 40 ? '…' : ''), href: `/pde/faculty/cases/${c.id}/edit` },
          { label: 'Preview' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription>
            <strong>Faculty preview mode.</strong> Coach replies may be live (real Gemini) but
            NOTHING is persisted — no attempt counter increment, no submission row, no engagement event.
            Use this to validate Q wording, image regions, and Socratic flow before publish.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/pde/faculty/cases/${c.id}/edit`}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to edit
              </Link>
            </Button>
            {c.status === 'published' ? (
              <Button size="sm" asChild>
                <Link href={`/pde/faculty/cases/${c.id}/assign`}>Assign to sections</Link>
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">v{c.version}</Badge>
            <Badge
              variant="outline"
              className={
                c.status === 'published'
                  ? 'text-green-600 border-green-200'
                  : 'text-muted-foreground'
              }
            >
              {c.status}
            </Badge>
          </div>
        </div>

        {/* Patient details */}
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex justify-between items-baseline">
              <h2 className="text-xl font-semibold" style={{ color: '#0b6d41' }}>
                {c.title}
              </h2>
            </div>
            {scenario ? (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">{scenario.patient_name}</span> · {scenario.age} y/o{' '}
                  {scenario.gender}
                  {scenario.occupation ? ` · ${scenario.occupation}` : ''}
                </div>
                <div>
                  <Label>Chief complaint</Label>
                  <p className="text-muted-foreground">{scenario.chief_complaint}</p>
                </div>
                <div>
                  <Label>HOPI</Label>
                  <p className="text-muted-foreground whitespace-pre-wrap">{scenario.hopi}</p>
                </div>
                {scenario.medical_history ? (
                  <div>
                    <Label>Medical history</Label>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {scenario.medical_history}
                    </p>
                  </div>
                ) : null}
                {scenario.additional_clinical_details ? (
                  <div>
                    <Label>Additional clinical details</Label>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {scenario.additional_clinical_details}
                    </p>
                  </div>
                ) : null}
                {scenario.image_url ? (
                  <div>
                    <Label>Patient image</Label>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={scenario.image_url}
                      alt="Patient"
                      className="rounded border max-w-md mt-1"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No patient scenario attached.</p>
            )}
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">Questions ({c.questions.length})</h3>
            {c.questions.map((q: ClinicalCaseQuestion) => (
              <div key={q.id} className="border rounded p-3 bg-card">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline">Q{q.metadata.q_number || q.order_index}</Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {q.question_type}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {q.metadata.osce_domain}
                  </Badge>
                </div>
                <p className="font-medium mb-2">{q.question_text}</p>

                {q.question_type === 'mcq_warmup' && q.options ? (
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {q.options.map((opt, i) => (
                      <li key={i}>
                        ◯ {opt.text}
                        {opt.is_correct ? (
                          <span className="ml-2 text-green-600 text-xs">(correct)</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {q.question_type === 'image_tag' && q.question_media_url ? (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={q.question_media_url}
                      alt="Question image"
                      className="rounded border max-w-md"
                    />
                    {q.expected_regions && q.expected_regions.length > 0 ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {q.expected_regions.length} expected region
                        {q.expected_regions.length === 1 ? '' : 's'}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Show ground truth + key concepts (preview-only)
                  </summary>
                  <div className="mt-1 space-y-1">
                    <p>
                      <strong>Ground truth:</strong> {q.metadata.ground_truth}
                    </p>
                    {q.metadata.key_concepts?.length ? (
                      <ul className="list-disc pl-5">
                        {q.metadata.key_concepts.map((k, i) => (
                          <li key={i}>{k}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </details>
              </div>
            ))}
          </CardContent>
        </Card>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Note:</strong> The full interactive student experience (Socratic coach loop,
            attempt counter, OSCE scoring) lives in <code>/pde/learn/cases/[caseSlug]</code> and is
            owned by Agent C. This preview shows the static case content; for full interactive
            preview, switch to draft state and self-enroll in the cohort.
          </AlertDescription>
        </Alert>
      </div>
    </ContentLayout>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground uppercase mt-2">{children}</p>;
}
