'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, X, Minus, Users, BedDouble, AlertTriangle } from 'lucide-react';
import type { AllocationCandidate, BillState } from '@/types/allocation-batch';

function BillBadge({ c }: { c: AllocationCandidate }) {
  const fee =
    c.current_year_fee != null ? ` (₹${Number(c.current_year_fee).toLocaleString('en-IN')})` : '';
  const map: Record<BillState, { label: string; cls: string }> = {
    matched: { label: `Matched${fee}`, cls: 'bg-green-100 text-green-800' },
    different_year: {
      label: `Diff. year${c.bill_other_year_name ? ` (${c.bill_other_year_name})` : ''}`,
      cls: 'bg-amber-100 text-amber-800',
    },
    untagged: { label: 'Untagged', cls: 'bg-amber-100 text-amber-800' },
    none: { label: 'None', cls: 'bg-red-100 text-red-700' },
  };
  const m = map[c.bill_state];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${m.cls}`}>{m.label}</span>;
}

function YesNo({ ok, na }: { ok: boolean; na?: boolean }) {
  if (na) return <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;
  return ok ? (
    <Check className="mx-auto h-4 w-4 text-green-600" />
  ) : (
    <X className="mx-auto h-4 w-4 text-red-600" />
  );
}

function Stat({
  icon,
  label,
  value,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${muted ? 'opacity-70' : ''}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export function CandidateValidationTable({
  candidates,
  availableBeds,
}: {
  candidates: AllocationCandidate[];
  availableBeds: number;
}) {
  const eligible = candidates.filter((c) => c.verdict === 'in').length;
  const excluded = candidates.length - eligible;
  const billReady = candidates.filter((c) => c.current_year_bill_count > 0).length;
  const willPlace = Math.min(eligible, availableBeds);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat icon={<Users className="h-4 w-4" />} label="Eligible" value={eligible} />
        <Stat icon={<BedDouble className="h-4 w-4" />} label="Available beds" value={availableBeds} />
        <Stat label="Will place" value={willPlace} />
        <Stat label="Excluded" value={excluded} muted />
        <Stat label="Bill-ready" value={billReady} muted />
      </div>

      {candidates.length > 0 && billReady === 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No hosteller has a current-year bill tagged</AlertTitle>
          <AlertDescription>
            Category Eligibility rules that depend on a current-year academic fee will not
            resolve a category for any student — those students will be skipped. Generate
            current-academic-year bills under{' '}
            <Link
              href="/campus-living/residents?tab=generate"
              className="font-medium underline underline-offset-2"
            >
              Campus Living → Residents → Generate
            </Link>{' '}
            for these students first.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-student validation</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Student</th>
                <th className="px-2">Acad. year</th>
                <th className="px-2 text-center">Bill (curr. yr)</th>
                <th className="px-2 text-center">Profile</th>
                <th className="px-2 text-center">Gender</th>
                <th className="px-2 text-center">Not alloc.</th>
                <th className="px-2 text-center">Phys. rule</th>
                <th className="px-2">Room cat.</th>
                <th className="px-2">Mess cat.</th>
                <th className="px-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const prereqFail = c.stage === 'prerequisite';
                return (
                  <tr key={c.learner_id} className="border-b align-middle last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground">{c.program_name ?? '—'}</div>
                    </td>
                    <td className="px-2">
                      {c.academic_year_id ? (
                        c.academic_year_name ?? '—'
                      ) : (
                        <span className="text-red-600">Not set</span>
                      )}
                    </td>
                    <td className="px-2 text-center">
                      <BillBadge c={c} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.has_profile} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.gender_ok} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.not_allocated} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.physical_rule_ok} na={prereqFail} />
                    </td>
                    <td className="px-2 text-xs">{c.resolved_room_category_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 text-xs">{c.resolved_mess_category_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2">
                      {c.verdict === 'in' ? (
                        <Badge className="bg-green-600 hover:bg-green-600">In</Badge>
                      ) : (
                        <span className="text-xs text-red-600">{c.exclusion_reason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                    No candidates found for this block.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
