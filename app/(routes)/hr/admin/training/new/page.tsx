// ============================================================================
// HR — New Training Program (Admin) — T5.3
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.3
// Created: 2026-06-19
//
// Form to create a new hr_training_programs row. Category options read from
// hr.staff_development.training_categories policy via TrainingService.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TrainingService,
  type TrainingCategory,
  type TrainingStatus,
} from '@/lib/services/hr/training-service';

const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  induction: 'Induction',
  internal: 'Internal',
  specialised: 'Specialised',
  fdp: 'FDP (Faculty Development Programme)',
};

export default function NewTrainingProgramPage() {
  const router = useRouter();
  const [allowedCategories, setAllowedCategories] = useState<
    TrainingCategory[]
  >(['induction', 'internal', 'specialised', 'fdp']);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TrainingCategory>('internal');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [facilitator, setFacilitator] = useState('');
  const [status, setStatus] = useState<TrainingStatus>('open');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPolicy() {
      try {
        const supabase = createClientSupabaseClient();
        const cats = await TrainingService.listAllowedCategories(supabase);
        if (!cancelled && cats.length > 0) {
          setAllowedCategories(cats);
          if (!cats.includes(category)) setCategory(cats[0]);
        }
      } catch {
        // fall back to defaults
      }
    }
    loadPolicy();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Start and end dates are required.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after start date.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClientSupabaseClient();
      const capacityNum = capacity.trim() === '' ? null : Number(capacity);
      if (capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum <= 0)) {
        setError('Capacity must be a positive number.');
        setSubmitting(false);
        return;
      }

      const program = await TrainingService.createSession(supabase, {
        title: title.trim(),
        description: description.trim() || null,
        category,
        start_date: startDate,
        end_date: endDate,
        location: location.trim() || null,
        capacity: capacityNum,
        status,
        institution_id: null,
        facilitator_name: facilitator.trim() || null,
        metadata: {},
      });

      router.push(`/hr/admin/training/${program.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <SuperAdminOnly>
    <ContentLayout title="New Training Program">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin/training">Training</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Program</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Induction — June 2026 batch"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What the program covers, who should attend, prerequisites…"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as TrainingCategory)}
                  >
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Options come from the{' '}
                    <code>hr.staff_development</code> policy.
                  </p>
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as TrainingStatus)}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft (hidden from staff)</SelectItem>
                      <SelectItem value="open">Open (staff can enroll)</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="startDate">Start date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End date *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Main Hall, Block A"
                  />
                </div>
                <div>
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="Leave blank for unlimited"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="facilitator">Facilitator / Trainer</Label>
                <Input
                  id="facilitator"
                  value={facilitator}
                  onChange={(e) => setFacilitator(e.target.value)}
                  placeholder="e.g. Dr. Ramesh Kumar (external)"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Program'}
                </Button>
                <Button variant="outline" asChild disabled={submitting}>
                  <Link href="/hr/admin/training">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
