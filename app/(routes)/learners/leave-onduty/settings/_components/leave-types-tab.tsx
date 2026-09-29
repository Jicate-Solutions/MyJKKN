'use client';

// Leave Types tab — one group-wide list, replaces both the campus-living
// hostel leave types master and the academic OD sub-categories list.

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { useLearnerLeaveTypes } from '@/hooks/learners/use-learner-leave-types';
import { createColumns } from './columns';
import { LeaveTypeFormDialog } from './leave-type-form-dialog';
import type { LearnerLeaveTypeFilters } from '@/types/learner-leave-types';

export function LeaveTypesTab({ canManage }: { canManage: boolean }) {
  const [category, setCategory] = useState<LearnerLeaveTypeFilters['category']>('all');
  const [residency, setResidency] = useState<LearnerLeaveTypeFilters['residency']>('all');
  const [showCreate, setShowCreate] = useState(false);

  const filters: LearnerLeaveTypeFilters = useMemo(() => ({ category, residency }), [category, residency]);
  const { data, isLoading } = useLearnerLeaveTypes(filters);
  const columns = useMemo(() => createColumns(canManage), [canManage]);

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Leave Types</h3>
            <p className="text-sm text-muted-foreground">
              One common list applies to every institution, hostel or day scholar.
            </p>
          </div>
          {canManage && (
            <Button className="shrink-0" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Leave Type
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={category} onValueChange={(v) => setCategory(v as LearnerLeaveTypeFilters['category'])}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="leave">Leave</SelectItem>
              <SelectItem value="onduty">On-Duty</SelectItem>
            </SelectContent>
          </Select>
          <Select value={residency} onValueChange={(v) => setResidency(v as LearnerLeaveTypeFilters['residency'])}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Residency</SelectItem>
              <SelectItem value="hostel">Hostel</SelectItem>
              <SelectItem value="day_scholar">Day Scholar</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={data ?? []}
          filterColumn="name"
          searchPlaceholder="Search by name or code..."
          showRefresh={false}
        />
        {isLoading && <p className="text-sm text-muted-foreground">Loading leave types...</p>}
      </CardContent>

      <LeaveTypeFormDialog open={showCreate} onOpenChange={setShowCreate} mode="create" />
    </Card>
  );
}
