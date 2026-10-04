'use client';

// Edit one survey: settings (status, audience, languages, public link) and the
// scenario question builder — options, the constructive answer, the per-option
// "why not" text and the suggested path shown after a non-constructive pick.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BarChart3,
  Copy,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SurveyBannerUpload } from './survey-banner-upload';
import { SurveyQr } from './survey-qr';
import {
  useDeleteSurvey,
  useSurvey,
  useSurveyResponses,
  useUpdateSurvey,
} from '@/hooks/health/use-wellness-surveys';
import {
  RESPONDENT_TYPE_LABEL,
  SURVEY_LANGUAGE_LABEL,
  type HealthSurvey,
  type HealthSurveyStatus,
  type LocalizedText,
  type SurveyLanguage,
  type SurveyQuestion,
  type SurveyRespondentType,
} from '@/types/health-surveys';

const ALL_TYPES: SurveyRespondentType[] = ['student', 'staff', 'public'];
const OPTION_IDS = 'ABCDEFGH'.split('');

function newQuestionId(existing: SurveyQuestion[]): string {
  let n = existing.length + 1;
  while (existing.some((q) => q.id === `s${n}`)) n += 1;
  return `s${n}`;
}

function blankQuestion(existing: SurveyQuestion[]): SurveyQuestion {
  return {
    id: newQuestionId(existing),
    title: { en: `Scenario ${existing.length + 1}` },
    text: { en: '' },
    constructive: 'A',
    options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: { en: '' }, justification: { en: '' } })),
    guidance: { en: '' },
  };
}

/** One input per active language for a LocalizedText value. */
function LocalizedField({
  label,
  value,
  languages,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  value: LocalizedText | undefined;
  languages: SurveyLanguage[];
  onChange: (v: LocalizedText) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const v = value ?? { en: '' };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-600">{label}</Label>
      <div className={languages.length > 1 ? 'grid grid-cols-1 gap-2 lg:grid-cols-2' : ''}>
        {languages.map((lang) => {
          const common = {
            value: v[lang] ?? '',
            placeholder: languages.length > 1 ? `${SURVEY_LANGUAGE_LABEL[lang]}${placeholder ? ` — ${placeholder}` : ''}` : placeholder,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              onChange({ ...v, [lang]: e.target.value }),
          };
          return multiline ? (
            <Textarea key={lang} rows={2} {...common} />
          ) : (
            <Input key={lang} {...common} />
          );
        })}
      </div>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  languages,
  onChange,
  onRemove,
}: {
  index: number;
  question: SurveyQuestion;
  languages: SurveyLanguage[];
  onChange: (q: SurveyQuestion) => void;
  onRemove: () => void;
}) {
  const setOption = (i: number, patch: Partial<SurveyQuestion['options'][number]>) =>
    onChange({
      ...question,
      options: question.options.map((o, oi) => (oi === i ? { ...o, ...patch } : o)),
    });

  const addOption = () => {
    const id = OPTION_IDS.find((l) => !question.options.some((o) => o.id === l));
    if (!id) return;
    onChange({
      ...question,
      options: [...question.options, { id, text: { en: '' }, justification: { en: '' } }],
    });
  };

  const removeOption = (i: number) => {
    const removed = question.options[i];
    const options = question.options.filter((_, oi) => oi !== i);
    onChange({
      ...question,
      options,
      constructive: question.constructive === removed.id ? options[0]?.id ?? '' : question.constructive,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold text-emerald-700">
          Question {index + 1}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onRemove} className="gap-1 text-red-600 hover:bg-red-50">
          <Trash2 className="h-4 w-4" />
          Remove
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <LocalizedField
          label="Title"
          value={question.title}
          languages={languages}
          onChange={(title) => onChange({ ...question, title })}
          placeholder="e.g. Scenario 1: The Critical Handover"
        />
        <LocalizedField
          label="Scenario / question"
          value={question.text}
          languages={languages}
          onChange={(text) => onChange({ ...question, text })}
          multiline
        />

        <div className="space-y-3">
          <Label className="text-xs text-slate-600">
            Options — select the best answer
          </Label>
          <p className="text-xs text-slate-500">
            The best answer gets the green &ldquo;Excellent&rdquo; review and counts toward the
            score. Every other option shows its &ldquo;why this isn&apos;t ideal&rdquo; text plus
            the suggested path.
          </p>
          {question.options.map((o, i) => {
            const isGood = question.constructive === o.id;
            return (
              <div
                key={o.id}
                className={`space-y-2 rounded-lg border p-3 ${isGood ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="radio"
                      name={`constructive-${question.id}`}
                      checked={isGood}
                      onChange={() => onChange({ ...question, constructive: o.id })}
                      className="accent-emerald-600"
                    />
                    Option {o.id} {isGood && <span className="text-xs text-emerald-700">(best answer)</span>}
                  </label>
                  {question.options.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => removeOption(i)} className="h-7 text-slate-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <LocalizedField
                  label="Answer text"
                  value={o.text}
                  languages={languages}
                  onChange={(text) => setOption(i, { text })}
                  multiline
                />
                {!isGood && (
                  <LocalizedField
                    label="Why this approach isn't ideal (shown when picked)"
                    value={o.justification}
                    languages={languages}
                    onChange={(justification) => setOption(i, { justification })}
                    multiline
                  />
                )}
              </div>
            );
          })}
          {question.options.length < OPTION_IDS.length && (
            <Button variant="outline" size="sm" onClick={addOption} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add option
            </Button>
          )}
        </div>

        <LocalizedField
          label="Suggested path (shown after a non-constructive answer)"
          value={question.guidance}
          languages={languages}
          onChange={(guidance) => onChange({ ...question, guidance })}
          multiline
        />
      </CardContent>
    </Card>
  );
}

function ShareLink({ label, url, title, hint }: { label: string; url: string; title: string; hint: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          onClick={() => {
            navigator.clipboard.writeText(url).then(
              () => toast.success('Link copied'),
              () => toast.error('Could not copy'),
            );
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <p className="text-xs text-slate-400">{hint}</p>
      <SurveyQr url={url} title={title} />
    </div>
  );
}

function validate(draft: HealthSurvey): string | null {
  if (draft.title.trim().length < 3) return 'Title is required (min 3 characters).';
  if (draft.audience.length === 0) return 'Pick at least one respondent category.';
  if (draft.status === 'active' && draft.questions.length === 0)
    return 'Add at least one question before making the survey active.';
  for (const [i, q] of draft.questions.entries()) {
    if (!q.text.en?.trim()) return `Question ${i + 1}: the English scenario text is required.`;
    if (q.options.length < 2) return `Question ${i + 1}: needs at least two options.`;
    if (q.options.some((o) => !o.text.en?.trim()))
      return `Question ${i + 1}: every option needs English text.`;
    if (!q.options.some((o) => o.id === q.constructive))
      return `Question ${i + 1}: pick the constructive option.`;
  }
  return null;
}

export function SurveyEditor({ programId, surveyId }: { programId: string; surveyId: string }) {
  const { data: survey, isLoading, error } = useSurvey(surveyId);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error || !survey) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Survey not found</AlertTitle>
        <AlertDescription>{error ? (error as Error).message : 'It may have been deleted.'}</AlertDescription>
      </Alert>
    );
  }
  // Re-seed the draft whenever the saved row changes (e.g. after Save).
  return <SurveyEditorForm key={survey.updated_at} programId={programId} survey={survey} />;
}

function SurveyEditorForm({ programId, survey }: { programId: string; survey: HealthSurvey }) {
  const router = useRouter();
  const surveyId = survey.id;
  const { data: responses } = useSurveyResponses(surveyId);
  const update = useUpdateSurvey();
  const del = useDeleteSurvey();
  const [draft, setDraft] = useState<HealthSurvey>(survey);

  const responseCount = responses?.length ?? 0;
  const hasTamil = draft.languages.includes('ta');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const internalUrl = origin
    ? `${origin}/survey?program=${programId}&survey=${surveyId}`
    : null;
  const publicUrl =
    draft.public_token && typeof window !== 'undefined'
      ? `${window.location.origin}/ws/${draft.public_token}`
      : null;

  const set = (patch: Partial<HealthSurvey>) => setDraft({ ...draft, ...patch });

  const toggleAudience = (t: SurveyRespondentType, on: boolean) =>
    set({ audience: on ? [...new Set([...draft.audience, t])] : draft.audience.filter((a) => a !== t) });

  const handleSave = async () => {
    const problem = validate(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    await update
      .mutateAsync({
        id: draft.id,
        patch: {
          title: draft.title.trim(),
          description: draft.description?.trim() || null,
          status: draft.status,
          audience: draft.audience,
          languages: draft.languages,
          questions: draft.questions,
        },
      })
      .catch(() => undefined);
  };

  const handleDelete = async () => {
    if (responseCount > 0) {
      toast.error('This survey has responses — close it instead of deleting.');
      return;
    }
    if (!window.confirm('Delete this survey? This cannot be undone.')) return;
    await del.mutateAsync({ id: draft.id, programId }).catch(() => undefined);
    router.push(`/health/admin/programs/${programId}/surveys`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/health/admin/programs/${programId}/surveys`}>
          <Button variant="ghost" size="sm" className="-ml-2 gap-2">
            <ArrowLeft className="h-4 w-4" />
            All surveys
          </Button>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/health/admin/programs/${programId}/surveys/${surveyId}/report`}>
            <Button variant="outline" size="sm" className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50">
              <BarChart3 className="h-3.5 w-3.5" />
              Report ({responseCount})
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={update.isPending}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save survey
          </Button>
        </div>
      </div>

      {responseCount > 0 && (
        <Alert>
          <AlertTitle>{responseCount} response{responseCount === 1 ? '' : 's'} already recorded</AlertTitle>
          <AlertDescription>
            Fixing wording is safe. Adding, removing or re-keying questions and options
            changes how existing answers read in the report.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-slate-800">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="se-title">Title</Label>
              <Input id="se-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="se-status">Status</Label>
              <Select value={draft.status} onValueChange={(v) => set({ status: v as HealthSurveyStatus })}>
                <SelectTrigger id="se-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft — not visible yet</SelectItem>
                  <SelectItem value="active">Active — accepting responses</SelectItem>
                  <SelectItem value="closed">Closed — no new responses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SurveyBannerUpload surveyId={surveyId} initialUrl={survey.banner_url} />
          <div className="space-y-1.5">
            <Label htmlFor="se-desc">Description (optional)</Label>
            <Textarea
              id="se-desc"
              rows={2}
              value={draft.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Who can respond</Label>
              <div className="flex flex-wrap gap-4">
                {ALL_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.audience.includes(t)}
                      onCheckedChange={(v) => toggleAudience(t, v === true)}
                    />
                    {RESPONDENT_TYPE_LABEL[t]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400">Each person can submit once.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="se-ta">Tamil version</Label>
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  id="se-ta"
                  checked={hasTamil}
                  onCheckedChange={(on) => set({ languages: on ? ['en', 'ta'] : ['en'] })}
                />
                Respondents can switch between English and தமிழ்
              </div>
            </div>
          </div>
          {(draft.audience.includes('student') || draft.audience.includes('staff')) && internalUrl && (
            <ShareLink
              label="JKKN users link (login)"
              url={internalUrl}
              title={`${draft.title}_JKKN`}
              hint="Opens this survey directly after the person signs in to MyJKKN. Each person can submit once."
            />
          )}
          {draft.audience.includes('public') && publicUrl && (
            <ShareLink
              label="Public link (no login)"
              url={publicUrl}
              title={`${draft.title}_Public`}
              hint="Anyone with the link can respond — one submission per email."
            />
          )}
          <p className="text-xs text-slate-400">
            Links work only while the survey is Active — save as Active before sharing.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {draft.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            languages={draft.languages}
            onChange={(nq) => set({ questions: draft.questions.map((x, xi) => (xi === i ? nq : x)) })}
            onRemove={() => set({ questions: draft.questions.filter((_, xi) => xi !== i) })}
          />
        ))}
        <Button
          variant="outline"
          onClick={() => set({ questions: [...draft.questions, blankQuestion(draft.questions)] })}
          className="w-full gap-2 border-dashed"
        >
          <Plus className="h-4 w-4" />
          Add question
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={del.isPending}
          className="gap-1 text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete survey
        </Button>
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save survey
        </Button>
      </div>
    </div>
  );
}
