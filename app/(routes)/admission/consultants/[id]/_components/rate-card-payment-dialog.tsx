'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { ConsultantService } from '@/lib/services/admission/consultant-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type {
  ConsultantRateCardEarning,
  RateCardPayment,
  RateCardPaymentEntryType,
} from '@/types/education-consultants'

const PAYMENT_MODES = ['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'Other']

function rupees(value: number): string {
  return formatCurrency(value, { showDecimals: false, minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export interface PaymentDialogState {
  /** Existing entry to edit; null = new entry. */
  editing: RateCardPayment | null
  groupId: string | null
  entryType: RateCardPaymentEntryType
}

interface RateCardPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  consultantId: string
  groups: ConsultantRateCardEarning[]
  state: PaymentDialogState
  onSaved: () => void
}

export function RateCardPaymentDialog({
  open,
  onOpenChange,
  consultantId,
  groups,
  state,
  onSaved,
}: RateCardPaymentDialogProps) {
  const { profile } = useAuth()
  const [form, setForm] = useState(() => initialForm(state, groups))
  const [saving, setSaving] = useState(false)

  const set = (key: keyof ReturnType<typeof initialForm>, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const group = groups.find(g => g.group_id === form.group_id)
  const isRecovery = form.entry_type === 'recovery'

  const handleSave = async () => {
    const amount = Number(form.amount)
    if (!form.group_id) return toast.error('Choose an institution')
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter an amount greater than 0')
    if (!form.paid_on) return toast.error('Enter the date')

    const payload = {
      group_id: form.group_id,
      entry_type: form.entry_type as RateCardPaymentEntryType,
      amount,
      paid_on: form.paid_on,
      payment_mode: form.payment_mode || null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    try {
      if (state.editing) {
        await ConsultantService.updateRateCardPayment(state.editing.id, payload, profile?.id)
        toast.success('Entry updated')
      } else {
        await ConsultantService.createRateCardPayment({ ...payload, consultant_id: consultantId }, profile?.id)
        toast.success(isRecovery ? 'Recovery recorded' : 'Payment recorded')
      }
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {state.editing ? 'Edit Entry' : isRecovery ? 'Record Recovery' : 'Record Payment'}
          </DialogTitle>
          <DialogDescription>
            {isRecovery
              ? 'Money the consultant returned for an overpaid institution.'
              : 'A lump-sum commission payment for one institution.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={form.entry_type} onValueChange={v => set('entry_type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="payment">Payment (paid to consultant)</SelectItem>
                <SelectItem value="recovery">Recovery (returned by consultant)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Institution *</Label>
            <Select value={form.group_id} onValueChange={v => set('group_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose institution" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.group_id} value={g.group_id}>
                    {g.group_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The number the person is about to pay against, so they don't have
                to leave the dialog to look it up. */}
            {group && (
              <p className="text-xs text-muted-foreground">
                Earned {rupees(group.total_amount ?? 0)} · Paid {rupees(group.paid_amount)} ·{' '}
                {group.excess_amount > 0 ? (
                  <span className="text-red-600">Excess {rupees(group.excess_amount)}</span>
                ) : (
                  <>Balance {rupees(group.balance_amount)}</>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.paid_on} onChange={e => set('paid_on', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={form.payment_mode} onValueChange={v => set('payment_mode', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map(m => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input
                placeholder="UTR / cheque no."
                value={form.reference}
                onChange={e => set('reference', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : state.editing ? 'Update' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function initialForm(state: PaymentDialogState, groups: ConsultantRateCardEarning[]) {
  if (state.editing) {
    const p = state.editing
    return {
      entry_type: p.entry_type as string,
      group_id: p.group_id,
      amount: String(p.amount),
      paid_on: p.paid_on,
      payment_mode: p.payment_mode ?? '',
      reference: p.reference ?? '',
      notes: p.notes ?? '',
    }
  }
  const group = groups.find(g => g.group_id === state.groupId)
  // Pre-fill with what is actually outstanding for that institution — the
  // balance for a payment, the excess for a recovery.
  const suggested =
    state.entryType === 'recovery' ? group?.excess_amount : group?.balance_amount
  return {
    entry_type: state.entryType as string,
    group_id: state.groupId ?? '',
    amount: suggested ? String(suggested) : '',
    paid_on: new Date().toISOString().split('T')[0],
    payment_mode: '',
    reference: '',
    notes: '',
  }
}
