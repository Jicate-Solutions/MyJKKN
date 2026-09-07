'use client';

import { useState } from 'react';
import {
  ContentLayout
} from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, FileSpreadsheet, AlertCircle, Loader2, FileArchive } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  useNaacExport,
  useAicteExport,
  useFlexExport,
  useProofsZip,
} from '@/hooks/cdc/use-cdc-exports';
import { FLEX_TABLE_COLUMNS, type FlexTable, type ExportFormat } from '@/types/cdc/exports';

const CURRENT_YEAR = new Date().getFullYear();

function NaacSection() {
  const [cycle, setCycle] = useState(`${CURRENT_YEAR - 1}-${String(CURRENT_YEAR).slice(-2)}`);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const { exportNaac, loading, error } = useNaacExport();
  const {
    downloadProofsZip,
    loading: proofsLoading,
    error: proofsError,
    message: proofsMessage,
  } = useProofsZip();

  // Surface the proof-bundle result (e.g. "No offer-letter documents found")
  // as a toast — the page renders other errors via Alert below.
  useEffect(() => {
    if (proofsMessage) toast.success(proofsMessage);
  }, [proofsMessage]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">NAAC</Badge>
          <CardTitle className="text-base">Metric 8.2 (Graduate Progression) — Placement Export</CardTitle>
        </div>
        <CardDescription>
          Download placement data formatted for the NAAC self-study report — Metric 8.2,
          Graduate Progression (Binary framework).
          Column mapping is managed in Admin &rarr; CDC Policies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="naac-cycle">Academic Cycle</Label>
            <Input
              id="naac-cycle"
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              placeholder="2024-25"
              pattern="\d{4}-\d{2}"
            />
            <p className="text-xs text-muted-foreground">Format: YYYY-YY (e.g. 2024-25)</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="naac-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger id="naac-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <PermissionGuard module="cdc.exports" action="download" fallback={null}>
              <Button
                onClick={() => exportNaac(cycle, format)}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {loading ? 'Generating…' : 'Download'}
              </Button>
            </PermissionGuard>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Separator />

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <Label className="text-sm">Supporting Proof Documents</Label>
              <p className="text-xs text-muted-foreground">
                Bundle the uploaded offer-letter documents for all accepted placements into
                a single ZIP — the supporting evidence for NAAC 8.2 (Graduate Progression) / AICTE submission.
              </p>
            </div>
            <PermissionGuard module="cdc.exports" action="download" fallback={null}>
              <Button
                variant="outline"
                onClick={downloadProofsZip}
                disabled={proofsLoading}
                className="w-full sm:w-auto shrink-0"
              >
                {proofsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <FileArchive className="h-4 w-4 mr-2" />
                )}
                {proofsLoading ? 'Bundling…' : 'Download Proofs (ZIP)'}
              </Button>
            </PermissionGuard>
          </div>
          {proofsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{proofsError}</AlertDescription>
            </Alert>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          A copy is saved to the CDC-docs storage bucket under exports/{CURRENT_YEAR}/ for audit trail.
        </p>
      </CardContent>
    </Card>
  );
}

function AicteSection() {
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const { exportAicte, loading, error } = useAicteExport();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">AICTE</Badge>
          <CardTitle className="text-base">Annual Return — Placement Export</CardTitle>
        </div>
        <CardDescription>
          Download placement data formatted for AICTE Annual Return submission.
          Internal placement inclusion is controlled by Admin &rarr; CDC Policies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="aicte-year">Calendar Year</Label>
            <Input
              id="aicte-year"
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              min={2000}
              max={2100}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="aicte-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger id="aicte-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <PermissionGuard module="cdc.exports" action="download" fallback={null}>
              <Button
                onClick={() => exportAicte(year, format)}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {loading ? 'Generating…' : 'Download'}
              </Button>
            </PermissionGuard>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

const FLEX_TABLE_LABELS: Record<FlexTable, string> = {
  cdc_placements: 'Placements',
  cdc_drives: 'Drives',
  cdc_training_enrollments: 'Training Enrollments',
};

function FlexSection() {
  const [table, setTable] = useState<FlexTable>('cdc_placements');
  const [columns, setColumns] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const { exportFlex, loading, error } = useFlexExport();

  const availableCols = FLEX_TABLE_COLUMNS[table];

  function toggleCol(name: string) {
    setColumns((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function selectAll() {
    setColumns(availableCols.map((c) => c.name));
  }

  function clearAll() {
    setColumns([]);
  }

  function handleTableChange(t: FlexTable) {
    setTable(t);
    setColumns([]);
  }

  async function handleExport() {
    if (columns.length === 0) return;
    if (!dateFrom || !dateTo) return;
    await exportFlex({ table, columns, dateFrom, dateTo, format });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Flex Generator</CardTitle>
        </div>
        <CardDescription>
          Build a custom export by choosing a data source, date range, and columns.
          For power users who need specific cuts of data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Data Source</Label>
            <Select value={table} onValueChange={(v) => handleTableChange(v as FlexTable)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FLEX_TABLE_LABELS) as FlexTable[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {FLEX_TABLE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Output Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="flex-from">Date From</Label>
            <Input
              id="flex-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="flex-to">Date To</Label>
            <Input
              id="flex-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Columns ({columns.length} selected)</Label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7">
                Clear
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border rounded-md bg-muted/30">
            {availableCols.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <Checkbox
                  id={`col-${col.name}`}
                  checked={columns.includes(col.name)}
                  onCheckedChange={() => toggleCol(col.name)}
                />
                <label htmlFor={`col-${col.name}`} className="text-sm cursor-pointer">
                  {col.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <PermissionGuard module="cdc.exports" action="download" fallback={null}>
          <Button
            onClick={handleExport}
            disabled={loading || columns.length === 0 || !dateFrom || !dateTo}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Generating…' : 'Generate Export'}
          </Button>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

export default function CdcExportsPage() {
  return (
    <PermissionGuard module="cdc.exports" action="view">
    <ContentLayout title="CDC — Exports">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/cdc">CDC</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Exports</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div>
          <h1 className="text-2xl font-semibold">Export Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate accreditation-ready and custom placement data exports. All downloads are
            archived in CDC-Docs storage for audit purposes.
          </p>
        </div>

        <Separator />

        <NaacSection />
        <AicteSection />
        <FlexSection />
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
