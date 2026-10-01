'use client'

// Record an advance to an agency.
//
// An advance carries no college line and must carry an intake year (Director,
// 2026-09-21: "advances will be attributed to admission year wise"). It is then
// consumed automatically as that year's admissions come in, spread down the card
// in its printed order.
//
// What happens to the unused part is decided here, per agency, when the money is
// recorded — the system keeps the decision, it does not make it.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConsultantService } from '@/lib/services/admission/consultant-service'
import { formatCurrency } from '@/lib/utils'
import type { AdvanceDisposition } from '@/types/education-consultants'

function yearLabel(year: number): string {
  return `${year}-${String(year + 1).slice(-2)}`
}

export function RateCardAdvanceDialog({
  open,
  onOpenChange,
  consultantId,
  consultantName,
  year,
  outstanding,
  userId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  consultantId: string
  consultantName?: string
  /** The intake year the panel is showing. An advance belongs to exactly one. */
  year: number
  /** What this agency still owes for that year, so the person can see what the advance will cover. */
  outstanding: number
  userId?: string | null
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [disposition, setDisposition] = useState<AdvanceDisposition | ''>('')
  const [mode, setMode] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setPaidOn(new Date().toISOString().slice(0, 10))
    setDisposition('')
    setMode('')
    setReference('')
    setNotes('')
  }, [open])

  const value = Number(amount || 0)
  const overshoot = value > outstanding ? value - outstanding : 0
  const canSave = value > 0 && !!disposition && !!paidOn

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      await ConsultantService.createRateCardAdvance(
        {
          consultant_id: consultantId,
          entry_type: 'advance',
          amount: value,
          paid_on: paidOn,
          academic_year: year,
          advance_disposition: disposition as AdvanceDisposition,
          payment_mode: mode.trim() || null,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        },
        userId ?? null
      )
      toast.success(`Advance of ${formatCurrency(value)} recorded for ${yearLabel(year)}`)
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the advance.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record an advance{consultantName ? ` — ${consultantName}` : ''}</DialogTitle>
          <DialogDescription>
            An advance is against the {yearLabel(year)}{' '}
            intake as a whole, not against one college. It
            is used up automatically as that year&apos;s admissions come in, starting at the top of the
            card and working down.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex justify-between gap-4">
          <span className="text-muted-foreground">Still to pay for {yearLabel(year)}</span>
          <span className="tabular-nums font-medium">{formatCurrency(outstanding)}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="advance-amount">Amount</Label>
            <Input
              id="advance-amount"
              inputMode="numeric"
              placeholder="1000000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="advance-paid-on">Paid on</Label>
            <Input id="advance-paid-on" type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="advance-disposition">If it is not fully used by the end of {yearLabel(year)}</Label>
          <Select value={disposition} onValueChange={v => setDisposition(v as AdvanceDisposition)}>
            <SelectTrigger id="advance-disposition">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="carry_forward">Carry what is left into next year</SelectItem>
              <SelectItem value="recoverable">Show what is left as money to recover</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="advance-mode">How it was paid</Label>
            <Input id="advance-mode" placeholder="Bank transfer, cheque" value={mode} onChange={e => setMode(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="advance-reference">Reference</Label>
            <Input id="advance-reference" placeholder="Cheque or transaction number" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="advance-notes">Notes</Label>
          <Input id="advance-notes" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {overshoot > 0 && (
          <Alert>
            <AlertDescription>
              {formatCurrency(overshoot)} of this is more than {yearLabel(year)} currently owes. That is
              fine — it sits unused and is eaten by later admissions.{' '}
              {disposition === 'recoverable'
                ? 'Anything still unused at year end will show as money to recover.'
                : disposition === 'carry_forward'
                  ? 'Anything still unused at year end is marked to carry forward.'
                  : 'Choose above what should happen to whatever is left.'}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy || !canSave}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Record advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
