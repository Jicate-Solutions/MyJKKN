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
import { QuotaMultiSelect } from './quota-multi-select';

const INSTITUTION_DEFAULT = '__default__';
const NO_CATEGORY = '__none__';

// Live "₹4,00,000"-style preview for the rupee fee inputs. Tolerant of any
// separators the user types ("3,00,000" / "3.00.000") — fees are whole rupees,
// so only the digits matter.
const formatINR = (s: string) => {
  const digits = s.replace(/[^\d]/g, '');
  return digits !== '' ? `₹${Number(digits).toLocaleString('en-IN')}` : null;
};

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
  const [quotaIds, setQuotaIds] = useState<string[]>([]);
  const [hostelType, setHostelType] = useState<string>(''); // 'boys' | 'girls' — UI-only filter (derived from category.type)
  const [feeMinRs, setFeeMinRs] = useState<string>('');
  const [feeMaxRs, setFeeMaxRs] = useState<string>('');
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
      setHostelType(row.hostel_type ?? 'both');
      setSelectedInstitution(row.institution_id ?? institutionId ?? '');
      setScope(row.program_id ?? INSTITUTION_DEFAULT);
      setQuotaIds(row.quota_ids ?? []);
      setFeeMinRs(row.fee_min != null ? String(row.fee_min) : '');
      setFeeMaxRs(row.fee_max != null ? String(row.fee_max) : '');
      setRoomCategoryId(row.room_category_id ?? NO_CATEGORY);
      setMessCategoryId(row.mess_category_id ?? NO_CATEGORY);
      setIsMonthlyMessAllowed(row.is_monthly_mess_allowed ?? false);
      setEffectiveFrom(row.effective_from ?? '');
      setIsActive(row.is_active ?? true);
    } else {
      setHostelType('both');
      setSelectedInstitution(institutionId ?? '');
      setScope(INSTITUTION_DEFAULT);
      setQuotaIds([]);
      setFeeMinRs('');
      setFeeMaxRs('');
      setRoomCategoryId(NO_CATEGORY);
      setMessCategoryId(NO_CATEGORY);
      setIsMonthlyMessAllowed(false);
      setEffectiveFrom('');
      setIsActive(true);
    }
  }, [open, isEdit, row, institutionId]);

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
  const quotaOptions = quotas.map((q) => ({ value: q.id, label: q.name }));
  // 'both' => the band is common to both genders, so show one option per category
  // NAME (the resolver maps it to each learner's gender variant). 'boys'/'girls'
  // => only that gender's categories.
  // The dedup is VALUE-AWARE: it keeps the currently-selected variant as the
  // representative for its name, so editing a 'both' band whose stored id is the
  // dropped gender variant (e.g. girls "Deluxe Room") still displays instead of
  // rendering blank.
  const filterCats = (
    cats: { id: string; name: string; type: string | null }[],
    selectedId?: string,
  ) => {
    if (hostelType === 'both') {
      const byName = new Map<string, { id: string; name: string; type: string | null }>();
      for (const c of cats) {
        const existing = byName.get(c.name);
        if (!existing || c.id === selectedId) byName.set(c.name, c);
      }
      return Array.from(byName.values());
    }
    return cats.filter((c) => !hostelType || c.type === hostelType);
  };
  const roomCategoryOptions = [
    { value: NO_CATEGORY, label: '— None —' },
    ...filterCats(roomCategories, roomCategoryId).map((c) => ({ value: c.id, label: c.name })),
  ];
  const messCategoryOptions = [
    { value: NO_CATEGORY, label: '— None —' },
    ...filterCats(messCategories, messCategoryId).map((c) => ({ value: c.id, label: c.name })),
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
      const quotaIdsToSend = quotaIds.length ? quotaIds : null;
      const effective = effectiveFrom.trim() || null;
      // Inputs are full rupee amounts (fee_min / fee_max are stored in rupees).
      // Strip any separators the user typed ("3,00,000" / "3.00.000") — fees are
      // whole rupees, so only the digits matter.
      const toRupees = (s: string) => {
        const digits = s.replace(/[^\d]/g, '');
        return digits !== '' ? Number(digits) : null;
      };
      const feeMin = toRupees(feeMinRs);
      const feeMax = toRupees(feeMaxRs);
      // The band is inclusive [min, max], so min == max (a single-fee band) is
      // valid; only reject min strictly greater than max.
      if (feeMin != null && feeMax != null && feeMin > feeMax) {
        toast.error('Fee "min" cannot be greater than "max"');
        setSubmitting(false);
        return;
      }

      if (isEdit && row) {
        await updateEligibility(row.id, {
          program_id: programId,
          quota_ids: quotaIdsToSend,
          fee_min: feeMin,
          fee_max: feeMax,
          room_category_id: roomId,
          mess_category_id: messId,
          hostel_type: hostelType,
          is_active: isActive,
          is_monthly_mess_allowed: isMonthlyMessAllowed,
          effective_from: effective,
        });
        toast.success('Eligibility updated');
      } else {
        await createEligibility({
          institution_id: selectedInstitution,
          program_id: programId,
          quota_ids: quotaIdsToSend,
          fee_min: feeMin,
          fee_max: feeMax,
          room_category_id: roomId,
          mess_category_id: messId,
          hostel_type: hostelType,
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
      <DialogContent className='w-[95vw] max-w-[95vw] sm:max-w-[640px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the scope, quota, fee band, categories or status. Institution is fixed — delete & recreate to move it. Learners are matched on their admission-year academic fee.'
              : 'Map a program + quota + fee band to the room and mess categories those students may use. Learners are matched on their admission-year academic fee.'}
          </DialogDescription>
        </DialogHeader>

        <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4'>
          <div className='space-y-2 sm:col-span-2'>
            <Label>Institution</Label>
            <SearchableSelect className='w-full' value={selectedInstitution} onValueChange={onInstitutionChange} options={institutionOptions} placeholder='Select an institution' loading={instLoading} disabled={isEdit} modal />
          </div>

          <div className='space-y-2 sm:col-span-2'>
            <Label>Scope</Label>
            <SearchableSelect className='w-full' value={scope} onValueChange={setScope} options={programOptions} placeholder={selectedInstitution ? 'Select scope' : 'Select an institution first'} disabled={!selectedInstitution} modal />
            <p className='text-xs text-muted-foreground'>Choose &ldquo;All programs&rdquo; for the institution default, or a specific program to override it.</p>
          </div>

          <div className='space-y-2'>
            <Label>Quota</Label>
            <QuotaMultiSelect options={quotaOptions} value={quotaIds} onChange={setQuotaIds} />
            <p className='text-xs text-muted-foreground'>Pick one or more quotas, or leave empty to apply to any quota.</p>
          </div>

          <div className='space-y-2'>
            <Label>Hostel Type</Label>
            <SearchableSelect
              className='w-full'
              value={hostelType}
              onValueChange={onHostelTypeChange}
              options={[
                { value: 'both', label: 'Both (boys & girls)' },
                { value: 'boys', label: 'Boys' },
                { value: 'girls', label: 'Girls' },
              ]}
              placeholder='Select hostel type'
              modal
            />
          </div>
          <p className='text-xs text-muted-foreground sm:col-span-2 -mt-2'>
            Choose <strong>Both</strong> when the fee condition is common to boys and
            girls (each learner lands in their own gender&apos;s category of that name),
            or pick a single gender to restrict the rule.
          </p>

          <div className='space-y-2 sm:col-span-2'>
            <Label>Academic Fee Band (₹) <span className='text-muted-foreground font-normal'>(Optional)</span></Label>
            <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2'>
              <Input type='text' inputMode='numeric' placeholder='Min — e.g. 400000' value={feeMinRs} onChange={(e) => setFeeMinRs(e.target.value)} />
              <span className='text-muted-foreground text-sm'>to</span>
              <Input type='text' inputMode='numeric' placeholder='Max — e.g. 600000' value={feeMaxRs} onChange={(e) => setFeeMaxRs(e.target.value)} />
            </div>
            {(formatINR(feeMinRs) || formatINR(feeMaxRs)) && (
              <div className='grid grid-cols-[1fr_auto_1fr] gap-2 text-xs tabular-nums text-muted-foreground'>
                <span>{formatINR(feeMinRs) ?? 'Unbounded'}</span>
                <span className='invisible'>to</span>
                <span>{formatINR(feeMaxRs) ?? 'Unbounded'}</span>
              </div>
            )}
            <p className='text-xs text-muted-foreground'>Enter full amounts in rupees. Half-open band: includes Min, excludes Max. Leave a side blank for unbounded; both blank = any fee.</p>
          </div>

          <div className='space-y-2'>
            <Label>Room Category</Label>
            <SearchableSelect className='w-full' value={roomCategoryId} onValueChange={setRoomCategoryId} options={roomCategoryOptions} placeholder={hostelType ? 'Select room category' : 'Select hostel type first'} disabled={!hostelType} modal />
          </div>

          <div className='space-y-2'>
            <Label>Mess Category</Label>
            <SearchableSelect className='w-full' value={messCategoryId} onValueChange={setMessCategoryId} options={messCategoryOptions} placeholder={hostelType ? 'Select mess category' : 'Select hostel type first'} disabled={!hostelType} modal />
          </div>
          <p className='text-xs text-muted-foreground sm:col-span-2 -mt-2'>Pick a room, a mess, or both for this band. Categories are gender-specific &mdash; add the rule once per gender you admit.</p>

          <div className='space-y-2 sm:col-span-2'>
            <Label>Effective From <span className='text-muted-foreground font-normal'>(Optional)</span></Label>
            <Input type='date' className='w-full sm:max-w-[calc(50%-0.5rem)]' value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            <p className='text-xs text-muted-foreground'>Reserved for forward-only restriction handling. Leave blank for immediate effect.</p>
          </div>

          <div className='flex flex-row items-center justify-between gap-3 rounded-lg border p-3'>
            <div className='space-y-0.5'>
              <Label className='text-sm'>Monthly mess allowed</Label>
              <p className='text-xs text-muted-foreground'>Allow monthly (non-daily) mess for this rule.</p>
            </div>
            <Switch checked={isMonthlyMessAllowed} onCheckedChange={setIsMonthlyMessAllowed} />
          </div>

          <div className='flex flex-row items-center justify-between gap-3 rounded-lg border p-3'>
            <div className='space-y-0.5'>
              <Label className='text-sm'>Active</Label>
              <p className='text-xs text-muted-foreground'>Disabled rules are kept but not applied.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2 sm:col-span-2'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={submitting} className='w-full sm:w-auto'>Cancel</Button>
            <Button type='button' onClick={onSubmit} disabled={submitting} className='w-full sm:w-auto'>{submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}{isEdit ? 'Save Changes' : 'Add'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
