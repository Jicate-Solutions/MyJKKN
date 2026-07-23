'use client';

/**
 * ARPS Phase 2C — Action Log page
 *
 * Lists Director-logged lever pulls per cycle, filterable by institution.
 * "Log Action" opens a dialog with the receipt-capture form. The system
 * auto-snapshots trigger context (fill %, expected %, gap) from the
 * current pace state. Outcome (+14d) is auto-captured via
 * fn_arps_capture_outcomes (cron-callable).
 *
 * Per Director's 2026-06-07 interview Section 6: each row is one receipt
 * for next year's learning.
 */

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Plus,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useArpsActionLog } from '@/hooks/admission/use-arps-action-log';
import { useArpsPaceStatus } from '@/hooks/admission/use-arps-pace-status';
import { LogActionDialog } from './_components/log-action-dialog';

export const navMeta = {
  invokedFrom: '/admission/group-dashboard',
} as const;

function tierBadge(tier: number | null) {
  if (tier === null) return <Badge variant="outline">—</Badge>;
  const variants: Record<number, { className: string; label: string }> = {
    1: { className: 'border-emerald-300 bg-emerald-50 text-emerald-700', label: 'T1 — Outreach' },
    2: { className: 'border-blue-300 bg-blue-50 text-blue-700', label: 'T2 — Incentive' },
    3: { className: 'border-violet-300 bg-violet-50 text-violet-700', label: 'T3 — Paid acq' },
    4: { className: 'border-red-300 bg-red-50 text-red-700', label: 'T4 — Price' },
  };
  const v = variants[tier];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  );
}

function outcomeBadge(row: { outcome_captured_at: string | null; outcome_pace_closed: boolean | null }) {
  if (!row.outcome_captured_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-stone-500">
        <Clock className="h-3 w-3" />
        pending +14d
      </span>
    );
  }
  if (row.outcome_pace_closed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <TrendingUp className="h-3 w-3" />
        gap narrowed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-700">
      <TrendingDown className="h-3 w-3" />
      gap widened
    </span>
  );
}

export default function ActionLogPage() {
  const [cycleYear, setCycleYear] = useState(2026);
  const [institutionFilter, setInstitutionFilter] = useState<string>('__all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const institutionId =
    institutionFilter === '__all' ? null : institutionFilter;
  const { data: rows, isLoading, error } = useArpsActionLog(cycleYear, institutionId);
  const { data: paceRows } = useArpsPaceStatus();

  const institutionOptions = (paceRows ?? []).map((r) => ({
    value: r.institution_id,
    label: r.institution_name.replace(/^JKKN College of /, '').replace(/^JKKN /, ''),
  }));

  return (
    <PermissionGuard permission="admission.group_dashboard.view">
      <ContentLayout title="ARPS Action Log">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admission/group-dashboard">Group Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Action Log</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="space-y-4 mt-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Receipt capture for next year&apos;s learning</AlertTitle>
            <AlertDescription className="text-sm">
              Director-locked 2026-06-07. Each row = one lever pull you made,
              with auto-snapshot of pace context at trigger + auto-captured
              outcome 14 days later. Auto-detection of scholarship awards,
              counselor reassignments and WhatsApp campaigns is a follow-on
              phase — for now, log entries here as you pull levers.
            </AlertDescription>
          </Alert>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-stone-500">Cycle year</label>
              <Select
                value={String(cycleYear)}
                onValueChange={(v) => setCycleYear(Number(v))}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024-25</SelectItem>
                  <SelectItem value="2025">2025-26</SelectItem>
                  <SelectItem value="2026">2026-27</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-stone-500">Institution</label>
              <Select
                value={institutionFilter}
                onValueChange={setInstitutionFilter}
              >
                <SelectTrigger className="w-[260px] h-9">
                  <SelectValue placeholder="All institutions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All institutions</SelectItem>
                  {institutionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Log Action
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to load action log</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (rows ?? []).length === 0 ? (
            <Card className="border-stone-200">
              <CardContent className="py-12 text-center space-y-2">
                <Minus className="h-8 w-8 text-stone-300 mx-auto" />
                <p className="text-sm text-stone-600">
                  No actions logged for {cycleYear}–{(cycleYear + 1) % 100}{' '}
                  yet.
                </p>
                <p className="text-xs text-stone-500">
                  Click <strong>Log Action</strong> to capture your first
                  receipt.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Triggered</TableHead>
                  <TableHead className="w-[180px]">Institution</TableHead>
                  <TableHead className="w-[100px]">Day N</TableHead>
                  <TableHead className="w-[100px]">Gap (trigger)</TableHead>
                  <TableHead className="w-[140px]">Tier</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[200px]">Magnitude</TableHead>
                  <TableHead className="w-[160px]">Outcome (+14d)</TableHead>
                  <TableHead>Confirmed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-stone-600">
                      {new Date(row.triggered_at).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.institution_name
                        ?.replace(/^JKKN College of /, '')
                        .replace(/^JKKN /, '') ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.trigger_day_n}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.trigger_gap_pp !== null
                        ? `${row.trigger_gap_pp > 0 ? '+' : ''}${row.trigger_gap_pp}pp`
                        : '—'}
                    </TableCell>
                    <TableCell>{tierBadge(row.lever_tier)}</TableCell>
                    <TableCell className="text-sm">
                      {row.lever_type ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-stone-700">
                      {row.lever_magnitude_text ?? '—'}
                    </TableCell>
                    <TableCell>{outcomeBadge(row)}</TableCell>
                    <TableCell>
                      {row.director_confirmed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-700" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <LogActionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          cycleYear={cycleYear}
          institutionOptions={institutionOptions}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
