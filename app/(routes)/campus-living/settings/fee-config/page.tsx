'use client';

/**
 * Fee Configuration — /campus-living/settings/fee-config
 *
 * Category-based hostel fees only: an individual fee (amount + frequency) per
 * hostel-room / mess / amenity category, scoped by hostel year, common to all
 * institutions. A learner's hostel total is the sum of their selected
 * categories' fees.
 *
 * The legacy room-type/AC/tier table (hostel_fee_config) was removed from this
 * page on 2026-05-28 — hostel pricing now lives entirely in the category-fee
 * model.
 *
 * Permission gate: `campus_living.settings.edit` (or super-admin).
 */

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useActiveHostelYears,
  useCurrentHostelYear,
} from '@/hooks/campus-living/use-hostel-years';
import { CategoryFeesSection } from './_components/category-fees-section';

export default function FeeConfigPage() {
  const { permissions, isSuperAdmin } = usePermissions();
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const { hostelYears, loading: loadingYears } = useActiveHostelYears();
  const { currentYear } = useCurrentHostelYear();

  const [selectedYearId, setSelectedYearId] = useState<string | undefined>(undefined);
  const effectiveYearId =
    selectedYearId ?? currentYear?.id ?? hostelYears?.[0]?.id ?? undefined;

  return (
    <ContentLayout title="Fee Configuration">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fee Configuration</h1>
            <p className="text-muted-foreground">
              Hostel category fees (room / mess / amenities) for the selected hostel year
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Hostel Year</Label>
            <Select
              value={effectiveYearId ?? ''}
              onValueChange={(v) => setSelectedYearId(v)}
              disabled={loadingYears || !hostelYears?.length}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {hostelYears?.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!canEdit ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              You can view fee configurations but editing requires the{' '}
              <code>campus_living.settings.edit</code> permission.
            </AlertDescription>
          </Alert>
        ) : null}

        {!effectiveYearId && !loadingYears ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>No hostel year</AlertTitle>
            <AlertDescription>
              No active hostel years found. Create one under{' '}
              <a className="underline" href="/campus-living/settings/hostel-years">
                Settings → Hostel Years
              </a>{' '}
              before configuring hostel fees.
            </AlertDescription>
          </Alert>
        ) : null}

        {effectiveYearId ? (
          <CategoryFeesSection hostelYearId={effectiveYearId} canEdit={canEdit} />
        ) : null}
      </div>
    </ContentLayout>
  );
}
