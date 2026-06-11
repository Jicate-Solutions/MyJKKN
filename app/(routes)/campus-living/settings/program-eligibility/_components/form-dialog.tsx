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
  useEligibility,
  useEligibilityInstitutions,
  useProgramsForInstitution,
  useActiveRoomCategories,
  useActiveMessCategories,
  useActiveQuotas,
} from '@/hooks/campus-living/use-program-eligibility';
import type { ProgramEligibilityRow } from '@/types/program-eligibility';

const INSTITUTION_DEFAULT = '__default__';
const ANY_QUOTA = '__any_quota__';
const NO_CATEGORY = '__none__';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
  row?: ProgramEligibilityRow; // edit mode when present
}

export function ProgramEligibilityFormDialog({
  open,
  onOpenChange,
  institutionId,
  row,
}: FormDialogProps) {
  const isEdit = Boolean(row);

  // Subscribe to the page's "all" cache so a create/edit here refreshes the table.
  const { createEligibility, updateEligibility } = useEligibility(null);
  const { institutions, loading: instLoading } = useEligibilityInstitutions();

  const [submitting, setSubmitting] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<string>('');
  const [scope, setScope] = useState<string>(INSTITUTION_DEFAULT);
  const [quota, setQuota] = useState<string>(ANY_QUOTA);
  const [hostelType, setHostelType] = useState<string>(''); // 'boys' | 'girls' — UI-only filter (derived from category.type)
  const [feeMinL, setFeeMinL] = useState<string>('');
  const [feeMaxL, setFeeMaxL] = useState<string>('');
  const [roomCategoryId, setRoomCategoryId] = useState<string>(NO_CATEGORY);
  const [messCategoryId, setMessCategoryId] = useState<string>(NO_CATEGORY);
  const [isMonthlyMessAllowed, setIsMonthlyMessAllowed] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  const { programs } = useProgramsForInstitution(selectedInstitution || null);
  const { categories: roomCategories } = useActiveRoomCategories();
  const { categories: messCategories } = useActiveMessCategories();
  const { quotas } = useActiveQuotas();

  useEffect(() => {
    if (!open) return;
    if (isEdit && row) {
      setHostelType('');
      setSelectedInstitution(row.institution_id ?? institutionId ?? '');
      setScope(row.program_id ?? INSTITUTION_DEFAULT);
      setQuota(row.quota_id ?? ANY_QUOTA);
      setFeeMinL(row.fee_min != null ? String(row.fee_min / 100000) : '');
      setFeeMaxL(row.fee_max != null ? String(row.fee_max / 100000) : '');
      setRoomCategoryId(row.room_category_id ?? NO_CATEGORY);
      setMessCategoryId(row.mess_category_id ?? NO_CATEGORY);
      setIsMonthlyMessAllowed(row.is_monthly_mess_allowed ?? false);
      setEffectiveFrom(row.effective_from ?? '');
      setIsActive(row.is_active ?? true);
    } else {
      setHostelType('');
      setSelectedInstitution(institutionId ?? '');
      setScope(INSTITUTION_DEFAULT);
      setQuota(ANY_QUOTA);
      setFeeMinL('');
      setFeeMaxL('');
      setRoomCategoryId(NO_CATEGORY);
      setMessCategoryId(NO_CATEGORY);
      setIsMonthlyMessAllowed(false);
      setEffectiveFrom('');
      setIsActive(true);
    }
  }, [open, isEdit, row, institutionId]);

  // Edit mode: derive the hostel type from the saved category once the lists load
  // (categories are locked in edit, so this only drives correct display/filtering).
  useEffect(() => {
    if (!open || !isEdit || !row || hostelType) return;
    const derived =
      roomCategories.find((c) => c.id === row.room_category_id)?.type ??
      messCategories.find((c) => c.id === row.mess_category_id)?.type ??
      '';
    if (derived) setHostelType(derived);
  }, [open, isEdit, row, roomCategories, messCategories, hostelType]);

  // Switching institution (create mode) clears the program scope.
  const onInstitutionChange = (value: string) => {
    setSelectedInstitution(value);
    setScope(INSTITUTION_DEFAULT);
  };

  const onHostelTypeChange = (value: string) => {
    setHostelType(value);
    setRoomCategoryId(NO_CATEGORY);
    setMessCategoryId(NO_CATEGORY);
  };

  const institutionOptions = institutions.map((i) => ({ value: i.id, label: i.name }));
  const programOptions = [
    { value: INSTITUTION_DEFAULT, label: 'All programs — institution default' },
    ...programs.map((p) => ({ value: p.id, label: p.program_name })),
  ];
  const quotaOptions = [
    { value: ANY_QUOTA, label: 'All quotas — any' },
    ...quotas.map((q) => ({ value: q.id, label: q.name })),
  ];
  const roomCategoryOptions = [
    { value: NO_CATEGORY, label: '— None —' },
    ...roomCategories
      .filter((c) => !hostelType || c.type === hostelType)
      .map((c) => ({ value: c.id, label: c.name })),
  ];
  const messCategoryOptions = [
    { value: NO_CATEGORY, label: '— None —' },
    ...messCategories
      .filter((c) => !hostelType || c.type === hostelType)
      .map((c) => ({ value: c.id, label: c.name })),
  ];

  const onSubmit = async () => {
    if (!selectedInstitution) {
      toast.error('Please select an institution');
      return;
    }
    if (!hostelType) {
      toast.error('Please select a hostel type');
      return;
    }
    const roomId = roomCategoryId === NO_CATEGORY ? null : roomCategoryId;
    const messId = messCategoryId === NO_CATEGORY ? null : messCategoryId;
    if (!roomId && !messId) {
      toast.error('Pick at least a room or a mess category');
      return;
    }
    try {
      setSubmitting(true);
      const programId = scope === INSTITUTION_DEFAULT ? null : scope;
      const quotaId = quota === ANY_QUOTA ? null : quota;
      const effective = effectiveFrom.trim() || null;
      const toRupees = (s: string) => {
        const n = parseFloat(s);
        return s.trim() !== '' && !Number.isNaN(n) ? Math.round(n * 100000) : null;
      };
      const feeMin = toRupees(feeMinL);
      const feeMax = toRupees(feeMaxL);
      if (feeMin != null && feeMax != null && feeMin >= feeMax) {
        toast.error('Fee "min" must be less than "max"');
        setSubmitting(false);
        return;
      }

      if (isEdit && row) {
        await updateEligibility(row.id, {
          program_id: programId,
          quota_id: quotaId,
          fee_min: feeMin,
          fee_max: feeMax,
          room_category_id: roomId,
          mess_category_id: messId,
          is_active: isActive,
          is_monthly_mess_allowed: isMonthlyMessAllowed,
          effective_from: effective,
        });
        toast.success('Eligibility updated');
      } else {
        await createEligibility({
          institution_id: selectedInstitution,
          program_id: programId,
          quota_id: quotaId,
          fee_min: feeMin,
          fee_max: feeMax,
          room_category_id: roomId,
          mess_category_id: messId,
          is_monthly_mess_allowed: isMonthlyMessAllowed,
          is_active: isActive,
          effective_from: effective,
        });
        toast.success('Eligibility added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save eligibility');
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEdit ? 'Edit Category Eligibility' : 'Add Category Eligibility';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the scope, quota, fee band, categories or status. Institution is fixed — delete & recreate to move it.'
              : 'Map a program + quota + fee band to the room and mess categories those students may use.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>Institution</Label>
            <SearchableSelect value={selectedInstitution} onValueChange={onInstitutionChange} options={institutionOptions} placeholder='Select an institution' loading={instLoading} disabled={isEdit} modal />
          </div>

          <div className='space-y-2'>
            <Label>Scope</Label>
            <SearchableSelect value={scope} onValueChange={setScope} options={programOptions} placeholder={selectedInstitution ? 'Select scope' : 'Select an institution first'} disabled={!selectedInstitution} modal />
            <p className='text-xs text-muted-foreground'>Choose &ldquo;All programs&rdquo; for the institution default, or a specific program to override it.</p>
          </div>

          <div className='space-y-2'>
            <Label>Quota</Label>
            <SearchableSelect value={quota} onValueChange={setQuota} options={quotaOptions} placeholder='Select quota' modal />
          </div>

          <div className='space-y-2'>
            <Label>Academic Fee Band (₹ lakhs) <span className='text-muted-foreground font-normal'>(Optional)</span></Label>
            <div className='flex items-center gap-2'>
              <Input type='number' inputMode='decimal' step='0.01' min='0' placeholder='Min' value={feeMinL} onChange={(e) => setFeeMinL(e.target.value)} />
              <span className='text-muted-foreground text-sm'>to</span>
              <Input type='number' inputMode='decimal' step='0.01' min='0' placeholder='Max' value={feeMaxL} onChange={(e) => setFeeMaxL(e.target.value)} />
            </div>
            <p className='text-xs text-muted-foreground'>Half-open band: includes Min, excludes Max. Leave a side blank for unbounded (blank&ndash;4 = below &#8377;4L; 5&ndash;6 = &#8377;5L up to under &#8377;6L). Both blank = any fee.</p>
          </div>

          <div className='space-y-2'>
            <Label>Hostel Type</Label>
            <SearchableSelect
              value={hostelType}
              onValueChange={onHostelTypeChange}
              options={[
                { value: 'boys', label: 'Boys' },
                { value: 'girls', label: 'Girls' },
              ]}
              placeholder='Select hostel type'
              modal
            />
            <p className='text-xs text-muted-foreground'>
              Pick Boys or Girls — the category lists below then show only that type.
            </p>
          </div>

          <div className='space-y-2'>
            <Label>Room Category</Label>
            <SearchableSelect value={roomCategoryId} onValueChange={setRoomCategoryId} options={roomCategoryOptions} placeholder={hostelType ? 'Select room category' : 'Select hostel type first'} disabled={!hostelType} modal />
          </div>

          <div className='space-y-2'>
            <Label>Mess Category</Label>
            <SearchableSelect value={messCategoryId} onValueChange={setMessCategoryId} options={messCategoryOptions} placeholder={hostelType ? 'Select mess category' : 'Select hostel type first'} disabled={!hostelType} modal />
          </div>
          <p className='text-xs text-muted-foreground'>Pick a room, a mess, or both for this band. Categories are gender-specific &mdash; add the rule once per gender you admit.</p>

          <div className='flex flex-row items-center justify-between rounded-lg border p-3'>
            <div className='space-y-0.5'>
              <Label className='text-sm'>Monthly mess allowed</Label>
              <p className='text-xs text-muted-foreground'>Allow monthly (non-daily) mess for this rule.</p>
            </div>
            <Switch checked={isMonthlyMessAllowed} onCheckedChange={setIsMonthlyMessAllowed} />
          </div>

          <div className='space-y-2'>
            <Label>Effective From <span className='text-muted-foreground font-normal'>(Optional)</span></Label>
            <Input type='date' value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            <p className='text-xs text-muted-foreground'>Reserved for forward-only restriction handling. Leave blank for immediate effect.</p>
          </div>

          <div className='flex flex-row items-center justify-between rounded-lg border p-3'>
            <Label className='text-sm'>Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={submitting} className='w-full sm:w-auto'>Cancel</Button>
            <Button type='button' onClick={onSubmit} disabled={submitting} className='w-full sm:w-auto'>{submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}{isEdit ? 'Save Changes' : 'Add'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
