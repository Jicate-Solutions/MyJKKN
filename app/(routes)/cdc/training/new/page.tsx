'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCdcTrainingTypes, useCreateCdcProgramme } from '@/hooks/cdc/use-cdc-training';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { CreateTrainingProgrammeDto, TrainingProgrammeStatus } from '@/types/cdc/training';

export default function NewTrainingProgrammePage() {
  const router = useRouter();
  const { data: trainingTypes } = useCdcTrainingTypes();
  const createMutation = useCreateCdcProgramme();

  const [form, setForm] = useState<CreateTrainingProgrammeDto>({
    name: '',
    training_type_id: null,
    description: null,
    institution_id: null,
    total_hours: null,
    start_date: null,
    end_date: null,
    status: 'planned',
    external_provider: null,
  });

  function set<K extends keyof CreateTrainingProgrammeDto>(key: K, value: CreateTrainingProgrammeDto[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const programme = await createMutation.mutateAsync(form);
    router.push(`/cdc/training/${programme.id}`);
  }

  return (
    <PermissionGuard module="cdc.training" action="create">
    <ContentLayout title="New Training Programme">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC' },
        { label: 'Training Programmes', href: '/cdc/training' },
        { label: 'New' },
      ]} />

      <div className="max-w-2xl space-y-4 mt-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cdc/training"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">New Training Programme</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Programme Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name">Programme Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Unnati Batch 2025, MRB Phase 3"
                  required
                />
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <Label>Training Type</Label>
                <Select
                  value={form.training_type_id ?? 'none'}
                  onValueChange={(v) => set('training_type_id', v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(trainingTypes ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status ?? 'planned'}
                  onValueChange={(v) => set('status', v as TrainingProgrammeStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={form.start_date ?? ''}
                    onChange={(e) => set('start_date', e.target.value || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={form.end_date ?? ''}
                    onChange={(e) => set('end_date', e.target.value || null)}
                  />
                </div>
              </div>

              {/* Total Hours */}
              <div className="space-y-1.5">
                <Label htmlFor="total_hours">Total Hours</Label>
                <Input
                  id="total_hours"
                  type="number"
                  min={1}
                  value={form.total_hours ?? ''}
                  onChange={(e) => set('total_hours', e.target.value ? Number(e.target.value) : null)}
                  placeholder="e.g. 40"
                />
              </div>

              {/* External Provider */}
              <div className="space-y-1.5">
                <Label htmlFor="external_provider">External Provider</Label>
                <Input
                  id="external_provider"
                  value={form.external_provider ?? ''}
                  onChange={(e) => set('external_provider', e.target.value || null)}
                  placeholder="e.g. NSDC, TCS iON"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description ?? ''}
                  onChange={(e) => set('description', e.target.value || null)}
                  placeholder="Objectives, syllabus overview, target audience..."
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={createMutation.isPending || !form.name.trim()}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Programme
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/cdc/training">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
