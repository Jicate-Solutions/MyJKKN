// app/(routes)/accreditation/manage/metrics/page.tsx
// ============================================================================
// CRUD UI for sh_accreditation_metrics — the body rubric catalog.
//
// 64 seeded rows (10 bodies) are is_system=true and CrudRowActions refuses
// delete on them. IQAC coordinators add local/supplementary metrics
// (e.g. "local benchmark 9.2.x") as is_system=false and can manage them
// freely.
// ============================================================================

'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import {
  AccreditationMetricService,
  type AccreditationMetricRow,
  type AccreditationMetricInput,
  type BodyCode,
} from '@/lib/services/accreditation/accreditation-metric-service';

const BODIES: BodyCode[] = ['NAAC', 'NIRF', 'NBA', 'QS', 'DCI', 'PCI', 'INC', 'NCTE', 'AICTE', 'UGC'];

function MetricFormDialog({
  open, onOpenChange, mode, entity,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'create' | 'edit';
  entity?: AccreditationMetricRow;
}) {
  const qc = useQueryClient();
  const [metricType, setMetricType] = useState<BodyCode>(entity?.metric_type ?? 'NAAC');
  const [metricCode, setMetricCode] = useState(entity?.metric_code ?? '');
  const [metricName, setMetricName] = useState(entity?.metric_name ?? '');
  const [category, setCategory] = useState(entity?.category ?? '');
  const [maxScore, setMaxScore] = useState(entity?.max_score?.toString() ?? '');
  const [weightage, setWeightage] = useState(entity?.weightage?.toString() ?? '');
  const [calc, setCalc] = useState(entity?.calculation_method ?? '');
  const [notes, setNotes] = useState(entity?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (metricCode.trim().length < 1) { toast.error('Metric code is required.'); return; }
    if (metricName.trim().length < 3) { toast.error('Metric name must be at least 3 characters.'); return; }

    const payload: AccreditationMetricInput = {
      metric_type: metricType,
      metric_code: metricCode.trim(),
      metric_name: metricName.trim(),
      category: category.trim() || null,
      max_score: maxScore ? parseFloat(maxScore) : null,
      weightage: weightage ? parseFloat(weightage) : null,
      calculation_method: calc.trim() || null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (mode === 'edit' && entity) {
        await AccreditationMetricService.update(entity.id, payload);
        toast.success('Metric updated.');
      } else {
        await AccreditationMetricService.create(payload);
        toast.success('Metric created.');
      }
      qc.invalidateQueries({ queryKey: ['accreditation-metrics'] });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit metric' : 'New metric'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Body *</Label>
              <Select value={metricType} onValueChange={v => setMetricType(v as BodyCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BODIES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric code *</Label>
              <Input value={metricCode} onChange={e => setMetricCode(e.target.value)} placeholder="e.g. 7.7.1" />
            </div>
          </div>
          <div>
            <Label>Metric name *</Label>
            <Input value={metricName} onChange={e => setMetricName(e.target.value)} maxLength={255} />
            {entity?.is_system && (
              <p className="text-xs text-amber-600 mt-1">
                Official rubric metric — edits allowed but deletion blocked. Deactivate instead.
              </p>
            )}
          </div>
          <div>
            <Label>Category</Label>
            <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Curricular Aspects" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Max score</Label>
              <Input type="number" step="0.1" value={maxScore} onChange={e => setMaxScore(e.target.value)} />
            </div>
            <div>
              <Label>Weightage</Label>
              <Input type="number" step="0.01" value={weightage} onChange={e => setWeightage(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Calculation method</Label>
            <Textarea value={calc} onChange={e => setCalc(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MetricsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [bodyFilter, setBodyFilter] = useState<string>('all');

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: ['accreditation-metrics', bodyFilter],
    queryFn: () => AccreditationMetricService.list({
      body_code: bodyFilter === 'all' ? undefined : (bodyFilter as BodyCode),
    }),
  });

  const columns: ColumnDef<AccreditationMetricRow>[] = [
    {
      accessorKey: 'metric_type',
      header: 'Body',
      cell: ({ row }) => <Badge variant="outline">{row.original.metric_type}</Badge>,
    },
    {
      accessorKey: 'metric_code',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.metric_code}</span>,
    },
    {
      accessorKey: 'metric_name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="truncate max-w-md">{row.original.metric_name}</span>
          {row.original.is_system && <Badge variant="outline" className="text-[10px]">system</Badge>}
        </div>
      ),
    },
    { accessorKey: 'category', header: 'Category' },
    {
      accessorKey: 'is_active',
      header: 'Active',
      cell: ({ row }) => (row.original.is_active ? <Badge>active</Badge> : <Badge variant="outline">inactive</Badge>),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <CrudRowActions<AccreditationMetricRow>
          entity={row.original}
          entityLabel="metric"
          entityDisplayName={(e) => `${e.metric_type} ${e.metric_code}: ${e.metric_name}`}
          onDelete={async (id) => {
            await AccreditationMetricService.delete(id);
            qc.invalidateQueries({ queryKey: ['accreditation-metrics'] });
          }}
          EditDialog={({ open, onOpenChange, entity }) => (
            <MetricFormDialog open={open} onOpenChange={onOpenChange} mode="edit" entity={entity} />
          )}
        />
      ),
    },
  ];

  return (
    <PermissionGuard module="accreditation.metrics" action="manage">
      <ContentLayout title="Accreditation Metrics Catalog">
        <PageBreadcrumb
          items={[
            { label: 'Accreditation', href: '/accreditation' },
            { label: 'Manage' },
            { label: 'Metrics Catalog' },
          ]}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Metrics Catalog</CardTitle>
                <p className="text-sm text-muted-foreground">
                  10-body rubric catalog. 64 seeded entries are system-protected.
                  Add local/supplementary metrics (e.g. JKKN-specific benchmarks) as needed.
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="w-40">
                  <Label className="text-xs">Filter body</Label>
                  <Select value={bodyFilter} onValueChange={setBodyFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All bodies</SelectItem>
                      {BODIES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New Metric
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CrudDataTable<AccreditationMetricRow>
              items={items}
              loading={isLoading}
              error={error ? (error as Error).message : null}
              onRefresh={() => refetch()}
              onBulkDelete={(ids) => AccreditationMetricService.bulkDelete(ids)}
              columns={columns}
              entityLabel="metric"
              entityLabelPlural="metrics"
            />
          </CardContent>
        </Card>

        <MetricFormDialog open={showCreate} onOpenChange={setShowCreate} mode="create" />
      </ContentLayout>
    </PermissionGuard>
  );
}
