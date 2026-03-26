'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  TrendingUp,
  PieChart,
  AlertTriangle,
  Plus,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import {
  useGrants,
  useCreateGrant,
  useBudgets,
  useRevenue,
  useRecordRevenue,
  useAuditRecords,
  useCreateAuditRecord,
  useSustainabilityMetrics,
  useCreateBudget,
} from '@/hooks/startup-studio';

// ─── Formatters ─────────────────────────────────────────────────────────────

function currency(amount: number, cur = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: 0,
  }).format(amount);
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(date: string | null) {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Status Badges ──────────────────────────────────────────────────────────

const AUDIT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  flagged: { label: 'Flagged', color: 'bg-red-100 text-red-800' },
};

const AUDIT_RECORD_STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-gray-100 text-gray-800' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  findings_open: { label: 'Findings Open', color: 'bg-orange-100 text-orange-800' },
};

const REVENUE_SOURCES: Record<string, string> = {
  rental_income: 'Rental Income',
  service_fees: 'Service Fees',
  equity_returns: 'Equity Returns',
  licensing_ip: 'Licensing / IP',
  event_sponsorship: 'Event Sponsorship',
  corporate_partnership: 'Corporate Partnership',
  government_grant: 'Government Grant',
  consulting: 'Consulting',
  training_programs: 'Training Programs',
  other: 'Other',
};

// ─── Add Grant Dialog ───────────────────────────────────────────────────────

function AddGrantDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    funder: '',
    grant_number: '',
    sanctioned_amount: '',
    purpose: '',
    start_date: '',
    end_date: '',
    reporting_frequency: 'quarterly',
  });
  const createGrant = useCreateGrant();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createGrant.mutateAsync({
      ...form,
      sanctioned_amount: parseFloat(form.sanctioned_amount) || 0,
    });
    setForm({
      name: '',
      funder: '',
      grant_number: '',
      sanctioned_amount: '',
      purpose: '',
      start_date: '',
      end_date: '',
      reporting_frequency: 'quarterly',
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Grant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Grant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Grant Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Funder *</Label>
              <Input
                value={form.funder}
                onChange={(e) => setForm({ ...form, funder: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Grant Number</Label>
              <Input
                value={form.grant_number}
                onChange={(e) => setForm({ ...form, grant_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Sanctioned Amount *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.sanctioned_amount}
                onChange={(e) => setForm({ ...form, sanctioned_amount: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Reporting Frequency</Label>
              <Select
                value={form.reporting_frequency}
                onValueChange={(v) => setForm({ ...form, reporting_frequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="half_yearly">Half-Yearly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Purpose</Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createGrant.isPending}>
              {createGrant.isPending ? 'Creating...' : 'Create Grant'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Budget Dialog ──────────────────────────────────────────────────────

function AddBudgetDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fiscal_year: '',
    category: '',
    subcategory: '',
    allocated_amount: '',
    notes: '',
  });
  const createBudget = useCreateBudget();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createBudget.mutateAsync({
      ...form,
      allocated_amount: parseFloat(form.allocated_amount) || 0,
    });
    setForm({ fiscal_year: '', category: '', subcategory: '', allocated_amount: '', notes: '' });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Add Budget Line
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Budget Line</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fiscal Year *</Label>
              <Input
                placeholder="2025-26"
                value={form.fiscal_year}
                onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Category *</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Subcategory</Label>
              <Input
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
              />
            </div>
            <div>
              <Label>Allocated Amount *</Label>
              <Input
                type="number"
                min="0"
                value={form.allocated_amount}
                onChange={(e) => setForm({ ...form, allocated_amount: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createBudget.isPending}>
              {createBudget.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Revenue Dialog ──────────────────────────────────────────────────

function RecordRevenueDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fiscal_year: '',
    source: '',
    amount: '',
    description: '',
    is_self_generated: true,
  });
  const recordRevenue = useRecordRevenue();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await recordRevenue.mutateAsync({
      ...form,
      amount: parseFloat(form.amount) || 0,
    });
    setForm({ fiscal_year: '', source: '', amount: '', description: '', is_self_generated: true });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Record Revenue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Revenue</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fiscal Year *</Label>
              <Input
                placeholder="2025-26"
                value={form.fiscal_year}
                onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Source *</Label>
              <Select
                value={form.source}
                onValueChange={(v) => setForm({ ...form, source: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REVENUE_SOURCES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount *</Label>
              <Input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Self-Generated?</Label>
              <Select
                value={form.is_self_generated ? 'yes' : 'no'}
                onValueChange={(v) => setForm({ ...form, is_self_generated: v === 'yes' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No (Grant/External)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={recordRevenue.isPending}>
              {recordRevenue.isPending ? 'Recording...' : 'Record'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Audit Dialog ───────────────────────────────────────────────────────

function AddAuditDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    audit_type: 'internal_quarterly',
    audit_period_start: '',
    audit_period_end: '',
    auditor_name: '',
    auditor_organization: '',
  });
  const createAudit = useCreateAuditRecord();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAudit.mutateAsync(form);
    setForm({
      audit_type: 'internal_quarterly',
      audit_period_start: '',
      audit_period_end: '',
      auditor_name: '',
      auditor_organization: '',
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Schedule Audit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Audit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Audit Type *</Label>
              <Select
                value={form.audit_type}
                onValueChange={(v) => setForm({ ...form, audit_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal_quarterly">Internal Quarterly</SelectItem>
                  <SelectItem value="external_annual">External Annual</SelectItem>
                  <SelectItem value="grant_specific">Grant Specific</SelectItem>
                  <SelectItem value="special">Special</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period Start *</Label>
              <Input
                type="date"
                value={form.audit_period_start}
                onChange={(e) => setForm({ ...form, audit_period_start: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Period End *</Label>
              <Input
                type="date"
                value={form.audit_period_end}
                onChange={(e) => setForm({ ...form, audit_period_end: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Auditor Name</Label>
              <Input
                value={form.auditor_name}
                onChange={(e) => setForm({ ...form, auditor_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Auditor Organization</Label>
              <Input
                value={form.auditor_organization}
                onChange={(e) => setForm({ ...form, auditor_organization: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createAudit.isPending}>
              {createAudit.isPending ? 'Scheduling...' : 'Schedule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export function FinanceDashboard() {
  const [fiscalYearFilter, setFiscalYearFilter] = useState<string>('');

  const { data: grantsRaw, isLoading: grantsLoading } = useGrants();
  const { data: budgetsRaw, isLoading: budgetsLoading } = useBudgets(
    fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : undefined
  );
  const { data: revenueRaw, isLoading: revenueLoading } = useRevenue(
    fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : undefined
  );
  const { data: auditsRaw, isLoading: auditsLoading } = useAuditRecords();
  const { data: sustainabilityRaw, isLoading: sustainLoading } = useSustainabilityMetrics(
    fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : undefined
  );

  const grants = (grantsRaw as any)?.data ?? grantsRaw ?? [];
  const budgets = (budgetsRaw as any)?.data ?? budgetsRaw ?? [];
  const revenue = (revenueRaw as any)?.data ?? revenueRaw ?? [];
  const audits = (auditsRaw as any)?.data ?? auditsRaw ?? [];
  const sustainability = (sustainabilityRaw as any)?.data ?? sustainabilityRaw ?? null;

  // ── KPI computations ──

  const totalSanctioned = (grants as any[]).reduce((s: number, g: any) => s + (g.sanctioned_amount || 0), 0);
  const totalUtilized = (grants as any[]).reduce((s: number, g: any) => s + (g.utilized_amount || 0), 0);
  const utilizationPct = totalSanctioned > 0 ? (totalUtilized / totalSanctioned) * 100 : 0;

  const totalAllocated = (budgets as any[]).reduce((s: number, b: any) => s + (b.allocated_amount || 0), 0);
  const totalSpent = (budgets as any[]).reduce((s: number, b: any) => s + (b.spent_amount || 0), 0);
  const budgetVariance = totalAllocated > 0 ? ((totalAllocated - totalSpent) / totalAllocated) * 100 : 0;

  const selfRatio = sustainability ? (sustainability as any).self_generated_ratio * 100 : 0;

  const isLoading = grantsLoading || budgetsLoading || revenueLoading || auditsLoading || sustainLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Grants"
          value={currency(totalSanctioned)}
          subtitle={`${(grants as any[]).length} grants`}
          icon={Wallet}
          color="bg-blue-100 text-blue-700"
        />
        <KpiCard
          title="Grant Utilization"
          value={pct(utilizationPct)}
          subtitle={`${currency(totalUtilized)} utilized`}
          icon={TrendingUp}
          color="bg-green-100 text-green-700"
        />
        <KpiCard
          title="Self-Sustainability"
          value={pct(selfRatio)}
          subtitle="Self-generated ratio"
          icon={PieChart}
          color="bg-purple-100 text-purple-700"
        />
        <KpiCard
          title="Budget Variance"
          value={pct(budgetVariance)}
          subtitle={`${currency(totalAllocated)} allocated`}
          icon={AlertTriangle}
          color={budgetVariance < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="grants" className="w-full">
        <TabsList>
          <TabsTrigger value="grants">Grants</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="audits">Audits</TabsTrigger>
        </TabsList>

        {/* Grants Tab */}
        <TabsContent value="grants">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Grants</CardTitle>
              <AddGrantDialog />
            </CardHeader>
            <CardContent>
              {(grants as any[]).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No grants yet. Click Add Grant to create one.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Funder</TableHead>
                        <TableHead className="text-right">Sanctioned</TableHead>
                        <TableHead className="text-right">Utilized</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(grants as any[]).map((g: any) => {
                        const utilPct = g.sanctioned_amount > 0
                          ? (g.utilized_amount / g.sanctioned_amount) * 100
                          : 0;
                        return (
                          <TableRow key={g.id}>
                            <TableCell className="font-medium">{g.name}</TableCell>
                            <TableCell>{g.funder}</TableCell>
                            <TableCell className="text-right">{currency(g.sanctioned_amount)}</TableCell>
                            <TableCell className="text-right">
                              {currency(g.utilized_amount)}
                              <span className="text-xs text-muted-foreground ml-1">({pct(utilPct)})</span>
                            </TableCell>
                            <TableCell>
                              <Badge className={AUDIT_STATUS_CONFIG[g.audit_status]?.color ?? 'bg-gray-100'}>
                                {AUDIT_STATUS_CONFIG[g.audit_status]?.label ?? g.audit_status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(g.end_date)}</TableCell>
                            <TableCell>
                              <Link href={`/startup-studio/finance/grants/${g.id}`}>
                                <Button variant="ghost" size="sm">
                                  <ArrowRight className="w-4 h-4" />
                                </Button>
                              </Link>
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
        </TabsContent>

        {/* Budgets Tab */}
        <TabsContent value="budgets">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <CardTitle className="text-lg">Budgets</CardTitle>
                <Input
                  placeholder="Filter by fiscal year..."
                  value={fiscalYearFilter}
                  onChange={(e) => setFiscalYearFilter(e.target.value)}
                  className="w-48 h-8"
                />
              </div>
              <AddBudgetDialog />
            </CardHeader>
            <CardContent>
              {(budgets as any[]).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No budget lines yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fiscal Year</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Subcategory</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                        <TableHead className="text-right">Committed</TableHead>
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
                            <TableCell>{b.subcategory || '--'}</TableCell>
                            <TableCell className="text-right">{currency(b.allocated_amount)}</TableCell>
                            <TableCell className="text-right">{currency(b.spent_amount)}</TableCell>
                            <TableCell className="text-right">{currency(b.committed_amount)}</TableCell>
                            <TableCell className={`text-right font-medium ${remaining < 0 ? 'text-red-600' : ''}`}>
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
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Revenue</CardTitle>
              <RecordRevenueDialog />
            </CardHeader>
            <CardContent>
              {(revenue as any[]).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No revenue recorded yet.</p>
              ) : (
                <>
                  {/* Source breakdown summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {Object.entries(
                      (revenue as any[]).reduce((acc: Record<string, number>, r: any) => {
                        const src = r.source || 'other';
                        acc[src] = (acc[src] || 0) + (r.amount || 0);
                        return acc;
                      }, {} as Record<string, number>)
                    )
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([source, total]) => (
                        <div key={source} className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground">{REVENUE_SOURCES[source] || source}</p>
                          <p className="text-lg font-semibold">{currency(total as number)}</p>
                        </div>
                      ))}
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fiscal Year</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Self-Generated</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(revenue as any[]).map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.fiscal_year}</TableCell>
                            <TableCell>{REVENUE_SOURCES[r.source] || r.source}</TableCell>
                            <TableCell className="text-right font-medium">{currency(r.amount)}</TableCell>
                            <TableCell>
                              {r.is_self_generated ? (
                                <Badge className="bg-green-100 text-green-800">Yes</Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-800">No</Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{r.description || '--'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audits Tab */}
        <TabsContent value="audits">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Audit Records</CardTitle>
              <AddAuditDialog />
            </CardHeader>
            <CardContent>
              {(audits as any[]).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No audit records yet.</p>
              ) : (
                <div className="space-y-3">
                  {(audits as any[]).map((a: any) => {
                    const statusConf = AUDIT_RECORD_STATUS[a.status] || { label: a.status, color: 'bg-gray-100' };
                    const typeLabel = (a.audit_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                    return (
                      <div
                        key={a.id}
                        className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-background rounded-md border">
                            {a.status === 'completed' ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : a.status === 'in_progress' ? (
                              <Clock className="w-5 h-5 text-blue-600" />
                            ) : (
                              <FileText className="w-5 h-5 text-gray-500" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{typeLabel}</p>
                            <p className="text-sm text-muted-foreground">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              {formatDate(a.audit_period_start)} - {formatDate(a.audit_period_end)}
                            </p>
                            {a.auditor_name && (
                              <p className="text-sm text-muted-foreground mt-0.5">
                                Auditor: {a.auditor_name}
                                {a.auditor_organization ? ` (${a.auditor_organization})` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={statusConf.color}>{statusConf.label}</Badge>
                          {a.findings_count > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {a.findings_count} findings ({a.critical_findings} critical)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
