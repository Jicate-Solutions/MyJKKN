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
import { useCASETrack, useUpdateCASETrack } from '@/hooks/vac/use-case';
import type { CASETrack, UpdateCASETrackInput } from '@/types/case';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EditTrackPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = use(params);
  const router = useRouter();

  const { data: trackData, isLoading } = useCASETrack(trackId);
  const updateMutation = useUpdateCASETrack();

  const track = trackData as CASETrack | undefined;

  const [form, setForm] = useState<Partial<UpdateCASETrackInput>>({});

  useEffect(() => {
    if (track) {
      setForm({
        track_name: track.track_name,
        description: track.description || '',
        completion_attendance_threshold: track.completion_attendance_threshold,
        completion_grader_threshold: track.completion_grader_threshold,
        completion_project_required: track.completion_project_required,
        is_active: track.is_active,
      });
    }
  }, [track]);

  const updateField = <K extends keyof UpdateCASETrackInput>(
    key: K,
    value: UpdateCASETrackInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.track_name) return;

    updateMutation.mutate(
      { id: trackId, input: form as UpdateCASETrackInput },
      {
        onSuccess: () => {
          router.push('/vac/admin/case/tracks');
        },
      }
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Edit Track">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!track) {
    return (
      <ContentLayout title="Track Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">Track not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/vac/admin/case/tracks')}
          >
            Back to Tracks
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${track.track_name}`}>
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
            <BreadcrumbLink href="/vac/admin/case">CASE</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin/case/tracks">Tracks</BreadcrumbLink>
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
            <h1 className="text-2xl font-bold">Edit Track</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {track.track_code} - Sequence #{track.sequence_order}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Track Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="track_name">Track Name *</Label>
                <Input
                  id="track_name"
                  value={form.track_name || ''}
                  onChange={(e) => updateField('track_name', e.target.value)}
                  required
                />
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
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Completion Thresholds</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="attendance_threshold">
                    Attendance Threshold (%)
                  </Label>
                  <Input
                    id="attendance_threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={form.completion_attendance_threshold ?? 75}
                    onChange={(e) =>
                      updateField(
                        'completion_attendance_threshold',
                        Number(e.target.value)
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grader_threshold">
                    Grader Score Threshold (%)
                  </Label>
                  <Input
                    id="grader_threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={form.completion_grader_threshold ?? 60}
                    onChange={(e) =>
                      updateField(
                        'completion_grader_threshold',
                        Number(e.target.value)
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="project_required"
                  checked={form.completion_project_required || false}
                  onCheckedChange={(v) =>
                    updateField('completion_project_required', v)
                  }
                />
                <Label htmlFor="project_required">
                  Project submission required for completion
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Switch
                  id="is_active"
                  checked={form.is_active || false}
                  onCheckedChange={(v) => updateField('is_active', v)}
                />
                <Label htmlFor="is_active">Track is active</Label>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/vac/admin/case/tracks')}
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
