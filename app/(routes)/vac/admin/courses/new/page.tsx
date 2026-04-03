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
import { useAuth } from '@/hooks/use-auth';
import { useCreateVACCourse } from '@/hooks/vac/use-vac';
import type { CreateVACCourseInput } from '@/types/vac';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreateCoursePage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const institutionId = profile?.institution_id;
  const createMutation = useCreateVACCourse();

  // Form state — only include fields with real values
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [track, setTrack] = useState('general');
  const [courseCategory, setCourseCategory] = useState<'add_on' | 'value_add'>('value_add');
  const [durationHours, setDurationHours] = useState(30);
  const [weeks, setWeeks] = useState(3);
  const [fee, setFee] = useState(0);
  const [nsqfLevel, setNsqfLevel] = useState<string>('');
  const [facultyEligible, setFacultyEligible] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      toast.error('Course code and name are required');
      return;
    }

    if (!institutionId) {
      toast.error('Institution not found. Please reload the page.');
      return;
    }

    // Build payload — only include non-empty optional fields
    const payload: CreateVACCourseInput = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      institution_id: institutionId,
      track,
      course_category: courseCategory,
      duration_hours: durationHours,
      weeks,
      fee,
      faculty_eligible: facultyEligible,
    };

    // Only add optional fields if they have values
    if (description.trim()) payload.description = description.trim();
    if (nsqfLevel && Number(nsqfLevel) >= 1 && Number(nsqfLevel) <= 10) {
      payload.nsqf_level = Number(nsqfLevel);
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        router.push('/vac/admin/courses');
      },
    });
  };

  if (authLoading) {
    return (
      <ContentLayout title="New Course">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="New Course">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin">VAC Admin</BreadcrumbLink>
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
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Course Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Foundations of AI"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Course description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Track</Label>
                  <Select value={track} onValueChange={setTrack}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AI-1">AI-1 (Foundations)</SelectItem>
                      <SelectItem value="AI-2">AI-2 (Application)</SelectItem>
                      <SelectItem value="AI-3">AI-3 (Advanced)</SelectItem>
                      <SelectItem value="AI-4">AI-4 (Mastery)</SelectItem>
                      <SelectItem value="H-1">H-1 (Communication)</SelectItem>
                      <SelectItem value="H-2">H-2 (Leadership)</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={courseCategory}
                    onValueChange={(v) => setCourseCategory(v as 'add_on' | 'value_add')}
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
                    value={fee}
                    onChange={(e) => setFee(Number(e.target.value))}
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
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weeks">Weeks</Label>
                  <Input
                    id="weeks"
                    type="number"
                    min={1}
                    value={weeks}
                    onChange={(e) => setWeeks(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nsqf">NSQF Level (1-10)</Label>
                  <Input
                    id="nsqf"
                    type="number"
                    min={1}
                    max={10}
                    placeholder="Optional"
                    value={nsqfLevel}
                    onChange={(e) => setNsqfLevel(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="faculty_eligible"
                  checked={facultyEligible}
                  onCheckedChange={setFacultyEligible}
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
            <Button
              type="submit"
              disabled={createMutation.isPending || !institutionId}
            >
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
  );
}
