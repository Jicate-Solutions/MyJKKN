'use client';

// Governing Body "Add Member" dialog.
//
// Modelled identically to the Academic Council dialog. The Governing Body
// separates position from source:
//   • Position  → Member (internal_member) | Member Secretary (member_secretary)
//                 (Chairman is auto-seated = the Principal, not selectable here)
//   • Source    → Staff (internal) | External Expert
// so a "Member" can be an internal HoD OR an external trustee / University
// nominee. Reuses the composition dialog's FacilitatorPicker / ExpertPicker.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  FacilitatorPicker,
  ExpertPicker,
  type FacilitatorRow,
} from '@/app/(routes)/bos/compositions/_components/add-member-dialog';
import { useAddBosMember } from '@/hooks/bos/use-bos-members';
import { BosExternalExpert, BosMemberType } from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

type GbPosition = Extract<BosMemberType, 'chairman' | 'internal_member' | 'member_secretary'>;
type GbSource = 'staff' | 'expert';

interface GbAddMemberDialogProps {
  open: boolean;
  onClose: () => void;
  compositionId: string;
  institutionsId: string;
  /** Current roster — for per-person dedup and the single-Member-Secretary rule. */
  existingMembers?: readonly {
    staff_id?: string | null;
    expert_id?: string | null;
    member_type?: string | null;
  }[];
}

export function GbAddMemberDialog({
  open,
  onClose,
  compositionId,
  institutionsId,
  existingMembers = [],
}: GbAddMemberDialogProps) {
  const addMember = useAddBosMember();

  const [position, setPosition] = useState<GbPosition>('internal_member');
  const [source, setSource] = useState<GbSource>('staff');
  const [selectedFacilitator, setSelectedFacilitator] = useState<FacilitatorRow | null>(null);
  const [selectedExpert, setSelectedExpert] = useState<BosExternalExpert | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [displayDesignation, setDisplayDesignation] = useState('');
  const [displayDepartment, setDisplayDepartment] = useState('');
  const [displayInstitution, setDisplayInstitution] = useState('');
  const [email, setEmail] = useState('');
  const [contactNo, setContactNo] = useState('');

  const hasSelection = !!selectedFacilitator || !!selectedExpert;

  // Single Member Secretary: disable the option once one exists on the roster.
  const secretaryTaken = useMemo(
    () => existingMembers.some((m) => m.member_type === 'member_secretary'),
    [existingMembers],
  );

  // People already on the body — hidden from the pickers.
  const assignedStaffSet = useMemo(
    () => new Set(existingMembers.map((m) => m.staff_id).filter((id): id is string => !!id)),
    [existingMembers],
  );
  const assignedExpertSet = useMemo(
    () => new Set(existingMembers.map((m) => m.expert_id).filter((id): id is string => !!id)),
    [existingMembers],
  );

  const clearSelection = () => {
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setDisplayName('');
    setDisplayDesignation('');
    setDisplayDepartment('');
    setDisplayInstitution('');
    setEmail('');
    setContactNo('');
  };

  const resetAll = () => {
    setPosition('internal_member');
    setSource('staff');
    clearSelection();
  };

  // Switching source clears any selection made under the other source.
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const handleSelectFacilitator = (row: FacilitatorRow) => {
    setSelectedFacilitator(row);
    setSelectedExpert(null);
    setDisplayName(`${row.first_name} ${row.last_name}`.trim());
    setDisplayDesignation(row.designation ?? '');
    setDisplayDepartment(row.department?.department_name ?? '');
    setDisplayInstitution(row.institution?.name ?? '');
    setEmail(row.institution_email ?? row.email ?? '');
    setContactNo(row.phone ?? '');
  };

  const handleSelectExpert = (row: BosExternalExpert) => {
    setSelectedExpert(row);
    setSelectedFacilitator(null);
    setDisplayName(row.title ? `${row.title} ${row.name}` : row.name);
    setDisplayDesignation(row.designation ?? '');
    setDisplayDepartment(row.department_name ?? '');
    setDisplayInstitution(row.institution_name ?? '');
    setEmail(row.email ?? '');
    setContactNo(row.contact_no ?? '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSelection) {
      toast.error(source === 'expert' ? 'Please select an external expert' : 'Please select a staff member');
      return;
    }
    if (position === 'member_secretary' && secretaryTaken) {
      toast.error('A Member Secretary is already assigned. Remove them first to change it.');
      return;
    }

    addMember.mutate(
      {
        institutions_id: institutionsId,
        composition_id: compositionId,
        committee_id: null,
        member_type: position,
        member_type_id: null,
        staff_id: selectedFacilitator?.id,
        expert_id: selectedExpert?.id,
        display_name: displayName.trim(),
        display_designation: displayDesignation.trim() || undefined,
        display_department: displayDepartment.trim() || undefined,
        display_institution: displayInstitution.trim() || undefined,
        email: email.trim() || undefined,
        contact_no: contactNo.trim() || undefined,
        is_active: true,
        // sort_order omitted → the API appends (count + 1). See the same note
        // in ac-add-member-dialog.tsx.
      },
      {
        onSuccess: () => toast.success('Member added'),
        onError: (err) => {
          logger.error('academic/bos', 'Failed to add governing body member', err);
          toast.error((err as Error).message || 'Failed to add member');
        },
      },
    );

    resetAll();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetAll();
          onClose();
        }
      }}
    >
      <DialogContent className='max-w-md max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Add Governing Body Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {/* ── Position ─────────────────────────────────────────────────── */}
          <div className='space-y-2'>
            <Label>
              Position <span className='text-destructive'>*</span>
            </Label>
            <Select value={position} onValueChange={(v) => setPosition(v as GbPosition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='chairman'>Chairman</SelectItem>
                <SelectItem value='internal_member'>Member</SelectItem>
                <SelectItem value='member_secretary' disabled={secretaryTaken}>
                  Member Secretary{secretaryTaken ? ' (already assigned)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className='text-xs text-muted-foreground'>
              The Principal is added automatically as Member Secretary. Add the Chairman and other members here.
            </p>
          </div>

          {/* ── Source ───────────────────────────────────────────────────── */}
          <div className='space-y-2'>
            <Label>
              Source <span className='text-destructive'>*</span>
            </Label>
            <Select value={source} onValueChange={(v) => setSource(v as GbSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='staff'>Staff (internal)</SelectItem>
                <SelectItem value='expert'>External Expert</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Picker (depends on source) ───────────────────────────────── */}
          {source === 'expert' ? (
            <ExpertPicker
              memberType={'subject_expert' as BosMemberType}
              selected={selectedExpert}
              onSelect={handleSelectExpert}
              onClear={clearSelection}
              excludeIds={assignedExpertSet}
            />
          ) : (
            <FacilitatorPicker
              institutionsId={institutionsId}
              selected={selectedFacilitator}
              onSelect={handleSelectFacilitator}
              onClear={clearSelection}
              excludeIds={assignedStaffSet}
            />
          )}

          {/* ── Locked display fields ────────────────────────────────────── */}
          {hasSelection && (
            <div className='rounded-md border bg-muted/30 p-3 space-y-3'>
              <div className='space-y-2'>
                <Label className='text-xs text-muted-foreground'>Full Name</Label>
                <Input value={displayName} readOnly disabled />
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>Designation</Label>
                  <Input value={displayDesignation} readOnly disabled />
                </div>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>Institution</Label>
                  <Input value={displayInstitution} readOnly disabled />
                </div>
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>Email</Label>
                  <Input value={email} readOnly disabled />
                </div>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>Contact No.</Label>
                  <Input value={contactNo} readOnly disabled />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                resetAll();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={addMember.isPending || !hasSelection}>
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
