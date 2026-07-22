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
import type { HRLeaveType, HRLeaveTypeInsert, HRLeaveTypeUpdate, LeaveAccrualType, LeaveApplicableGender, LeaveDurationType, LeaveRequestCategory } from '@/types/hr-leave-types';
import { REQUEST_CATEGORY_LABELS, REQUEST_CATEGORY_HINTS } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
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
  request_category: 'leave' as LeaveRequestCategory,
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
  const { profile } = useAuth();
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

    // Edit-mode seeds `form` from the full row (see useEffect above), so at
    // runtime it also carries id/created_at/created_by/updated_at/updated_by/
    // hr_organization_id/valid_from/valid_until/superseded_by/
    // applicable_cadre_ids even though the state type doesn't declare them.
    // Strip all of those out here — they must never blindly round-trip
    // through this form's payload, and each is re-added deliberately below.
    const {
      id: _id,
      created_at: _createdAt,
      created_by: _createdBy,
      updated_at: _updatedAt,
      updated_by: _updatedBy,
      hr_organization_id: _hrOrganizationId,
      valid_from: _validFrom,
      valid_until: _validUntil,
      superseded_by: _supersededBy,
      applicable_cadre_ids: _applicableCadreIds,
      ...editableFields
    } = form as typeof form & Partial<HRLeaveType>;

    const shared = {
      ...editableFields,
      description: form.description || null,
      max_continuous_days: nullable(form.max_continuous_days),
      document_required_after_days: nullable(form.document_required_after_days),
      max_carry_forward_days: nullable(form.max_carry_forward_days),
      max_encashable_days: nullable(form.max_encashable_days),
    };

    try {
      if (isEdit) {
        // The organization a leave type belongs to is never edited from this
        // dialog — hr_organization_id is intentionally omitted from the
        // update patch (an org move is not an edit operation). Preserve the
        // row's own applicable_cadre_ids (no UI for it here) and advance the
        // audit columns ourselves — there is no DB trigger doing it for us.
        const patch: HRLeaveTypeUpdate & { updated_at: string } = {
          ...shared,
          applicable_cadre_ids: leaveType?.applicable_cadre_ids ?? null,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id ?? null,
        };
        await update.mutateAsync({ id: leaveType!.id, patch });
        toast.success('Leave type updated');
      } else {
        // Create always comes from the page-selected organization (Add is
        // disabled without one) — never from a row, since there is none yet.
        const insertPayload: HRLeaveTypeInsert = {
          ...shared,
          hr_organization_id: leaveType?.hr_organization_id ?? hrOrgId,
          applicable_cadre_ids: null,
          valid_from: new Date().toISOString(),
          valid_until: null,
          superseded_by: null,
        };
        await create.mutateAsync(insertPayload);
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
            <h3 className="text-sm font-semibold">Request surface</h3>
            <div>
              <Label>Requested from</Label>
              <Select value={form.request_category}
                onValueChange={(v) => set('request_category', v as LeaveRequestCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REQUEST_CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {REQUEST_CATEGORY_HINTS[form.request_category as LeaveRequestCategory]}
              </p>
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
                <Label htmlFor="accrualRate">Accrual rate (days per period)</Label>
                <Input id="accrualRate" type="number" step="0.01" min="0"
                  disabled={form.accrual_type === 'none'} value={form.accrual_rate}
                  onChange={(e) => set('accrual_rate', Number(e.target.value))} />
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
