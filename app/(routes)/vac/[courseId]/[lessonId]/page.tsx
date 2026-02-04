'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  useVACLesson,
  useStartLesson,
  useMarkLessonComplete,
  useLessonProgress,
  useCourseProgress,
  useIsEnrolled
} from '@/hooks/vac/use-vac';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  FileText,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquare,
  Trophy,
  Wrench
} from 'lucide-react';
import { EnrollmentGate } from '../../_components/enrollment-gate';

export default function LessonDetailPage({
  params
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = use(params);
  const { data, isLoading, isError, error } = useVACLesson(lessonId);
  const { toast } = useToast();
  const { user } = useAuth();

  // Enrollment check
  const { data: enrollmentCheck, refetch: refetchEnrollment } = useIsEnrolled(user?.id, courseId);
  const isEnrolled = enrollmentCheck?.isEnrolled ?? false;

  // Progress tracking hooks
  const startLessonMutation = useStartLesson();
  const markCompleteMutation = useMarkLessonComplete();
  const { data: lessonProgress } = useLessonProgress(user?.id, lessonId);
  const { data: courseProgress } = useCourseProgress(user?.id, courseId);

  // Local state for completion
  const [isCompleting, setIsCompleting] = useState(false);

  const lesson = data?.lesson;
  const course = data?.course;
  const prevLesson = data?.prev_lesson;
  const nextLesson = data?.next_lesson;

  const isCompleted = lessonProgress?.status === 'completed';
  const isInProgress = lessonProgress?.status === 'in_progress';

  // Determine if this lesson is accessible (hour 1 is free preview, others require enrollment)
  const isFreePreview = lesson?.hour === 1;
  const hasAccess = isFreePreview || isEnrolled;

  // Mark lesson as in_progress when user opens it (if authenticated and has access)
  useEffect(() => {
    if (user?.id && courseId && lessonId && lesson && !isCompleted && hasAccess) {
      startLessonMutation.mutate({
        userId: user.id,
        courseId,
        lessonId
      });
    }
    // Only run when lesson loads, not on every dependency change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, lessonId, lesson?.id, hasAccess]);

  const handleMarkComplete = async () => {
    if (!user?.id) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to track your progress',
        variant: 'destructive'
      });
      return;
    }

    setIsCompleting(true);
    try {
      await markCompleteMutation.mutateAsync({
        userId: user.id,
        courseId,
        lessonId
      });
      toast({
        title: 'Lesson completed!',
        description: nextLesson
          ? 'Great job! Continue to the next lesson.'
          : 'Congratulations on completing all lessons!',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to mark lesson as complete',
        variant: 'destructive'
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied!',
        description: 'Prompt copied to clipboard',
      });
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (isError || !lesson || !course) {
    return (
      <ContentLayout title="Error">
        <div className="space-y-6">
          <Link href={`/vac/${courseId}`}>
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Course
            </Button>
          </Link>
          <div className="text-center py-12">
            <p className="text-destructive">
              Failed to load lesson: {error instanceof Error ? error.message : 'Lesson not found'}
            </p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={lesson.title}>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/vac/${courseId}`}>{course.code}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Hour {lesson.hour}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Progress Bar (for authenticated users) */}
        {user && courseProgress && (
          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  Course Progress: {courseProgress.completed} of {courseProgress.total} lessons
                </span>
                <span className="text-sm font-medium">{courseProgress.percentage}%</span>
              </div>
              <Progress value={courseProgress.percentage} className="h-2" />
              {courseProgress.percentage === 100 && (
                <div className="flex items-center gap-2 mt-2 text-green-600">
                  <Trophy className="h-4 w-4" />
                  <span className="text-sm font-medium">Course Complete!</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link href={`/vac/${courseId}`}>
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Course
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            {/* Lesson status badge */}
            {user && (
              isCompleted ? (
                <Badge variant="default" className="bg-green-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </Badge>
              ) : isInProgress ? (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  In Progress
                </Badge>
              ) : null
            )}
            {prevLesson && (
              <Link href={`/vac/${courseId}/${prevLesson.id}`}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Hour {prevLesson.hour}
                </Button>
              </Link>
            )}
            {nextLesson && (
              <Link href={`/vac/${courseId}/${nextLesson.id}`}>
                <Button variant="outline" size="sm">
                  Hour {nextLesson.hour}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">{course.code}</Badge>
            <Badge variant="outline">Week {lesson.week}</Badge>
            <Badge variant="outline">Hour {lesson.hour}</Badge>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{lesson.title}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {lesson.duration_minutes} minutes
            </span>
            {lesson.toolboxes && (
              <span className="flex items-center gap-1">
                <Wrench className="h-4 w-4" />
                {lesson.toolboxes}
              </span>
            )}
          </div>
          {lesson.prerequisites && (
            <p className="text-sm text-muted-foreground mt-2">
              Prerequisites: {lesson.prerequisites}
            </p>
          )}
          {/* Free preview badge */}
          {isFreePreview && !isEnrolled && (
            <Badge variant="outline" className="mt-2 text-green-600 border-green-600">
              Free Preview Lesson
            </Badge>
          )}
        </div>

        {/* Enrollment Gate - wraps content for non-enrolled users (except free preview) */}
        {!hasAccess ? (
          <EnrollmentGate
            course={course}
            userId={user?.id}
            isEnrolled={false}
            onEnrollSuccess={() => refetchEnrollment()}
          >
            <div />
          </EnrollmentGate>
        ) : (
          <>
        {/* Content Tabs */}
        <Tabs defaultValue="outcomes" className="w-full">
          <TabsList className="flex-wrap h-auto gap-1 mb-6">
            <TabsTrigger value="outcomes" className="gap-1">
              <GraduationCap className="h-4 w-4" />
              Outcomes
            </TabsTrigger>
            <TabsTrigger value="faculty" className="gap-1">
              <FileText className="h-4 w-4" />
              Faculty Script
            </TabsTrigger>
            <TabsTrigger value="student" className="gap-1">
              <BookOpen className="h-4 w-4" />
              Content
            </TabsTrigger>
            <TabsTrigger value="exercises" className="gap-1">
              <Code className="h-4 w-4" />
              Exercises
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1">
              <MessageSquare className="h-4 w-4" />
              AI Prompts
            </TabsTrigger>
            <TabsTrigger value="troubleshooting" className="gap-1">
              <Wrench className="h-4 w-4" />
              Troubleshooting
            </TabsTrigger>
            <TabsTrigger value="interview" className="gap-1">
              <HelpCircle className="h-4 w-4" />
              Interview Prep
            </TabsTrigger>
          </TabsList>

          {/* Learning Outcomes */}
          <TabsContent value="outcomes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Learning Outcomes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lesson.learning_outcomes && lesson.learning_outcomes.length > 0 ? (
                  <ul className="space-y-3">
                    {lesson.learning_outcomes.map((outcome, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{outcome}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No learning outcomes defined.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Faculty Script */}
          <TabsContent value="faculty">
            <div className="space-y-4">
              {lesson.faculty_script && lesson.faculty_script.length > 0 ? (
                lesson.faculty_script.map((section, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2 text-sm text-primary font-mono">
                        {section.time_range}
                      </div>
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {section.content}
                        </ReactMarkdown>
                      </div>
                      {section.visuals && (
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md text-sm text-blue-800 dark:text-blue-200">
                          <Lightbulb className="h-4 w-4 inline mr-2" />
                          Visual: {section.visuals}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No faculty script available.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Student Content */}
          <TabsContent value="student">
            <div className="space-y-4">
              {lesson.student_content && lesson.student_content.length > 0 ? (
                lesson.student_content.map((block, i) => (
                  <Card key={i}>
                    {block.title && (
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{block.title}</CardTitle>
                      </CardHeader>
                    )}
                    <CardContent className={block.title ? '' : 'pt-6'}>
                      {block.type === 'code' ? (
                        <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
                          <code>{block.content}</code>
                        </pre>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {block.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No student content available.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Exercises */}
          <TabsContent value="exercises">
            <div className="space-y-4">
              {lesson.exercises && lesson.exercises.length > 0 ? (
                lesson.exercises.map((exercise, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{exercise.title}</CardTitle>
                        <Badge variant={
                          exercise.difficulty === 'required' ? 'default' :
                          exercise.difficulty === 'medium' ? 'secondary' : 'outline'
                        }>
                          {exercise.difficulty}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Question:</h4>
                        <div className="prose prose-sm dark:prose-invert max-w-none bg-muted p-4 rounded-lg">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {exercise.question}
                          </ReactMarkdown>
                        </div>
                      </div>
                      {exercise.solution && (
                        <div>
                          <h4 className="font-medium mb-2">Solution:</h4>
                          <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
                            <code>{exercise.solution}</code>
                          </pre>
                        </div>
                      )}
                      {exercise.hints && exercise.hints.length > 0 && (
                        <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                          <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Hints:</h4>
                          <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300">
                            {exercise.hints.map((hint, j) => (
                              <li key={j}>{hint}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No exercises available.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* AI Prompts */}
          <TabsContent value="prompts">
            <div className="space-y-4">
              {lesson.gemini_prompts && lesson.gemini_prompts.length > 0 ? (
                lesson.gemini_prompts.map((prompt, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <CardTitle className="text-lg">{prompt.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm">
                        {prompt.prompt}
                      </pre>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => copyToClipboard(prompt.prompt)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy Prompt
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No AI prompts available.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Error Troubleshooting */}
          <TabsContent value="troubleshooting">
            <div className="space-y-4">
              {lesson.error_troubleshooting && lesson.error_troubleshooting.length > 0 ? (
                lesson.error_troubleshooting.map((item, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <CardTitle className="text-lg text-destructive">{item.error}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <span className="font-medium">Problem:</span> {item.problem}
                      </div>
                      <div>
                        <span className="font-medium">Cause:</span> {item.cause}
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md">
                        <span className="font-medium text-green-800 dark:text-green-200">Fix:</span>{' '}
                        <span className="text-green-700 dark:text-green-300">{item.fix}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Prevention:</span> {item.prevention}
                      </div>
                      {item.code_example && (
                        <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
                          <code>{item.code_example}</code>
                        </pre>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No troubleshooting guides available.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Interview Questions */}
          <TabsContent value="interview">
            <div className="space-y-4">
              {lesson.interview_questions && lesson.interview_questions.length > 0 ? (
                lesson.interview_questions.map((item, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <CardTitle className="text-lg">Q: {item.question}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {item.model_answer}
                        </ReactMarkdown>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No interview questions available.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Self-Check Section */}
        {lesson.self_check && lesson.self_check.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Self-Check
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {lesson.self_check.map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Checkbox id={`self-check-${i}`} />
                    <Label htmlFor={`self-check-${i}`} className="cursor-pointer">
                      {item}
                    </Label>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Resources Section */}
        {lesson.resources && lesson.resources.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {lesson.resources.map((resource, i) => (
                  <a
                    key={i}
                    href={resource.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted transition-colors"
                  >
                    <Badge variant="outline">{resource.type}</Badge>
                    <div>
                      <div className="font-medium">{resource.title}</div>
                      {resource.duration && (
                        <div className="text-sm text-muted-foreground">{resource.duration}</div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mark Complete / Navigation Footer */}
        <div className="flex items-center justify-between pt-6 border-t">
          {prevLesson ? (
            <Link href={`/vac/${courseId}/${prevLesson.id}`}>
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous: Hour {prevLesson.hour}
              </Button>
            </Link>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {/* Mark Complete Button (only for authenticated users, not yet completed) */}
            {user && !isCompleted && (
              <Button
                variant="default"
                onClick={handleMarkComplete}
                disabled={isCompleting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isCompleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Mark Complete
              </Button>
            )}

            {nextLesson ? (
              <Link href={`/vac/${courseId}/${nextLesson.id}`}>
                <Button>
                  Next: Hour {nextLesson.hour}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            ) : (
              <Link href={`/vac/${courseId}`}>
                <Button>
                  <Trophy className="h-4 w-4 mr-2" />
                  Finish Course
                </Button>
              </Link>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </ContentLayout>
  );
}
