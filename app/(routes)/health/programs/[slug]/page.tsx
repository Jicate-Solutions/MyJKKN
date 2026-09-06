'use client';

/**
 * health/programs/[slug]/page.tsx
 * JKKN Health — Wellness Program (day-by-day consume experience)
 *
 * The screen a student/staff member uses each day of a wellness program.
 *
 * Signature element: the 7-day "week ribbon" — a strip of day-orbs that
 * shows the whole journey at a glance (done / today / upcoming) and lets
 * the person jump between days. It reappears in the header so the arc of
 * the program is always visible.
 *
 * Flow per day:
 *  1. Watch the day's short video (or a "coming soon" placeholder).
 *  2. Mark it watched.
 *  3. If the day has a quiz, answer it — score is % correct.
 *  4. One-tap "was this useful?" rating (1–5) + optional reflection.
 *
 * Completion + streak are computed against the director-editable policy
 * from useWellnessConfig() via isDayComplete().
 *
 * CONSENT (Director decision 2026-06-15 — "light program consent, then track"):
 * Viewing the video + reading content is friction-free (NO heavy
 * HealthConsentProvider). The first TRACKED action (mark watched / submit quiz /
 * rate) is intercepted by a one-tap LIGHT program consent dialog; on agree we
 * record the consent and replay the action. This is separate from the full
 * health-data consent used on the core health pages.
 */

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  PlayCircle,
  CheckCircle2,
  Check,
  Lock,
  Flame,
  Star,
  CalendarDays,
  Leaf,
  Video,
  Trophy,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useProgram,
  useMyParticipation,
  useMarkWatched,
  useSubmitForm,
  useRateUsefulness,
  useWellnessConfig,
} from '@/hooks/health/use-wellness-programs';
import {
  useProgramConsent,
  useGiveProgramConsent,
} from '@/hooks/health/use-program-consent';
import { CrossoverCTA } from './_components/crossover-cta';
import {
  isDayComplete,
  WELLNESS_CONFIG_DEFAULTS,
  type FormAnswer,
  type FormField,
  type FormResponses,
  type FormSpec,
  type HealthProgramDay,
  type HealthProgramParticipation,
  type HealthProgramWithDays,
  type WellnessProgramConfig,
} from '@/types/health-programs';
import { formIsGraded, normalizeForm, scoreForm } from '@/lib/health/forms';
import { toYouTubeEmbed } from '@/lib/health/youtube';

// ============================================================================
// Helpers
// ============================================================================

function todayISODate(): string {
  // Local-date string YYYY-MM-DD, matching how publish_date is stored (DATE).
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDayDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Find the participation row for a given day. */
function participationFor(
  rows: HealthProgramParticipation[] | undefined,
  dayId: string
): HealthProgramParticipation | undefined {
  return rows?.find((r) => r.day_id === dayId);
}

// ============================================================================
// Week ribbon — the signature element
// ============================================================================

type DayState = 'done' | 'today' | 'open' | 'locked';

function dayState(
  day: HealthProgramDay,
  selectedDayId: string,
  participation: HealthProgramParticipation[] | undefined,
  config: WellnessProgramConfig
): DayState {
  const p = participationFor(participation, day.id);
  if (p && isDayComplete(p, config)) return 'done';
  // A day is "open" once its publish_date has arrived (or it has no date).
  const published =
    !day.publish_date || day.publish_date <= todayISODate();
  if (!published) return 'locked';
  if (day.id === selectedDayId) return 'today';
  return 'open';
}

function WeekRibbon({
  days,
  selectedDayId,
  participation,
  config,
  onSelect,
}: {
  days: HealthProgramDay[];
  selectedDayId: string;
  participation: HealthProgramParticipation[] | undefined;
  config: WellnessProgramConfig;
  onSelect: (dayId: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
      {days.map((day) => {
        const state = dayState(day, selectedDayId, participation, config);
        const isSelected = day.id === selectedDayId;
        const base =
          'flex flex-col items-center justify-center shrink-0 snap-start rounded-2xl border-2 transition-all w-[58px] h-[68px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
        const styles =
          state === 'done'
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : state === 'today'
            ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
            : state === 'locked'
            ? 'bg-slate-50 border-slate-100 text-slate-300'
            : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300';
        const ring = isSelected ? 'ring-2 ring-emerald-400 ring-offset-1' : '';

        return (
          <button
            key={day.id}
            type="button"
            disabled={state === 'locked'}
            onClick={() => onSelect(day.id)}
            className={`${base} ${styles} ${ring} disabled:cursor-not-allowed`}
            aria-label={`Day ${day.day_number}: ${day.title}`}
            aria-current={isSelected ? 'true' : undefined}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
              Day
            </span>
            <span className="text-lg font-bold leading-none">{day.day_number}</span>
            <span className="mt-0.5 h-4 flex items-center">
              {state === 'done' ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : state === 'locked' ? (
                <Lock className="h-3 w-3" />
              ) : state === 'today' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Form (Google-Forms-style: graded + ungraded fields)
// ============================================================================

function isAnswered(field: FormField, value: FormAnswer | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true; // number (scale)
}

/** Renders one field by its type and reports answer changes upward. */
function FormFieldInput({
  index,
  field,
  value,
  onText,
  onChoose,
  onToggleMulti,
  onScale,
}: {
  index: number;
  field: FormField;
  value: FormAnswer | undefined;
  onText: (v: string) => void;
  onChoose: (optId: string) => void;
  onToggleMulti: (optId: string) => void;
  onScale: (n: number) => void;
}) {
  const opts = field.options ?? [];
  const label = (
    <div className="space-y-0.5">
      <p className="text-sm font-medium leading-snug text-slate-800">
        {index + 1}. {field.label}
        {field.required && <span className="ml-1 text-rose-500">*</span>}
      </p>
      {field.description?.trim() && (
        <p className="text-xs leading-snug text-slate-500">
          {field.description}
        </p>
      )}
    </div>
  );

  if (field.type === 'single_choice') {
    return (
      <div className="space-y-2.5">
        {label}
        <div className="space-y-2">
          {opts.map((opt) => {
            const selected = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChoose(opt.id)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                  selected
                    ? 'border-emerald-400 bg-emerald-50 text-slate-900'
                    : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                  }`}
                >
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === 'multi_choice') {
    const sel = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2.5">
        {label}
        <div className="space-y-2">
          {opts.map((opt) => {
            const checked = sel.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onToggleMulti(opt.id)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                  checked
                    ? 'border-emerald-400 bg-emerald-50 text-slate-900'
                    : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                  }`}
                >
                  {checked && <Check className="h-3 w-3 text-white" />}
                </span>
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === 'dropdown') {
    return (
      <div className="space-y-2.5">
        {label}
        <Select
          value={typeof value === 'string' ? value : undefined}
          onValueChange={(v) => onChoose(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {opts.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === 'short_text') {
    return (
      <div className="space-y-2.5">
        {label}
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onText(e.target.value)}
          placeholder="Your answer"
        />
      </div>
    );
  }

  if (field.type === 'paragraph') {
    return (
      <div className="space-y-2.5">
        {label}
        <Textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onText(e.target.value)}
          placeholder="Your answer"
          className="min-h-[80px]"
        />
      </div>
    );
  }

  if (field.type === 'scale') {
    const lo = field.scale_min ?? 1;
    const hi = field.scale_max ?? 5;
    const nums: number[] = [];
    for (let n = lo; n <= hi; n++) nums.push(n);
    const cur = typeof value === 'number' ? value : null;
    return (
      <div className="space-y-2.5">
        {label}
        <div className="flex flex-wrap items-center gap-2">
          {nums.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onScale(n)}
              className={`h-9 w-9 rounded-full border-2 text-sm font-semibold transition-all ${
                cur === n
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {(field.scale_min_label || field.scale_max_label) && (
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>{field.scale_min_label}</span>
            <span>{field.scale_max_label}</span>
          </div>
        )}
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <div className="space-y-2.5">
        {label}
        <Input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onText(e.target.value)}
          className="w-auto"
        />
      </div>
    );
  }

  return null;
}

function FormBlock({
  form,
  alreadyScore,
  alreadyResponses,
  onSubmit,
  isSubmitting,
}: {
  form: FormSpec;
  alreadyScore: number | null;
  alreadyResponses: FormResponses | null;
  onSubmit: (score: number | null, responses: FormResponses) => void;
  isSubmitting: boolean;
}) {
  const [responses, setResponses] = useState<FormResponses>(
    alreadyResponses ?? {}
  );
  const [submitted, setSubmitted] = useState(
    alreadyResponses !== null || alreadyScore !== null
  );
  const [score, setScore] = useState<number | null>(alreadyScore);

  const graded = formIsGraded(form);
  const allRequiredAnswered = form.fields.every(
    (f) => !f.required || isAnswered(f, responses[f.id])
  );

  function setAnswer(id: string, value: FormAnswer) {
    setResponses((prev) => ({ ...prev, [id]: value }));
  }
  function toggleMulti(id: string, optId: string) {
    setResponses((prev) => {
      const cur = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = cur.includes(optId)
        ? cur.filter((x) => x !== optId)
        : [...cur, optId];
      return { ...prev, [id]: next };
    });
  }

  function handleSubmit() {
    const s = scoreForm(form, responses);
    setScore(s);
    setSubmitted(true);
    onSubmit(s, responses);
  }

  if (submitted) {
    return (
      <Card className="border-emerald-100">
        <CardContent className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50">
            <Trophy className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">
              {graded ? 'Quiz complete' : 'Response saved'}
            </p>
            {graded && score !== null ? (
              <p className="text-xs text-slate-500">
                You scored{' '}
                <span className="font-semibold text-emerald-700">{score}%</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500">Thanks for your responses.</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          {graded ? 'Quick check' : 'Quick form'} ({form.fields.length} question
          {form.fields.length !== 1 ? 's' : ''})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {form.fields.map((f, i) => (
          <FormFieldInput
            key={f.id}
            index={i}
            field={f}
            value={responses[f.id]}
            onText={(v) => setAnswer(f.id, v)}
            onChoose={(optId) => setAnswer(f.id, optId)}
            onToggleMulti={(optId) => toggleMulti(f.id, optId)}
            onScale={(n) => setAnswer(f.id, n)}
          />
        ))}
        <Button
          onClick={handleSubmit}
          disabled={!allRequiredAnswered || isSubmitting}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {isSubmitting ? 'Submitting…' : 'Submit'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Usefulness rating
// ============================================================================

function UsefulnessBlock({
  prompt,
  alreadyRating,
  alreadyReflection,
  onSubmit,
  isSubmitting,
}: {
  prompt: string;
  alreadyRating: number | null;
  alreadyReflection: string | null;
  onSubmit: (rating: number, reflection: string) => void;
  isSubmitting: boolean;
}) {
  const [rating, setRating] = useState<number | null>(alreadyRating);
  const [reflection, setReflection] = useState(alreadyReflection ?? '');
  const [saved, setSaved] = useState(alreadyRating !== null);

  function handleSubmit() {
    if (rating === null) return;
    setSaved(true);
    onSubmit(rating, reflection.trim());
  }

  return (
    <Card className="border-violet-100 bg-gradient-to-br from-violet-50/60 to-white">
      <CardContent className="py-4 px-5 space-y-3">
        <p className="text-sm font-semibold text-slate-800">{prompt}</p>

        {/* 1–5 stars */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = rating !== null && n <= rating;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setRating(n);
                  setSaved(false);
                }}
                aria-label={`Rate ${n} of 5`}
                className="p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 rounded-md"
              >
                <Star
                  className={`h-7 w-7 transition-colors ${
                    active ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {rating !== null && (
          <>
            <Textarea
              value={reflection}
              onChange={(e) => {
                setReflection(e.target.value);
                setSaved(false);
              }}
              placeholder="Anything you'd like to add? (optional)"
              className="min-h-[64px] resize-none text-sm"
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || saved}
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {saved ? 'Saved' : isSubmitting ? 'Saving…' : 'Send feedback'}
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Thanks for sharing
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Day video panel
// ============================================================================

function VideoPanel({ day }: { day: HealthProgramDay }) {
  if (!day.video_url) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-900/95 aspect-video text-center px-6">
        <Video className="h-9 w-9 text-emerald-400" />
        <p className="text-sm font-medium text-slate-200">Video coming soon</p>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          Today&apos;s short video is being prepared. You can still mark this day
          and follow along with the summary below.
        </p>
      </div>
    );
  }

  const embed = toYouTubeEmbed(day.video_url);
  if (!embed) {
    // Legacy / non-YouTube link still stored — link out rather than break.
    return (
      <a
        href={day.video_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex aspect-video w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-medium text-emerald-700 hover:bg-slate-100"
      >
        <PlayCircle className="h-5 w-5" />
        Watch the video
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-black aspect-video">
      <iframe
        src={embed}
        title={day.title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

// ============================================================================
// Streak / progress strip
// ============================================================================

function ProgressStrip({
  completedCount,
  totalDays,
  streak,
}: {
  completedCount: number;
  totalDays: number;
  streak: number;
}) {
  const pct = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;
  return (
    <Card className="border-emerald-100">
      <CardContent className="flex items-center gap-4 py-4 px-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50 border-2 border-amber-200">
          <Flame className="h-6 w-6 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {streak} day{streak !== 1 ? 's' : ''} streak
          </p>
          <p className="text-xs text-slate-500">
            {completedCount} of {totalDays} days complete
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="text-lg font-extrabold text-emerald-700 tabular-nums">{pct}%</span>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-[68px] w-full rounded-xl" />
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

// ============================================================================
// Light program consent dialog
// ============================================================================
// Asked ONCE, only when a person first tries a TRACKED action (mark watched /
// submit quiz / rate). Viewing the video + reading content require NO consent.
// This is separate from the heavy health-data consent on the core health pages.

function ProgramConsentDialog({
  open,
  onOpenChange,
  onAgree,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAgree: () => void;
  isSaving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <DialogTitle className="text-lg">Track your progress?</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-600">
            We&apos;ll record which days you complete so we can show your
            progress and your streak. That&apos;s all this is for. You can keep
            watching either way — this only lets us save your completions.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Not now
          </Button>
          <Button
            onClick={onAgree}
            disabled={isSaving}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                OK, track it
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Inner
// ============================================================================

function ProgramDetailInner({ slug }: { slug: string }) {
  const { profile } = useAuth();
  const userId = profile?.id;
  const learnerId = profile?.learner_id ?? null;

  const { data: program, isLoading: programLoading } = useProgram(slug);
  const { data: config } = useWellnessConfig();
  const { data: participation } = useMyParticipation(program?.id, userId);

  const markWatched = useMarkWatched();
  const submitForm = useSubmitForm();
  const rateUsefulness = useRateUsefulness();

  // --- Light program consent (gates the TRACKED writes only) ---------------
  const { data: hasConsent } = useProgramConsent(userId, program?.id);
  const giveConsent = useGiveProgramConsent();
  // A tracked action the user triggered before consenting — replayed on agree.
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const consentDialogOpen = pendingAction !== null;

  /**
   * Run a tracked write only if the person has given light consent.
   * If not, stash the action and open the one-tap consent dialog instead.
   */
  function withConsent(run: () => void) {
    if (hasConsent) {
      run();
      return;
    }
    setPendingAction(() => run);
  }

  function handleAgreeConsent() {
    if (!userId || !program) return;
    const run = pendingAction;
    giveConsent.mutate(
      { userId, programId: program.id, learnerId },
      {
        onSuccess: () => {
          setPendingAction(null);
          run?.(); // replay the action that triggered the dialog
        },
      }
    );
  }

  const effectiveConfig = config ?? WELLNESS_CONFIG_DEFAULTS;
  const days = program?.days ?? [];

  // Selected day: default to today's published day, else first incomplete, else day 1.
  const defaultDayId = useMemo(() => {
    if (days.length === 0) return '';
    const today = todayISODate();
    const todays = days.find((d) => d.publish_date === today);
    if (todays) return todays.id;
    const firstIncomplete = days.find((d) => {
      const p = participationFor(participation, d.id);
      const published = !d.publish_date || d.publish_date <= today;
      return published && !(p && isDayComplete(p, effectiveConfig));
    });
    if (firstIncomplete) return firstIncomplete.id;
    return days[0].id;
  }, [days, participation, effectiveConfig]);

  const [selectedDayId, setSelectedDayId] = useState('');
  // Adopt the computed default once data lands, without overriding a manual pick.
  useEffect(() => {
    if (!selectedDayId && defaultDayId) setSelectedDayId(defaultDayId);
  }, [defaultDayId, selectedDayId]);

  if (programLoading) return <DetailSkeleton />;

  if (!program) {
    return (
      <Card className="border-dashed border-slate-200">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Leaf className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Program not found</p>
          <p className="text-xs text-slate-400">
            This program may have ended or the link is incorrect.
          </p>
          <Link href="/health/programs" className="mt-2">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back to programs
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const activeDayId = selectedDayId || defaultDayId;
  const day = days.find((d) => d.id === activeDayId) ?? days[0];
  const dayParticipation = day ? participationFor(participation, day.id) : undefined;
  const dayForm = day ? normalizeForm(day.quiz) : null;

  const completedCount = days.filter((d) => {
    const p = participationFor(participation, d.id);
    return p && isDayComplete(p, effectiveConfig);
  }).length;

  // Streak: count consecutive completed days from day 1 upward.
  const streak = (() => {
    let s = 0;
    for (const d of [...days].sort((a, b) => a.day_number - b.day_number)) {
      const p = participationFor(participation, d.id);
      if (p && isDayComplete(p, effectiveConfig)) s += 1;
      else break;
    }
    return s;
  })();

  const watched = dayParticipation?.watch_completed === true;
  const range = (() => {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const s = program.start_date ? new Date(program.start_date).toLocaleDateString('en-IN', opts) : null;
    const e = program.end_date ? new Date(program.end_date).toLocaleDateString('en-IN', opts) : null;
    return s && e ? `${s} – ${e}` : s ?? e;
  })();

  function handleMarkWatched() {
    if (!day || !userId) return;
    withConsent(() =>
      markWatched.mutate({
        programId: program.id,
        dayId: day.id,
        userId,
        learnerId,
        completed: true,
      })
    );
  }

  function handleSubmitForm(score: number | null, responses: FormResponses) {
    if (!day || !userId) return;
    withConsent(() =>
      submitForm.mutate({
        programId: program.id,
        dayId: day.id,
        userId,
        learnerId,
        score,
        responses,
      })
    );
  }

  function handleRate(rating: number, reflection: string) {
    if (!day || !userId) return;
    withConsent(() =>
      rateUsefulness.mutate({
        programId: program.id,
        dayId: day.id,
        userId,
        learnerId,
        rating,
        reflection: reflection || null,
      })
    );
  }

  return (
    <div className="space-y-5">
      {/* One-tap LIGHT consent dialog — shown only when a tracked action is
          attempted before consent is given. */}
      <ProgramConsentDialog
        open={consentDialogOpen}
        onOpenChange={(v) => {
          if (!v) setPendingAction(null);
        }}
        onAgree={handleAgreeConsent}
        isSaving={giveConsent.isPending}
      />

      {/* Back link */}
      <Link
        href="/health/programs"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All programs
      </Link>

      {/* Header */}
      <div>
        {program.theme && (
          <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-600">
            {program.theme}
          </p>
        )}
        <h1 className="text-xl font-bold text-slate-800 leading-tight">{program.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {range && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
              {range}
            </span>
          )}
          <span>
            Day {day?.day_number ?? 1} of {days.length}
          </span>
        </div>

        {/* Section leaderboard link (sibling lane builds the route) */}
        <Link
          href={`/health/programs/${slug}/leaderboard`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <Trophy className="h-3.5 w-3.5" />
          See section leaderboard
          <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
        </Link>
      </div>

      {/* Week ribbon — signature */}
      {days.length > 0 && (
        <WeekRibbon
          days={days}
          selectedDayId={activeDayId}
          participation={participation}
          config={effectiveConfig}
          onSelect={setSelectedDayId}
        />
      )}

      {/* Progress / streak */}
      <ProgressStrip completedCount={completedCount} totalDays={days.length} streak={streak} />

      {day && (
        <>
          {/* Today's day */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">{day.title}</h2>
              {watched && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[11px]"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Watched
                </Badge>
              )}
            </div>
            {day.publish_date && (
              <p className="mb-3 text-xs text-slate-400">{formatDayDate(day.publish_date)}</p>
            )}
            <VideoPanel day={day} />
            {day.summary && (
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">{day.summary}</p>
            )}
          </div>

          {/* Mark watched */}
          <Button
            onClick={handleMarkWatched}
            disabled={watched || markWatched.isPending || !userId}
            className={`w-full ${
              watched
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            variant={watched ? 'outline' : 'default'}
          >
            {watched ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Marked as watched
              </>
            ) : markWatched.isPending ? (
              'Saving…'
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-1.5" />
                Mark as watched
              </>
            )}
          </Button>

          {/* Form (if any) */}
          {dayForm && dayForm.fields.length > 0 && (
            <FormBlock
              form={dayForm}
              alreadyScore={dayParticipation?.quiz_score ?? null}
              alreadyResponses={dayParticipation?.form_responses ?? null}
              onSubmit={handleSubmitForm}
              isSubmitting={submitForm.isPending}
            />
          )}

          {/* Usefulness */}
          <UsefulnessBlock
            prompt={effectiveConfig.useful_prompt}
            alreadyRating={dayParticipation?.usefulness_rating ?? null}
            alreadyReflection={dayParticipation?.reflection_text ?? null}
            onSubmit={handleRate}
            isSubmitting={rateUsefulness.isPending}
          />
        </>
      )}

      {/* Cross-over into the core Health module — shown once engaged
          (≥1 day complete). Adoption on-ramp for mood/profile. */}
      {completedCount > 0 && <CrossoverCTA programTitle={program.title} />}

      <div className="h-4" />
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function WellnessProgramDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  return (
    <ContentLayout title="Wellness Program">
      <ProgramDetailInner slug={slug} />
    </ContentLayout>
  );
}
