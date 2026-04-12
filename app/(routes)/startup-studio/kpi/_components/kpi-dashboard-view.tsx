'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  BarChart3,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import { useKpiDashboard, useKpiDefinitions, useRecordMeasurement } from '@/hooks/startup-studio/use-kpi';
import { toast } from 'sonner';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────

interface KpiWithValue {
  id: string;
  name: string;
  code: string;
  description: string | null;
  framework: string;
  category: string;
  data_type: string;
  unit: string | null;
  target_value: number | null;
  collection_frequency: string;
  is_active: boolean;
  latest_value?: number;
  latest_period_end?: string;
}

interface DashboardData {
  kpis_by_framework: Record<string, KpiWithValue[]>;
  overall_compliance: {
    total: number;
    measured: number;
    unmeasured: number;
    compliance_pct: number;
  };
}

// ── Constants ────────────────────────────────────────────────────────

const FRAMEWORK_LABELS: Record<string, string> = {
  dst: 'DST',
  msh: 'MSH',
  moe_innovation_cell: 'MoE',
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
  input: 'bg-sky-50 text-sky-700 border-sky-200',
  output: 'bg-orange-50 text-orange-700 border-orange-200',
  outcome: 'bg-violet-50 text-violet-700 border-violet-200',
  impact: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// ── Trend Icon ───────────────────────────────────────────────────────

function TrendIcon({ current, target }: { current?: number; target: number | null }) {
  if (current === undefined || target === null) {
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
  if (current >= target) {
    return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  }
  if (current >= target * 0.7) {
    return <Minus className="h-4 w-4 text-amber-500" />;
  }
  return <TrendingDown className="h-4 w-4 text-red-500" />;
}

// ── Record Measurement Dialog ────────────────────────────────────────

function RecordMeasurementDialog({ kpi }: { kpi: KpiWithValue }) {
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
          toast.success(`Measurement recorded for ${kpi.name}`);
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
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <PlusCircle className="h-3.5 w-3.5 mr-1" />
          Record
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Measurement</DialogTitle>
          <DialogDescription>
            Record a new measurement for <span className="font-medium">{kpi.name}</span> ({kpi.code})
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period_start">Period Start *</Label>
              <Input
                id="period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period_end">Period End *</Label>
              <Input
                id="period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="value">
              Value * {kpi.unit && <span className="text-muted-foreground">({kpi.unit})</span>}
            </Label>
            <Input
              id="value"
              type="number"
              step="any"
              placeholder={kpi.target_value ? `Target: ${kpi.target_value}` : 'Enter value'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
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

// ── KPI Card ─────────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: KpiWithValue }) {
  const progressPct =
    kpi.target_value && kpi.latest_value !== undefined
      ? Math.min(Math.round((kpi.latest_value / kpi.target_value) * 100), 100)
      : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/startup-studio/kpi/${kpi.id}`}
              className="hover:underline"
            >
              <CardTitle className="text-sm font-medium leading-tight truncate">
                {kpi.name}
              </CardTitle>
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{kpi.code}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${FRAMEWORK_COLORS[kpi.framework] || ''}`}>
              {FRAMEWORK_LABELS[kpi.framework] || kpi.framework}
            </Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[kpi.category] || ''}`}>
              {kpi.category}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-end justify-between mt-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {kpi.latest_value !== undefined ? kpi.latest_value.toLocaleString() : '--'}
              </span>
              {kpi.unit && (
                <span className="text-xs text-muted-foreground">{kpi.unit}</span>
              )}
              <TrendIcon current={kpi.latest_value} target={kpi.target_value} />
            </div>
            {kpi.target_value !== null && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Target: {kpi.target_value.toLocaleString()} {kpi.unit || ''}
              </p>
            )}
          </div>
          <RecordMeasurementDialog kpi={kpi} />
        </div>
        {progressPct !== null && (
          <div className="mt-3">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  progressPct >= 100
                    ? 'bg-emerald-500'
                    : progressPct >= 70
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{progressPct}%</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Stat Cards ───────────────────────────────────────────────────────

function StatCards({ data }: { data: DashboardData }) {
  const { overall_compliance } = data;
  const frameworks = Object.keys(data.kpis_by_framework);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total KPIs</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{overall_compliance.total}</div>
          <p className="text-xs text-muted-foreground">across {frameworks.length} framework(s)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Measured</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {overall_compliance.compliance_pct}%
          </div>
          <p className="text-xs text-muted-foreground">
            {overall_compliance.measured} of {overall_compliance.total} KPIs
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unmeasured</CardTitle>
          <AlertCircle className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{overall_compliance.unmeasured}</div>
          <p className="text-xs text-muted-foreground">KPIs need data collection</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Frameworks</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {frameworks.map((fw) => (
              <Badge
                key={fw}
                variant="outline"
                className={`text-[10px] ${FRAMEWORK_COLORS[fw] || ''}`}
              >
                {FRAMEWORK_LABELS[fw] || fw} ({data.kpis_by_framework[fw]?.length || 0})
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-10 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-20 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-1.5 w-full mt-3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard View ──────────────────────────────────────────────

export function KpiDashboardView() {
  const { data: dashboardData, isLoading, error } = useKpiDashboard();
  const [activeTab, setActiveTab] = useState('all');

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Failed to load KPI dashboard</p>
        </CardContent>
      </Card>
    );
  }

  const data = dashboardData as DashboardData | undefined;
  if (!data || !data.kpis_by_framework) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No KPI data available</p>
        </CardContent>
      </Card>
    );
  }

  const frameworks = Object.keys(data.kpis_by_framework);
  const allKpis = Object.values(data.kpis_by_framework).flat();

  const displayKpis =
    activeTab === 'all'
      ? allKpis
      : data.kpis_by_framework[activeTab] || [];

  return (
    <div className="space-y-6">
      <StatCards data={data} />

      {/* Framework Filter Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {frameworks.map((fw) => (
              <TabsTrigger key={fw} value={fw}>
                {FRAMEWORK_LABELS[fw] || fw}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/startup-studio/kpi/reports">
                Impact Reports
              </Link>
            </Button>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <TabsContent value={activeTab} className="mt-4">
          {displayKpis.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No KPIs found for this framework
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayKpis.map((kpi) => (
                <KpiCard key={kpi.id} kpi={kpi} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
