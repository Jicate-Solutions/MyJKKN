/**
 * Grade Sync Statistics Cards Component
 * Display key metrics for grade synchronization
 *
 * Created: 2026-01-12
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, XCircle, TrendingUp } from 'lucide-react';

interface GradeSyncStatsProps {
  total: number;
  synced: number;
  pending: number;
  failed: number;
}

export function GradeSyncStats({
  total,
  synced,
  pending,
  failed
}: GradeSyncStatsProps) {
  const syncRate = total > 0 ? ((synced / total) * 100).toFixed(1) : '0.0';
  const failureRate = total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Grades */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Grades</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{total.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Received in date range
          </p>
        </CardContent>
      </Card>

      {/* Synced to Gradebook */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Synced</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {synced.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {syncRate}% sync rate
          </p>
        </CardContent>
      </Card>

      {/* Pending Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending</CardTitle>
          <Clock className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600">
            {pending.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Awaiting sync
          </p>
        </CardContent>
      </Card>

      {/* Failed Syncs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Failed</CardTitle>
          <XCircle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {failed.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {failureRate}% failure rate
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
