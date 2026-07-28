'use client';

/**
 * Live Eligibility Resolver preview — the "reads the engine live" panel.
 *
 * Runs ProgramEligibilityService.previewLearnerCategorySync(), a DRY-RUN of the
 * exact resolution the allocation/sync engine uses (program → quota → fee band →
 * room/mess category). Writes nothing. Edit a rule in the sections above, re-run,
 * and the numbers move — proving the config drives the live engine.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Info } from 'lucide-react';
import {
  ProgramEligibilityService,
  type InstitutionOption,
} from '@/lib/services/campus-living/program-eligibility-service';
import type { CategorySyncPreviewRow } from '@/types/program-eligibility';

const REASON_LABEL: Record<CategorySyncPreviewRow['reason'], string> = {
  band_match: 'Resolved by a fee-band rule',
  classic_default_fee_unknown: 'Classic default (fee unknown)',
  classic_default_no_band: 'Classic default (no matching band)',
  no_academic_bill: 'Skipped — no academic bill',
};

interface Aggregate {
  total: number;
  willChange: number;
  byReason: Record<string, number>;
  byResolved: Record<string, number>; // "Room / Mess" -> count
}

function aggregate(rows: CategorySyncPreviewRow[]): Aggregate {
  const agg: Aggregate = { total: rows.length, willChange: 0, byReason: {}, byResolved: {} };
  for (const r of rows) {
    if (r.will_change) agg.willChange++;
    agg.byReason[r.reason] = (agg.byReason[r.reason] ?? 0) + 1;
    if (r.reason !== 'no_academic_bill') {
      const key = `${r.new_room ?? '—'} / ${r.new_mess ?? '—'}`;
      agg.byResolved[key] = (agg.byResolved[key] ?? 0) + 1;
    }
  }
  return agg;
}

export function EligibilityResolverPreview({
  institutions,
}: {
  institutions: InstitutionOption[];
}) {
  const [institutionId, setInstitutionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agg, setAgg] = useState<Aggregate | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const rows = await ProgramEligibilityService.previewLearnerCategorySync(
        institutionId || undefined
      );
      setAgg(aggregate(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run the resolver preview');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className='border-primary/30 bg-primary/[0.02]'>
      <CardContent className='p-6 space-y-4'>
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <h2 className='text-lg font-semibold'>Live eligibility resolver</h2>
            <Badge variant='outline' className='text-xs font-normal'>
              dry-run · reads live
            </Badge>
          </div>
          <p className='text-sm text-muted-foreground'>
            Runs the same resolver the allocation engine uses (program → quota → fee band →
            room &amp; mess category) across real learners — writing nothing. Edit a rule below
            and re-run: the numbers reflect what the next allocation run will do.
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <select
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            className='h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm sm:w-auto'
          >
            <option value=''>All institutions</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <Button onClick={run} disabled={loading}>
            {loading ? (
              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
            ) : (
              <Play className='h-4 w-4 mr-2' />
            )}
            Run preview
          </Button>
        </div>

        {error && <p className='text-sm text-destructive'>{error}</p>}

        {agg && !error && (
          <div className='space-y-4 pt-1'>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
              <Stat label='Learners scanned' value={agg.total} />
              <Stat label='Would change category' value={agg.willChange} accent />
              <Stat
                label='Resolved by a rule'
                value={agg.byReason['band_match'] ?? 0}
              />
            </div>

            <div className='space-y-2'>
              <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                How each learner resolved
              </p>
              <div className='space-y-1'>
                {Object.entries(agg.byReason)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, n]) => (
                    <div key={reason} className='flex items-center justify-between text-sm'>
                      <span>{REASON_LABEL[reason as CategorySyncPreviewRow['reason']] ?? reason}</span>
                      <span className='font-medium tabular-nums'>{n}</span>
                    </div>
                  ))}
              </div>
            </div>

            {Object.keys(agg.byResolved).length > 0 && (
              <div className='space-y-2'>
                <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                  Resolved room / mess
                </p>
                <div className='space-y-1'>
                  {Object.entries(agg.byResolved)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([combo, n]) => (
                      <div key={combo} className='flex items-center justify-between text-sm'>
                        <span>{combo}</span>
                        <span className='font-medium tabular-nums'>{n}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!agg && !error && (
          <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
            <Info className='h-3.5 w-3.5' />
            Run the preview to see how the current rules resolve real learners.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className='rounded-lg border bg-background p-3'>
      <div className={`text-2xl font-semibold tabular-nums ${accent ? 'text-primary' : ''}`}>
        {value}
      </div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  );
}
