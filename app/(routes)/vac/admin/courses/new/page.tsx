'use client';

import { useState } from 'react';
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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useCreateVACCourse } from '@/hooks/vac/use-vac';
import type { CreateVACCourseInput } from '@/types/vac';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreateCoursePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const createMutation = useCreateVACCourse();

  const [form, setForm] = useState<Partial<CreateVACCourseInput>>({
    code: '',
    name: '',
    description: '',
    track: 'AI-1',
    duration_hours: 30,
    weeks: 15,
    fee: 0,
    course_category: 'value_add',
    faculty_eligible: false,
    institution_id: institutionId,
  });

  const updateField = <K extends keyof CreateVACCourseInput>(
    key: K,
    value: CreateVACCourseInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name) return;

    createMutation.mutate(
      {
        ...form,
        institution_id: institutionId,
      } as CreateVACCourseInput,
      {
        onSuccess: () => {
          router.push('/vac/admin/courses');
        },
      }
    );
  };

  return (
    <PermissionGuard permission="vac.admin.courses.create">
      <ContentLayout title="New Course">
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
              <h1 className="text-2xl font-bold">Create Course</h1>
              <p className="text-sm text-muted-foreground">
                Add a new Value-Added Course to the catalog
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
                      placeholder="e.g. VAC-AI1-001"
                      value={form.code || ''}
                      onChange={(e) => updateField('code', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Course Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Foundations of AI"
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
                    placeholder="Course description..."
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
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Create Course
              </Button>
            </div>
          </form>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
