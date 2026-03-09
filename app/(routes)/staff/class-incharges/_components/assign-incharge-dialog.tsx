'use client';

import { useState } from 'react';
import { SectionWithIncharges } from '@/types/staff';
import {
  useInchargesBySection,
  useAssignIncharge,
  useRemoveIncharge,
  useBulkAssignIncharge,
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, Plus, Loader2, ChevronsUpDown, Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// Discriminated union — single section OR multiple sections (bulk mode)
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | { section: SectionWithIncharges; sections?: never }
  | { sections: SectionWithIncharges[]; section?: never }
);

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

export function AssignInchargeDialog({ open, onOpenChange, ...rest }: Props) {
  const isBulk = 'sections' in rest && Array.isArray(rest.sections);
  const sections = isBulk ? rest.sections! : [rest.section!];
  const primarySection = sections[0];

  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const { canAccess } = usePermissions();
  const canCreate = canAccess('staff', 'class_incharges.create') || canAccess('staff', 'edit');
  const canDelete = canAccess('staff', 'class_incharges.delete') || canAccess('staff', 'edit');

  // Single mode only: fetch live incharges for the section
  const { data: incharges = [], isLoading: inchargesLoading } =
    useInchargesBySection(!isBulk ? primarySection.id : null);

  const { data: allStaff = [], isLoading: staffLoading } = useStaffForSelection({
    institution_id: primarySection.institution_id,
    isActive: true,
  });

  const assignMutation = useAssignIncharge();
  const removeMutation = useRemoveIncharge(!isBulk ? primarySection.id : '');
  const bulkAssignMutation = useBulkAssignIncharge();

  // Single mode: exclude already-assigned staff from dropdown
  const assignedStaffIds = new Set(!isBulk ? incharges.map((ic) => ic.staff_id) : []);
  const availableStaff = allStaff.filter((s) => !assignedStaffIds.has(s.id));

  // ── Single mode handlers ──────────────────────────────────────
  async function handleAssign() {
    if (!selectedStaffId) return;
    try {
      await assignMutation.mutateAsync({
        institution_id: primarySection.institution_id,
        section_id: primarySection.id,
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

  // ── Bulk mode handler ─────────────────────────────────────────
  async function handleBulkAssign() {
    if (!selectedStaffId) return;
    try {
      const { assigned, skipped } = await bulkAssignMutation.mutateAsync({
        institution_id: primarySection.institution_id,
        section_ids: sections.map((s) => s.id),
        staff_id: selectedStaffId,
      });
      setSelectedStaffId('');
      const msg =
        skipped > 0
          ? `Assigned to ${assigned} of ${sections.length} sections (${skipped} already assigned, skipped)`
          : `Incharge assigned to ${assigned} section${assigned !== 1 ? 's' : ''}`;
      toast.success(msg);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to bulk assign incharge');
    }
  }

  const hierarchyLabel = !isBulk
    ? [
        primarySection.degree?.degree_name,
        primarySection.department?.department_name,
        primarySection.semester?.semester_name,
      ]
        .filter(Boolean)
        .join(' › ')
    : '';

  const isPending = isBulk ? bulkAssignMutation.isPending : assignMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        ref={(node) => setContainerEl(node)}
      >
        <DialogHeader>
          <DialogTitle>
            {isBulk
              ? `Assign Incharge — ${sections.length} sections selected`
              : `Manage Class Incharges — ${primarySection.section_name}`}
          </DialogTitle>
          {!isBulk && hierarchyLabel && (
            <DialogDescription>{hierarchyLabel}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">

          {/* ── SINGLE MODE: currently assigned badges ── */}
          {!isBulk && (
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
          )}

          {/* ── BULK MODE: section review list ── */}
          {isBulk && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Selected Sections
              </Label>
              <ScrollArea className="max-h-48 rounded-md border">
                <div className="p-2 space-y-1">
                  {sections.map((sec) => {
                    const currentIncharges = sec.class_incharges ?? [];
                    return (
                      <div
                        key={sec.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-xs">{sec.section_name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {[sec.semester?.semester_name, sec.program?.program_name]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {currentIncharges.length === 0 ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal text-muted-foreground"
                            >
                              None
                            </Badge>
                          ) : (
                            currentIncharges.map((ic) => (
                              <Badge
                                key={ic.id}
                                variant="secondary"
                                className="text-[10px] font-normal"
                              >
                                {ic.staff
                                  ? `${ic.staff.first_name} ${ic.staff.last_name}`
                                  : 'Unknown'}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ── Staff picker (shared: single + bulk) ── */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              {isBulk ? 'Add Incharge to All' : 'Add Incharge'}
            </Label>
            <div className="flex gap-2">
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboboxOpen}
                    className="flex-1 h-9 justify-between text-sm font-normal"
                    disabled={staffLoading || (!isBulk && availableStaff.length === 0)}
                  >
                    {selectedStaffId
                      ? (() => {
                          const s = allStaff.find((s) => s.id === selectedStaffId);
                          return s
                            ? `${s.first_name} ${s.last_name}${s.staff_id ? ` (${s.staff_id})` : ''}`
                            : 'Select staff...';
                        })()
                      : staffLoading
                      ? 'Loading staff...'
                      : availableStaff.length === 0 && !isBulk
                      ? 'No staff available'
                      : 'Search staff by name...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                  container={containerEl ?? undefined}
                >
                  <Command>
                    <CommandInput placeholder="Search by name or staff ID..." />
                    <CommandList>
                      <CommandEmpty>No staff found.</CommandEmpty>
                      <CommandGroup>
                        {(isBulk ? allStaff : availableStaff).map((s) => (
                          <CommandItem
                            key={s.id}
                            value={`${s.first_name} ${s.last_name} ${s.staff_id || ''} ${s.email || ''}`}
                            onSelect={() => {
                              setSelectedStaffId(s.id === selectedStaffId ? '' : s.id);
                              setComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedStaffId === s.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col">
                              <span>
                                {s.first_name} {s.last_name}
                                {s.staff_id ? ` (${s.staff_id})` : ''}
                              </span>
                              {s.email && (
                                <span className="text-xs text-muted-foreground">{s.email}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Button
                size="sm"
                disabled={!selectedStaffId || isPending || !canCreate}
                onClick={isBulk ? handleBulkAssign : handleAssign}
                className="h-9"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isBulk ? (
                  <>
                    <Users className="h-4 w-4 mr-1" />
                    Add to All
                  </>
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
