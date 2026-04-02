'use client';

import { use, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import {
  useVACCourse,
  useVACLesson,
  useVACLessons,
  useIsEnrolled,
  useVACProgress,
  useMarkLessonComplete,
} from '@/hooks/vac/use-vac';
import type {
  ContentBlock,
  TieredExercise,
  SelfCheckQuestion,
  GeminiPrompt,
  ResourceLink,
  LearningOutcome,
  VACLearnerProgress,
} from '@/types/vac';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  Loader2,
  ExternalLink,
  Lightbulb,
  Brain,
  BookOpen,
  Sparkles,
  ListChecks,
  Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Content block renderer ─────────────────────────────────────────────────

function RenderContentBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading':
      return <h3 className="text-lg font-semibold mt-4 mb-2">{block.content}</h3>;
    case 'text':
      return <p className="text-sm leading-relaxed mb-3 whitespace-pre-wrap">{block.content}</p>;
    case 'code':
      return (
        <pre className="bg-muted rounded-lg p-4 mb-3 overflow-x-auto text-sm">
          {block.language && (
            <div className="text-xs text-muted-foreground mb-2 font-mono">{block.language}</div>
          )}
          <code>{block.content}</code>
        </pre>
      );
    case 'image':
      return (
        <div className="mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url || block.content} alt="" className="rounded-lg max-w-full" />
        </div>
      );
    case 'video':
      return (
        <div className="mb-3 aspect-video">
          <iframe
            src={block.url || block.content}
            className="w-full h-full rounded-lg"
            allowFullScreen
          />
        </div>
      );
    case 'list':
      return (
        <ul className="list-disc list-inside space-y-1 mb-3 text-sm">
          {(block.items || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'callout':
      return (
        <div className="bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-400 p-4 rounded-r-lg mb-3">
          <p className="text-sm">{block.content}</p>
        </div>
      );
    default:
      return <p className="text-sm mb-3">{block.content}</p>;
  }
}

// ── Learning Outcomes ──────────────────────────────────────────────────────

function LearningOutcomesList({ outcomes }: { outcomes: LearningOutcome[] }) {
  if (!outcomes?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Learning Outcomes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {outcomes.map((o) => (
            <li key={o.id} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>{o.description}</span>
              {o.bloom_level && (
                <Badge variant="outline" className="text-xs ml-auto shrink-0">
                  {o.bloom_level}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── Exercises ──────────────────────────────────────────────────────────────

function ExerciseTabs({ exercises }: { exercises: TieredExercise[] }) {
  if (!exercises?.length) return null;

  const grouped = useMemo(() => {
    const m: Record<string, TieredExercise[]> = { apply: [], analyze: [], create: [] };
    exercises.forEach((ex) => {
      if (m[ex.tier]) m[ex.tier].push(ex);
    });
    return m;
  }, [exercises]);

  const availableTiers = Object.entries(grouped).filter(([, items]) => items.length > 0);
  if (availableTiers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Exercises
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={availableTiers[0][0]}>
          <TabsList>
            {availableTiers.map(([tier]) => (
              <TabsTrigger key={tier} value={tier} className="capitalize">
                {tier}
              </TabsTrigger>
            ))}
          </TabsList>
          {availableTiers.map(([tier, items]) => (
            <TabsContent key={tier} value={tier} className="space-y-4 mt-4">
              {items.map((ex, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="font-medium text-sm">{ex.title}</h4>
                  <p className="text-sm text-muted-foreground">{ex.description}</p>
                  {ex.expected_output && (
                    <div className="text-xs bg-muted p-2 rounded">
                      <span className="font-semibold">Expected: </span>
                      {ex.expected_output}
                    </div>
                  )}
                  {ex.hints && ex.hints.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-primary">Show hints</summary>
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        {ex.hints.map((h, j) => (
                          <li key={j}>{h}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ── Self-Check Quiz ────────────────────────────────────────────────────────

function SelfCheckQuiz({ questions }: { questions: SelfCheckQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions?.length) return null;

  const score = submitted
    ? questions.filter((q) => answers[q.id] === q.correct_answer).length
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Self-Check Quiz
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {questions.map((q, idx) => {
          const isCorrect = submitted && answers[q.id] === q.correct_answer;
          const isWrong = submitted && answers[q.id] && !isCorrect;

          return (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium">
                {idx + 1}. {q.question}
              </p>
              <div className="space-y-1">
                {q.options.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 p-2 rounded-md text-sm cursor-pointer transition-colors ${
                      submitted && opt.value === q.correct_answer
                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200'
                        : submitted && answers[q.id] === opt.value && opt.value !== q.correct_answer
                          ? 'bg-red-50 dark:bg-red-950/30 border border-red-200'
                          : answers[q.id] === opt.value
                            ? 'bg-primary/10 border border-primary/30'
                            : 'hover:bg-muted border border-transparent'
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.value}
                      checked={answers[q.id] === opt.value}
                      onChange={() => {
                        if (!submitted) {
                          setAnswers((prev) => ({ ...prev, [q.id]: opt.value }));
                        }
                      }}
                      disabled={submitted}
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {submitted && isWrong && q.explanation && (
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  {q.explanation}
                </p>
              )}
            </div>
          );
        })}

        {submitted ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
            <span className="font-medium">
              Score: {score} / {questions.length} ({Math.round((score / questions.length) * 100)}%)
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setSubmitted(true)}
            disabled={Object.keys(answers).length < questions.length}
          >
            Check Answers
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Gemini Prompts ─────────────────────────────────────────────────────────

function GeminiPromptsSection({ prompts }: { prompts: GeminiPrompt[] }) {
  if (!prompts?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-500" />
          AI Prompts (Gemini)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prompts.map((p) => (
          <div key={p.id} className="bg-muted rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">{p.title}</p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-background rounded p-2">
              {p.prompt}
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Resources ──────────────────────────────────────────────────────────────

function ResourcesSection({ resources }: { resources: ResourceLink[] }) {
  if (!resources?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Resources
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {resources.map((r, i) => (
            <li key={i}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {r.title}
                <Badge variant="outline" className="text-xs ml-auto capitalize">
                  {r.type}
                </Badge>
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function LessonContentPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id || '';

  const { data: course } = useVACCourse(courseId);
  const { data: lesson, isLoading } = useVACLesson(lessonId);
  const { data: allLessons } = useVACLessons(courseId);
  const { data: isEnrolled } = useIsEnrolled(userId, courseId);
  const { data: progress } = useVACProgress(userId, courseId);
  const markComplete = useMarkLessonComplete();

  // Determine current lesson's position
  const sortedLessons = useMemo(() => {
    if (!allLessons || !Array.isArray(allLessons)) return [];
    return [...allLessons].sort((a, b) =>
      a.week !== b.week ? a.week - b.week : a.hour - b.hour
    );
  }, [allLessons]);

  const currentIndex = sortedLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? sortedLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < sortedLessons.length - 1 ? sortedLessons[currentIndex + 1] : null;

  // Check if this lesson is already completed
  const isCompleted = useMemo(() => {
    if (!progress || !Array.isArray(progress)) return false;
    const lp = progress.find((p: VACLearnerProgress) => p.lesson_id === lessonId);
    return lp?.status === 'completed' || lp?.status === 'tested_out';
  }, [progress, lessonId]);

  // Sequential gating: if not hour 1 and not enrolled, redirect
  const isHourOne = currentIndex === 0;
  const isGated = !isHourOne && !isEnrolled;

  const handleMarkComplete = useCallback(() => {
    if (!userId || !courseId || !lessonId) return;
    markComplete.mutate({ userId, courseId, lessonId });
  }, [userId, courseId, lessonId, markComplete]);

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!lesson) {
    return (
      <ContentLayout title="Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Lesson not found</h3>
          <Button variant="outline" className="mt-4" onClick={() => router.push(`/vac/${courseId}`)}>
            Back to Course
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (isGated) {
    return (
      <ContentLayout title="Locked">
        <div className="flex flex-col items-center justify-center py-16">
          <Lock className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Lesson Locked</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You need to enroll in this course to access lessons beyond Hour 1.
          </p>
          <Button className="mt-4" onClick={() => router.push(`/vac/${courseId}`)}>
            View Course Details
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={lesson.title}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/vac/${courseId}`}>
              {course?.name || 'Course'}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Hour {lesson.hour}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="max-w-4xl mx-auto space-y-6 mt-4">
        {/* Lesson header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Week {lesson.week}</span>
            <span>/</span>
            <span>Hour {lesson.hour}</span>
            <span>/</span>
            <span>{lesson.duration_minutes} min</span>
            {lesson.ltl_phase && (
              <Badge variant="outline" className="ml-2 uppercase text-xs">
                {lesson.ltl_phase}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          {isCompleted && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Completed
            </Badge>
          )}
        </div>

        {/* Learning outcomes */}
        <LearningOutcomesList outcomes={lesson.learning_outcomes} />

        {/* Student content blocks */}
        {lesson.student_content?.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Lesson Content
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lesson.student_content.map((block, i) => (
                <RenderContentBlock key={i} block={block} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Exercises */}
        <ExerciseTabs exercises={lesson.exercises} />

        {/* Gemini Prompts */}
        <GeminiPromptsSection prompts={lesson.gemini_prompts} />

        {/* Self-check quiz */}
        <SelfCheckQuiz questions={lesson.self_check} />

        {/* Resources */}
        <ResourcesSection resources={lesson.resources} />

        <Separator />

        {/* Mark Complete */}
        {isEnrolled && !isCompleted && (
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleMarkComplete}
              disabled={markComplete.isPending}
            >
              {markComplete.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark as Complete
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4">
          {prevLesson ? (
            <Button
              variant="outline"
              onClick={() => router.push(`/vac/${courseId}/${prevLesson.id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous: Hour {prevLesson.hour}
            </Button>
          ) : (
            <div />
          )}
          {nextLesson ? (
            <Button
              variant="outline"
              onClick={() => router.push(`/vac/${courseId}/${nextLesson.id}`)}
            >
              Next: Hour {nextLesson.hour}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button variant="outline" onClick={() => router.push(`/vac/${courseId}`)}>
              Back to Course
            </Button>
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
