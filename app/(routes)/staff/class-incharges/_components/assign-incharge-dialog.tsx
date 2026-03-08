'use client';

import { useState } from 'react';
import { SectionWithIncharges } from '@/types/staff';
import {
  useInchargesBySection,
  useAssignIncharge,
  useRemoveIncharge,
} from '@/hooks/staff/use-class-incharges';
import { useStaffForSelection } from '@/hooks/staff/use-staff';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, Plus, Loader2 } from 'lucide-react';

interface Props {
  section: SectionWithIncharges;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

export function AssignInchargeDialog({ section, open, onOpenChange }: Props) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  const { canAccess } = usePermissions();
  const canCreate = canAccess('staff', 'class_incharges.create') || canAccess('staff', 'edit');
  const canDelete = canAccess('staff', 'class_incharges.delete') || canAccess('staff', 'edit');

  const { data: incharges = [], isLoading: inchargesLoading } =
    useInchargesBySection(section.id);

  const { data: allStaff = [], isLoading: staffLoading } = useStaffForSelection({
    institution_id: section.institution_id,
    isActive: true,
  });

  const assignMutation = useAssignIncharge();
  const removeMutation = useRemoveIncharge(section.id);

  // Exclude already-assigned staff from the dropdown
  const assignedStaffIds = new Set(incharges.map((ic) => ic.staff_id));
  const availableStaff = allStaff.filter((s) => !assignedStaffIds.has(s.id));

  async function handleAssign() {
    if (!selectedStaffId) return;
    try {
      await assignMutation.mutateAsync({
        institution_id: section.institution_id,
        section_id: section.id,
        staff_id: selectedStaffId,
      });
      setSelectedStaffId('');
      toast.success('Incharge assigned successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign incharge');
    }
  }

  async function handleRemove(id: string, name: string) {
    try {
      await removeMutation.mutateAsync(id);
      toast.success(`${name} removed as incharge`);
    } catch {
      toast.error('Failed to remove incharge');
    }
  }

  const hierarchyLabel = [
    section.degree?.degree_name,
    section.department?.department_name,
    section.semester?.semester_name,
  ]
    .filter(Boolean)
    .join(' › ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Manage Class Incharges — {section.section_name}
          </DialogTitle>
          {hierarchyLabel && (
            <DialogDescription>{hierarchyLabel}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          {/* Currently Assigned section */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Currently Assigned</Label>
            {inchargesLoading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : incharges.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No incharges assigned yet
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {incharges.map((ic) => {
                  const name = ic.staff
                    ? `${ic.staff.first_name} ${ic.staff.last_name}`
                    : 'Unknown';
                  return (
                    <Badge
                      key={ic.id}
                      variant="secondary"
                      className="flex items-center gap-1.5 pl-1 pr-2 py-1 h-auto"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px]">
                          {ic.staff
                            ? getInitials(ic.staff.first_name, ic.staff.last_name)
                            : '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{name}</span>
                      <button
                        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                        disabled={removeMutation.isPending || !canDelete}
                        onClick={() => handleRemove(ic.id, name)}
                        aria-label={`Remove ${name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Incharge section */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Add Incharge</Label>
            <div className="flex gap-2">
              <Select
                value={selectedStaffId}
                onValueChange={setSelectedStaffId}
                disabled={staffLoading || availableStaff.length === 0}
              >
                <SelectTrigger className="flex-1 h-9 text-sm">
                  <SelectValue
                    placeholder={
                      staffLoading
                        ? 'Loading staff...'
                        : availableStaff.length === 0
                        ? 'No staff available'
                        : 'Search staff by name...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                      {s.staff_id ? ` (${s.staff_id})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!selectedStaffId || assignMutation.isPending || !canCreate}
                onClick={handleAssign}
                className="h-9"
              >
                {assignMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
