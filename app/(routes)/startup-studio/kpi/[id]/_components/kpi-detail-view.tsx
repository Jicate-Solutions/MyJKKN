'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  CheckCircle2,
  XCircle,
  PlusCircle,
  AlertCircle,
  ArrowLeft,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { useKpiDefinition, useRecordMeasurement } from '@/hooks/startup-studio/use-kpi';
import { toast } from 'sonner';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────

interface KpiData {
  id: string;
  name: string;
  code: string;
  description: string | null;
  framework: string;
  category: string;
  data_type: string;
  unit: string | null;
  measurement_method: string | null;
  target_value: number | null;
  target_period: string | null;
  collection_frequency: string;
  is_auto_calculated: boolean;
  relevant_to: string[];
  is_active: boolean;
  created_at: string;
  latest_measurement?: {
    id: string;
    kpi_id: string;
    period_start: string;
    period_end: string;
    value: number;
    previous_value: number | null;
    notes: string | null;
    data_source: string | null;
    verified: boolean;
    verified_by: string | null;
    created_at: string;
  };
}

// ── Constants ────────────────────────────────────────────────────────

const FRAMEWORK_LABELS: Record<string, string> = {
  dst: 'DST',
  msh: 'MSH',
  moe_innovation_cell: 'MoE Innovation Cell',
  nirf: 'NIRF',
  internal: 'Internal',
  custom: 'Custom',
};

const FRAMEWORK_COLORS: Record<string, string> = {
  dst: 'bg-blue-100 text-blue-800',
  msh: 'bg-purple-100 text-purple-800',
  moe_innovation_cell: 'bg-amber-100 text-amber-800',
  nirf: 'bg-emerald-100 text-emerald-800',
  internal: 'bg-gray-100 text-gray-800',
  custom: 'bg-rose-100 text-rose-800',
};

const CATEGORY_COLORS: Record<string, string> = {
  input: 'bg-sky-50 text-sky-700',
  output: 'bg-orange-50 text-orange-700',
  outcome: 'bg-violet-50 text-violet-700',
  impact: 'bg-emerald-50 text-emerald-700',
};

// ── Trend Badge ──────────────────────────────────────────────────────

function TrendBadge({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return <Badge variant="outline" className="text-xs"><Minus className="h-3 w-3 mr-1" />First</Badge>;
  }
  const diff = current - previous;
  const pctChange = previous !== 0 ? Math.round((diff / previous) * 100) : 0;

  if (diff > 0) {
    return (
      <Badge variant="outline" className="text-xs text-emerald-700 bg-emerald-50">
        <TrendingUp className="h-3 w-3 mr-1" />+{pctChange}%
      </Badge>
    );
  }
  if (diff < 0) {
    return (
      <Badge variant="outline" className="text-xs text-red-700 bg-red-50">
        <TrendingDown className="h-3 w-3 mr-1" />{pctChange}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      <Minus className="h-3 w-3 mr-1" />0%
    </Badge>
  );
}

// ── Record Measurement Dialog ────────────────────────────────────────

function RecordMeasurementForm({ kpi }: { kpi: KpiData }) {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  const recordMutation = useRecordMeasurement();

  const handleSubmit = () => {
    if (!periodStart || !periodEnd || !value) {
      toast.error('Please fill in all required fields');
      return;
    }

    recordMutation.mutate(
      {
        kpiId: kpi.id,
        data: {
          period_start: periodStart,
          period_end: periodEnd,
          value: parseFloat(value),
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Measurement recorded successfully');
          setOpen(false);
          setPeriodStart('');
          setPeriodEnd('');
          setValue('');
          setNotes('');
        },
        onError: (err: any) => {
          toast.error(err?.message || 'Failed to record measurement');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="h-4 w-4 mr-2" />
          Record Measurement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Measurement</DialogTitle>
          <DialogDescription>
            Record a new measurement for <span className="font-medium">{kpi.name}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="detail_period_start">Period Start *</Label>
              <Input
                id="detail_period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail_period_end">Period End *</Label>
              <Input
                id="detail_period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="detail_value">
              Value * {kpi.unit && <span className="text-muted-foreground">({kpi.unit})</span>}
            </Label>
            <Input
              id="detail_value"
              type="number"
              step="any"
              placeholder={kpi.target_value ? `Target: ${kpi.target_value}` : 'Enter value'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="detail_notes">Notes</Label>
            <Textarea
              id="detail_notes"
              placeholder="Optional notes about this measurement..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={recordMutation.isPending}>
            {recordMutation.isPending ? 'Saving...' : 'Save Measurement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Detail View ─────────────────────────────────────────────────

export function KpiDetailView({ kpiId }: { kpiId: string }) {
  const { data, isLoading, error } = useKpiDefinition(kpiId);

  if (isLoading) return <DetailSkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Failed to load KPI details</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link href="/startup-studio/kpi">
              <ArrowLeft className="h-4 w-4 mr-2" />Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const kpi = data as KpiData | undefined;
  if (!kpi) return null;

  const latestMeasurement = kpi.latest_measurement;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/startup-studio/kpi">
                <ArrowLeft className="h-4 w-4 mr-1" />Back
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold">{kpi.name}</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">{kpi.code}</p>
          {kpi.description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{kpi.description}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="outline" className={FRAMEWORK_COLORS[kpi.framework] || ''}>
              {FRAMEWORK_LABELS[kpi.framework] || kpi.framework}
            </Badge>
            <Badge variant="outline" className={CATEGORY_COLORS[kpi.category] || ''}>
              {kpi.category}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {kpi.data_type}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {kpi.collection_frequency}
            </Badge>
          </div>
        </div>
        <RecordMeasurementForm kpi={kpi} />
      </div>

      {/* KPI Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" />
              Current Value
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {latestMeasurement ? latestMeasurement.value.toLocaleString() : '--'}
              {kpi.unit && <span className="text-sm font-normal text-muted-foreground ml-1">{kpi.unit}</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Target className="h-4 w-4" />
              Target
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {kpi.target_value !== null ? kpi.target_value.toLocaleString() : '--'}
              {kpi.unit && kpi.target_value !== null && (
                <span className="text-sm font-normal text-muted-foreground ml-1">{kpi.unit}</span>
              )}
            </div>
            {kpi.target_period && (
              <p className="text-xs text-muted-foreground mt-1">Period: {kpi.target_period}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Last Measured
            </div>
            <div className="text-lg font-semibold">
              {latestMeasurement
                ? new Date(latestMeasurement.period_end).toLocaleDateString()
                : 'Never'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              {latestMeasurement?.verified ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-amber-500" />
              )}
              Verified
            </div>
            <div className="text-lg font-semibold">
              {latestMeasurement
                ? latestMeasurement.verified
                  ? 'Yes'
                  : 'Pending'
                : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Measurement History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Measurement History</CardTitle>
        </CardHeader>
        <CardContent>
          {!latestMeasurement ? (
            <div className="py-8 text-center text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No measurements recorded yet</p>
              <p className="text-xs mt-1">Click &quot;Record Measurement&quot; to add the first data point</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Note: Currently showing only the latest measurement from the KPI detail endpoint.
                      A dedicated measurements list endpoint could be added for full history. */}
                  <TableRow>
                    <TableCell className="font-mono text-xs">
                      {new Date(latestMeasurement.period_start).toLocaleDateString()} -{' '}
                      {new Date(latestMeasurement.period_end).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {latestMeasurement.value.toLocaleString()}
                      {kpi.unit && <span className="text-xs text-muted-foreground ml-1">{kpi.unit}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {latestMeasurement.previous_value !== null
                        ? latestMeasurement.previous_value.toLocaleString()
                        : '--'}
                    </TableCell>
                    <TableCell>
                      <TrendBadge
                        current={latestMeasurement.value}
                        previous={latestMeasurement.previous_value}
                      />
                    </TableCell>
                    <TableCell>
                      {latestMeasurement.verified ? (
                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {latestMeasurement.notes || '--'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Details */}
      {kpi.measurement_method && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Measurement Method</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{kpi.measurement_method}</p>
          </CardContent>
        </Card>
      )}

      {kpi.relevant_to && kpi.relevant_to.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relevant To</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {kpi.relevant_to.map((item, idx) => (
                <Badge key={idx} variant="secondary">
                  {item}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
