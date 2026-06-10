// ============================================================================
// /hr/admin/disciplinary — Disciplinary case list (super_admin / HR Admin)
// ============================================================================
// T6.2 spec — surfaces formal disciplinary proceedings (distinct from T6.1
// memos and T6.4 separation).
//
// Director's view (no raw JSON, English consequences):
//   * Each row: case number + staff name + stage badge + status + initiated
//     date + outcome (if decided) + "view detail" link.
//   * Stage totals strip at top: initiated / enquiry / hearing / decision /
//     closed counts.
//   * Stage filter via search param `?stage=`.
//   * "New case" button → /hr/admin/disciplinary/new.
// ============================================================================

export const navMeta = {
  label: 'Disciplinary Cases',
  icon: 'Gavel',
} as const;

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  HRDisciplinaryService,
  type DisciplinaryStage,
} from '@/lib/services/hr/disciplinary-service';
import { Badge } from '@/components/ui/badge';

const STAGE_LABEL: Record<DisciplinaryStage, string> = {
  initiated: 'Initiated',
  enquiry: 'Enquiry',
  hearing: 'Hearing',
  decision: 'Decision',
  closed: 'Closed',
};

const STAGE_VARIANT: Record<
  DisciplinaryStage,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  initiated: 'destructive',
  enquiry: 'outline',
  hearing: 'outline',
  decision: 'secondary',
  closed: 'default',
};

const OUTCOME_LABEL: Record<string, string> = {
  warning: 'Warning',
  suspension: 'Suspension',
  termination: 'Termination',
  exonerated: 'Exonerated',
};

const VALID_STAGES: DisciplinaryStage[] = [
  'initiated',
  'enquiry',
  'hearing',
  'decision',
  'closed',
];

async function loadData(stageFilter: DisciplinaryStage | null) {
  const supabase = await createServerSupabaseClient();
  const service = new HRDisciplinaryService(supabase);

  const cases = await service
    .listCases(stageFilter ? { stage: stageFilter } : undefined)
    .catch(() => []);

  // Resolve staff names in one batch
  const staffIds = Array.from(new Set(cases.map((c) => c.staff_id)));
  const { data: staffRows } = staffIds.length
    ? await supabase
        .from('staff')
        .select('id, first_name, last_name, email')
        .in('id', staffIds)
    : { data: [] };
  const staffMap = new Map(
    (staffRows ?? []).map((s) => [
      s.id as string,
      `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() ||
        (s.email as string) ||
        'Unknown',
    ]),
  );

  // Stage totals (always over all cases — query separately so filter doesn't
  // hide the picture)
  const allCases = stageFilter ? await service.listCases().catch(() => []) : cases;
  const totals: Record<DisciplinaryStage, number> = {
    initiated: 0,
    enquiry: 0,
    hearing: 0,
    decision: 0,
    closed: 0,
  };
  for (const c of allCases) {
    totals[c.current_stage] += 1;
  }

  return { cases, staffMap, totals };
}

interface PageProps {
  searchParams?: Promise<{ stage?: string }>;
}

export default async function HRDisciplinaryListPage(props: PageProps) {
  const sp = (await props.searchParams) ?? {};
  const stageFilter = (
    VALID_STAGES.includes(sp.stage as DisciplinaryStage) ? sp.stage : null
  ) as DisciplinaryStage | null;

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Disciplinary Cases">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators / HR Admin.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Disciplinary Cases — formal proceedings">
        {/* @ts-expect-error Async Server Component */}
        <DisciplinaryListBody stageFilter={stageFilter} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function DisciplinaryListBody({
  stageFilter,
}: {
  stageFilter: DisciplinaryStage | null;
}) {
  const data = await loadData(stageFilter);
  const { cases, staffMap, totals } = data;

  return (
    <div className="space-y-6">
      {/* Stage totals strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {VALID_STAGES.map((stage) => (
          <StatTile
            key={stage}
            label={STAGE_LABEL[stage]}
            value={totals[stage]}
            href={`/hr/admin/disciplinary?stage=${stage}`}
            active={stageFilter === stage}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {stageFilter ? (
            <>
              Filtered: <strong>{STAGE_LABEL[stageFilter]}</strong> —{' '}
              <Link
                href="/hr/admin/disciplinary"
                className="text-primary underline-offset-4 hover:underline"
              >
                clear
              </Link>
            </>
          ) : (
            <>Showing all cases ({cases.length})</>
          )}
        </div>
        <Link
          href="/hr/admin/disciplinary/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New case
        </Link>
      </div>

      {/* Case list */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Case #</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Initiated</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {stageFilter
                    ? `No cases at the ${STAGE_LABEL[stageFilter]} stage.`
                    : 'No disciplinary cases recorded. Initiate one via "New case".'}
                </td>
              </tr>
            )}
            {cases.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">
                  {c.case_number}
                </td>
                <td className="px-4 py-3">
                  {staffMap.get(c.staff_id) ?? 'Unknown'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STAGE_VARIANT[c.current_stage]}>
                    {STAGE_LABEL[c.current_stage]}
                  </Badge>
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {c.status}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(c.initiated_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {c.outcome ? (
                    <span
                      className={
                        c.outcome === 'termination'
                          ? 'font-medium text-red-700 dark:text-red-400'
                          : c.outcome === 'exonerated'
                            ? 'font-medium text-green-700 dark:text-green-400'
                            : 'text-foreground'
                      }
                    >
                      {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/hr/admin/disciplinary/${c.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  href,
  active,
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-md border p-3 transition-colors ${
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Link>
  );
}
