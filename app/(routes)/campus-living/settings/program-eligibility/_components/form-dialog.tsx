'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useRoomEligibility,
  useMessEligibility,
  useProgramsForInstitution,
  useActiveRoomCategories,
  useActiveMessCategories,
} from '@/hooks/campus-living/use-program-eligibility';
import type {
  ProgramRoomEligibilityRow,
  ProgramMessEligibilityRow,
} from '@/types/program-eligibility';

const INSTITUTION_DEFAULT = '__default__';

type Kind = 'room' | 'mess';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: Kind;
  institutionId: string;
  // edit mode: pass the existing row; create mode: leave undefined
  roomRow?: ProgramRoomEligibilityRow;
  messRow?: ProgramMessEligibilityRow;
}

export function ProgramEligibilityFormDialog({
  open,
  onOpenChange,
  kind,
  institutionId,
  roomRow,
  messRow,
}: FormDialogProps) {
  const isEdit = Boolean(roomRow || messRow);

  const roomHook = useRoomEligibility(institutionId);
  const messHook = useMessEligibility(institutionId);
  const { programs } = useProgramsForInstitution(institutionId);
  const { categories: roomCategories } = useActiveRoomCategories();
  const { categories: messCategories } = useActiveMessCategories();

  const [submitting, setSubmitting] = useState(false);
  const [scope, setScope] = useState<string>(INSTITUTION_DEFAULT); // program id or default
  const [categoryId, setCategoryId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [isMonthlyMessAllowed, setIsMonthlyMessAllowed] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      const row = kind === 'room' ? roomRow : messRow;
      setScope(row?.program_id ?? INSTITUTION_DEFAULT);
      setCategoryId(
        kind === 'room'
          ? roomRow?.room_category_id ?? ''
          : messRow?.mess_category_id ?? ''
      );
      setIsActive(row?.is_active ?? true);
      setIsMonthlyMessAllowed(messRow?.is_monthly_mess_allowed ?? false);
      setEffectiveFrom(row?.effective_from ?? '');
    } else {
      setScope(INSTITUTION_DEFAULT);
      setCategoryId('');
      setIsActive(true);
      setIsMonthlyMessAllowed(false);
      setEffectiveFrom('');
    }
  }, [open, isEdit, kind, roomRow, messRow]);

  const programOptions = [
    { value: INSTITUTION_DEFAULT, label: 'All programs — institution default' },
    ...programs.map((p) => ({ value: p.id, label: p.program_name })),
  ];
  const categoryOptions = (kind === 'room' ? roomCategories : messCategories).map(
    (c) => ({ value: c.id, label: c.name })
  );

  const onSubmit = async () => {
    if (!isEdit && !categoryId) {
      toast.error('Please select a category');
      return;
    }
    try {
      setSubmitting(true);
      const programId = scope === INSTITUTION_DEFAULT ? null : scope;
      const effective = effectiveFrom.trim() || null;

      if (kind === 'room') {
        if (isEdit && roomRow) {
          await roomHook.updateRoomEligibility(roomRow.id, {
            is_active: isActive,
            effective_from: effective,
          });
          toast.success('Room eligibility updated');
        } else {
          await roomHook.createRoomEligibility({
            institution_id: institutionId,
            program_id: programId,
            room_category_id: categoryId,
            is_active: isActive,
            effective_from: effective,
          });
          toast.success('Room eligibility added');
        }
      } else {
        if (isEdit && messRow) {
          await messHook.updateMessEligibility(messRow.id, {
            is_active: isActive,
            is_monthly_mess_allowed: isMonthlyMessAllowed,
            effective_from: effective,
          });
          toast.success('Mess eligibility updated');
        } else {
          await messHook.createMessEligibility({
            institution_id: institutionId,
            program_id: programId,
            mess_category_id: categoryId,
            is_active: isActive,
            is_monthly_mess_allowed: isMonthlyMessAllowed,
            effective_from: effective,
          });
          toast.success('Mess eligibility added');
        }
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save eligibility');
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEdit
    ? `Edit ${kind === 'room' ? 'Room' : 'Mess'} Eligibility`
    : `Add ${kind === 'room' ? 'Room' : 'Mess'} Eligibility`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px]'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this eligibility entry. Scope and category are fixed once created.'
              : 'Pick a scope (institution default or a specific program) and the allowed category.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>Scope</Label>
            <SearchableSelect
              value={scope}
              onValueChange={setScope}
              options={programOptions}
              placeholder='Select scope'
              disabled={isEdit}
              modal
            />
            <p className='text-xs text-muted-foreground'>
              Choose &ldquo;All programs&rdquo; for the institution default, or a
              specific program to override it.
            </p>
          </div>

          <div className='space-y-2'>
            <Label>{kind === 'room' ? 'Room Category' : 'Mess Category'}</Label>
            <SearchableSelect
              value={categoryId}
              onValueChange={setCategoryId}
              options={categoryOptions}
              placeholder='Select category'
              disabled={isEdit}
              modal
            />
          </div>

          {kind === 'mess' && (
            <div className='flex flex-row items-center justify-between rounded-lg border p-3'>
              <div className='space-y-0.5'>
                <Label className='text-sm'>Monthly mess allowed</Label>
                <p className='text-xs text-muted-foreground'>
                  Allow monthly (non-daily) mess for this scope.
                </p>
              </div>
              <Switch
                checked={isMonthlyMessAllowed}
                onCheckedChange={setIsMonthlyMessAllowed}
              />
            </div>
          )}

          <div className='space-y-2'>
            <Label>
              Effective From{' '}
              <span className='text-muted-foreground font-normal'>(Optional)</span>
            </Label>
            <Input
              type='date'
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              Reserved for forward-only restriction handling. Leave blank for
              immediate effect.
            </p>
          </div>

          <div className='flex flex-row items-center justify-between rounded-lg border p-3'>
            <Label className='text-sm'>Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className='w-full sm:w-auto'
            >
              Cancel
            </Button>
            <Button
              type='button'
              onClick={onSubmit}
              disabled={submitting}
              className='w-full sm:w-auto'
            >
              {submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
              {isEdit ? 'Save Changes' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
