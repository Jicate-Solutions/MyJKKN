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
 */

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  PlayCircle,
  CheckCircle2,
  Lock,
  Flame,
  Star,
  CalendarDays,
  Leaf,
  Video,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useProgram,
  useMyParticipation,
  useMarkWatched,
  useSubmitQuiz,
  useRateUsefulness,
  useWellnessConfig,
} from '@/hooks/health/use-wellness-programs';
import { HealthConsentProvider } from '../../_components/consent-gate';
import {
  isDayComplete,
  WELLNESS_CONFIG_DEFAULTS,
  type HealthProgramDay,
  type HealthProgramParticipation,
  type HealthProgramWithDays,
  type QuizSpec,
  type WellnessProgramConfig,
} from '@/types/health-programs';

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

/** Convert a video URL into an embeddable src (YouTube/Vimeo aware, else raw). */
function toEmbedSrc(url: string): { kind: 'iframe' | 'video'; src: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id) return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}` };
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      if (id) return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}` };
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}` };
    }
  } catch {
    /* fall through */
  }
  // Direct file (mp4/webm) or already an embed URL
  if (/\.(mp4|webm|ogg)$/i.test(url)) return { kind: 'video', src: url };
  return { kind: 'iframe', src: url };
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
// Quiz
// ============================================================================

function QuizBlock({
  quiz,
  alreadyScore,
  onSubmit,
  isSubmitting,
}: {
  quiz: QuizSpec;
  alreadyScore: number | null;
  onSubmit: (score: number) => void;
  isSubmitting: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittedScore, setSubmittedScore] = useState<number | null>(alreadyScore);

  const total = quiz.questions.length;
  const allAnswered = quiz.questions.every((q) => answers[q.id] !== undefined);

  function handleSubmit() {
    let correct = 0;
    for (const q of quiz.questions) {
      const chosen = answers[q.id];
      const opt = q.options.find((o) => o.id === chosen);
      if (opt?.is_correct) correct += 1;
    }
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    setSubmittedScore(pct);
    onSubmit(pct);
  }

  if (submittedScore !== null) {
    return (
      <Card className="border-emerald-100">
        <CardContent className="flex items-center gap-3 py-4 px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
            <Trophy className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">Quiz complete</p>
            <p className="text-xs text-slate-500">
              You scored <span className="font-semibold text-emerald-700">{submittedScore}%</span>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Quick check ({total} question{total !== 1 ? 's' : ''})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {quiz.questions.map((q, qi) => (
          <div key={q.id} className="space-y-2.5">
            <p className="text-sm font-medium text-slate-800 leading-snug">
              {qi + 1}. {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
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
        ))}
        <Button
          onClick={handleSubmit}
          disabled={!allAnswered || isSubmitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isSubmitting ? 'Submitting…' : 'Submit answers'}
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

  const embed = toEmbedSrc(day.video_url);
  return (
    <div className="overflow-hidden rounded-2xl bg-black aspect-video">
      {embed.kind === 'iframe' ? (
        <iframe
          src={embed.src}
          title={day.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <video src={embed.src} controls className="h-full w-full" />
      )}
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
  const submitQuiz = useSubmitQuiz();
  const rateUsefulness = useRateUsefulness();

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
    markWatched.mutate({
      programId: program.id,
      dayId: day.id,
      userId,
      learnerId,
      completed: true,
    });
  }

  function handleSubmitQuiz(score: number) {
    if (!day || !userId) return;
    submitQuiz.mutate({
      programId: program.id,
      dayId: day.id,
      userId,
      learnerId,
      score,
    });
  }

  function handleRate(rating: number, reflection: string) {
    if (!day || !userId) return;
    rateUsefulness.mutate({
      programId: program.id,
      dayId: day.id,
      userId,
      learnerId,
      rating,
      reflection: reflection || null,
    });
  }

  return (
    <div className="space-y-5">
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

          {/* Quiz (if any) */}
          {day.quiz && day.quiz.questions?.length > 0 && (
            <QuizBlock
              quiz={day.quiz}
              alreadyScore={dayParticipation?.quiz_score ?? null}
              onSubmit={handleSubmitQuiz}
              isSubmitting={submitQuiz.isPending}
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
    <HealthConsentProvider>
      <ContentLayout title="Wellness Program">
        <ProgramDetailInner slug={slug} />
      </ContentLayout>
    </HealthConsentProvider>
  );
}
