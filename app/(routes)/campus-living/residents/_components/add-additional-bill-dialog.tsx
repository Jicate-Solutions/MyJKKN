'use client';

// Task 7 — ad-hoc ("additional") hostel bill. Creates ONE bill outside the
// hostel-year generation pipeline (fee_source='ad_hoc'), so it is exempt from
// the generation dedup indexes and always inserts. Used as a per-row action on
// the generate tab.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBillingCategories } from '@/hooks/billing/use-billing-categories';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import { getErrorMessage } from '@/lib/utils';
import type { LearnerHostelite } from '@/types/campus-living';

interface Props {
  learner: LearnerHostelite | null;
  hostelYearId: string | null;
  onClose: () => void;
}

function defaultDueDate(): string {
  // 30 days out, as a YYYY-MM-DD date (the column is a DATE).
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

export function AddAdditionalBillDialog({ learner, hostelYearId, onClose }: Props) {
  const open = !!learner;
  const qc = useQueryClient();
  const { categories, loading: categoriesLoading } = useBillingCategories({
    isActive: true,
    limit: 1000,
  });

  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(defaultDueDate());
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCategoryId('');
    setAmount('');
    setDescription('');
    setDueDate(defaultDueDate());
    setSubmitting(false);
  }

  function handleOpenChange(v: boolean) {
    if (submitting) return;
    if (!v) {
      reset();
      onClose();
    }
  }

  async function handleSubmit() {
    if (submitting) return; // double-submit guard (race before disabled applies)
    if (!learner) return;

    const amt = Number.parseFloat(amount);
    if (!categoryId) {
      toast.error('Select a billing category.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount greater than 0.');
      return;
    }
    if (!dueDate) {
      toast.error('Pick a due date.');
      return;
    }

    setSubmitting(true);
    try {
      // createStudentBill throws on Supabase error (it destructures + rethrows
      // internally), so the try/catch surfaces RLS / constraint failures.
      await StudentBillService.createStudentBill({
        student_id: learner.id,
        institution_id: learner.institution_id,
        item_category_id: categoryId,
        bill_description: description.trim() || undefined,
        due_date: dueDate,
        unit_amount: amt,
        total_amount: amt,
        final_amount: amt,
        fee_source: 'ad_hoc',
        hostel_year_id: hostelYearId ?? undefined,
        applies_year_of_study: learner.year_of_study ?? undefined,
      });

      toast.success('Additional bill created.');
      // Refresh the same caches the generation flow touches.
      qc.invalidateQueries({ queryKey: ['campus-living'] });
      qc.invalidateQueries({ queryKey: ['student-bills'] });
      qc.invalidateQueries({ queryKey: ['hostel-residents'] });
      reset();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  const learnerName =
    [learner?.first_name, learner?.last_name].filter(Boolean).join(' ') ||
    '(unnamed)';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add additional bill</DialogTitle>
          <DialogDescription>
            Create a one-off ad-hoc bill for <strong>{learnerName}</strong>.
            This bypasses hostel-year generation and is not deduplicated.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label htmlFor='adhoc-category'>Billing category</Label>
            <Select
              value={categoryId || undefined}
              onValueChange={setCategoryId}
              disabled={submitting || categoriesLoading}
            >
              <SelectTrigger id='adhoc-category'>
                <SelectValue
                  placeholder={
                    categoriesLoading ? 'Loading categories…' : 'Select category'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='adhoc-amount'>Amount</Label>
            <Input
              id='adhoc-amount'
              type='number'
              min='0'
              step='1'
              inputMode='decimal'
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder='0'
              disabled={submitting}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='adhoc-due'>Due date</Label>
            <Input
              id='adhoc-due'
              type='date'
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='adhoc-description'>Description</Label>
            <Textarea
              id='adhoc-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Optional note describing this charge'
              rows={2}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Create bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
