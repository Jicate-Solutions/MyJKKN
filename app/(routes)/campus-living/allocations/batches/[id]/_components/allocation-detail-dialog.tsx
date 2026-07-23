'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  X,
  Loader2,
  Building2,
  UtensilsCrossed,
  DoorOpen,
  ReceiptText,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';
import { useAllocationExplain } from '@/hooks/campus-living/use-allocation-batches';

const inr = (n: number | null) => (n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—');

// Half-open band [fee_min, fee_max) — mirrors fn_hostel_effective_*_categories.
const feeBand = (min: number | null, max: number | null) => {
  if (min == null && max == null) return 'Any fee';
  if (min == null) return `Below ${inr(max)}`;
  if (max == null) return `${inr(min)} or more`;
  return `${inr(min)} – ${inr(max)}`;
};

function Cond({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      )}
      <span>{children}</span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="space-y-1.5 pl-1">{children}</div>
    </div>
  );
}

/** One "condition vs learner" line: what the rule demands on the left, what the learner has on the right. */
function CompareRow({
  label,
  condition,
  learner,
  ok,
}: {
  label: string;
  condition: string;
  learner: string;
  ok: boolean;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr_1fr_18px] items-center gap-x-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate" title={condition}>{condition}</span>
      <span className="truncate" title={learner}>{learner}</span>
      {ok ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <X className="h-3.5 w-3.5 text-red-600" />
      )}
    </div>
  );
}

function CompareHeader() {
  return (
    <div className="grid grid-cols-[88px_1fr_1fr_18px] gap-x-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <span />
      <span>Condition</span>
      <span>Learner</span>
      <span />
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocationId: string | null;
  learnerName: string;
}

export function AllocationDetailDialog({ open, onOpenChange, allocationId, learnerName }: Props) {
  const { data, isLoading, error } = useAllocationExplain(open ? allocationId : null);

  const learner = data?.learner;
  const rules = data?.eligibility_rules ?? [];
  const appliedRoomRule = rules.find((r) => r.selected_room);
  const pinnedRules = data?.physical?.pinned_rules ?? [];
  const bills = data?.bills ?? [];
  const countedTotal = bills
    .filter((b) => b.counted)
    .reduce((sum, b) => sum + Number(b.amount ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocation eligibility</DialogTitle>
          <DialogDescription>
            Why <span className="font-medium text-foreground">{learnerName}</span> qualifies for{' '}
            {data?.room_number ? `Room ${data.room_number}` : 'this room'} — the configured
            conditions compared against the learner.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading eligibility…
          </div>
        ) : error || !data || data.error ? (
          <p className="py-6 text-sm text-destructive">
            {data?.error === 'allocation_not_found'
              ? 'Allocation not found.'
              : 'Could not load eligibility details.'}
          </p>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Configured Program-Eligibility conditions vs the learner */}
            <Section
              icon={<SlidersHorizontal className="h-4 w-4 text-primary" />}
              title="Program-Eligibility conditions"
            >
              {learner?.academic_fee == null && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    No academic bill tagged to {learner?.academic_year ?? 'the current academic year'} —
                    the gating fee is unknown, so fee-band conditions cannot match (allocation fails
                    open with no category restriction).
                  </span>
                </div>
              )}
              {rules.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No conditions configured for {learner?.institution ?? 'this institution'} —
                  allocation fails open (no category restriction).
                </p>
              ) : (
                <div className="space-y-2">
                  {rules.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded-md border p-2.5 space-y-1.5 ${
                        r.selected_room || r.selected_mess ? 'border-primary/50 bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.selected_room && <Badge>Applied — room</Badge>}
                        {r.selected_mess && <Badge>Applied — mess</Badge>}
                        {!r.selected_room && !r.selected_mess && (
                          <Badge variant={r.matched ? 'secondary' : 'outline'}>
                            {r.matched ? 'matched (not selected)' : 'not matched'}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          grants{r.room_category ? ` Room: ${r.room_category}` : ''}
                          {r.room_category && r.mess_category ? ' ·' : ''}
                          {r.mess_category ? ` Mess: ${r.mess_category}` : ''}
                        </span>
                      </div>
                      <CompareHeader />
                      <CompareRow
                        label="Program"
                        condition={r.program ?? 'Any program'}
                        learner={learner?.program ?? '—'}
                        ok={r.program_ok}
                      />
                      <CompareRow
                        label="Quota"
                        condition={r.quota ?? 'Any quota'}
                        learner={learner?.quota ?? 'None'}
                        ok={r.quota_ok}
                      />
                      <CompareRow
                        label="Fee band"
                        condition={feeBand(r.fee_min, r.fee_max)}
                        learner={inr(learner?.academic_fee ?? null)}
                        ok={r.fee_ok}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Category eligibility result */}
            <Section icon={<Building2 className="h-4 w-4 text-primary" />} title="Category eligibility">
              <Cond ok={data.category.room_category_matched}>
                Room category: allocated{' '}
                <strong>{data.category.allocated_room_category ?? '—'}</strong>
                {' · '}eligible <strong>{data.category.resolved_room_category ?? '—'}</strong>
                {!data.category.room_category_matched && (
                  <Badge variant="destructive" className="ml-1 align-middle">
                    mismatch
                  </Badge>
                )}
              </Cond>
              <div className="flex items-start gap-2 text-sm">
                <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  Mess category: <strong>{data.category.resolved_mess_category ?? '—'}</strong>
                </span>
              </div>
              <Cond ok={data.category.gender_ok}>
                Gender match ({data.category.gender ?? '—'})
              </Cond>
              <p className="pl-6 text-xs text-muted-foreground">
                Resolved from {data.category.academic_year ?? 'academic year'} · academic fee{' '}
                {inr(data.category.academic_fee)}
              </p>
              {appliedRoomRule && (
                <p className="pl-6 text-xs text-muted-foreground">
                  Condition fee: <strong>{feeBand(appliedRoomRule.fee_min, appliedRoomRule.fee_max)}</strong>
                  {' · '}Learner fee: <strong>{inr(learner?.academic_fee ?? null)}</strong>
                  {' → '}{appliedRoomRule.room_category ?? '—'}
                </p>
              )}
            </Section>

            {/* The learner's academic bills — which one produced the gating fee */}
            <Section icon={<ReceiptText className="h-4 w-4 text-primary" />} title="Academic bills (gating fee)">
              {bills.length === 0 ? (
                <p className="text-xs text-muted-foreground">No academic bills found for this learner.</p>
              ) : (
                <div className="space-y-1">
                  {bills.map((b, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                        b.counted ? 'border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950' : ''
                      }`}
                    >
                      {b.counted ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate" title={b.description ?? undefined}>
                        {b.description ?? 'Academic bill'}
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {b.academic_year?.trim() ?? 'Untagged'}
                      </Badge>
                      <span className="shrink-0 font-medium">{inr(b.amount)}</span>
                      <Badge variant="secondary" className="shrink-0 capitalize">
                        {b.status ?? '—'}
                      </Badge>
                    </div>
                  ))}
                  <p className="pt-0.5 text-xs text-muted-foreground">
                    Counted bills (tagged to {learner?.academic_year?.trim() ?? 'current AY'}, not
                    cancelled/superseded) total <strong>{inr(countedTotal)}</strong> — the fee compared
                    against the fee-band conditions above.
                  </p>
                </div>
              )}
            </Section>

            {/* Physical-room rule */}
            <Section icon={<DoorOpen className="h-4 w-4 text-primary" />} title="Physical-room rule">
              <Cond ok={data.physical.institution_served}>
                Room serves the learner&apos;s institution ({learner?.institution ?? '—'})
              </Cond>
              <Cond ok={data.physical.access_ok}>
                {data.physical.open_room
                  ? data.physical.pinned_elsewhere
                    ? `Open room, but this cohort has reserved rooms in ${
                        data.physical.pinned_blocks ?? 'another block'
                      } — pinned cohorts may only occupy their reserved rooms`
                    : 'Open room — no cohort reservation; admitted as a served-institution learner'
                  : data.physical.rule_matched
                  ? 'Matches a cohort reservation rule for this room'
                  : 'Room is reserved for another cohort'}
              </Cond>
              {/* The cohort's own reservation rule(s) — the configured condition vs the learner */}
              {pinnedRules.length > 0 && (
                <div className="space-y-2 pl-6">
                  <p className="text-xs font-medium text-muted-foreground">
                    Cohort reservation condition{pinnedRules.length > 1 ? 's' : ''} (where this
                    cohort&apos;s rooms are)
                  </p>
                  {pinnedRules.map((r, i) => (
                    <div key={i} className="rounded-md border p-2.5 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge>{r.block}</Badge>
                        <span className="font-medium">{r.rule_name}</span>
                        <span className="text-muted-foreground">
                          · {r.rooms} room{r.rooms === 1 ? '' : 's'}
                          {r.floor != null
                            ? ` · ${r.floor === 0 ? 'Ground floor' : `Floor ${r.floor}`}`
                            : ''}
                        </span>
                      </div>
                      <CompareHeader />
                      <CompareRow
                        label="Institution"
                        condition={r.institution ?? '—'}
                        learner={learner?.institution ?? '—'}
                        ok
                      />
                      <CompareRow
                        label="Degree"
                        condition={r.degree ?? 'Any'}
                        learner={learner?.degree ?? '—'}
                        ok
                      />
                      <CompareRow
                        label="Department"
                        condition={r.department ?? 'Any'}
                        learner={learner?.department ?? '—'}
                        ok
                      />
                      <CompareRow
                        label="Program"
                        condition={r.program ?? 'Any'}
                        learner={learner?.program ?? '—'}
                        ok
                      />
                      <CompareRow
                        label="Semester"
                        condition={r.semester ?? 'Any'}
                        learner={learner?.semester ?? '—'}
                        ok
                      />
                    </div>
                  ))}
                </div>
              )}
              {!data.physical.open_room && data.physical.covering_rules.length > 0 && (
                <div className="space-y-2 pl-6">
                  {data.physical.covering_rules.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded-md border p-2.5 space-y-1.5 ${
                        r.matched ? 'border-primary/50 bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant={r.matched ? 'default' : 'outline'}>
                          {r.matched ? 'matched' : 'not matched'}
                        </Badge>
                        <span className="font-medium">{r.rule_name}</span>
                        {r.floor != null && (
                          <span className="text-muted-foreground">
                            · {r.floor === 0 ? 'Ground floor' : `Floor ${r.floor}`}
                          </span>
                        )}
                      </div>
                      <CompareHeader />
                      <CompareRow
                        label="Institution"
                        condition={r.institution ?? '—'}
                        learner={learner?.institution ?? '—'}
                        ok={r.institution_ok}
                      />
                      <CompareRow
                        label="Degree"
                        condition={r.degree ?? 'Any'}
                        learner={learner?.degree ?? '—'}
                        ok={r.degree_ok}
                      />
                      <CompareRow
                        label="Department"
                        condition={r.department ?? 'Any'}
                        learner={learner?.department ?? '—'}
                        ok={r.department_ok}
                      />
                      <CompareRow
                        label="Program"
                        condition={r.program ?? 'Any'}
                        learner={learner?.program ?? '—'}
                        ok={r.program_ok}
                      />
                      <CompareRow
                        label="Semester"
                        condition={r.semester ?? 'Any'}
                        learner={learner?.semester ?? '—'}
                        ok={r.semester_ok}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Billing prerequisite */}
            <Section icon={<ReceiptText className="h-4 w-4 text-primary" />} title="Billing prerequisite">
              <Cond ok={data.bill.current_year_bills > 0}>
                Current-year academic bill{' '}
                {data.bill.current_year_bills > 0 ? 'present' : 'missing'} ({data.bill.current_year_bills}{' '}
                this year · {data.bill.academic_bills} total)
              </Cond>
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
