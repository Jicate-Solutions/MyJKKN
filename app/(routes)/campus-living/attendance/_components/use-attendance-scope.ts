'use client';

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  addDays,
  istToday,
  periodRange,
  type CubeFilter,
  type Period,
} from '@/lib/campus-living/attendance-cube';

const PERIODS: Period[] = ['day', '7d', '30d', '90d', 'custom'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The dashboard's scope — period / day / range and the cross-filter — lives in the
 * URL (?period&day&from&to&inst&dept&block), so a view is shareable and survives
 * a reload. Writes go through useTransition: loading.tsx does not fire for
 * searchParams-only changes, so without it the page would freeze silently.
 */
export function useAttendanceScope() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const today = istToday();

  const read = (key: string): string | null => params.get(key);
  const iso = (key: string, fallback: string): string => {
    const v = read(key);
    return v && ISO.test(v) ? v : fallback;
  };

  const periodParam = read('period') as Period | null;
  const period: Period = periodParam && PERIODS.includes(periodParam) ? periodParam : 'day';
  // No future days: nothing can have been marked for one.
  const day = iso('day', today) > today ? today : iso('day', today);
  const customFrom = iso('from', addDays(today, -29));
  const customTo = iso('to', today) > today ? today : iso('to', today);

  const range = useMemo(
    () => periodRange(period, today, day, { from: customFrom, to: customTo }),
    [period, today, day, customFrom, customTo],
  );

  const filter: CubeFilter = useMemo(
    () => ({
      institutionId: read('inst'),
      departmentId: read('dept'),
      blockId: read('block'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params],
  );

  const write = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  const setFilter = useCallback(
    (f: CubeFilter) =>
      write({ inst: f.institutionId ?? null, dept: f.departmentId ?? null, block: f.blockId ?? null }),
    [write],
  );

  return {
    today,
    period,
    day,
    customFrom,
    customTo,
    range,
    filter,
    isPending,
    setPeriod: (p: Period) => write({ period: p === 'day' ? null : p }),
    setDay: (d: string) => write({ day: d === today ? null : d }),
    setCustom: (from: string, to: string) => write({ from, to }),
    setFilter,
    clearFilter: () => write({ inst: null, dept: null, block: null }),
  };
}
