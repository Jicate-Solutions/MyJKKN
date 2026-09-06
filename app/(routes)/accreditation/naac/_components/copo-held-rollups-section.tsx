// app/(routes)/accreditation/naac/_components/copo-held-rollups-section.tsx
// ============================================================================
// "Held CO/PO results — assign the right college" (twin-college re-stamp
// control; Director 2026-07-10: "Build the re-assignment control now").
//
// CO/PO course results whose college stamp is uncertain — a COE code shared
// by twin colleges (CAS Self / CAS Aided) or a course with no confident match
// at all — are computed and visible on dashboards but HELD OUT of the
// accreditation evidence ledger. This section is the human release valve:
// pick the right college and the result enters that college's evidence on
// the next weekly run.
//
// Writes go through fn_copo_restamp_rollup_institution (SECURITY DEFINER;
// permission re-checked server-side). Section renders only for super admins
// and holders of accreditation.evidence.restamp.
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, CheckCircle2 } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  listActiveInstitutionsLite,
  listHeldCourseAttainment,
  restampRollupInstitution,
  type HeldCourseAttainmentRow,
  type InstitutionLite,
} from '@/lib/services/accreditation/copo-attainment-service';

const HELD_QUERY_KEY = ['accreditation', 'copo', 'held-rollups'] as const;

function whyHeld(match: string | undefined): string {
  switch (match) {
    case 'ambiguous_first_mapped':
      return 'Twin colleges share this exam code — pick which college taught it';
    case 'unmatched_first_mapped':
      return 'No confident match — the college currently shown is a guess';
    default:
      return 'College stamp is uncertain';
  }
}

function heldBadgeLabel(match: string | undefined): string {
  return match === 'ambiguous_first_mapped' ? 'Twin colleges' : 'No confident match';
}

function HeldRollupRow({
  row,
  institutions,
}: {
  row: HeldCourseAttainmentRow;
  institutions: InstitutionLite[];
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string>('');

  const nameById = useMemo(
    () => new Map(institutions.map((i) => [i.id, i.name])),
    [institutions],
  );

  // Candidate colleges: the COE code's mapped twins when the stamping run
  // recorded them; otherwise any active college is assignable (the server
  // enforces the same rule).
  const candidateIds = Array.isArray(row.metadata?.myjkkn_institution_ids)
    ? row.metadata.myjkkn_institution_ids.filter(Boolean)
    : [];
  const options: InstitutionLite[] =
    candidateIds.length > 0
      ? candidateIds.map((id) => ({ id, name: nameById.get(id) ?? id }))
      : institutions;

  const assign = useMutation({
    mutationFn: () => restampRollupInstitution(row.id, picked),
    onSuccess: (res) => {
      toast.success(
        `${res.course_code} assigned to ${res.institution_name}. It enters that college's evidence on the next weekly run.`,
      );
      // Optimistic refresh: drop the released row immediately, then revalidate.
      qc.setQueryData<HeldCourseAttainmentRow[]>(HELD_QUERY_KEY, (rows) =>
        (rows ?? []).filter((r) => r.id !== row.id),
      );
      void qc.invalidateQueries({ queryKey: HELD_QUERY_KEY });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not assign the college.';
      toast.error(msg);
    },
  });

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{row.course_code}</span>
            {row.course_name && (
              <span className="truncate text-sm text-muted-foreground">
                {row.course_name}
              </span>
            )}
            <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300">
              {heldBadgeLabel(row.metadata?.institution_match)}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {row.session_code}
            {row.program_code ? ` · ${row.program_code}` : ''}
            {' — '}
            {whyHeld(row.metadata?.institution_match)}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Select value={picked} onValueChange={setPicked} disabled={assign.isPending}>
            <SelectTrigger className="w-[220px] bg-card">
              <SelectValue placeholder="Pick the college" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!picked || assign.isPending}
            onClick={() => assign.mutate()}
          >
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CopoHeldRollupsSection() {
  const { canAccess, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canRestamp = isSuperAdmin || canAccess('accreditation', 'evidence.restamp');

  const held = useQuery({
    queryKey: HELD_QUERY_KEY,
    queryFn: listHeldCourseAttainment,
    enabled: canRestamp,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const insts = useQuery({
    queryKey: ['accreditation', 'copo', 'institutions-lite'],
    queryFn: listActiveInstitutionsLite,
    enabled: canRestamp,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (permsLoading || !canRestamp) return null;

  const rows = held.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5 text-amber-600" />
          Held CO/PO results — assign the right college
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Course results whose college could not be stamped with confidence are
          computed and visible, but stay out of the accreditation evidence
          ledger until someone assigns the right college here. Assigning a
          college changes which college&apos;s evidence ledger the result lands
          in on the next weekly run.
        </p>
      </CardHeader>
      <CardContent>
        {held.isLoading || insts.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : held.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load held results. Try refreshing the page.
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Nothing waiting — every CO/PO course result is stamped to a
            confident college.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <HeldRollupRow key={row.id} row={row} institutions={insts.data ?? []} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
