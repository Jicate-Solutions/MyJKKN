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
import { useVACCourse, useUpdateVACCourse } from '@/hooks/vac/use-vac';
import type { UpdateVACCourseInput, VACCourse } from '@/types/vac';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const router = useRouter();

  const { data: courseData, isLoading } = useVACCourse(courseId);
  const updateMutation = useUpdateVACCourse();

  const course = courseData as VACCourse | undefined;

  const [form, setForm] = useState<Partial<UpdateVACCourseInput>>({});

  useEffect(() => {
    if (course) {
      setForm({
        code: course.code,
        name: course.name,
        description: course.description || '',
        track: course.track,
        duration_hours: course.duration_hours,
        weeks: course.weeks,
        fee: course.fee,
        course_category: course.course_category,
        faculty_eligible: course.faculty_eligible,
        nsqf_level: course.nsqf_level ?? undefined,
        nheqf_level: course.nheqf_level ?? undefined,
        ncrf_credits: course.ncrf_credits ?? undefined,
        ncrf_credit_hours: course.ncrf_credit_hours ?? undefined,
      });
    }
  }, [course]);

  const updateField = <K extends keyof UpdateVACCourseInput>(
    key: K,
    value: UpdateVACCourseInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name) return;

    updateMutation.mutate(
      { id: courseId, ...form } as UpdateVACCourseInput & { id: string },
      {
        onSuccess: () => {
          router.push('/vac/admin/courses');
        },
      }
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Edit Course">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!course) {
    return (
      <ContentLayout title="Course Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">Course not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/vac/admin/courses')}
          >
            Back to Courses
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${course.name}`}>
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
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Course</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {course.code}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Course Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Course Code *</Label>
                  <Input
                    id="code"
                    value={form.code || ''}
                    onChange={(e) => updateField('code', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Course Name *</Label>
                  <Input
                    id="name"
                    value={form.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Track</Label>
                  <Select
                    value={form.track || 'AI-1'}
                    onValueChange={(v) => updateField('track', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AI-1">AI-1</SelectItem>
                      <SelectItem value="AI-2">AI-2</SelectItem>
                      <SelectItem value="AI-3">AI-3</SelectItem>
                      <SelectItem value="AI-4">AI-4</SelectItem>
                      <SelectItem value="H-1">H-1</SelectItem>
                      <SelectItem value="H-2">H-2</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.course_category || 'value_add'}
                    onValueChange={(v) =>
                      updateField(
                        'course_category',
                        v as 'add_on' | 'value_add'
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value_add">Value-Add</SelectItem>
                      <SelectItem value="add_on">Add-on</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fee">Fee (INR)</Label>
                  <Input
                    id="fee"
                    type="number"
                    min={0}
                    value={form.fee ?? 0}
                    onChange={(e) =>
                      updateField('fee', Number(e.target.value))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (Hours)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    value={form.duration_hours ?? 30}
                    onChange={(e) =>
                      updateField('duration_hours', Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weeks">Weeks</Label>
                  <Input
                    id="weeks"
                    type="number"
                    min={1}
                    value={form.weeks ?? 15}
                    onChange={(e) =>
                      updateField('weeks', Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nsqf">NSQF Level</Label>
                  <Input
                    id="nsqf"
                    type="number"
                    min={1}
                    max={10}
                    value={form.nsqf_level ?? ''}
                    onChange={(e) =>
                      updateField(
                        'nsqf_level',
                        e.target.value ? Number(e.target.value) : undefined
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="faculty_eligible"
                  checked={form.faculty_eligible || false}
                  onCheckedChange={(v) => updateField('faculty_eligible', v)}
                />
                <Label htmlFor="faculty_eligible">
                  Faculty eligible (professional development)
                </Label>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/vac/admin/courses')}
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
