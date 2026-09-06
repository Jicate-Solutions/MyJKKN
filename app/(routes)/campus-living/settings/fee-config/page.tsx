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

import { Suspense, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoryFeesSection } from './_components/category-fees-section';
import { PackageFeesSection } from './_components/package-fees-section';
import { UpgradeFeesSection } from './_components/upgrade-fees-section';
import { RoomSharingSection } from './_components/room-sharing-section';

const FEE_CONFIG_TABS = ['category', 'upgrade', 'package', 'sharing'] as const;

function FeeConfigPageInner() {
  const { permissions, isSuperAdmin } = usePermissions();
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const { hostelYears, loading: loadingYears } = useActiveHostelYears();
  const { currentYear } = useCurrentHostelYear();

  const [selectedYearId, setSelectedYearId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useTabParam('category', FEE_CONFIG_TABS);
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
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Hostel Year</Label>
            <Select
              value={effectiveYearId ?? ''}
              onValueChange={(v) => setSelectedYearId(v)}
              disabled={loadingYears || !hostelYears?.length}
            >
              <SelectTrigger className="w-full sm:w-48">
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
              <TabsTrigger value="category">Category Fees</TabsTrigger>
              <TabsTrigger value="upgrade">Upgrade Fees</TabsTrigger>
              <TabsTrigger value="package">Package Fees</TabsTrigger>
              <TabsTrigger value="sharing">Room Sharing</TabsTrigger>
            </TabsList>
            <TabsContent value="category">
              <CategoryFeesSection hostelYearId={effectiveYearId} canEdit={canEdit} />
            </TabsContent>
            <TabsContent value="upgrade">
              <UpgradeFeesSection hostelYearId={effectiveYearId} canEdit={canEdit} />
            </TabsContent>
            <TabsContent value="package">
              <PackageFeesSection hostelYearId={effectiveYearId} canEdit={canEdit} />
            </TabsContent>
            {/* Deadlines and scope are global, not per hostel year — a settle
                window is measured in days from a learner's arrival, not against
                the year the page's selector is showing. */}
            <TabsContent value="sharing">
              <RoomSharingSection canEdit={canEdit} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </ContentLayout>
  );
}

export default function FeeConfigPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <FeeConfigPageInner />
    </Suspense>
  );
}
