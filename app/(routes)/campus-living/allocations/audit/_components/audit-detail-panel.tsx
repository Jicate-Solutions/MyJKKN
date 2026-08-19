'use client';

// The full per-allocation audit breakdown, rendered in TWO places: the audit
// table's "Why" drawer and the allocation detail page. It lives here rather
// than inside the drawer so the two surfaces cannot drift — the detail page
// showing a different story than the audit that sent you there would be worse
// than it not being on the detail page at all.
//
// Section 1-4 come from the audit row (fn_hostel_allocation_audit); the bill
// list, the per-band condition matrix and the per-rule condition matrix come
// from fn_explain_allocation, fetched lazily here.

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Check, X } from 'lucide-react';
import { useAllocationExplain } from '@/hooks/campus-living/use-allocation-batches';
import type { AllocationAuditRow } from '@/types/campus-living-allocation-audit';
import { YearSourceBadge, YEAR_SOURCE_META, VERDICT_META, inr } from './audit-badges';

function Ok({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="inline h-3.5 w-3.5 text-green-600" />
  ) : (
    <X className="inline h-3.5 w-3.5 text-red-600" />
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="break-words text-sm">{value ?? '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const feeWindow = (r: AllocationAuditRow) =>
  r.matched_fee_min === null && r.matched_fee_max === null
    ? '—'
    : `${r.matched_fee_min === null ? '0' : inr(r.matched_fee_min)} – ${
        r.matched_fee_max === null ? '∞' : inr(r.matched_fee_max)
      }`;

export function AllocationAuditPanel({ row }: { row: AllocationAuditRow }) {
  const { data, isLoading, error } = useAllocationExplain(row.allocation_id);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">{VERDICT_META[row.verdict]?.hint}</p>

      <Section title="1 · Which year the fee band was read from">
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-3 sm:grid-cols-3">
          <Field label="Admitted year" value={row.admission_year} />
          <Field label="Admission academic year" value={row.admission_academic_year_name} />
          <Field label="Band read from" value={row.band_academic_year_name} />
        </div>
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <YearSourceBadge source={row.band_year_source} />
          <p className="text-xs text-muted-foreground">
            {YEAR_SOURCE_META[row.band_year_source]?.hint}
          </p>
        </div>
      </Section>

      <Separator />

      <Section title="2 · The bills that produced the gating fee">
        <div className="grid grid-cols-3 gap-4 rounded-lg border p-3">
          <Field label="Fee used for the band" value={inr(row.band_fee)} />
          <Field label="Paid" value={inr(row.band_year_bill_paid)} />
          <Field label="Outstanding" value={inr(row.band_year_bill_balance)} />
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading bill detail…
          </div>
        )}
        {error && <p className="text-sm text-destructive">Could not load the bill breakdown.</p>}
        {data?.bills && data.bills.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 font-medium">Bill</th>
                  <th className="p-2 font-medium">Academic year</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">Counted</th>
                </tr>
              </thead>
              <tbody>
                {data.bills.map((b, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{b.description ?? '—'}</td>
                    <td className="p-2">{b.academic_year ?? '—'}</td>
                    <td className="p-2 text-right tabular-nums">{inr(b.amount)}</td>
                    <td className="p-2 capitalize">{b.status ?? '—'}</td>
                    <td className="p-2">
                      <Ok ok={b.counted} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Only rows marked <em>Counted</em> were summed — a bill counts when it is tagged to the
          band year above and is not cancelled or superseded.
        </p>
      </Section>

      <Separator />

      <Section title="3 · Fee band → entitled category">
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-3 sm:grid-cols-3">
          <Field label="Matched band" value={feeWindow(row)} />
          <Field label="Entitled room" value={row.entitled_room_category_name} />
          <Field label="Occupied room" value={row.occupied_room_category_name} />
          <Field label="Entitled mess" value={row.entitled_mess_category_name} />
          <Field label="Current mess" value={row.current_mess_category_name} />
          <Field label="Mess in band" value={row.mess_in_band ? 'Yes' : 'No'} />
        </div>
        {data?.eligibility_rules && data.eligibility_rules.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 font-medium">Program</th>
                  <th className="p-2 font-medium">Quota</th>
                  <th className="p-2 font-medium">Fee window</th>
                  <th className="p-2 font-medium">Room</th>
                  <th className="p-2 font-medium">Prog</th>
                  <th className="p-2 font-medium">Quota</th>
                  <th className="p-2 font-medium">Fee</th>
                  <th className="p-2 font-medium">Applied</th>
                </tr>
              </thead>
              <tbody>
                {data.eligibility_rules.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{r.program ?? 'Any'}</td>
                    <td className="p-2">{r.quota ?? 'Any'}</td>
                    <td className="p-2 tabular-nums">
                      {r.fee_min === null ? '0' : inr(r.fee_min)} –{' '}
                      {r.fee_max === null ? '∞' : inr(r.fee_max)}
                    </td>
                    <td className="p-2">{r.room_category ?? '—'}</td>
                    <td className="p-2"><Ok ok={r.program_ok} /></td>
                    <td className="p-2"><Ok ok={r.quota_ok} /></td>
                    <td className="p-2"><Ok ok={r.fee_ok} /></td>
                    <td className="p-2">
                      {r.selected_room ? (
                        <Badge variant="success">winner</Badge>
                      ) : r.matched ? (
                        <span className="text-muted-foreground">eligible</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          When several bands match, the most specific wins (program beats quota beats fee), and
          ties break to the narrowest fee window.
        </p>
      </Section>

      <Separator />

      <Section title="4 · Upgrade trail">
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-3 sm:grid-cols-4">
          <Field label="First category" value={row.first_room_category_name} />
          <Field label="Current category" value={row.occupied_room_category_name} />
          <Field label="Billed" value={inr(row.upgrade_bill_total)} />
          <Field label="Outstanding" value={inr(row.upgrade_bill_balance)} />
        </div>
        {row.upgrade_bill_descriptions ? (
          <p className="rounded-lg border p-3 text-xs">{row.upgrade_bill_descriptions}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No hostel-category (upgrade) bill has ever been raised for this learner.
          </p>
        )}
      </Section>

      <Separator />

      <Section title="5 · Physical room rules">
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-3 sm:grid-cols-3">
          <Field label="Block" value={row.block_name} />
          <Field label="Room" value={row.room_number} />
          <Field label="Floor" value={row.floor === 0 ? 'Ground' : (row.floor ?? '—')} />
          <Field
            label="Institution served by block"
            value={row.serves_institution ? 'Yes' : 'No'}
          />
          <Field label="Matched rule" value={row.matched_rule_name} />
          <Field label="Cohort pinned to" value={row.pinned_blocks} />
        </div>
        {data?.physical?.covering_rules && data.physical.covering_rules.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 font-medium">Rule</th>
                  <th className="p-2 font-medium">Institution</th>
                  <th className="p-2 font-medium">Degree</th>
                  <th className="p-2 font-medium">Dept</th>
                  <th className="p-2 font-medium">Program</th>
                  <th className="p-2 font-medium">Semester</th>
                  <th className="p-2 font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {data.physical.covering_rules.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{r.rule_name}</td>
                    <td className="p-2"><Ok ok={r.institution_ok} /></td>
                    <td className="p-2"><Ok ok={r.degree_ok} /></td>
                    <td className="p-2"><Ok ok={r.department_ok} /></td>
                    <td className="p-2"><Ok ok={r.program_ok} /></td>
                    <td className="p-2"><Ok ok={r.semester_ok} /></td>
                    <td className="p-2">
                      {r.matched ? (
                        <Badge variant="success">matched</Badge>
                      ) : (
                        <span className="text-muted-foreground">no</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && (
            <p className="text-xs text-muted-foreground">
              No physical-room rule covers this room — it is open to any eligible learner of the
              block&apos;s institutions.
            </p>
          )
        )}
        {data?.physical?.pinned_rules && data.physical.pinned_rules.length > 0 && (
          <div className="space-y-1 rounded-lg border p-3">
            <p className="text-xs font-medium">Rules that reserve rooms for this cohort</p>
            {data.physical.pinned_rules.map((r, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {r.block} · {r.rule_name}
                {r.floor !== null && ` · floor ${r.floor}`}
                {r.rooms > 0 && ` · ${r.rooms} room(s)`}
                {r.covers_allocated_room && ' · covers this room'}
              </p>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
