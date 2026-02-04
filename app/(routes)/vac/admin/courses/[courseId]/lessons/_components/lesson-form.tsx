'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  Loader2,
  BookOpen,
  Users,
  FileText,
  Code,
  Brain,
  AlertCircle,
  MessageSquare,
  Link as LinkIcon,
  CheckSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { VACLesson, VACLessonFormData } from '@/types/vac';
import { useCreateVACLesson, useUpdateVACLesson } from '@/hooks/vac/use-vac';
import { LessonPreview } from './lesson-preview';

// Zod schemas for nested objects
const facultyScriptSchema = z.object({
  time_range: z.string().min(1, 'Time range required'),
  title: z.string().min(1, 'Title required'),
  content: z.string().min(1, 'Content required'),
  visuals: z.string().optional()
});

const contentBlockSchema = z.object({
  type: z.enum(['text', 'code', 'table', 'diagram', 'checklist']),
  title: z.string().optional(),
  content: z.string().min(1, 'Content required'),
  language: z.string().optional()
});

const exerciseSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Title required'),
  difficulty: z.enum(['required', 'medium', 'optional']),
  question: z.string().min(1, 'Question required'),
  solution: z.string().optional(),
  hints: z.array(z.string()).optional()
});

const geminiPromptSchema = z.object({
  title: z.string().min(1, 'Title required'),
  prompt: z.string().min(1, 'Prompt required')
});

const troubleshootingSchema = z.object({
  error: z.string().min(1, 'Error required'),
  problem: z.string().min(1, 'Problem required'),
  cause: z.string().min(1, 'Cause required'),
  fix: z.string().min(1, 'Fix required'),
  prevention: z.string().min(1, 'Prevention required'),
  code_example: z.string().optional()
});

const interviewQuestionSchema = z.object({
  question: z.string().min(1, 'Question required'),
  model_answer: z.string().min(1, 'Answer required')
});

const resourceSchema = z.object({
  type: z.string().min(1, 'Type required'),
  title: z.string().min(1, 'Title required'),
  link: z.string().url('Valid URL required'),
  duration: z.string().optional()
});

const lessonFormSchema = z.object({
  week: z.coerce.number().min(1, 'Week must be at least 1'),
  hour: z.coerce.number().min(1, 'Hour must be at least 1'),
  title: z.string().min(1, 'Title is required'),
  duration_minutes: z.coerce.number().min(1, 'Duration required'),
  prerequisites: z.string(),
  toolboxes: z.string(),
  learning_outcomes: z.array(z.string()),
  faculty_script: z.array(facultyScriptSchema),
  student_content: z.array(contentBlockSchema),
  exercises: z.array(exerciseSchema),
  gemini_prompts: z.array(geminiPromptSchema),
  error_troubleshooting: z.array(troubleshootingSchema),
  interview_questions: z.array(interviewQuestionSchema),
  resources: z.array(resourceSchema),
  self_check: z.array(z.string()),
  is_published: z.boolean()
});

type LessonFormValues = z.infer<typeof lessonFormSchema>;

interface LessonFormProps {
  courseId: string;
  lesson?: VACLesson;
  mode: 'create' | 'edit';
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Check if badge is a simple value that needs wrapping
  const isSimpleBadge = typeof badge === 'string' || typeof badge === 'number';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between p-4 h-auto hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <span className="font-medium">{title}</span>
            {badge !== undefined && (
              isSimpleBadge ? (
                <Badge variant="secondary" className="ml-2">
                  {badge}
                </Badge>
              ) : (
                <span className="ml-2">{badge}</span>
              )
            )}
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// String array editor component
function StringArrayEditor({
  value,
  onChange,
  placeholder = 'Add item...'
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...value, newItem.trim()]);
      setNewItem('');
    }
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
        />
        <Button type="button" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-1">
        {value.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 bg-muted rounded-md"
          >
            <span className="flex-1 text-sm">{item}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeItem(index)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LessonForm({ courseId, lesson, mode }: LessonFormProps) {
  const router = useRouter();
  const createMutation = useCreateVACLesson();
  const updateMutation = useUpdateVACLesson();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const form = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      week: lesson?.week || 1,
      hour: lesson?.hour || 1,
      title: lesson?.title || '',
      duration_minutes: lesson?.duration_minutes || 60,
      prerequisites: lesson?.prerequisites || '',
      toolboxes: lesson?.toolboxes || '',
      learning_outcomes: lesson?.learning_outcomes || [],
      faculty_script: lesson?.faculty_script || [],
      student_content: lesson?.student_content || [],
      exercises: lesson?.exercises || [],
      gemini_prompts: lesson?.gemini_prompts || [],
      error_troubleshooting: lesson?.error_troubleshooting || [],
      interview_questions: lesson?.interview_questions || [],
      resources: lesson?.resources || [],
      self_check: lesson?.self_check || [],
      is_published: lesson?.is_published || false
    }
  });

  // Field arrays for complex nested types
  const facultyScriptArray = useFieldArray({
    control: form.control,
    name: 'faculty_script'
  });

  const studentContentArray = useFieldArray({
    control: form.control,
    name: 'student_content'
  });

  const exercisesArray = useFieldArray({
    control: form.control,
    name: 'exercises'
  });

  const geminiPromptsArray = useFieldArray({
    control: form.control,
    name: 'gemini_prompts'
  });

  const troubleshootingArray = useFieldArray({
    control: form.control,
    name: 'error_troubleshooting'
  });

  const interviewQuestionsArray = useFieldArray({
    control: form.control,
    name: 'interview_questions'
  });

  const resourcesArray = useFieldArray({
    control: form.control,
    name: 'resources'
  });

  const onSubmit = async (data: LessonFormValues) => {
    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({
          courseId,
          data: data as VACLessonFormData
        });
        toast.success('Lesson created successfully');
      } else {
        await updateMutation.mutateAsync({
          lessonId: lesson!.id,
          data: data as Partial<VACLessonFormData>
        });
        toast.success('Lesson updated successfully');
      }
      router.push(`/vac/admin/courses/${courseId}/lessons`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save lesson'
      );
    }
  };

  const watchedValues = form.watch();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-10">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
            <TabsTrigger value="faculty">Faculty</TabsTrigger>
            <TabsTrigger value="student">Student</TabsTrigger>
            <TabsTrigger value="exercises">Exercises</TabsTrigger>
            <TabsTrigger value="ai">AI Prompts</TabsTrigger>
            <TabsTrigger value="troubleshoot">Errors</TabsTrigger>
            <TabsTrigger value="interview">Interview</TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="selfcheck">Self-Check</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="week"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Week</FormLabel>
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
                        <FormLabel>Hour #</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormDescription>e.g., Hour 1 of 30</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration_minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (min)</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_published"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Published</FormLabel>
                          <FormDescription>
                            Make lesson visible
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lesson Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Introduction to MATLAB" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prerequisites"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prerequisites</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Basic programming knowledge, familiarity with matrices..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="toolboxes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Required Toolboxes</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Signal Processing Toolbox, Image Processing Toolbox"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Comma-separated list of required MATLAB toolboxes
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Learning Outcomes Tab */}
          <TabsContent value="outcomes" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Learning Outcomes
                  <Badge variant="secondary">
                    {watchedValues.learning_outcomes?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="learning_outcomes"
                  render={({ field }) => (
                    <FormItem>
                      <FormDescription>
                        What students will learn from this lesson
                      </FormDescription>
                      <FormControl>
                        <StringArrayEditor
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="e.g., Understand MATLAB workspace basics"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Faculty Script Tab */}
          <TabsContent value="faculty" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Faculty Script
                  <Badge variant="secondary">
                    {facultyScriptArray.fields.length}
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    facultyScriptArray.append({
                      time_range: '',
                      title: '',
                      content: '',
                      visuals: ''
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Section
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {facultyScriptArray.fields.map((field, index) => (
                  <CollapsibleSection
                    key={field.id}
                    title={
                      watchedValues.faculty_script?.[index]?.title ||
                      `Section ${index + 1}`
                    }
                    icon={FileText}
                    defaultOpen={index === facultyScriptArray.fields.length - 1}
                    badge={watchedValues.faculty_script?.[index]?.time_range}
                  >
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`faculty_script.${index}.time_range`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Time Range</FormLabel>
                              <FormControl>
                                <Input placeholder="[0:00-0:05]" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`faculty_script.${index}.title`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Section Title</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Opening & Schedule"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`faculty_script.${index}.content`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Content (Markdown)</FormLabel>
                            <FormControl>
                              <Textarea rows={6} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`faculty_script.${index}.visuals`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Visual Aids (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Slide 1, Demo video..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => facultyScriptArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove Section
                      </Button>
                    </div>
                  </CollapsibleSection>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Student Content Tab */}
          <TabsContent value="student" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Student Content
                  <Badge variant="secondary">
                    {studentContentArray.fields.length}
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    studentContentArray.append({
                      type: 'text',
                      title: '',
                      content: '',
                      language: ''
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Block
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {studentContentArray.fields.map((field, index) => (
                  <CollapsibleSection
                    key={field.id}
                    title={
                      watchedValues.student_content?.[index]?.title ||
                      `Block ${index + 1}`
                    }
                    icon={Code}
                    defaultOpen={index === studentContentArray.fields.length - 1}
                    badge={watchedValues.student_content?.[index]?.type}
                  >
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name={`student_content.${index}.type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Type</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="code">Code</SelectItem>
                                  <SelectItem value="table">Table</SelectItem>
                                  <SelectItem value="diagram">Diagram</SelectItem>
                                  <SelectItem value="checklist">
                                    Checklist
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`student_content.${index}.title`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Title (Optional)</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`student_content.${index}.language`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Language (for code)</FormLabel>
                              <FormControl>
                                <Input placeholder="matlab" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`student_content.${index}.content`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Content</FormLabel>
                            <FormControl>
                              <Textarea rows={6} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => studentContentArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove Block
                      </Button>
                    </div>
                  </CollapsibleSection>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Exercises Tab */}
          <TabsContent value="exercises" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Exercises
                  <Badge variant="secondary">
                    {exercisesArray.fields.length}
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    exercisesArray.append({
                      id: crypto.randomUUID(),
                      title: '',
                      difficulty: 'required',
                      question: '',
                      solution: '',
                      hints: []
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Exercise
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {exercisesArray.fields.map((field, index) => (
                  <CollapsibleSection
                    key={field.id}
                    title={
                      watchedValues.exercises?.[index]?.title ||
                      `Exercise ${index + 1}`
                    }
                    icon={Code}
                    defaultOpen={index === exercisesArray.fields.length - 1}
                    badge={
                      <Badge
                        variant={
                          watchedValues.exercises?.[index]?.difficulty ===
                          'required'
                            ? 'default'
                            : watchedValues.exercises?.[index]?.difficulty ===
                              'medium'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {watchedValues.exercises?.[index]?.difficulty}
                      </Badge>
                    }
                  >
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`exercises.${index}.title`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Title</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Create a Basic Matrix"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`exercises.${index}.difficulty`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Difficulty</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="required">
                                    Required
                                  </SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="optional">
                                    Optional
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`exercises.${index}.question`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Question (Markdown)</FormLabel>
                            <FormControl>
                              <Textarea rows={4} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`exercises.${index}.solution`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Solution (Optional)</FormLabel>
                            <FormControl>
                              <Textarea rows={4} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => exercisesArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove Exercise
                      </Button>
                    </div>
                  </CollapsibleSection>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Prompts Tab */}
          <TabsContent value="ai" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI Prompts (Gemini)
                  <Badge variant="secondary">
                    {geminiPromptsArray.fields.length}
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    geminiPromptsArray.append({ title: '', prompt: '' })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Prompt
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {geminiPromptsArray.fields.map((field, index) => (
                  <CollapsibleSection
                    key={field.id}
                    title={
                      watchedValues.gemini_prompts?.[index]?.title ||
                      `Prompt ${index + 1}`
                    }
                    icon={Brain}
                    defaultOpen={index === geminiPromptsArray.fields.length - 1}
                  >
                    <div className="space-y-4 pt-2">
                      <FormField
                        control={form.control}
                        name={`gemini_prompts.${index}.title`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Debug My Code"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`gemini_prompts.${index}.prompt`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prompt Template</FormLabel>
                            <FormControl>
                              <Textarea rows={4} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => geminiPromptsArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove Prompt
                      </Button>
                    </div>
                  </CollapsibleSection>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Troubleshooting Tab */}
          <TabsContent value="troubleshoot" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Error Troubleshooting
                  <Badge variant="secondary">
                    {troubleshootingArray.fields.length}
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    troubleshootingArray.append({
                      error: '',
                      problem: '',
                      cause: '',
                      fix: '',
                      prevention: '',
                      code_example: ''
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Error
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {troubleshootingArray.fields.map((field, index) => (
                  <CollapsibleSection
                    key={field.id}
                    title={
                      watchedValues.error_troubleshooting?.[index]?.error ||
                      `Error ${index + 1}`
                    }
                    icon={AlertCircle}
                    defaultOpen={
                      index === troubleshootingArray.fields.length - 1
                    }
                  >
                    <div className="space-y-4 pt-2">
                      <FormField
                        control={form.control}
                        name={`error_troubleshooting.${index}.error`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Error Message</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Undefined function or variable 'x'"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`error_troubleshooting.${index}.problem`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Problem</FormLabel>
                              <FormControl>
                                <Textarea rows={2} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`error_troubleshooting.${index}.cause`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cause</FormLabel>
                              <FormControl>
                                <Textarea rows={2} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`error_troubleshooting.${index}.fix`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fix</FormLabel>
                              <FormControl>
                                <Textarea rows={2} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`error_troubleshooting.${index}.prevention`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Prevention</FormLabel>
                              <FormControl>
                                <Textarea rows={2} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`error_troubleshooting.${index}.code_example`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Code Example (Optional)</FormLabel>
                            <FormControl>
                              <Textarea rows={3} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => troubleshootingArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove Error
                      </Button>
                    </div>
                  </CollapsibleSection>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Interview Questions Tab */}
          <TabsContent value="interview" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Interview Questions
                  <Badge variant="secondary">
                    {interviewQuestionsArray.fields.length}
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    interviewQuestionsArray.append({
                      question: '',
                      model_answer: ''
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Question
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {interviewQuestionsArray.fields.map((field, index) => (
                  <CollapsibleSection
                    key={field.id}
                    title={
                      watchedValues.interview_questions?.[index]?.question?.substring(
                        0,
                        50
                      ) || `Question ${index + 1}`
                    }
                    icon={MessageSquare}
                    defaultOpen={
                      index === interviewQuestionsArray.fields.length - 1
                    }
                  >
                    <div className="space-y-4 pt-2">
                      <FormField
                        control={form.control}
                        name={`interview_questions.${index}.question`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Question</FormLabel>
                            <FormControl>
                              <Textarea rows={2} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`interview_questions.${index}.model_answer`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Model Answer (Markdown)</FormLabel>
                            <FormControl>
                              <Textarea rows={4} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => interviewQuestionsArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove Question
                      </Button>
                    </div>
                  </CollapsibleSection>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Resources
                  <Badge variant="secondary">
                    {resourcesArray.fields.length}
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    resourcesArray.append({
                      type: 'Documentation',
                      title: '',
                      link: '',
                      duration: ''
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Resource
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {resourcesArray.fields.map((field, index) => (
                  <CollapsibleSection
                    key={field.id}
                    title={
                      watchedValues.resources?.[index]?.title ||
                      `Resource ${index + 1}`
                    }
                    icon={LinkIcon}
                    defaultOpen={index === resourcesArray.fields.length - 1}
                    badge={watchedValues.resources?.[index]?.type}
                  >
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name={`resources.${index}.type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Type</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Video">Video</SelectItem>
                                  <SelectItem value="Guide">Guide</SelectItem>
                                  <SelectItem value="Documentation">
                                    Documentation
                                  </SelectItem>
                                  <SelectItem value="Article">
                                    Article
                                  </SelectItem>
                                  <SelectItem value="Tool">Tool</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`resources.${index}.title`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Title</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`resources.${index}.duration`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="15 min" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`resources.${index}.link`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>URL</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => resourcesArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove Resource
                      </Button>
                    </div>
                  </CollapsibleSection>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Self-Check Tab */}
          <TabsContent value="selfcheck" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Self-Check Checklist
                  <Badge variant="secondary">
                    {watchedValues.self_check?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="self_check"
                  render={({ field }) => (
                    <FormItem>
                      <FormDescription>
                        Items students can check off to verify their
                        understanding
                      </FormDescription>
                      <FormControl>
                        <StringArrayEditor
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="e.g., I can create a basic matrix in MATLAB"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Form Actions */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t">
          <LessonPreview lesson={watchedValues as VACLessonFormData} />

          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(`/vac/admin/courses/${courseId}/lessons`)
              }
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {mode === 'create' ? 'Create Lesson' : 'Save Changes'}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
