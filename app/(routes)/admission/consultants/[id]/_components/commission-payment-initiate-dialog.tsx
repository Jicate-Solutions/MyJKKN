'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RefundAttachmentsField } from '@/components/billing/refund-attachments-field'
import { formatCurrency } from '@/lib/utils'
import {
  useInitiateCommissionPayment,
  usePayableCommissionLines,
} from '@/hooks/admission/use-commission-payments'
import type { CommissionPaymentAttachment } from '@/types/consultant-commission-payment'
import type { ConsultantFirstYearFeeCollection } from '@/types/education-consultants'

function rupees(value: number): string {
  return formatCurrency(value, { showDecimals: false, minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface CommissionPaymentInitiateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  consultantId: string
  consultantName: string
  year: number
  yearLabel: string
  feeCollection: ConsultantFirstYearFeeCollection[]
  onInitiated?: (requestId: string) => void
}

export function CommissionPaymentInitiateDialog({
  open,
  onOpenChange,
  consultantId,
  consultantName,
  year,
  yearLabel,
  feeCollection,
  onInitiated,
}: CommissionPaymentInitiateDialogProps) {
  const { data: lines, isLoading } = usePayableCommissionLines(consultantId, year, open)
  const initiate = useInitiateCommissionPayment()

  // group_id → amount typed; presence means the line is ticked.
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<CommissionPaymentAttachment[]>([])

  const total = useMemo(
    () => Object.values(selected).reduce((s, v) => s + (Number(v) || 0), 0),
    [selected]
  )

  const fee = useMemo(
    () =>
      feeCollection.reduce(
        (t, r) => ({ fee: t.fee + r.fee_amount, paid: t.paid + r.paid_amount }),
        { fee: 0, paid: 0 }
      ),
    [feeCollection]
  )

  const toggle = (groupId: string, payable: number, checked: boolean) =>
    setSelected(prev => {
      const next = { ...prev }
      if (checked) next[groupId] = String(payable)
      else delete next[groupId]
      return next
    })

  const handleSubmit = () => {
    const picked = Object.entries(selected)
    if (!picked.length) return toast.error('Select at least one institution to pay')
    for (const [groupId, raw] of picked) {
      const line = lines?.find(l => l.group_id === groupId)
      const amount = Number(raw)
      if (!line || !(amount > 0)) return toast.error('Enter an amount greater than zero for each selected line')
      if (amount > line.payable) {
        return toast.error(`${line.group_name}: at most ${rupees(line.payable)} can be requested`)
      }
    }
    if (!notes.trim()) return toast.error('Notes are required')

    initiate.mutate(
      {
        consultant_id: consultantId,
        academic_year: year,
        lines: picked.map(([group_id, raw]) => ({ group_id, amount: Number(raw) })),
        notes: notes.trim(),
        attachments,
      },
      {
        onSuccess: id => {
          onOpenChange(false)
          onInitiated?.(id)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={o => !initiate.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Initiate Commission Payment</DialogTitle>
          <DialogDescription>
            {consultantName} · {yearLabel}. The request goes through the commission approval flow and is
            recorded as a payment once it is disbursed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            1st-year fees collected from counted learners:{' '}
            <span className="font-semibold tabular-nums">
              {rupees(fee.paid)} of {rupees(fee.fee)}
            </span>
            {fee.fee > 0 && (
              <span className="text-muted-foreground"> ({((fee.paid / fee.fee) * 100).toFixed(1)}%)</span>
            )}
            . This is shown to approvers with the request.
          </div>

          <div className="space-y-2">
            <Label>Institutions with balance to pay *</Label>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !lines?.length ? (
              <p className="rounded-md border py-6 text-center text-sm text-muted-foreground">
                No balance left to pay for {yearLabel}.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {lines.map(l => {
                  const checked = l.group_id in selected
                  const disabled = l.payable <= 0
                  return (
                    <div key={l.group_id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                      <label className="flex flex-1 items-start gap-3">
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={c => toggle(l.group_id, l.payable, c === true)}
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <p className="font-medium">{l.group_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Balance {rupees(l.balance)}
                            {l.held > 0 && ` · ${rupees(l.held)} held in another request`}
                            {' · '}can request {rupees(l.payable)}
                          </p>
                        </div>
                      </label>
                      {checked && (
                        <Input
                          type="number"
                          min={1}
                          max={l.payable}
                          step="1"
                          className="sm:w-40 text-right"
                          value={selected[l.group_id]}
                          onChange={e => setSelected(prev => ({ ...prev, [l.group_id]: e.target.value }))}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes *</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why this payment is due now"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Supporting Documents <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <RefundAttachmentsField
              value={attachments}
              onChange={setAttachments}
              institutionName={consultantName}
              requestRef={`draft-${consultantId}`}
              endpoint="/api/admission/consultants/commission-payments/attachments"
            />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total to pay</span>
            <span className="text-lg font-bold tabular-nums">{rupees(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={initiate.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={initiate.isPending || total <= 0}>
            {initiate.isPending ? 'Submitting…' : 'Initiate Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
