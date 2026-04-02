'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  BookOpen,
  Code2,
  Dumbbell,
  Sparkles,
  HelpCircle,
  Link2,
} from 'lucide-react';
import type {
  VACLesson,
  LearningOutcome,
  ContentBlock,
  TieredExercise,
  SelfCheckQuestion,
  GeminiPrompt,
  ResourceLink,
} from '@/types/vac';

interface LessonPreviewProps {
  lesson: VACLesson;
}

// ── Sub-components ──────────────────────────────────────────────────────

function OutcomesList({ outcomes }: { outcomes: LearningOutcome[] }) {
  if (!outcomes?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          Learning Outcomes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {outcomes.map((o) => (
            <li key={o.id} className="flex items-start gap-2 text-sm">
              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
              <div>
                <span>{o.description}</span>
                {o.bloom_level && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {o.bloom_level}
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ContentBlockRenderer({ blocks, title, icon }: { blocks: ContentBlock[]; title: string; icon: React.ReactNode }) {
  if (!blocks?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {blocks.map((block, idx) => (
          <div key={idx}>
            {block.type === 'heading' && (
              <h4 className="font-semibold text-sm">{block.content}</h4>
            )}
            {block.type === 'text' && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.content}</p>
            )}
            {block.type === 'code' && (
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
                {block.language && (
                  <span className="text-muted-foreground block mb-1">{block.language}</span>
                )}
                <code>{block.content}</code>
              </pre>
            )}
            {block.type === 'list' && block.items && (
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
            {block.type === 'callout' && (
              <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950 p-3 text-sm">
                {block.content}
              </div>
            )}
            {(block.type === 'image' || block.type === 'video') && block.url && (
              <div className="text-sm text-muted-foreground">
                [{block.type}]: <a href={block.url} target="_blank" rel="noopener noreferrer" className="underline">{block.url}</a>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ExercisesList({ exercises }: { exercises: TieredExercise[] }) {
  if (!exercises?.length) return null;

  const tierColor = (tier: string) => {
    switch (tier) {
      case 'apply': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'analyze': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'create': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return '';
    }
  };

  const grouped = {
    apply: exercises.filter((e) => e.tier === 'apply'),
    analyze: exercises.filter((e) => e.tier === 'analyze'),
    create: exercises.filter((e) => e.tier === 'create'),
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Dumbbell className="h-4 w-4 text-orange-600" />
          Exercises
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(['apply', 'analyze', 'create'] as const).map((tier) => {
          const items = grouped[tier];
          if (!items.length) return null;
          return (
            <div key={tier}>
              <Badge className={`mb-2 capitalize ${tierColor(tier)}`}>{tier}</Badge>
              <div className="space-y-2 pl-2">
                {items.map((ex, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <p className="font-medium text-sm">{ex.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{ex.description}</p>
                    {ex.expected_output && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Expected: {ex.expected_output}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SelfCheckList({ questions }: { questions: SelfCheckQuestion[] }) {
  if (!questions?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HelpCircle className="h-4 w-4 text-violet-600" />
          Self-Check Questions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((q, idx) => (
          <div key={q.id || idx} className="rounded-md border p-3">
            <p className="font-medium text-sm mb-2">
              {idx + 1}. {q.question}
            </p>
            <div className="space-y-1 pl-2">
              {q.options.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex items-center gap-2 text-sm rounded px-2 py-1 ${
                    opt.value === q.correct_answer
                      ? 'bg-green-50 dark:bg-green-950 font-medium text-green-700 dark:text-green-300'
                      : 'text-muted-foreground'
                  }`}
                >
                  <span className="w-5 text-center">{opt.label}.</span>
                  <span>{opt.value}</span>
                  {opt.value === q.correct_answer && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 ml-auto" />
                  )}
                </div>
              ))}
            </div>
            {q.explanation && (
              <p className="text-xs text-muted-foreground mt-2 italic pl-2">
                {q.explanation}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ResourcesList({ resources }: { resources: ResourceLink[] }) {
  if (!resources?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Link2 className="h-4 w-4 text-sky-600" />
          Resources
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {resources.map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs capitalize shrink-0">
                {r.type}
              </Badge>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline truncate"
              >
                {r.title}
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── Main Preview Component ──────────────────────────────────────────────

export function LessonPreview({ lesson }: LessonPreviewProps) {
  const phaseLabel = lesson.ltl_phase === 'both' ? 'Learn + Leverage' : lesson.ltl_phase;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline">Week {lesson.week}, Hour {lesson.hour}</Badge>
        <Badge variant="outline" className="capitalize">{phaseLabel}</Badge>
        <Badge variant={lesson.is_published ? 'default' : 'secondary'}>
          {lesson.is_published ? 'Published' : 'Draft'}
        </Badge>
        <span className="text-sm text-muted-foreground ml-auto">
          {lesson.duration_minutes} min
        </span>
      </div>

      <h2 className="text-xl font-semibold">{lesson.title}</h2>

      <Separator />

      <OutcomesList outcomes={lesson.learning_outcomes} />

      <ContentBlockRenderer
        blocks={lesson.student_content}
        title="Student Content"
        icon={<BookOpen className="h-4 w-4 text-blue-600" />}
      />

      <ExercisesList exercises={lesson.exercises} />

      {lesson.gemini_prompts?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-amber-600" />
              Gemini Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lesson.gemini_prompts.map((gp: GeminiPrompt) => (
              <div key={gp.id} className="rounded-md border p-3">
                <p className="font-medium text-sm">{gp.title}</p>
                <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap bg-muted rounded p-2">
                  {gp.prompt}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <SelfCheckList questions={lesson.self_check} />

      <ResourcesList resources={lesson.resources} />
    </div>
  );
}
