'use client';
/**
 * Onboarding Table — client-side rendering with server-fetched initial data.
 *
 * Pattern cloned from app/(routes)/learners/profiles/_components/profiles-table-server.tsx.
 *
 * Bulk action — "Assign Academic Info" — pre-fills the existing promotion form
 * at /learners/profiles/promotion?ids=... so admins can batch-fill the four
 * onboarding fields (semester/section/academic year) for many learners at once.
 * No new bulk endpoint is needed — we lean on the existing promotion flow.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ArrowRight, ArrowUpDown } from 'lucide-react';
import { onboardingColumns } from './columns';
import type { OnboardingProfileRow, OnboardingTier } from '@/types/learner-onboarding';
import { usePermissions } from '@/hooks/use-permissions';

const SORT_OPTIONS = [
  { value: 'first_name_asc', label: 'Name (A → Z)', sortBy: 'first_name', sortOrder: 'asc' },
  { value: 'first_name_desc', label: 'Name (Z → A)', sortBy: 'first_name', sortOrder: 'desc' },
  { value: 'roll_number_asc', label: 'Roll No. (A → Z)', sortBy: 'roll_number', sortOrder: 'asc' },
  { value: 'roll_number_desc', label: 'Roll No. (Z → A)', sortBy: 'roll_number', sortOrder: 'desc' },
  { value: 'created_at_desc', label: 'Newest First', sortBy: 'created_at', sortOrder: 'desc' },
  { value: 'created_at_asc', label: 'Oldest First', sortBy: 'created_at', sortOrder: 'asc' }
] as const;

interface OnboardingTableServerProps {
  initialData: OnboardingProfileRow[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  tier: OnboardingTier;
}

export function OnboardingTableServer({ initialData, metadata, tier }: OnboardingTableServerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, canAccess } = usePermissions();

  const canBulkUpdate =
    isSuperAdmin || canAccess('learners', 'onboarding.bulk_update' as any);

  const [localData, setLocalData] = useState<OnboardingProfileRow[]>(initialData);
  const [localMetadata, setLocalMetadata] = useState(metadata);

  useEffect(() => {
    setLocalData(initialData);
    setLocalMetadata(metadata);
  }, [initialData, metadata]);

  const currentSortBy = searchParams.get('sort_by') || 'first_name';
  const currentSortOrder = searchParams.get('sort_order') || 'asc';
  const currentSort =
    SORT_OPTIONS.find((o) => o.sortBy === currentSortBy && o.sortOrder === currentSortOrder)?.value ??
    'first_name_asc';

  const handleSortChange = (value: string) => {
    const option = SORT_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort_by', option.sortBy);
    params.set('sort_order', option.sortOrder);
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const fetchData = useCallback(async () => {
    return {
      success: true,
      data: localData,
      pagination: localMetadata
    };
  }, [localData, localMetadata]);

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => {
    const selectedIds = props.allSelectedIds.join(',');
    return (
      <div className="flex items-center gap-2">
        <Select value={currentSort} onValueChange={handleSortChange}>
          <SelectTrigger className="h-8 w-[165px] text-xs">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {props.selectedRows.length > 0 && canBulkUpdate && (
          <Button asChild size="sm" className="h-8">
            <Link
              href={`/learners/profiles/promotion?ids=${selectedIds}`}
              onClick={() => props.resetSelection()}
              title="Open promotion form to assign Academic Year / Semester / Section in bulk"
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Assign Academic Info ({props.selectedRows.length})
            </Link>
          </Button>
        )}
      </div>
    );
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => onboardingColumns as any}
      exportConfig={{
        entityName: `onboarding-${tier}-learners`,
        columnMapping: {},
        columnWidths: [],
        headers: []
      }}
      idField="id"
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        enableExport: false,
        enableRowSelection: true,
        enableSearch: false
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
