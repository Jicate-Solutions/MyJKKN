'use client';

import Link from 'next/link';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCreateCdcPlacement } from '@/hooks/cdc/use-cdc-placements';
import { useCdcLookups } from '@/hooks/cdc/use-cdc-drives';
import type { CdcPlacementInsert } from '@/types/cdc/placements';

export default function NewCdcPlacementPage() {
  const router = useRouter();
  const createPlacement = useCreateCdcPlacement();
  const { data: lookups } = useCdcLookups();

  const [form, setForm] = useState<Partial<CdcPlacementInsert>>({
    is_remote: false,
    is_walk_in: false,
    batch_no: 1,
  });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof CdcPlacementInsert>(key: K, value: CdcPlacementInsert[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.learner_id || !form.recruiter_id || !form.offer_type_id) {
      setError('Learner ID, Recruiter, and Offer Type are required.');
      return;
    }

    try {
      const placement = await createPlacement.mutateAsync(form as CdcPlacementInsert);
      router.push(`/cdc/placements/${placement.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create placement.');
    }
  }

  return (
    <ContentLayout title="Record Placement">
      <div className="space-y-6 max-w-2xl">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/cdc">CDC</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/cdc/placements">Placements</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Record Placement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record an offer for a learner from a drive or walk-in.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Learner + Drive */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Learner & Drive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="learner_id">Learner ID <span className="text-destructive">*</span></Label>
                <Input
                  id="learner_id"
                  placeholder="UUID from learners_profiles"
                  value={form.learner_id ?? ''}
                  onChange={(e) => set('learner_id', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="drive_id">Drive (optional)</Label>
                <Input
                  id="drive_id"
                  placeholder="Drive UUID — leave blank for walk-in"
                  value={form.drive_id ?? ''}
                  onChange={(e) => set('drive_id', e.target.value || null)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_walk_in"
                  checked={form.is_walk_in ?? false}
                  onChange={(e) => set('is_walk_in', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is_walk_in" className="cursor-pointer">Walk-in placement (no pre-registered drive)</Label>
              </div>
            </CardContent>
          </Card>

          {/* Recruiter + Offer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recruiter & Offer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="recruiter_id">Recruiter <span className="text-destructive">*</span></Label>
                <select
                  id="recruiter_id"
                  value={form.recruiter_id ?? ''}
                  onChange={(e) => set('recruiter_id', e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select recruiter...</option>
                  {(lookups?.recruiters ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer_type_id">Offer Type <span className="text-destructive">*</span></Label>
                <select
                  id="offer_type_id"
                  value={form.offer_type_id ?? ''}
                  onChange={(e) => set('offer_type_id', e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select offer type...</option>
                  {(lookups?.offer_types ?? []).map((o) => (
                    <option key={o.id} value={o.id}>{o.display_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="job_role">Job Role / Title</Label>
                  <Input
                    id="job_role"
                    placeholder="e.g. Software Engineer"
                    value={form.job_role ?? ''}
                    onChange={(e) => set('job_role', e.target.value || null)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="job_location">Location</Label>
                  <Input
                    id="job_location"
                    placeholder="e.g. Chennai"
                    value={form.job_location ?? ''}
                    onChange={(e) => set('job_location', e.target.value || null)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_remote"
                  checked={form.is_remote ?? false}
                  onChange={(e) => set('is_remote', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is_remote" className="cursor-pointer">Remote position</Label>
              </div>
            </CardContent>
          </Card>

          {/* Package & Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Package & Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="package_lpa">Package (LPA)</Label>
                  <Input
                    id="package_lpa"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 4.5"
                    value={form.package_lpa ?? ''}
                    onChange={(e) => set('package_lpa', e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="package_inr_total">Total Package (₹)</Label>
                  <Input
                    id="package_inr_total"
                    type="number"
                    min="0"
                    placeholder="Annual CTC in ₹"
                    value={form.package_inr_total ?? ''}
                    onChange={(e) => set('package_inr_total', e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="joining_date">Expected Joining Date</Label>
                <Input
                  id="joining_date"
                  type="date"
                  value={form.joining_date ?? ''}
                  onChange={(e) => set('joining_date', e.target.value || null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="round_no">Round No.</Label>
                  <Input
                    id="round_no"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={form.round_no ?? ''}
                    onChange={(e) => set('round_no', e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="batch_no">Batch No.</Label>
                  <Input
                    id="batch_no"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={form.batch_no ?? 1}
                    onChange={(e) => set('batch_no', Number(e.target.value) || 1)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  placeholder="Any additional notes..."
                  value={form.notes ?? ''}
                  onChange={(e) => set('notes', e.target.value || null)}
                  rows={3}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" disabled={createPlacement.isPending}>
              {createPlacement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Placement
            </Button>
            <Button asChild variant="ghost">
              <Link href="/cdc/placements">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Cancel
              </Link>
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
