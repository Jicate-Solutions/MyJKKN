'use client';

import { AlertCircle, Building2, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useGroupDashboard } from '@/hooks/admission/use-group-dashboard';
import { InstitutionComparisonTable } from './_components/institution-comparison-table';
import { CrossCampusDedup } from './_components/cross-campus-dedup';
import { SeatFillTracker } from './_components/seat-fill-tracker';
import { NAACReportGenerator } from './_components/naac-report-generator';

export default function GroupDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useGroupDashboard();

  if (isError) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message || 'Failed to load group dashboard.'}
          </AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <div>
            <h1 className="text-xl font-bold">Group Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Cross-institution admission overview
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Totals Summary */}
          {data?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total Leads', value: data.totals.total_leads },
                { label: 'Applied', value: data.totals.total_applied },
                { label: 'Enrolled', value: data.totals.total_enrolled },
                { label: 'Total Seats', value: data.totals.total_seats || '—' },
                {
                  label: 'Fill Rate',
                  value:
                    data.totals.total_seats > 0
                      ? `${data.totals.overall_fill_percentage}%`
                      : '—',
                },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-lg font-bold">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Comparison Table */}
          <InstitutionComparisonTable institutions={data?.institutions || []} />

          {/* Two-column for Seat Fill + Dedup */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SeatFillTracker institutions={data?.institutions || []} />
            <CrossCampusDedup />
          </div>

          {/* NAAC Report */}
          <NAACReportGenerator />
        </>
      )}
    </div>
  );
}
