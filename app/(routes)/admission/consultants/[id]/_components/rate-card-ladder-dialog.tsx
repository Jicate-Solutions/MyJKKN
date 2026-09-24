'use client'

// Agency rate ladder editor — one line of the service-charge card, one agency.
//
// The Director's ruling of 2026-09-21: an agency may be moved off the standard
// card onto THEIR OWN ladder for a line. Their ladder replaces the standard one
// for that line; it never merges with it and never tops it up. Clearing the
// bands puts them back on the standard card.
//
// The dialog always shows the standard ladder alongside, because a rate is only
// meaningful next to the rate it is departing from.

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ConsultantService } from '@/lib/services/admission/consultant-service'
import { formatCurrency } from '@/lib/utils'
import type { RateCardSlab, RateCardSlabInput } from '@/types/education-consultants'

export interface LadderDialogState {
  groupId: string
  groupName: string
  /** The agency's existing bands on this line; empty means they are on the standard card. */
  bands: RateCardSlab[]
  /** The standard card's bands for this line, shown for comparison. */
  standard: { min_count: number; max_count: number | null; amount: number }[]
  note: string | null
}

interface Row {
  min_count: string
  max_count: string
  amount: string
}

function toRows(bands: RateCardSlab[]): Row[] {
  if (bands.length === 0) return [{ min_count: '1', max_count: '', amount: '' }]
  return bands.map(b => ({
    min_count: String(b.min_count),
    max_count: b.max_count == null ? '' : String(b.max_count),
    amount: String(b.amount),
  }))
}

function bandLabel(min: number, max: number | null): string {
  return max == null ? `${min} and above` : `${min} to ${max}`
}

export function RateCardLadderDialog({
  open,
  onOpenChange,
  consultantId,
  state,
  userId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  consultantId: string
  state: LadderDialogState | null
  userId?: string | null
  onSaved: () => void
}) {
  const [rows, setRows] = useState<Row[]>([{ min_count: '1', max_count: '', amount: '' }])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !state) return
    setRows(toRows(state.bands))
    setNote(state.note ?? '')
  }, [open, state])

  const parsed: RateCardSlabInput[] = useMemo(
    () =>
      rows
        .filter(r => r.amount.trim() !== '' || r.min_count.trim() !== '')
        .map(r => ({
          min_count: Number(r.min_count || 0),
          max_count: r.max_count.trim() === '' ? null : Number(r.max_count),
          amount: Number(r.amount || 0),
        })),
    [rows]
  )

  // Mirrors the checks the service and the database both enforce, so the person
  // sees the problem while typing instead of after pressing Save.
  const problem = useMemo(() => {
    const sorted = [...parsed].sort((a, b) => a.min_count - b.min_count)
    for (const b of sorted) {
      if (!Number.isFinite(b.min_count) || b.min_count < 1) return 'Every band must start at 1 learner or more.'
      if (b.max_count != null && b.max_count < b.min_count) return 'A band cannot end before it starts.'
      if (!Number.isFinite(b.amount) || b.amount < 0) return 'Every band needs a rate of zero or more.'
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1].max_count == null || sorted[i].min_count <= (sorted[i - 1].max_count as number)) {
        return 'Two bands cover the same number of learners. Change the ranges so they do not overlap.'
      }
    }
    return null
  }, [parsed])

  const isClearing = parsed.length === 0 || parsed.every(b => b.amount === 0 && b.min_count === 0)

  const save = async () => {
    if (!state) return
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      await ConsultantService.saveConsultantLadder(
        consultantId,
        state.groupId,
        parsed,
        note.trim() === '' ? null : note.trim(),
        userId ?? null
      )
      toast.success(
        parsed.length === 0
          ? `${state.groupName}: back on the standard card`
          : `${state.groupName}: agency rate saved`
      )
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the agency rate.')
    } finally {
      setBusy(false)
    }
  }

  const clearLadder = async () => {
    if (!state) return
    setBusy(true)
    try {
      await ConsultantService.clearConsultantLadder(consultantId, state.groupId)
      toast.success(`${state.groupName}: back on the standard card`)
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not clear the agency rate.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Agency rate — {state?.groupName}</DialogTitle>
          <DialogDescription>
            These rates replace the standard card for this agency, on this line only. Every other line
            and every other agency stays on the standard card.
          </DialogDescription>
        </DialogHeader>

        {state && state.standard.length > 0 && (
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Standard card for this line</p>
            <ul className="text-sm space-y-0.5">
              {state.standard.map((b, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{bandLabel(b.min_count, b.max_count)} learners</span>
                  <span className="tabular-nums">{formatCurrency(b.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1.3fr_auto] gap-2 text-xs text-muted-foreground">
            <span>From learners</span>
            <span>To learners</span>
            <span>Rate per learner</span>
            <span className="sr-only">Remove</span>
          </div>

          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.3fr_auto] gap-2 items-center">
              <Input
                id={`ladder-min-${i}`}
                inputMode="numeric"
                value={r.min_count}
                onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, min_count: e.target.value } : x)))}
              />
              <Input
                id={`ladder-max-${i}`}
                inputMode="numeric"
                placeholder="no limit"
                value={r.max_count}
                onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, max_count: e.target.value } : x)))}
              />
              <Input
                id={`ladder-amount-${i}`}
                inputMode="numeric"
                value={r.amount}
                onChange={e => setRows(rs => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this band"
                onClick={() => setRows(rs => (rs.length === 1 ? rs : rs.filter((_, j) => j !== i)))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows(rs => [...rs, { min_count: '', max_count: '', amount: '' }])}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add a band
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ladder-note">Why this agency is off the standard card</Label>
          <Input
            id="ladder-note"
            placeholder="The signed letter, the meeting, the date"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {problem && (
          <Alert variant="destructive">
            <AlertTitle>Fix this before saving</AlertTitle>
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}

        {!problem && parsed.length > 0 && parsed.every(b => b.max_count != null) && (
          <Alert>
            <AlertTitle>The top band ends</AlertTitle>
            <AlertDescription>
              Above {Math.max(...parsed.map(b => b.max_count as number))} learners this agency earns nothing
              on this line, and it will read as not earned rather than fall back to the standard rate. Leave
              the last band&apos;s &ldquo;to&rdquo; empty if it should have no limit.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {state && state.bands.length > 0 && (
            <Button type="button" variant="outline" onClick={clearLadder} disabled={busy} className="sm:mr-auto">
              Back to standard card
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy || !!problem}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isClearing ? 'Back to standard card' : 'Save agency rate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
