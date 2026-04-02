'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useState } from 'react';
import type { VACLesson, LTLPhase } from '@/types/vac';

// ── Helper to parse JSONB textarea safely ───────────────────────────────

function safeParseJson(value: string, fallback: unknown[] = []): unknown {
  if (!value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return null; // signal parse error
  }
}

function jsonStringify(value: unknown): string {
  if (!value || (Array.isArray(value) && value.length === 0)) return '';
  return JSON.stringify(value, null, 2);
}

// ── Schema ──────────────────────────────────────────────────────────────

const lessonFormSchema = z.object({
  week: z.coerce.number().min(1, 'Week is required'),
  hour: z.coerce.number().min(1, 'Hour is required'),
  title: z.string().min(2, 'Title is required'),
  duration_minutes: z.coerce.number().min(1).default(60),
  ltl_phase: z.enum(['learn', 'leverage', 'both']).default('learn'),
  is_published: z.boolean().default(false),
  // JSONB fields stored as strings in the form, parsed on submit
  learning_outcomes_json: z.string().default(''),
  student_content_json: z.string().default(''),
  exercises_json: z.string().default(''),
  gemini_prompts_json: z.string().default(''),
  self_check_json: z.string().default(''),
  resources_json: z.string().default(''),
});

type LessonFormValues = z.infer<typeof lessonFormSchema>;

interface LessonFormProps {
  lesson?: VACLesson;
  courseId: string;
  onSubmit: (data: {
    course_id: string;
    week: number;
    hour: number;
    title: string;
    duration_minutes: number;
    ltl_phase: LTLPhase;
    is_published: boolean;
    learning_outcomes?: unknown[];
    student_content?: unknown[];
    exercises?: unknown[];
    gemini_prompts?: unknown[];
    self_check?: unknown[];
    resources?: unknown[];
  }) => void;
  isSubmitting: boolean;
}

const JSONB_FIELDS = [
  {
    name: 'learning_outcomes_json' as const,
    label: 'Learning Outcomes',
    description: 'Array of {id, description, bloom_level?} objects',
    placeholder: '[{"id": "lo-1", "description": "Understand basic AI concepts", "bloom_level": "understand"}]',
  },
  {
    name: 'student_content_json' as const,
    label: 'Student Content',
    description: 'Array of content blocks: {type, content, language?, url?, items?}',
    placeholder: '[{"type": "text", "content": "Introduction to the lesson..."}]',
  },
  {
    name: 'exercises_json' as const,
    label: 'Exercises',
    description: 'Tiered exercises: {tier: "apply"|"analyze"|"create", title, description}',
    placeholder: '[{"tier": "apply", "title": "Basic Exercise", "description": "Create a simple prompt"}]',
  },
  {
    name: 'gemini_prompts_json' as const,
    label: 'Gemini Prompts',
    description: 'AI prompts: {id, title, prompt, expected_behavior?}',
    placeholder: '[{"id": "gp-1", "title": "Summarize", "prompt": "Summarize the following..."}]',
  },
  {
    name: 'self_check_json' as const,
    label: 'Self-Check Questions',
    description: 'Questions: {id, question, options: [{label, value}], correct_answer, explanation?}',
    placeholder: '[{"id": "q1", "question": "What is AI?", "options": [{"label": "A", "value": "a"}], "correct_answer": "a"}]',
  },
  {
    name: 'resources_json' as const,
    label: 'Resources',
    description: 'Links: {title, url, type: "article"|"video"|"tool"|"documentation"|"other"}',
    placeholder: '[{"title": "MDN Docs", "url": "https://developer.mozilla.org", "type": "documentation"}]',
  },
];

export function LessonForm({ lesson, courseId, onSubmit, isSubmitting }: LessonFormProps) {
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  const form = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      week: lesson?.week ?? 1,
      hour: lesson?.hour ?? 1,
      title: lesson?.title ?? '',
      duration_minutes: lesson?.duration_minutes ?? 60,
      ltl_phase: lesson?.ltl_phase ?? 'learn',
      is_published: lesson?.is_published ?? false,
      learning_outcomes_json: jsonStringify(lesson?.learning_outcomes),
      student_content_json: jsonStringify(lesson?.student_content),
      exercises_json: jsonStringify(lesson?.exercises),
      gemini_prompts_json: jsonStringify(lesson?.gemini_prompts),
      self_check_json: jsonStringify(lesson?.self_check),
      resources_json: jsonStringify(lesson?.resources),
    },
  });

  const handleFormSubmit = (values: LessonFormValues) => {
    const errors: Record<string, string> = {};

    const jsonFields = {
      learning_outcomes: values.learning_outcomes_json,
      student_content: values.student_content_json,
      exercises: values.exercises_json,
      gemini_prompts: values.gemini_prompts_json,
      self_check: values.self_check_json,
      resources: values.resources_json,
    };

    const parsed: Record<string, unknown[]> = {};

    for (const [key, raw] of Object.entries(jsonFields)) {
      if (!raw.trim()) {
        parsed[key] = [];
        continue;
      }
      const result = safeParseJson(raw);
      if (result === null) {
        errors[`${key}_json`] = `Invalid JSON in ${key.replace(/_/g, ' ')}`;
      } else {
        parsed[key] = result as unknown[];
      }
    }

    if (Object.keys(errors).length > 0) {
      setJsonErrors(errors);
      return;
    }

    setJsonErrors({});

    onSubmit({
      course_id: courseId,
      week: values.week,
      hour: values.hour,
      title: values.title,
      duration_minutes: values.duration_minutes,
      ltl_phase: values.ltl_phase as LTLPhase,
      is_published: values.is_published,
      learning_outcomes: parsed.learning_outcomes,
      student_content: parsed.student_content,
      exercises: parsed.exercises,
      gemini_prompts: parsed.gemini_prompts,
      self_check: parsed.self_check,
      resources: parsed.resources,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* ── Basic Fields ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lesson Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="week"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Week *</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hour"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hour *</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="Lesson title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="duration_minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (minutes)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ltl_phase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>LTL Phase</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex gap-4 pt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="learn" id="ltl-learn" />
                        <Label htmlFor="ltl-learn">Learn</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="leverage" id="ltl-leverage" />
                        <Label htmlFor="ltl-leverage">Leverage</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="both" id="ltl-both" />
                        <Label htmlFor="ltl-both">Both</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── JSONB Content Sections ─────────────────────────────── */}
        {JSONB_FIELDS.map((jf) => (
          <Card key={jf.name}>
            <CardHeader>
              <CardTitle className="text-base">{jf.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name={jf.name}
                render={({ field }) => (
                  <FormItem>
                    <FormDescription>{jf.description}</FormDescription>
                    <FormControl>
                      <Textarea
                        rows={6}
                        className="font-mono text-xs"
                        placeholder={jf.placeholder}
                        {...field}
                      />
                    </FormControl>
                    {jsonErrors[jf.name] && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{jsonErrors[jf.name]}</AlertDescription>
                      </Alert>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        ))}

        {/* ── Publish toggle ─────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <FormField
              control={form.control}
              name="is_published"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Published</FormLabel>
                    <FormDescription>
                      Make this lesson visible to enrolled learners
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Actions ────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {lesson ? 'Update Lesson' : 'Create Lesson'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
