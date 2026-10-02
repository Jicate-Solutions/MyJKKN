'use client';

// Lists a program's surveys + the "New survey" form (blank or from a template).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllPrograms } from '@/hooks/health/use-wellness-programs';
import { useCreateSurvey, useProgramSurveys } from '@/hooks/health/use-wellness-surveys';
import { SURVEY_TEMPLATES, cloneTemplateQuestions } from '@/lib/health/survey-templates';
import {
  RESPONDENT_TYPE_LABEL,
  type HealthSurvey,
  type HealthSurveyStatus,
} from '@/types/health-surveys';

export const SURVEY_STATUS_STYLES: Record<HealthSurveyStatus, string> = {
  draft: 'border-slate-300 text-slate-600 bg-slate-50',
  active: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  closed: 'border-slate-200 text-slate-400 bg-slate-50',
};

const BLANK = '__blank__';

function NewSurveyForm({ programId, onDone }: { programId: string; onDone: () => void }) {
  const router = useRouter();
  const create = useCreateSurvey();
  const [template, setTemplate] = useState<string>(SURVEY_TEMPLATES[0]?.key ?? BLANK);
  const [title, setTitle] = useState(SURVEY_TEMPLATES[0]?.title ?? '');

  const handleTemplate = (key: string) => {
    setTemplate(key);
    const t = SURVEY_TEMPLATES.find((x) => x.key === key);
    if (t) setTitle(t.title);
  };

  const handleCreate = async () => {
    if (title.trim().length < 3) {
      toast.error('Title is required (min 3 characters).');
      return;
    }
    const t = SURVEY_TEMPLATES.find((x) => x.key === template);
    try {
      const survey = await create.mutateAsync({
        program_id: programId,
        title: title.trim(),
        description: t?.description ?? null,
        languages: t?.languages ?? ['en'],
        questions: t ? cloneTemplateQuestions(t.key) : [],
        status: 'draft',
      });
      onDone();
      router.push(`/health/admin/programs/${programId}/surveys/${survey.id}`);
    } catch {
      /* hook toasts */
    }
  };

  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle className="text-base text-slate-800">New survey</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ns-template">Start from</Label>
            <Select value={template} onValueChange={handleTemplate}>
              <SelectTrigger id="ns-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SURVEY_TEMPLATES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
                <SelectItem value={BLANK}>Blank survey</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ns-title">Title</Label>
            <Input id="ns-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={handleCreate}
            disabled={create.isPending}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create survey
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SurveyCard({ programId, survey }: { programId: string; survey: HealthSurvey }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-800">{survey.title}</h3>
            <Badge variant="outline" className={`capitalize text-xs ${SURVEY_STATUS_STYLES[survey.status]}`}>
              {survey.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            {survey.questions.length} question{survey.questions.length === 1 ? '' : 's'} ·{' '}
            {survey.audience.map((a) => RESPONDENT_TYPE_LABEL[a]).join(', ')} ·{' '}
            {survey.languages.map((l) => l.toUpperCase()).join(' + ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={`/health/admin/programs/${programId}/surveys/${survey.id}/report`}>
            <Button variant="outline" size="sm" className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50">
              <BarChart3 className="h-3.5 w-3.5" />
              Report
            </Button>
          </Link>
          <Link href={`/health/admin/programs/${programId}/surveys/${survey.id}`}>
            <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
              Edit
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function SurveyList({ programId }: { programId: string }) {
  const { data: programs } = useAllPrograms();
  const program = programs?.find((p) => p.id === programId);
  const { data: surveys, isLoading, error } = useProgramSurveys(programId);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/health/admin/programs/${programId}`}>
            <Button variant="ghost" size="sm" className="-ml-2 gap-2">
              <ArrowLeft className="h-4 w-4" />
              {program?.title ?? 'Program'}
            </Button>
          </Link>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate((v) => !v)}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          {showCreate ? 'Close' : 'New survey'}
        </Button>
      </div>

      {showCreate && <NewSurveyForm programId={programId} onDone={() => setShowCreate(false)} />}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load surveys</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : !surveys || surveys.length === 0 ? (
        <Card className="border-dashed border-emerald-200">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-600">No surveys for this program yet</p>
            {!showCreate && (
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="mt-2 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                New survey
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {surveys.map((s) => (
            <SurveyCard key={s.id} programId={programId} survey={s} />
          ))}
        </div>
      )}
    </div>
  );
}
