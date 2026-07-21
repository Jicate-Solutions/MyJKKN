'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateHRLeaveType, useUpdateHRLeaveType } from '@/hooks/hr/use-hr-leave-types';
import { ACCRUAL_TYPE_LABELS, APPLICABLE_GENDER_LABELS } from '@/types/hr-leave-types';
import type { HRLeaveType, LeaveAccrualType, LeaveApplicableGender, LeaveDurationType } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hrOrgId: string;
  leaveType?: HRLeaveType | null;
}

const EMPTY = {
  leave_type_code: '', leave_type_name: '', description: '',
  color_code: '#6B7280', display_order: 0, is_active: true,
  duration_type: 'full' as LeaveDurationType, allow_half_day: false, allow_hourly: false,
  skip_weekends: true, skip_holidays: true,
  requires_approval: true, is_paid: true,
  min_advance_notice_days: 0, max_continuous_days: '' as number | '' ,
  requires_documents: false, document_required_after_days: '' as number | '',
  default_entitled_days: 0,
  allow_carry_forward: false, max_carry_forward_days: '' as number | '',
  is_encashable: false, max_encashable_days: '' as number | '',
  accrual_type: 'none' as LeaveAccrualType, accrual_rate: 0,
  applicable_gender: 'all' as LeaveApplicableGender,
};

export function LeaveTypeFormDialog({ open, onOpenChange, hrOrgId, leaveType }: Props) {
  const [form, setForm] = useState({ ...EMPTY });
  const create = useCreateHRLeaveType();
  const update = useUpdateHRLeaveType();
  const isEdit = !!leaveType;

  useEffect(() => {
    if (!open) return;
    if (leaveType) {
      setForm({
        ...EMPTY,
        ...leaveType,
        description: leaveType.description ?? '',
        max_continuous_days: leaveType.max_continuous_days ?? '',
        document_required_after_days: leaveType.document_required_after_days ?? '',
        max_carry_forward_days: leaveType.max_carry_forward_days ?? '',
        max_encashable_days: leaveType.max_encashable_days ?? '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, leaveType]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Numeric fields left blank must go to the DB as null, not '' — an empty
  // string sent for a numeric/uuid column raises 22P02.
  const nullable = (v: number | '') => (v === '' ? null : Number(v));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      hr_organization_id: hrOrgId,
      description: form.description || null,
      max_continuous_days: nullable(form.max_continuous_days),
      document_required_after_days: nullable(form.document_required_after_days),
      max_carry_forward_days: nullable(form.max_carry_forward_days),
      max_encashable_days: nullable(form.max_encashable_days),
      applicable_cadre_ids: null,
      valid_from: leaveType?.valid_from ?? new Date().toISOString(),
      valid_until: leaveType?.valid_until ?? null,
      superseded_by: leaveType?.superseded_by ?? null,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: leaveType!.id, patch: payload });
        toast.success('Leave type updated');
      } else {
        await create.mutateAsync(payload as never);
        toast.success('Leave type created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Leave Type</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Identity</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={form.leave_type_code}
                  onChange={(e) => set('leave_type_code', e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.leave_type_name}
                  onChange={(e) => set('leave_type_name', e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description}
                onChange={(e) => set('description', e.target.value)} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Duration &amp; day counting</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Duration type</Label>
                <Select value={form.duration_type}
                  onValueChange={(v) => set('duration_type', v as LeaveDurationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full day</SelectItem>
                    <SelectItem value="first_half">First half</SelectItem>
                    <SelectItem value="second_half">Second half</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="entitled">Default entitled days</Label>
                <Input id="entitled" type="number" step="0.5" value={form.default_entitled_days}
                  onChange={(e) => set('default_entitled_days', Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {([
                ['allow_half_day', 'Allow half day'],
                ['allow_hourly', 'Allow hourly'],
                ['skip_weekends', 'Skip weekends'],
                ['skip_holidays', 'Skip holidays'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form[k]} onCheckedChange={(c) => set(k, !!c)} />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Policy</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="notice">Min advance notice (days)</Label>
                <Input id="notice" type="number" min="0" value={form.min_advance_notice_days}
                  onChange={(e) => set('min_advance_notice_days', Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="maxcont">Max continuous days (blank = unlimited)</Label>
                <Input id="maxcont" type="number" min="1" value={form.max_continuous_days}
                  onChange={(e) => set('max_continuous_days', e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requires_approval} onCheckedChange={(c) => set('requires_approval', !!c)} />
                Requires approval
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_paid} onCheckedChange={(c) => set('is_paid', !!c)} />
                Paid leave
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requires_documents} onCheckedChange={(c) => set('requires_documents', !!c)} />
                Requires documents
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Carry-forward, encashment &amp; accrual</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.allow_carry_forward} onCheckedChange={(c) => set('allow_carry_forward', !!c)} />
                  Allow carry-forward
                </label>
                <Input type="number" step="0.5" placeholder="Max carry-forward days"
                  disabled={!form.allow_carry_forward} value={form.max_carry_forward_days}
                  onChange={(e) => set('max_carry_forward_days', e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.is_encashable} onCheckedChange={(c) => set('is_encashable', !!c)} />
                  Encashable
                </label>
                <Input type="number" step="0.5" placeholder="Max encashable days"
                  disabled={!form.is_encashable} value={form.max_encashable_days}
                  onChange={(e) => set('max_encashable_days', e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <Label>Accrual</Label>
                <Select value={form.accrual_type} onValueChange={(v) => set('accrual_type', v as LeaveAccrualType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCRUAL_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Applicable to</Label>
                <Select value={form.applicable_gender} onValueChange={(v) => set('applicable_gender', v as LeaveApplicableGender)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPLICABLE_GENDER_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
