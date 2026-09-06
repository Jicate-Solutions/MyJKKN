'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface Row {
  college: string;
  syllabi_clos: number;
  fink_regs: number;
  bloom_regs: number;
  no_tax_regs: number;
  pos: number;
  psos: number;
  bloom_cos: number;
  fink_cos: number;
  spine_lessons: number;
  spine_courses: number;
  missing_taxonomy_courses: number;
}

function shortName(n: string) {
  return n.replace('JKKN ', '').replace(' and ', ' & ');
}

function Pill({ value, warn }: { value: string | number; warn?: boolean }) {
  const empty = value === 0 || value === '—' || value === '';
  if (empty) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        warn
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
      }`}
    >
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
  );
}

export function CurriculumSection() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    (supabase as any)
      .rpc('fn_open_curriculum_readiness')
      .then(({ data, error }: { data: Row[] | null; error: { message: string } | null }) => {
        if (error) setError(error.message);
        else setRows((data as Row[]) ?? []);
      });
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">Couldn&apos;t load readiness data: {error}</p>;
  }
  if (!rows) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const live = rows.filter((r) => r.spine_lessons > 100).length;
  const awaiting = rows.filter((r) => r.syllabi_clos === 0 && r.spine_lessons <= 100).length;
  const skippedNoTax = rows.reduce((sum, r) => sum + (r.missing_taxonomy_courses ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          <strong className="text-lg tabular-nums">{live}</strong>
          <span className="text-muted-foreground"> / {rows.length} generating spines</span>
        </span>
        <span className="text-muted-foreground">
          <strong className="tabular-nums text-foreground">{awaiting}</strong> awaiting a learning-pathway upload
        </span>
        {skippedNoTax > 0 && (
          <span className="text-muted-foreground">
            <strong className="tabular-nums text-amber-700 dark:text-amber-400">{skippedNoTax}</strong>{' '}
            skipped — Board of Studies taxonomy not set
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">College</th>
              <th className="px-3 py-2.5 font-semibold">Pathways</th>
              <th className="px-3 py-2.5 font-semibold">Taxonomy fixed</th>
              <th className="px-3 py-2.5 font-semibold">POs</th>
              <th className="px-3 py-2.5 font-semibold">PSOs</th>
              <th className="px-3 py-2.5 font-semibold">Outcomes</th>
              <th className="px-3 py-2.5 font-semibold">Spine</th>
              <th className="px-3 py-2.5 font-semibold">No taxonomy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tax: string[] = [];
              if (r.fink_regs) tax.push(`${r.fink_regs} Fink`);
              if (r.bloom_regs) tax.push(`${r.bloom_regs} Bloom`);
              if (r.no_tax_regs) tax.push(`${r.no_tax_regs} unset`);
              const orphan = r.spine_lessons > 0 && r.spine_lessons <= 100;
              return (
                <tr key={r.college} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{shortName(r.college)}</td>
                  <td className="px-3 py-2.5">
                    <Pill value={r.syllabi_clos} />
                  </td>
                  <td className="px-3 py-2.5">
                    {tax.length ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          r.no_tax_regs
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                        }`}
                      >
                        {tax.join(' · ')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill value={r.pos} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill value={r.psos} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill value={r.bloom_cos + r.fink_cos} />
                  </td>
                  <td className="px-3 py-2.5">
                    {orphan ? <Pill value={`${r.spine_lessons} orphan`} warn /> : <Pill value={r.spine_lessons} />}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.missing_taxonomy_courses > 0
                      ? <Pill value={r.missing_taxonomy_courses} warn />
                      : <span className="text-muted-foreground/50">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
