'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Wallet,
  Calendar,
  FileText,
  CheckCircle,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { useGrant, useBudgets } from '@/hooks/startup-studio';

// ─── Helpers ────────────────────────────────────────────────────────────────

function currency(amount: number, cur = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string | null) {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const AUDIT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  flagged: { label: 'Flagged', color: 'bg-red-100 text-red-800' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function GrantDetail({ grantId }: { grantId: string }) {
  const { data: grantRaw, isLoading: grantLoading } = useGrant(grantId);
  const { data: budgetsRaw, isLoading: budgetsLoading } = useBudgets({ grant_id: grantId });

  const grant = (grantRaw as any)?.data ?? grantRaw ?? null;
  const budgets = (budgetsRaw as any)?.data ?? budgetsRaw ?? [];

  if (grantLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!grant) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Grant not found.
        </CardContent>
      </Card>
    );
  }

  const sanctioned = grant.sanctioned_amount || 0;
  const utilized = grant.utilized_amount || 0;
  const received = grant.received_amount || 0;
  const utilizationPct = sanctioned > 0 ? (utilized / sanctioned) * 100 : 0;
  const receivedPct = sanctioned > 0 ? (received / sanctioned) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold">{grant.name}</h1>
              <p className="text-muted-foreground">{grant.funder}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={AUDIT_STATUS_CONFIG[grant.audit_status]?.color ?? 'bg-gray-100'}>
                {AUDIT_STATUS_CONFIG[grant.audit_status]?.label ?? grant.audit_status}
              </Badge>
              {grant.uc_submitted && (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3 mr-1" /> UC Submitted
                </Badge>
              )}
            </div>
          </div>

          {/* Utilization progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Utilization: {currency(utilized)} / {currency(sanctioned)}</span>
              <span className="font-semibold">{utilizationPct.toFixed(1)}%</span>
            </div>
            <Progress value={utilizationPct} className="h-3" />
          </div>

          {/* Received progress bar */}
          <div className="space-y-2 mt-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Received: {currency(received)} / {currency(sanctioned)}</span>
              <span>{receivedPct.toFixed(1)}%</span>
            </div>
            <Progress value={receivedPct} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Grant Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Grant Number" value={grant.grant_number || '--'} />
            <DetailRow label="Purpose" value={grant.purpose || '--'} />
            <DetailRow label="Currency" value={grant.currency} />
            <DetailRow label="Reporting Frequency" value={formatFrequency(grant.reporting_frequency)} />
            <DetailRow label="Last Report Date" value={formatDate(grant.last_report_date)} />
            <DetailRow label="Next Report Due" value={formatDate(grant.next_report_due)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Timeline & Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Sanction Date" value={formatDate(grant.sanction_date)} />
            <DetailRow label="Start Date" value={formatDate(grant.start_date)} />
            <DetailRow label="End Date" value={formatDate(grant.end_date)} />
            <DetailRow
              label="UC Status"
              value={
                grant.uc_submitted
                  ? `Submitted on ${formatDate(grant.uc_submitted_at)}`
                  : 'Not submitted'
              }
            />
            <DetailRow label="Audit Status" value={AUDIT_STATUS_CONFIG[grant.audit_status]?.label ?? grant.audit_status} />
            {grant.allowed_heads && grant.allowed_heads.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Allowed Heads</p>
                <div className="flex flex-wrap gap-1">
                  {grant.allowed_heads.map((h: string) => (
                    <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Related Budgets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Related Budgets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {budgetsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (budgets as any[]).length === 0 ? (
            <p className="text-center text-muted-foreground py-6">
              No budget lines linked to this grant.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fiscal Year</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(budgets as any[]).map((b: any) => {
                    const remaining = (b.allocated_amount || 0) - (b.spent_amount || 0) - (b.committed_amount || 0);
                    return (
                      <TableRow key={b.id}>
                        <TableCell>{b.fiscal_year}</TableCell>
                        <TableCell className="font-medium">{b.category}</TableCell>
                        <TableCell className="text-right">{currency(b.allocated_amount)}</TableCell>
                        <TableCell className="text-right">{currency(b.spent_amount)}</TableCell>
                        <TableCell className={`text-right ${remaining < 0 ? 'text-red-600' : ''}`}>
                          {currency(remaining)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function formatFrequency(freq: string) {
  const map: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    half_yearly: 'Half-Yearly',
    annually: 'Annually',
  };
  return map[freq] || freq;
}
