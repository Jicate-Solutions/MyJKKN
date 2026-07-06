'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useCreateCdcPlacement } from '@/hooks/cdc/use-cdc-placements';
import { useCdcLookups, useCdcDrives } from '@/hooks/cdc/use-cdc-drives';
import type { CdcPlacementInsert, CdcPlacementMode } from '@/types/cdc/placements';
import { CDC_PLACEMENT_MODES, CDC_PLACEMENT_MODE_LABELS } from '@/types/cdc/placements';

/**
 * Local form-state shape. Extends the shared CdcPlacementInsert with the two
 * service-agreement/bond columns added by migration
 * 20260620T0030Z_cdc_placements_service_agreement.sql (BUG-004046).
 * Kept local (not in types/cdc/placements.ts) to avoid touching the shared
 * types file while other CDC forms are being edited concurrently — the extra
 * keys pass straight through the POST body into the service-layer insert().
 */
type CdcPlacementFormState = Partial<CdcPlacementInsert> & {
  has_service_agreement?: boolean;
  service_agreement_details?: string | null;
};

/**
 * Active + graduated learners for the placement-recipient picker.
 *
 * BUG-004044: this used to read `learners_profiles` straight from the browser
 * supabase client, but that table's RLS SELECT policy needs a `learners.*`
 * permission a CDC placement coordinator doesn't hold — so the client read
 * returned 0 rows and the picker showed "No matching learners". We now fetch
 * from a server route that uses the service-role client and scopes to the
 * caller's accessible institutions (see app/api/cdc/placements/new/learners).
 */
function useLearnersForPicker() {
  return useQuery<Array<{ id: string; label: string }>>({
    queryKey: ['cdc-placement-learner-picker'],
    queryFn: async () => {
      const res = await fetch('/api/cdc/placements/new/learners');
      if (!res.ok) {
        console.error('[placement-new] Failed to load learners:', res.status);
        return [];
      }
      const json = (await res.json()) as {
        data?: Array<{ value: string; label: string }>;
      };
      return (json.data ?? []).map((o) => ({ id: o.value, label: o.label }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function NewCdcPlacementPage() {
  const router = useRouter();
  const createPlacement = useCreateCdcPlacement();
  const { data: lookups } = useCdcLookups();
  const { data: learners, isLoading: learnersLoading } = useLearnersForPicker();
  // Only show drives in states where recording a placement makes sense
  // (announced through closed). Skip draft + cancelled.
  const { data: drivesRes, isLoading: drivesLoading } = useCdcDrives({
    status: ['announced', 'willingness_open', 'eligibility_locked',
             'attendance_day', 'results_announced', 'closed'],
    pageSize: 500,
  });

  const [form, setForm] = useState<CdcPlacementFormState>({
    is_remote: false,
    is_walk_in: false,
    placement_mode: 'on_campus',
    batch_no: 1,
    has_service_agreement: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [uploadingOfferLetter, setUploadingOfferLetter] = useState(false);

  const set = <K extends keyof CdcPlacementFormState>(key: K, value: CdcPlacementFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleServiceAgreementToggle = (checked: boolean) => {
    setForm((f) => ({
      ...f,
      has_service_agreement: checked,
      // Clear any captured bond details when the agreement is turned off
      service_agreement_details: checked ? f.service_agreement_details : null,
    }));
  };

  /**
   * BUG-004041: upload the signed offer letter to the cdc-docs bucket and stash
   * the returned URL in `offer_letter_url` (a column that already exists on
   * cdc_placements — no migration). Self-contained upload via the browser
   * client so we don't touch the shared StorageService; mirrors the
   * cdc-docs path convention used by lib/services/cdc/export-service.ts.
   */
  const handleOfferLetterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingOfferLetter(true);
      const supabase = createClientSupabaseClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `offer-letters/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('cdc-docs')
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('cdc-docs').getPublicUrl(path);
      set('offer_letter_url', data.publicUrl);
      toast.success('Offer letter uploaded');
    } catch (err: unknown) {
      console.error('[placement-new] Offer letter upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to upload offer letter');
    } finally {
      setUploadingOfferLetter(false);
      // Reset the input so re-selecting the same file fires onChange again
      e.target.value = '';
    }
  };

  const learnerOptions = useMemo(
    () => (learners ?? []).map((l: { id: string; label: string }) => ({ value: l.id, label: l.label })),
    [learners]
  );

  const recruiterById = useMemo(() => {
    const m = new Map<string, string>();
    (lookups?.recruiters ?? []).forEach((r) => m.set(r.id, r.name));
    return m;
  }, [lookups]);

  const driveOptions = useMemo(() => {
    return ((drivesRes?.data ?? []) as Array<{ id: string; title: string; recruiter_id: string; status: string }>)
      .map((d) => ({
        value: d.id,
        label: `${d.title} — ${recruiterById.get(d.recruiter_id) ?? '?'} · ${d.status}`,
      }));
  }, [drivesRes, recruiterById]);

  const recruiterOptions = useMemo(
    () => (lookups?.recruiters ?? []).map((r) => ({ value: r.id, label: r.name })),
    [lookups]
  );

  const offerTypeOptions = useMemo(
    () => (lookups?.offer_types ?? []).map((o) => ({ value: o.id, label: o.display_name })),
    [lookups]
  );

  const handlePlacementModeChange = (mode: CdcPlacementMode) => {
    setForm((f) => ({
      ...f,
      placement_mode: mode,
      // Keep the legacy is_walk_in boolean in sync so the drive-required conditional
      // and the NAAC/AICTE export-service (both still read is_walk_in) stay correct.
      is_walk_in: mode === 'walk_in',
      // Walk-ins have no pre-registered drive; clear any prior selection.
      drive_id: mode === 'walk_in' ? null : f.drive_id,
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.learner_id || !form.recruiter_id || !form.offer_type_id) {
      setError('Learner ID, Recruiter, and Offer Type are required.');
      return;
    }

    try {
      const placement = await createPlacement.mutateAsync(
        form as unknown as CdcPlacementInsert
      );
      router.push(`/cdc/placements/${placement.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create placement.');
    }
  }

  return (
    <PermissionGuard module="cdc.placements" action="create">
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
                <Label htmlFor="learner_id">Learner <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.learner_id ?? ''}
                  onValueChange={(v) => set('learner_id', v)}
                  options={learnerOptions}
                  placeholder="Search by name or register number…"
                  searchPlaceholder="Type to search learners…"
                  emptyMessage="No matching learners"
                  loading={learnersLoading}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="placement_mode">Placement Mode <span className="text-destructive">*</span></Label>
                <Select
                  value={form.placement_mode ?? 'on_campus'}
                  onValueChange={(v) => handlePlacementModeChange(v as CdcPlacementMode)}
                >
                  <SelectTrigger id="placement_mode" className="w-full">
                    <SelectValue placeholder="Select placement mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {CDC_PLACEMENT_MODES.map((m) => (
                      <SelectItem key={m} value={m}>{CDC_PLACEMENT_MODE_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Walk-in placements have no pre-registered drive.
                </p>
              </div>
              {form.placement_mode !== 'walk_in' && (
                <div className="space-y-1">
                  <Label htmlFor="drive_id">Drive (optional)</Label>
                  <SearchableSelect
                    value={form.drive_id ?? ''}
                    onValueChange={(v) => set('drive_id', v || null)}
                    options={driveOptions}
                    placeholder="Search drive by title or recruiter…"
                    searchPlaceholder="Type to search drives…"
                    emptyMessage="No drives match — check 'Walk-in' above if no drive was registered"
                    loading={drivesLoading}
                    className="w-full"
                  />
                </div>
              )}
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
                <SearchableSelect
                  value={form.recruiter_id ?? ''}
                  onValueChange={(v) => set('recruiter_id', v)}
                  options={recruiterOptions}
                  placeholder="Select recruiter…"
                  searchPlaceholder="Type to search recruiters…"
                  emptyMessage="No recruiters found"
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer_type_id">Offer Type <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.offer_type_id ?? ''}
                  onValueChange={(v) => set('offer_type_id', v)}
                  options={offerTypeOptions}
                  placeholder="Select offer type…"
                  searchPlaceholder="Type to search…"
                  emptyMessage="No offer types found"
                  className="w-full"
                />
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

              {/* Service Agreement / Bond (BUG-004046) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="has_service_agreement"
                    checked={form.has_service_agreement ?? false}
                    onChange={(e) => handleServiceAgreementToggle(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="has_service_agreement" className="cursor-pointer">
                    Service Agreement / Bond required?
                  </Label>
                </div>
                {form.has_service_agreement && (
                  <div className="space-y-1">
                    <Label htmlFor="service_agreement_details">Bond period / terms</Label>
                    <textarea
                      id="service_agreement_details"
                      placeholder="e.g. 2-year bond, ₹1,50,000 penalty for early exit…"
                      value={form.service_agreement_details ?? ''}
                      onChange={(e) =>
                        set('service_agreement_details', e.target.value || null)
                      }
                      rows={3}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Capture the bond duration, penalty amount, and any other service-agreement terms.
                    </p>
                  </div>
                )}
              </div>

              {/* Offer Letter upload (BUG-004041) */}
              <div className="space-y-1 pt-1">
                <Label htmlFor="offer_letter">Offer Letter (optional)</Label>
                {form.offer_letter_url ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={form.offer_letter_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate underline underline-offset-2"
                    >
                      View uploaded offer letter
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => set('offer_letter_url', null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Input
                    id="offer_letter"
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleOfferLetterUpload}
                    disabled={uploadingOfferLetter}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {uploadingOfferLetter
                    ? 'Uploading…'
                    : 'Attach the signed offer letter (PDF or image). Visible to CDC staff on the placement record.'}
                </p>
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
                  <Label htmlFor="round_no">Interview Round No.</Label>
                  <Input
                    id="round_no"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={form.round_no ?? ''}
                    onChange={(e) => set('round_no', e.target.value ? Number(e.target.value) : null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Which interview round produced this offer (e.g. 1 = first round, 2 = second round).
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="batch_no">Recruitment Batch No.</Label>
                  <Input
                    id="batch_no"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={form.batch_no ?? 1}
                    onChange={(e) => set('batch_no', Number(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The recruitment/placement batch for this drive — not the learner&apos;s academic year/batch.
                  </p>
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
    </PermissionGuard>
  );
}
