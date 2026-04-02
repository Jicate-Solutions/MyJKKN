'use client';

import { use, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateVACLesson } from '@/hooks/vac/use-vac';
import type { CreateVACLessonInput, LTLPhase } from '@/types/vac';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreateLessonPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const router = useRouter();
  const createMutation = useCreateVACLesson();

  const [form, setForm] = useState<Partial<CreateVACLessonInput>>({
    course_id: courseId,
    week: 1,
    hour: 1,
    title: '',
    duration_minutes: 60,
    prerequisites: '',
    toolboxes: '',
    ltl_phase: 'learn',
    is_published: false,
  });

  const updateField = <K extends keyof CreateVACLessonInput>(
    key: K,
    value: CreateVACLessonInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;

    createMutation.mutate(
      {
        ...form,
        course_id: courseId,
      } as CreateVACLessonInput,
      {
        onSuccess: () => {
          router.push(`/vac/admin/courses/${courseId}/lessons`);
        },
      }
    );
  };

  return (
    <ContentLayout title="New Lesson">
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
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Lesson</h1>
            <p className="text-sm text-muted-foreground">
              Add a new lesson to the course
            </p>
          </div>
        </div>

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
                  placeholder="Lesson title"
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
                    placeholder="What learners should know before this lesson..."
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
                    placeholder="Tools and software needed..."
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
                <Label htmlFor="is_published">Publish immediately</Label>
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
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Create Lesson
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
