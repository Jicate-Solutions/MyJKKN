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
import { useDepartments } from '@/hooks/organization/use-departments';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { CreateTrainingProgrammeDto, TrainingProgrammeStatus } from '@/types/cdc/training';
import { TrainerPicker } from '../_components/trainer-picker';

export default function NewTrainingProgrammePage() {
  const router = useRouter();
  const { data: trainingTypes } = useCdcTrainingTypes();
  const createMutation = useCreateCdcProgramme();

  // BUG-004073 — cohort binding: load active departments & academic years org-wide
  const { data: departmentsData, isLoading: deptsLoading } = useDepartments({ isActive: true, limit: 500 });
  const departmentOptions = (departmentsData?.data ?? []).map((d) => ({ id: d.id, label: d.department_name }));
  const { data: academicYearsData, isLoading: academicYearsLoading } = useAcademicYears();
  const academicYearOptions = academicYearsData?.data ?? [];

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
    trainer_name: null,
    trainer_staff_id: null,
    target_department_id: null,   // BUG-004073
    academic_year_label: null,    // BUG-004073
  });

  // BUG-004049: End Date must not be earlier than Start Date.
  // Dates come from <input type="date"> as ISO 'YYYY-MM-DD' strings, so a
  // lexicographic string comparison correctly orders them by calendar date.
  const dateRangeInvalid =
    !!form.start_date && !!form.end_date && form.end_date < form.start_date;

  function set<K extends keyof CreateTrainingProgrammeDto>(key: K, value: CreateTrainingProgrammeDto[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (dateRangeInvalid) return;
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

              {/* Cohort binding — Target Department + Batch (BUG-004073) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Target Department</Label>
                  <Select
                    value={form.target_department_id ?? 'none'}
                    onValueChange={(v) => set('target_department_id', v === 'none' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={deptsLoading ? 'Loading…' : 'All departments (optional)'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— All departments —</SelectItem>
                      {departmentOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Batch / Academic Year</Label>
                  <Select
                    value={form.academic_year_label ?? 'none'}
                    onValueChange={(v) => set('academic_year_label', v === 'none' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={academicYearsLoading ? 'Loading…' : 'Any year (optional)'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Any year —</SelectItem>
                      {academicYearOptions.map((y) => (
                        <SelectItem key={y.id} value={y.academic_year_name}>
                          {y.academic_year_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    min={form.start_date ?? undefined}
                    aria-invalid={dateRangeInvalid}
                    onChange={(e) => set('end_date', e.target.value || null)}
                  />
                </div>
              </div>
              {dateRangeInvalid && (
                <p className="text-sm text-destructive" role="alert">
                  End Date cannot be earlier than Start Date.
                </p>
              )}

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

              {/* Trainer — BUG-004076 + data-driven picker (staff or external) */}
              <div className="space-y-1.5">
                <Label htmlFor="trainer_name">Trainer</Label>
                <TrainerPicker
                  id="trainer_name"
                  value={{ trainerStaffId: form.trainer_staff_id ?? null, trainerName: form.trainer_name ?? null }}
                  onChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      trainer_staff_id: next.trainerStaffId,
                      trainer_name: next.trainerName,
                    }))
                  }
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
                <Button type="submit" disabled={createMutation.isPending || !form.name.trim() || dateRangeInvalid}>
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
