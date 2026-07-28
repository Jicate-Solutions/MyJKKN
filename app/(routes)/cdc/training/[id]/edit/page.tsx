'use client';

import { use, useEffect, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useCdcProgramme, useCdcTrainingTypes, useUpdateCdcProgramme } from '@/hooks/cdc/use-cdc-training';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { UpdateTrainingProgrammeDto, TrainingProgrammeStatus } from '@/types/cdc/training';
import { TrainerPicker } from '../../_components/trainer-picker';

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditTrainingProgrammePage(props: Props) {
  return (
    <PermissionGuard module="cdc.training" action="edit">
      <EditTrainingProgrammeContent {...props} />
    </PermissionGuard>
  );
}

function EditTrainingProgrammeContent({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: programme, isLoading, isError, error, refetch } = useCdcProgramme(id);
  const { data: trainingTypes } = useCdcTrainingTypes();
  const updateMutation = useUpdateCdcProgramme();

  // BUG-004073 — cohort binding: load active departments & academic years org-wide
  const { data: departmentsData, isLoading: deptsLoading } = useDepartments({ isActive: true, limit: 500 });
  const departmentOptions = (departmentsData?.data ?? []).map((d) => ({ id: d.id, label: d.department_name }));
  const { data: academicYearsData, isLoading: academicYearsLoading } = useAcademicYears();
  const academicYearOptions = academicYearsData?.data ?? [];

  const [form, setForm] = useState<UpdateTrainingProgrammeDto>({});
  const [hydrated, setHydrated] = useState(false);

  // Pre-fill the form once the existing programme loads.
  useEffect(() => {
    if (programme && !hydrated) {
      setForm({
        name: programme.name,
        training_type_id: programme.training_type_id ?? null,
        description: programme.description ?? null,
        institution_id: programme.institution_id ?? null,
        total_hours: programme.total_hours ?? null,
        start_date: programme.start_date ?? null,
        end_date: programme.end_date ?? null,
        status: programme.status,
        external_provider: programme.external_provider ?? null,
        trainer_name: programme.trainer_name ?? null,
        trainer_staff_id: programme.trainer_staff_id ?? null,
        target_department_id: programme.target_department_id ?? null,   // BUG-004073
        academic_year_label: programme.academic_year_label ?? null,     // BUG-004073
      });
      setHydrated(true);
    }
  }, [programme, hydrated]);

  // BUG-004049 parity: End Date must not be earlier than Start Date.
  // Dates are ISO 'YYYY-MM-DD' strings, so lexicographic comparison is correct.
  const dateRangeInvalid =
    !!form.start_date && !!form.end_date && form.end_date < form.start_date;

  function set<K extends keyof UpdateTrainingProgrammeDto>(key: K, value: UpdateTrainingProgrammeDto[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    if (dateRangeInvalid) return;
    await updateMutation.mutateAsync({ id, dto: form });
    router.push(`/cdc/training/${id}`);
  }

  return (
    <ContentLayout title="Edit Training Programme">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC' },
        { label: 'Training Programmes', href: '/cdc/training' },
        { label: programme?.name ?? 'Programme', href: `/cdc/training/${id}` },
        { label: 'Edit' },
      ]} />

      <div className="max-w-2xl space-y-4 mt-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/cdc/training/${id}`}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Edit Training Programme</h1>
        </div>

        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Programme Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : isError || !programme ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <BookOpen className="w-12 h-12 text-destructive/40" />
              <p className="text-lg font-medium text-destructive">
                {programme === null ? 'Programme not found' : 'Failed to load programme'}
              </p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'The programme may have been removed or you may not have access.'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/cdc/training">Back to list</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
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
                    value={form.name ?? ''}
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
                  <Button type="submit" disabled={updateMutation.isPending || !form.name?.trim() || dateRangeInvalid}>
                    {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/cdc/training/${id}`}>Cancel</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
