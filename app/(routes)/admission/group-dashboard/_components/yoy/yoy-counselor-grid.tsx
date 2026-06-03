'use client';

import { useMemo } from 'react';
import { useYoYCounselorGrid } from '@/hooks/admission/use-yoy-trajectory';
import { formatIndianNumber } from './_helpers/chart-formatters';
import type { YoYCounselorGridCell } from '@/lib/services/admission/yoy-trajectory-service';

type Props = {
  institutionId: string | undefined;
};

/**
 * Counselor Accountability Grid — institution × counsellor matrix of
 * stale in-flight leads. Red cells = ≥5 stale leads = one named conversation.
 */
export function YoYCounselorGrid({ institutionId }: Props) {
  const { data, isLoading } = useYoYCounselorGrid(institutionId);

  const { matrix, counselors, institutions, totals } = useMemo(() => {
    if (!data?.length) {
      return { matrix: new Map<string, Map<string, YoYCounselorGridCell>>(), counselors: [], institutions: [], totals: new Map<string, number>() };
    }
    const matrix = new Map<string, Map<string, YoYCounselorGridCell>>();
    const counselorSet = new Map<string, string>();
    const institutionSet = new Map<string, string>();
    const totals = new Map<string, number>();
    for (const row of data) {
      const cKey = row.counselorId ?? 'unassigned';
      const iKey = row.institutionId;
      counselorSet.set(cKey, row.counselorName);
      institutionSet.set(iKey, row.institutionName);
      if (!matrix.has(iKey)) matrix.set(iKey, new Map());
      matrix.get(iKey)!.set(cKey, row);
      totals.set(cKey, (totals.get(cKey) ?? 0) + row.staleReservedCount);
    }
    // Sort counsellors by total stale count desc; institutions by name asc
    const counselors = Array.from(counselorSet.entries())
      .sort((a, b) => (totals.get(b[0]) ?? 0) - (totals.get(a[0]) ?? 0))
      .slice(0, 8);
    const institutions = Array.from(institutionSet.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    return { matrix, counselors, institutions, totals };
  }, [data]);

  if (isLoading) return <GridSkeleton />;
  if (!data?.length) return null;

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: '#fafaf8',
        borderColor: '#e7e2d8',
        fontFamily: 'var(--font-ibm-plex-sans)',
      }}
    >
      <div className="px-5 py-3 border-b" style={{ borderColor: '#e7e2d8' }}>
        <h3
          className="text-[14px] tracking-tight"
          style={{
            fontFamily: 'var(--font-dm-serif-display)',
            color: '#2a2624',
            fontWeight: 400,
          }}
        >
          Counsellor Accountability
        </h3>
        <p className="text-[11px]" style={{ color: '#9a948a' }}>
          Stale in-flight leads (no contact 10+ days) by institution × counsellor · red cells = 5+ stale = named conversation today
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full text-[11.5px] tabular-nums"
          style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f4efe3' }}>
              <th className="px-3 py-2 text-left font-medium" style={{ color: '#6e6760' }}>
                Institution
              </th>
              {counselors.map(([cKey, cName]) => (
                <th
                  key={cKey}
                  className="px-2 py-2 text-center font-medium"
                  style={{ color: '#6e6760', minWidth: 70 }}
                >
                  {shortenCounselorName(cName)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium" style={{ color: '#2a2624' }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {institutions.map(([iKey, iName]) => {
              const instRow = matrix.get(iKey);
              const instTotal = counselors.reduce((s, [cKey]) => s + (instRow?.get(cKey)?.staleReservedCount ?? 0), 0);
              return (
                <tr key={iKey} className="border-t" style={{ borderColor: '#e7e2d8' }}>
                  <td className="px-3 py-2" style={{ color: '#2a2624' }}>
                    {shortenInstitutionName(iName)}
                  </td>
                  {counselors.map(([cKey]) => {
                    const cell = instRow?.get(cKey);
                    const stale = cell?.staleReservedCount ?? 0;
                    const isRed = stale >= 5;
                    return (
                      <td
                        key={cKey}
                        className="px-2 py-2 text-center"
                        style={{
                          color: isRed ? '#a8453c' : stale > 0 ? '#2a2624' : '#c4baaa',
                          fontWeight: isRed ? 600 : 400,
                          backgroundColor: isRed ? 'rgba(168, 69, 60, 0.08)' : 'transparent',
                        }}
                      >
                        {stale > 0 ? stale : '·'}
                      </td>
                    );
                  })}
                  <td
                    className="px-3 py-2 text-right font-medium"
                    style={{ color: '#2a2624' }}
                  >
                    {formatIndianNumber(instTotal)}
                  </td>
                </tr>
              );
            })}
            <tr
              className="border-t-2"
              style={{ borderColor: '#d8d3c8', backgroundColor: '#f4efe3' }}
            >
              <td className="px-3 py-2 font-medium" style={{ color: '#6e6760' }}>
                Total per counsellor
              </td>
              {counselors.map(([cKey]) => (
                <td
                  key={cKey}
                  className="px-2 py-2 text-center font-medium"
                  style={{ color: '#2a2624' }}
                >
                  {totals.get(cKey) ?? 0}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-bold" style={{ color: '#2a2624' }}>
                {Array.from(totals.values()).reduce((a, b) => a + b, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function shortenInstitutionName(name: string): string {
  return name
    .replace(/^JKKN College of /i, '')
    .replace(/^JKKN /i, '')
    .replace(/and Technology$/, 'Tech')
    .replace(/and Research$/, '')
    .replace(/and Hospital$/, '')
    .replace(/Sciences$/, 'Sci');
}

function shortenCounselorName(name: string): string {
  if (name === 'Unassigned') return 'Unassigned';
  const parts = name.split(/\s+/);
  if (parts.length === 1) return name.slice(0, 8);
  return parts[0].slice(0, 7) + (parts[1]?.[0] ? ' ' + parts[1][0] + '.' : '');
}

function GridSkeleton() {
  return (
    <div
      className="rounded-lg border p-5 space-y-2"
      style={{ backgroundColor: '#fafaf8', borderColor: '#e7e2d8' }}
    >
      <div className="h-4 w-48 animate-pulse rounded bg-[#ece8de]" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-[#ece8de]" />
      ))}
    </div>
  );
}
