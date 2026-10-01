export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  isIsoDate,
  parseStatusList,
  resolvedAtBounds,
  REPORTER_CONFIRMED_MARKER,
  OTHERS_RESOLVER_KEY,
  OTHERS_RESOLVER_LABEL
} from '@/lib/utils/bug-reports/status-tabs';

export async function GET(request: Request) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    // Optional scope: the status tab and resolved-date filter on the admin
    // page. With no params every count below is exactly what it always was.
    const statuses = parseStatusList(searchParams.get('statuses'));
    const resolvedFrom = searchParams.get('resolved_from');
    const resolvedTo = searchParams.get('resolved_to');

    if (statuses === null) {
      return NextResponse.json({ error: 'Invalid statuses filter.' }, { status: 400 });
    }
    if ((resolvedFrom && !isIsoDate(resolvedFrom)) || (resolvedTo && !isIsoDate(resolvedTo))) {
      return NextResponse.json(
        { error: 'Invalid resolved date. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }
    const resolvedBounds = resolvedAtBounds(resolvedFrom, resolvedTo);

    // HEAD-only count query with the scope applied (no row data transferred)
    const scopedCount = () => {
      let query = supabase.from('bug_reports').select('*', { count: 'exact', head: true });
      if (statuses) query = query.in('status', statuses);
      if (resolvedBounds.gte) query = query.gte('resolved_at', resolvedBounds.gte);
      if (resolvedBounds.lte) query = query.lte('resolved_at', resolvedBounds.lte);
      return query;
    };

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const previous7Days = new Date();
    previous7Days.setDate(previous7Days.getDate() - 14);

    // Run all count queries in parallel
    const [
      { count: total },
      { count: resolved },
      { count: inProgress },
      { count: newReports },
      { count: seen },
      { count: wontFix },
      { count: duplicates },
      { count: recentReports },
      { count: previousReports },
      { count: resolvedMissingDate }
    ] = await Promise.all([
      scopedCount(),
      scopedCount().eq('status', 'resolved'),
      scopedCount().eq('status', 'in_progress'),
      scopedCount().eq('status', 'new'),
      scopedCount().eq('status', 'seen'),
      scopedCount().eq('status', 'wont_fix'),
      scopedCount().eq('status', 'duplicate'),
      scopedCount().gte('created_at', last7Days.toISOString()),
      scopedCount()
        .gte('created_at', previous7Days.toISOString())
        .lt('created_at', last7Days.toISOString()),
      // Unscoped on purpose: resolved bugs with no resolved_at can never match
      // a date filter, so the page reports how many a date filter leaves out.
      supabase
        .from('bug_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .is('resolved_at', null)
    ]);

    // Who resolved how many, grouped in SQL. Absent before migration
    // 20261223093000 is applied — the dashboard then shows no breakdown
    // rather than failing the whole stats call.
    let resolvers: Array<{
      resolved_by: string | null;
      resolver_name: string | null;
      resolver_email: string | null;
      resolved_count: number;
    }> = [];
    const { data: resolverRows, error: resolverError } = await (supabase as any).rpc(
      'fn_bug_resolver_stats',
      { p_from: resolvedFrom || null, p_to: resolvedTo || null }
    );
    if (resolverError) {
      logger.warn('bug-reports/api', 'Resolver breakdown unavailable', resolverError);
    } else {
      resolvers = (resolverRows ?? []).map((row: any) => ({
        resolved_by: row.resolved_by ?? null,
        resolver_name: row.resolver_name ?? null,
        resolver_email: row.resolver_email ?? null,
        resolved_count: Number(row.resolved_count ?? 0)
      }));

      // Bugs closed by their reporter's "No, it works now" leave each person's
      // count and are pooled as one Others entry. The period mirrors the RPC's
      // exactly (>= from, < the day after to, IST) so the subtraction is exact.
      const nextDay = (date: string) => {
        const [y, m, d] = date.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      };
      const confirmedRows: Array<{ resolved_by: string | null }> = [];
      let confirmedError: unknown = null;
      for (let offset = 0; ; offset += 1000) {
        let confirmedQuery = supabase
          .from('bug_reports')
          .select('id, resolved_by')
          .eq('status', 'resolved')
          .eq('metadata->>resolved_by', REPORTER_CONFIRMED_MARKER);
        if (resolvedBounds.gte) confirmedQuery = confirmedQuery.gte('resolved_at', resolvedBounds.gte);
        if (isIsoDate(resolvedTo)) {
          confirmedQuery = confirmedQuery.lt(
            'resolved_at',
            `${nextDay(resolvedTo)}T00:00:00.000+05:30`
          );
        }
        const { data, error } = await confirmedQuery
          .order('id')
          .range(offset, offset + 999);
        if (error) {
          confirmedError = error;
          break;
        }
        confirmedRows.push(...((data ?? []) as Array<{ resolved_by: string | null }>));
        if ((data ?? []).length < 1000) break;
      }

      if (confirmedError) {
        logger.warn('bug-reports/api', 'Reporter-confirmed breakdown unavailable', confirmedError);
      } else if (confirmedRows.length > 0) {
        const confirmedByResolver = new Map<string | null, number>();
        for (const row of confirmedRows) {
          const key = row.resolved_by ?? null;
          confirmedByResolver.set(key, (confirmedByResolver.get(key) ?? 0) + 1);
        }
        resolvers = resolvers
          .map((resolver) => ({
            ...resolver,
            resolved_count:
              resolver.resolved_count - (confirmedByResolver.get(resolver.resolved_by) ?? 0)
          }))
          .filter((resolver) => resolver.resolved_count > 0);
        resolvers.push({
          resolved_by: OTHERS_RESOLVER_KEY,
          resolver_name: OTHERS_RESOLVER_LABEL,
          resolver_email: null,
          resolved_count: confirmedRows.length
        });
        resolvers.sort((a, b) => b.resolved_count - a.resolved_count);
      }
    }

    const totalCount = total ?? 0;
    const resolvedCount = resolved ?? 0;
    const recentCount = recentReports ?? 0;
    const previousCount = previousReports ?? 0;

    const trendValue =
      previousCount > 0
        ? ((recentCount - previousCount) / previousCount) * 100
        : recentCount > 0
        ? 100
        : 0;

    const resolutionRate =
      totalCount > 0 ? ((resolvedCount / totalCount) * 100).toFixed(1) : '0.0';

    return NextResponse.json({
      total: totalCount,
      resolved: resolvedCount,
      inProgress: inProgress ?? 0,
      newReports: newReports ?? 0,
      seen: seen ?? 0,
      wontFix: wontFix ?? 0,
      duplicates: duplicates ?? 0,
      resolutionRate,
      recentReports: recentCount,
      previousReports: previousCount,
      resolvedMissingDate: resolvedMissingDate ?? 0,
      resolvers,
      reportsTrend: {
        value: trendValue.toFixed(1),
        direction: trendValue > 0 ? 'up' : trendValue < 0 ? 'down' : 'neutral'
      }
    });
  } catch (error) {
    logger.error('bug-reports/api', 'Unexpected error fetching stats', error);
    return NextResponse.json(
      { error: 'Failed to fetch bug report statistics.' },
      { status: 500 }
    );
  }
}
