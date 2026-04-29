'use client';

// components/shared/assignment-rules-crud/data-table.tsx
// Shared data-table for admission_assignment_rules.
// Extracted from: app/(routes)/admission/settings/assignment-rules/_components/assignment-rules-data-table.tsx
// Accepts institutionId as prop so both settings page and counselors/team can consume it.

import { useCallback, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { AssignmentRulesService } from '@/lib/services/admission/assignment-rules-service';
import { getColumns } from './columns';
import { RuleFormDialog } from './rule-form-dialog';

interface AssignmentRulesDataTableProps {
  /**
   * Institution to scope rules to. When undefined (super_admin / global admin),
   * read shows rules across all institutions; create is disabled until caller
   * scopes to a specific institution.
   */
  institutionId: string | undefined;
  /** Show "+ New Rule" button. Default true. Auto-hidden when institutionId is undefined. */
  showCreateButton?: boolean;
}

export function AssignmentRulesDataTable({
  institutionId,
  showCreateButton = true,
}: AssignmentRulesDataTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const refetchRef = useRef<(() => void) | null>(null);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const data = await AssignmentRulesService.getAssignmentRules(institutionId);
      const filtered = params.search
        ? data.filter((item) =>
            JSON.stringify(item).toLowerCase().includes(params.search.toLowerCase())
          )
        : data;
      const start = (params.page - 1) * params.limit;
      const paginated = filtered.slice(start, start + params.limit);
      return {
        success: true,
        data: paginated,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.ceil(filtered.length / params.limit) || 1,
          total_items: filtered.length,
        },
      };
    },
    [institutionId]
  );

  return (
    <div className="space-y-4">
      {showCreateButton && institutionId && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Rule
          </Button>
        </div>
      )}

      <DataTable
        fetchDataFn={fetchData as any}
        getColumns={(handleRowDeselection) => {
          const onRefetch = () => refetchRef.current?.();
          return getColumns(handleRowDeselection, onRefetch) as any;
        }}
        exportConfig={{
          entityName: 'assignment-rules',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        idField="id"
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: false,
        }}
      />

      {institutionId && (
        <RuleFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          institutionId={institutionId}
          onSuccess={() => refetchRef.current?.()}
        />
      )}
    </div>
  );
}
