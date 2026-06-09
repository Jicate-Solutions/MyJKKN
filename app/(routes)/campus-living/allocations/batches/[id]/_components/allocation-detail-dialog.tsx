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
} from 'lucide-react';
import { useAllocationExplain } from '@/hooks/campus-living/use-allocation-batches';

const inr = (n: number | null) => (n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—');

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocationId: string | null;
  learnerName: string;
}

export function AllocationDetailDialog({ open, onOpenChange, allocationId, learnerName }: Props) {
  const { data, isLoading, error } = useAllocationExplain(open ? allocationId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocation eligibility</DialogTitle>
          <DialogDescription>
            Why <span className="font-medium text-foreground">{learnerName}</span> qualifies for{' '}
            {data?.room_number ? `Room ${data.room_number}` : 'this room'} — the Program-Eligibility
            conditions checked for the allocation.
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
            {/* Category eligibility */}
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
            </Section>

            {/* Physical-room rule */}
            <Section icon={<DoorOpen className="h-4 w-4 text-primary" />} title="Physical-room rule">
              <Cond ok={data.physical.institution_served}>
                Room serves the learner&apos;s institution
              </Cond>
              <Cond ok={data.physical.access_ok}>
                {data.physical.open_room
                  ? 'Open room — no cohort reservation; admitted as a served-institution learner'
                  : data.physical.rule_matched
                  ? 'Matches a cohort reservation rule for this room'
                  : 'Room is reserved for another cohort'}
              </Cond>
              {!data.physical.open_room && data.physical.covering_rules.length > 0 && (
                <div className="space-y-1 pl-6">
                  {data.physical.covering_rules.map((r, i) => (
                    <div key={i} className="text-xs">
                      <Badge variant={r.matched ? 'default' : 'outline'} className="mr-1">
                        {r.matched ? 'matched' : 'not matched'}
                      </Badge>
                      {r.rule_name}
                      {r.cohort ? ` — ${r.cohort}` : ' — any cohort'}
                      {r.floor != null
                        ? ` · ${r.floor === 0 ? 'Ground floor' : `Floor ${r.floor}`}`
                        : ''}
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
