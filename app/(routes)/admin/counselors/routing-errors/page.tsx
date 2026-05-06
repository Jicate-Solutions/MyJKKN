'use client';

// /admin/counselors/routing-errors
// Observability surface for fn_auto_assign_counselor_v2 routing failures.
// Today the table is intentionally unwritten — see migration
// 20260506234138_create_counselor_routing_errors.sql for the writer-side
// follow-up plan.

export const navMeta = { label: 'Routing Errors', icon: 'AlertTriangle' } as const;

import { useEffect, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Info } from 'lucide-react';
import {
  RoutingErrorsService,
  type RoutingError,
} from '@/lib/services/admission/routing-errors-service';
import { RoutingErrorsDataTable } from './_components/routing-errors-data-table';
import { ErrorDetailDrawer } from './_components/error-detail-drawer';

type TimeWindowHours = 24 | 168 | 720; // 24h / 7d / 30d

export default function RoutingErrorsPage() {
  const [hours, setHours] = useState<TimeWindowHours>(24);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [errors, setErrors] = useState<RoutingError[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<RoutingError | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    RoutingErrorsService.getRecentErrors(undefined, hours, 200)
      .then((rows) => {
        if (cancelled) return;
        setErrors(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load routing errors';
        setLoadError(msg);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hours, refreshTick]);

  const filteredErrors = useMemo(() => {
    if (!unresolvedOnly) return errors;
    return errors.filter((e) => !e.resolved_at);
  }, [errors, unresolvedOnly]);

  const totalCount = errors.length;
  const unresolvedCount = errors.filter((e) => !e.resolved_at).length;
  const unassignedCount = errors.filter((e) => e.resulted_in_unassigned).length;

  return (
    <ContentLayout title="Counselor Routing Errors">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/counselors">Counselors</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Routing Errors</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Observability surface only</AlertTitle>
          <AlertDescription>
            This page reads from <code>counselor_routing_errors</code>. The
            writer side — rewriting <code>fn_auto_assign_counselor_v2</code> to
            INSERT named-exception captures here — ships in a follow-up PR.
            Until then, the table is intentionally empty.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Routing failures
            </CardTitle>
            <CardDescription>
              Counselor-routing errors that today vanish silently inside{' '}
              <code>fn_auto_assign_counselor_v2</code>. Affected leads land in
              the unassigned queue with no diagnostic trail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Time window</Label>
                <Select
                  value={String(hours)}
                  onValueChange={(v) => setHours(Number(v) as TimeWindowHours)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">Last 24 hours</SelectItem>
                    <SelectItem value="168">Last 7 days</SelectItem>
                    <SelectItem value="720">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="unresolved-only"
                  checked={unresolvedOnly}
                  onCheckedChange={setUnresolvedOnly}
                />
                <Label htmlFor="unresolved-only" className="text-sm">
                  Unresolved only
                </Label>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setRefreshTick((n) => n + 1)}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              <div className="ml-auto text-sm text-muted-foreground">
                {!isLoading && (
                  <>
                    {totalCount} total · {unresolvedCount} unresolved ·{' '}
                    {unassignedCount} resulted in unassigned
                  </>
                )}
              </div>
            </div>

            {loadError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Failed to load routing errors</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredErrors.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <div className="font-medium text-foreground mb-1">
                  No routing errors logged in the selected window.
                </div>
                <div>
                  Either the routing engine is healthy, or error logging
                  hasn&apos;t been wired into{' '}
                  <code>fn_auto_assign_counselor_v2</code> yet (follow-up PR).
                </div>
              </div>
            ) : (
              <RoutingErrorsDataTable
                rows={filteredErrors}
                onRowClick={(row) => setSelectedError(row)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ErrorDetailDrawer
        error={selectedError}
        onClose={() => setSelectedError(null)}
        onResolved={() => {
          setSelectedError(null);
          setRefreshTick((n) => n + 1);
        }}
      />
    </ContentLayout>
  );
}
