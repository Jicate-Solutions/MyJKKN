'use client';

/**
 * Create / edit dialog for a single hostel_fee_config row.
 *
 * Wired 2026-04-24 (Agent D — settings real-save). Replaces the previous
 * no-op Add/Edit buttons on /campus-living/settings/fee-config which only
 * showed a warning toast.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Loader2 } from 'lucide-react';
import {
  useCreateHostelFeeConfig,
  useUpdateHostelFeeConfig,
} from '@/hooks/campus-living/use-hostel-fee-config';

type RoomTypeEnum = 'single' | 'double' | 'triple' | 'quad' | 'dormitory';
type AcStatusEnum = 'ac' | 'non_ac' | 'cooler';

export interface FeeConfigRow {
  id?: string;
  institution_id: string;
  academic_year_id: string;
  room_type: RoomTypeEnum;
  ac_status: AcStatusEnum;
  annual_fee: number;
  semester_fee?: number | null;
  monthly_fee?: number | null;
  deposit_amount: number;
  mess_fee_monthly?: number | null;
  mess_fee_semester?: number | null;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  academicYearId: string;
  initialValue?: FeeConfigRow | null;
}

export function FeeConfigDialog({
  open,
  onOpenChange,
  institutionId,
  academicYearId,
  initialValue,
}: Props) {
  const isEdit = !!initialValue?.id;
  const createMut = useCreateHostelFeeConfig();
  const updateMut = useUpdateHostelFeeConfig();

  const [form, setForm] = useState<FeeConfigRow>({
    institution_id: institutionId,
    academic_year_id: academicYearId,
    room_type: 'single',
    ac_status: 'non_ac',
    annual_fee: 0,
    semester_fee: null,
    monthly_fee: null,
    deposit_amount: 0,
    mess_fee_monthly: null,
    mess_fee_semester: null,
    is_active: true,
  });

  useEffect(() => {
    if (initialValue) {
      setForm({ ...initialValue });
    } else if (open) {
      setForm({
        institution_id: institutionId,
        academic_year_id: academicYearId,
        room_type: 'single',
        ac_status: 'non_ac',
        annual_fee: 0,
        semester_fee: null,
        monthly_fee: null,
        deposit_amount: 0,
        mess_fee_monthly: null,
        mess_fee_semester: null,
        is_active: true,
      });
    }
  }, [initialValue, open, institutionId, academicYearId]);

  const isSaving = createMut.isPending || updateMut.isPending;

  const canSave =
    !!form.institution_id &&
    !!form.academic_year_id &&
    !!form.room_type &&
    !!form.ac_status &&
    Number.isFinite(form.annual_fee) &&
    form.annual_fee >= 0 &&
    Number.isFinite(form.deposit_amount) &&
    form.deposit_amount >= 0;

  const handleSave = async () => {
    try {
      if (isEdit && initialValue?.id) {
        await updateMut.mutateAsync({
          id: initialValue.id,
          payload: {
            room_type: form.room_type,
            ac_status: form.ac_status,
            annual_fee: form.annual_fee,
            semester_fee: form.semester_fee ?? null,
            monthly_fee: form.monthly_fee ?? null,
            deposit_amount: form.deposit_amount,
            mess_fee_monthly: form.mess_fee_monthly ?? null,
            mess_fee_semester: form.mess_fee_semester ?? null,
            is_active: form.is_active ?? true,
          },
        });
      } else {
        await createMut.mutateAsync({
          institution_id: form.institution_id,
          academic_year_id: form.academic_year_id,
          room_type: form.room_type,
          ac_status: form.ac_status,
          annual_fee: form.annual_fee,
          semester_fee: form.semester_fee ?? null,
          monthly_fee: form.monthly_fee ?? null,
          deposit_amount: form.deposit_amount,
          mess_fee_monthly: form.mess_fee_monthly ?? null,
          mess_fee_semester: form.mess_fee_semester ?? null,
          is_active: form.is_active ?? true,
        } as FeeConfigRow);
      }
      onOpenChange(false);
    } catch {
      // error toast handled by mutation hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Fee Configuration' : 'Add Fee Configuration'}</DialogTitle>
          <DialogDescription>
            Fees persist to <code>hostel_fee_config</code> and take effect on the next billing run.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Room Type</Label>
            <Select
              value={form.room_type}
              onValueChange={(v) => setForm((f) => ({ ...f, room_type: v as RoomTypeEnum }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="double">Double</SelectItem>
                <SelectItem value="triple">Triple</SelectItem>
                <SelectItem value="quad">Quad</SelectItem>
                <SelectItem value="dormitory">Dormitory</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>AC Status</Label>
            <Select
              value={form.ac_status}
              onValueChange={(v) => setForm((f) => ({ ...f, ac_status: v as AcStatusEnum }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ac">AC</SelectItem>
                <SelectItem value="non_ac">Non-AC</SelectItem>
                <SelectItem value="cooler">Cooler</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Annual Fee (INR)</Label>
            <Input
              type="number"
              min="0"
              value={form.annual_fee}
              onChange={(e) => setForm((f) => ({ ...f, annual_fee: Number(e.target.value) }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Deposit (INR)</Label>
            <Input
              type="number"
              min="0"
              value={form.deposit_amount}
              onChange={(e) => setForm((f) => ({ ...f, deposit_amount: Number(e.target.value) }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Semester Fee (INR)</Label>
            <Input
              type="number"
              min="0"
              value={form.semester_fee ?? ''}
              placeholder="optional"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  semester_fee: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Monthly Fee (INR)</Label>
            <Input
              type="number"
              min="0"
              value={form.monthly_fee ?? ''}
              placeholder="optional"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  monthly_fee: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Mess Fee (per semester)</Label>
            <Input
              type="number"
              min="0"
              value={form.mess_fee_semester ?? ''}
              placeholder="optional"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  mess_fee_semester: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Mess Fee (per month)</Label>
            <Input
              type="number"
              min="0"
              value={form.mess_fee_monthly ?? ''}
              placeholder="optional"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  mess_fee_monthly: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
