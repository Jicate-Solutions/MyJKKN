'use client';

// Turn a clinical case into a printable written exam: a question paper, a
// faculty-only answer key, and an OSCE competency rubric.
//
// The page is read-only over the case — nothing here edits the case or its
// questions. The marks total is chosen per export (70 for Oral Medicine &
// Radiology; other departments set their own), and the preview below shows the
// balance BEFORE anything is printed, because a paper whose questions do not
// add up to its stated total is the kind of mistake that is only noticed after
// the photocopying.
//
// Route permission: '/pde/faculty/cases/[id]/export' → 'pde.faculty.view',
// the same key as the rest of the case-authoring pages. The API enforces it
// again server-side and answers with an explicit error, never a redirect.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BeatLoader } from 'react-spinners';
import { AlertCircle, ArrowLeft, Download, FileText, KeyRound, Target } from 'lucide-react';
import { useFacultyCaseDetail } from '@/hooks/pde/use-faculty-cases';
import {
  DEFAULT_MEQ_TOTAL_MARKS,
  buildMeqPaperModel,
  meqFileName,
  type MeqDocumentKind,
} from '@/lib/pde/meq-export';

const DOCUMENTS: Array<{
  kind: MeqDocumentKind;
  title: string;
  blurb: string;
  icon: typeof FileText;
  facultyOnly: boolean;
}> = [
  {
    kind: 'paper',
    title: 'Question paper',
    blurb: 'Every question in order with its marks and the paper total. This is the sheet learners sit.',
    icon: FileText,
    facultyOnly: false,
  },
  {
    kind: 'answer-key',
    title: 'Answer key',
    blurb: 'Model answer and key concepts for each question. Faculty copy — never issued to learners.',
    icon: KeyRound,
    facultyOnly: true,
  },
  {
    kind: 'rubric',
    title: 'Competency rubric',
    blurb: "Marks grouped by OSCE domain against this case's configured weights.",
    icon: Target,
    facultyOnly: false,
  },
];

export default function ExportClinicalCasePaperPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading, error } = useFacultyCaseDetail(id);

  const [totalMarksInput, setTotalMarksInput] = useState(String(DEFAULT_MEQ_TOTAL_MARKS));
  const [downloading, setDownloading] = useState<MeqDocumentKind | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const parsedTotal = Number(totalMarksInput);
  const totalMarksValid =
    Number.isFinite(parsedTotal) && parsedTotal >= 1 && parsedTotal <= 1000;

  const clinicalCase = data?.data;

  const model = useMemo(() => {
    if (!clinicalCase) return null;
    return buildMeqPaperModel(clinicalCase, {
      totalMarks: totalMarksValid ? parsedTotal : DEFAULT_MEQ_TOTAL_MARKS,
    });
  }, [clinicalCase, parsedTotal, totalMarksValid]);

  async function handleDownload(kind: MeqDocumentKind) {
    if (!id || !model) return;
    setDownloading(kind);
    setDownloadError(null);
    try {
      const res = await fetch(
        `/api/pde/cases/${id}/meq-export?document=${kind}&totalMarks=${model.declaredTotalMarks}`
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = text || `Export failed (${res.status}).`;
        try {
          message = JSON.parse(text)?.error || message;
        } catch {
          /* keep the raw text */
        }
        setDownloadError(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meqFileName(model, kind);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setDownloadError(e?.message || 'Could not download the document.');
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading) {
    return (
      <ContentLayout title="Export Question Paper">
        <div className="flex justify-center p-8">
          <BeatLoader color="#0b6d41" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !clinicalCase || !model) {
    return (
      <ContentLayout title="Export Question Paper">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message ||
              'That clinical case could not be opened. It may not exist, or it may not be in your institution.'}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/pde/faculty/cases">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to clinical cases
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const noQuestions = model.questions.length === 0;

  return (
    <ContentLayout title="Export Question Paper">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Clinical Cases', href: '/pde/faculty/cases' },
          {
            label: model.caseTitle.slice(0, 40) + (model.caseTitle.length > 40 ? '…' : ''),
            href: `/pde/faculty/cases/${model.caseId}/edit`,
          },
          { label: 'Export' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#0b6d41]">{model.caseTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {[model.courseCode, model.courseName].filter(Boolean).join(' — ') || 'No cohort set'}
              {' · '}v{model.version} · {model.status}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/pde/faculty/cases/${model.caseId}/edit`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to case
            </Link>
          </Button>
        </div>

        {noQuestions ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This case has no questions yet, so there is nothing to put on a paper. Add questions to the
              case first.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* ── Paper total ─────────────────────────────────────────────── */}
        <Card className="bg-[#fbfbee]/40 dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paper total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full sm:w-48">
                <Label htmlFor="meq-total-marks">This paper is out of</Label>
                <Input
                  id="meq-total-marks"
                  type="number"
                  min={1}
                  max={1000}
                  value={totalMarksInput}
                  onChange={(e) => setTotalMarksInput(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="text-sm text-muted-foreground sm:pb-2">
                The questions on this case carry{' '}
                <span className="font-semibold text-foreground">{model.questionMarksTotal}</span> marks in
                total.
              </div>
            </div>

            {!totalMarksValid ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Enter a paper total between 1 and 1000. Using {DEFAULT_MEQ_TOTAL_MARKS} until you do.
                </AlertDescription>
              </Alert>
            ) : model.marksWarning ? (
              <Alert className="border-[#ffde59] bg-[#ffde59]/20">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{model.marksWarning}</AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm text-[#0b6d41]">
                The question marks add up to the paper total. Pass mark is {model.passMarks} (
                {model.passThreshold}%).
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Competency preview ──────────────────────────────────────── */}
        <Card className="bg-[#fbfbee]/40 dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Marks by OSCE competency</CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competency domain</TableHead>
                  <TableHead className="text-center">Questions</TableHead>
                  <TableHead className="text-right">Weighted</TableHead>
                  <TableHead className="text-right">Target marks</TableHead>
                  <TableHead className="text-right">On this paper</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.domains.map((d) => (
                  <TableRow key={d.domain}>
                    <TableCell className="font-medium">
                      {d.label}
                      {d.questionCount === 0 && d.weightPercent > 0 ? (
                        <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700">
                          not examined
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-center">{d.questionCount}</TableCell>
                    <TableCell className="text-right">{d.weightPercent}%</TableCell>
                    <TableCell className="text-right">{d.targetMarks}</TableCell>
                    <TableCell className="text-right font-medium">{d.actualMarks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Downloads ───────────────────────────────────────────────── */}
        {downloadError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{downloadError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          {DOCUMENTS.map((d) => {
            const Icon = d.icon;
            return (
              <Card key={d.kind} className="flex flex-col bg-[#fbfbee]/40 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-[#0b6d41]" />
                    {d.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{d.blurb}</p>
                    {d.facultyOnly ? (
                      <Badge variant="outline" className="mt-2 border-[#0b6d41] text-[#0b6d41]">
                        Faculty only
                      </Badge>
                    ) : null}
                  </div>
                  <Button
                    onClick={() => handleDownload(d.kind)}
                    disabled={noQuestions || downloading !== null}
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {downloading === d.kind ? 'Preparing…' : 'Download PDF'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ContentLayout>
  );
}
