'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVACLesson, useUpdateVACLesson } from '@/hooks/vac/use-vac';
import type { VACLesson, UpdateVACLessonInput, LTLPhase } from '@/types/vac';
import { ArrowLeft, Save, Loader2, Eye, EyeOff } from 'lucide-react';

// ── Lesson Preview ────────────────────────────────────────────────────────────

function LessonPreview({ lesson }: { lesson: VACLesson }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h3 className="font-semibold text-lg">{lesson.title}</h3>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>Week {lesson.week}, Hour {lesson.hour}</span>
            <span>-</span>
            <span>{lesson.duration_minutes} min</span>
            <Badge variant="secondary" className="ml-1">
              {lesson.ltl_phase}
            </Badge>
          </div>
        </div>
        {lesson.prerequisites && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Prerequisites
            </p>
            <p className="text-sm">{lesson.prerequisites}</p>
          </div>
        )}
        {lesson.learning_outcomes && lesson.learning_outcomes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Learning Outcomes
            </p>
            <ul className="list-disc list-inside text-sm space-y-1">
              {lesson.learning_outcomes.map((lo) => (
                <li key={lo.id}>{lo.description}</li>
              ))}
            </ul>
          </div>
        )}
        {lesson.student_content && lesson.student_content.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Content Blocks
            </p>
            <p className="text-sm text-muted-foreground">
              {lesson.student_content.length} block(s)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EditLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = use(params);
  const router = useRouter();

  const { data: lessonData, isLoading } = useVACLesson(lessonId);
  const updateMutation = useUpdateVACLesson(courseId);

  const lesson = lessonData as VACLesson | undefined;

  const [form, setForm] = useState<Partial<UpdateVACLessonInput>>({});
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (lesson) {
      setForm({
        week: lesson.week,
        hour: lesson.hour,
        title: lesson.title,
        duration_minutes: lesson.duration_minutes,
        prerequisites: lesson.prerequisites || '',
        toolboxes: lesson.toolboxes || '',
        ltl_phase: lesson.ltl_phase,
        is_published: lesson.is_published,
      });
    }
  }, [lesson]);

  const updateField = <K extends keyof UpdateVACLessonInput>(
    key: K,
    value: UpdateVACLessonInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;

    updateMutation.mutate(
      { id: lessonId, ...form } as UpdateVACLessonInput & { id: string },
      {
        onSuccess: () => {
          router.push(`/vac/admin/courses/${courseId}/lessons`);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Edit Lesson">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!lesson) {
    return (
      <ContentLayout title="Lesson Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">Lesson not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() =>
              router.push(`/vac/admin/courses/${courseId}/lessons`)
            }
          >
            Back to Lessons
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${lesson.title}`}>
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
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin/courses">Courses</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/vac/admin/courses/${courseId}/lessons`}>
              Lessons
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Edit Lesson</h1>
              <p className="text-sm text-muted-foreground">
                Week {lesson.week}, Hour {lesson.hour}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </>
            )}
          </Button>
        </div>

        {showPreview && <LessonPreview lesson={{ ...lesson, ...form } as VACLesson} />}

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lesson Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={form.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="week">Week</Label>
                  <Input
                    id="week"
                    type="number"
                    min={1}
                    value={form.week ?? 1}
                    onChange={(e) =>
                      updateField('week', Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hour">Hour</Label>
                  <Input
                    id="hour"
                    type="number"
                    min={1}
                    value={form.hour ?? 1}
                    onChange={(e) =>
                      updateField('hour', Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    value={form.duration_minutes ?? 60}
                    onChange={(e) =>
                      updateField('duration_minutes', Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>LTL Phase</Label>
                  <Select
                    value={form.ltl_phase || 'learn'}
                    onValueChange={(v) =>
                      updateField('ltl_phase', v as LTLPhase)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="learn">Learn</SelectItem>
                      <SelectItem value="leverage">Leverage</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prerequisites">Prerequisites</Label>
                  <Textarea
                    id="prerequisites"
                    value={form.prerequisites || ''}
                    onChange={(e) =>
                      updateField('prerequisites', e.target.value)
                    }
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toolboxes">Toolboxes</Label>
                  <Textarea
                    id="toolboxes"
                    value={form.toolboxes || ''}
                    onChange={(e) => updateField('toolboxes', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="is_published"
                  checked={form.is_published || false}
                  onCheckedChange={(v) => updateField('is_published', v)}
                />
                <Label htmlFor="is_published">Published</Label>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(`/vac/admin/courses/${courseId}/lessons`)
              }
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
