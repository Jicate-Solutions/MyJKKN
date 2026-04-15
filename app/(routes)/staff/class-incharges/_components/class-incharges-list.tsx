'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { ClassInchargeFilters, SectionWithIncharges } from '@/types/staff';
import { useClassIncharges, classInchargeKeys } from '@/hooks/staff/use-class-incharges';
import { ClassInchargeService } from '@/lib/services/staff/class-incharge-service';
import { usePermissions } from '@/hooks/use-permissions';
import { getClassInchargeColumns } from './class-incharge-columns';
import { AssignInchargeDialog } from './assign-incharge-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'react-hot-toast';

interface Props {
  filters: ClassInchargeFilters;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function ClassInchargesList({ filters, onPageChange, onPageSizeChange }: Props) {
  const [selectedSection, setSelectedSection] = useState<SectionWithIncharges | null>(null);
  const [removeAllSection, setRemoveAllSection] = useState<SectionWithIncharges | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const { isSuperAdmin, canAccess } = usePermissions();
  const canDelete = isSuperAdmin || canAccess('staff.class_incharges', 'delete');

  const { data, isLoading, error, refetch } = useClassIncharges(filters);
  const sections = data?.data || [];
  const metadata = data?.metadata;

  const selectedSections = sections.filter((s) => selectedIds.has(s.id));

  const handleManage = useCallback((section: SectionWithIncharges) => {
    setSelectedSection(section);
  }, []);

  const handleRemoveAllClick = useCallback((section: SectionWithIncharges) => {
    setRemoveAllSection(section);
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(sections.map((s) => s.id)) : new Set());
    },
    [sections]
  );

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters]);

  const handleConfirmRemoveAll = async () => {
    if (!removeAllSection?.class_incharges?.length) return;
    setIsRemoving(true);
    try {
      await Promise.all(
        removeAllSection.class_incharges.map((ic) =>
          ClassInchargeService.removeIncharge(ic.id)
        )
      );
      await queryClient.invalidateQueries({ queryKey: classInchargeKeys.lists() });
      toast.success(
        `Removed ${removeAllSection.class_incharges.length} incharge${
          removeAllSection.class_incharges.length !== 1 ? 's' : ''
        } from ${removeAllSection.section_name}`
      );
    } catch {
      toast.error('Failed to remove all incharges');
    } finally {
      setIsRemoving(false);
      setRemoveAllSection(null);
    }
  };

  const columns = useMemo(
    () =>
      getClassInchargeColumns({
        onManage: handleManage,
        onRemoveAll: handleRemoveAllClick,
        canDelete,
        selectedIds,
        onToggleSelect: handleToggleSelect,
        onSelectAll: handleSelectAll,
        totalCount: sections.length,
      }),
    [handleManage, handleRemoveAllClick, canDelete, selectedIds, handleToggleSelect, handleSelectAll, sections.length]
  );

  if (!filters.institution_id) {
    return (
      <Alert>
        <AlertDescription>
          Select an institution to view class incharges.
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load sections. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {/* Bulk Action Bar — visible when ≥1 row is selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-1 py-2 mb-2 rounded-lg border bg-muted/40">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} section{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setBulkDialogOpen(true)}
            >
              <Users className="h-3.5 w-3.5" />
              Bulk Assign Incharge
            </Button>
          </div>
        </div>
      )}

      {/* Existing DataTable — unchanged */}
      <DataTable
        columns={columns}
        data={sections}
        filterColumn="__no_search__"
        searchPlaceholder="Search sections..."
        onRefresh={refetch}
        showRefresh={true}
        serverSidePagination={
          metadata
            ? {
                currentPage: metadata.page,
                totalPages: metadata.totalPages,
                pageSize: metadata.limit,
                totalItems: metadata.total,
                hasNextPage: metadata.page < metadata.totalPages,
                hasPreviousPage: metadata.page > 1,
                onPageChange,
                onPageSizeChange,
                isLoading,
              }
            : undefined
        }
      />

      {/* Single-section dialog — existing, unchanged */}
      {selectedSection && (
        <AssignInchargeDialog
          section={selectedSection}
          open={!!selectedSection}
          onOpenChange={(open) => {
            if (!open) setSelectedSection(null);
          }}
        />
      )}

      {/* Bulk assign dialog — new */}
      {bulkDialogOpen && selectedSections.length > 0 && (
        <AssignInchargeDialog
          sections={selectedSections}
          open={bulkDialogOpen}
          onOpenChange={(open) => {
            setBulkDialogOpen(open);
            if (!open) setSelectedIds(new Set());
          }}
        />
      )}

      {/* Remove All confirmation — existing, unchanged */}
      <AlertDialog
        open={!!removeAllSection}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setRemoveAllSection(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove All Incharges?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeAllSection && (
                <>
                  This will permanently remove all{' '}
                  <strong>{removeAllSection.class_incharges?.length}</strong>{' '}
                  incharge assignment
                  {(removeAllSection.class_incharges?.length ?? 0) !== 1 ? 's' : ''}{' '}
                  from <strong>{removeAllSection.section_name}</strong>. This
                  action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveAll}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? 'Removing...' : 'Remove All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
