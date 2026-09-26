'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertCircle,
  CalendarDays,
  Download,
  FileText,
  ReceiptIndianRupee,
  Search,
  TrendingUp,
  Wallet,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCollectionDaywise } from '@/hooks/billing/use-billing-reports';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  buildWorkbookModel,
  daywiseModeLabel,
  groupByDay,
  learnerName,
  summarise,
  transactionDetail
} from '@/lib/services/billing/reports/collection-daywise';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface CollectionReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

const ALL_MODES = '_all_';

const MODE_CLASS: Record<string, string> = {
  cash: 'bg-green-100 text-green-800',
  online: 'bg-blue-100 text-blue-800',
  bank_transfer: 'bg-purple-100 text-purple-800',
  dd: 'bg-orange-100 text-orange-800',
  cheque: 'bg-gray-100 text-gray-800',
  combined: 'bg-amber-100 text-amber-800'
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);

const formatDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

const shortDate = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN') : '';

export function CollectionReportTab({ filters, canExport }: CollectionReportTabProps) {
  const { rows, truncated, loading, error, refetch } = useCollectionDaywise(filters);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<string>(ALL_MODES);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (mode !== ALL_MODES && (r.payment_mode || '') !== mode) return false;
      if (!q) return true;
      return (
        learnerName(r).toLowerCase().includes(q) ||
        (r.receipt_number || '').toLowerCase().includes(q) ||
        (r.roll_number || '').toLowerCase().includes(q) ||
        (r.payment_reference_number || '').toLowerCase().includes(q) ||
        (r.payer_name || '').toLowerCase().includes(q) ||
        (r.categories || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, mode]);

  const sections = useMemo(() => groupByDay(visible), [visible]);
  const summary = useMemo(() => summarise(visible), [visible]);
  // Mode selector options come from the unfiltered set so a mode stays
  // pickable after another one is chosen.
  const allModes = useMemo(() => summarise(rows).byMode, [rows]);

  const filtersActive = search.trim() !== '' || mode !== ALL_MODES;

  const handleExport = async () => {
    if (visible.length === 0) {
      toast.error('Nothing to export for this range.');
      return;
    }
    try {
      setExporting(true);
      const from = filters.date_from || sections[0].date;
      const to = filters.date_to || sections[sections.length - 1].date;
      const rangeLabel = from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
      // Summary + All + one sheet per payment mode present. exceljs is
      // dynamic-imported so the reports page bundle does not carry it.
      const model = buildWorkbookModel(visible, { rangeLabel });
      const { writeCollectionWorkbook, downloadWorkbook } = await import(
        '@/lib/services/billing/reports/collection-excel'
      );
      const buffer = await writeCollectionWorkbook(model);
      downloadWorkbook(buffer, `fee-collection-${from}_to_${to}.xlsx`);
    } catch (err) {
      console.error('Collection export failed:', err);
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // One landscape PDF per mode — Cash and Online as separate files — each
  // with a letterhead section per institution.
  const handleExportPdf = async () => {
    const byMode = (['cash', 'online'] as const)
      .map((m) => ({ mode: m, rows: visible.filter((r) => r.payment_mode === m) }))
      .filter((x) => x.rows.length > 0);
    if (byMode.length === 0) {
      toast.error('No cash or online receipts to export for this range.');
      return;
    }
    try {
      setExportingPdf(true);
      const from = (filters.date_from || sections[0].date).slice(0, 10);
      const to = (filters.date_to || sections[sections.length - 1].date).slice(0, 10);

      const names = Array.from(new Set(visible.map((r) => r.institution_name).filter(Boolean)));
      const supabase = createClientSupabaseClient();
      const { data: insts } = await supabase
        .from('institutions')
        .select(
          'name, logo_url, address_line1, address_line2, address_line3, pin_code, university_affiliation_name, counselling_code'
        )
        .in('name', names);
      const { generateCollectionModePdf } = await import('@/lib/utils/billing/collection-mode-pdf');
      const institutions = new Map((insts ?? []).map((i) => [i.name as string, i]));

      for (const { mode: m, rows: modeRows } of byMode) {
        const doc = await generateCollectionModePdf({
          mode: m,
          rows: modeRows,
          dateFrom: from,
          dateTo: to,
          institutions
        });
        doc.save(`${m}-collection-${from}_to_${to}.pdf`);
      }
    } catch (err) {
      console.error('Collection PDF export failed:', err);
      toast.error('PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className='flex justify-center items-center p-8'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='h-12 w-12 text-destructive mb-4' />
          <h3 className='text-lg font-semibold mb-2'>Error Loading Report</h3>
          <p className='text-muted-foreground text-center max-w-md mb-4'>{error}</p>
          <Button variant='outline' onClick={refetch}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {truncated && (
        <Card className='border-orange-300'>
          <CardContent className='flex items-start gap-3 py-4'>
            <AlertCircle className='h-5 w-5 text-orange-600 shrink-0 mt-0.5' />
            <p className='text-sm'>
              Showing the first 10,000 receipts only — totals are partial.
              Narrow the date range or institution for exact figures.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Range summary */}
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Days</CardTitle>
            <CalendarDays className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{sections.length}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              {filters.date_from && filters.date_to
                ? `${shortDate(filters.date_from)} – ${shortDate(filters.date_to)}`
                : 'All dates'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Receipts</CardTitle>
            <ReceiptIndianRupee className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{summary.count.toLocaleString('en-IN')}</div>
            {filtersActive && (
              <p className='text-xs text-muted-foreground mt-1'>
                of {rows.length.toLocaleString('en-IN')} total
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Net Collected</CardTitle>
            <TrendingUp className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>{formatCurrency(summary.net)}</div>
            {summary.refunds > 0 && (
              <p className='text-xs text-muted-foreground mt-1'>
                {formatCurrency(summary.gross)} before {formatCurrency(summary.refunds)} refunds
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>By Mode</CardTitle>
            <Wallet className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent className='space-y-1'>
            {summary.byMode.length === 0 && (
              <p className='text-sm text-muted-foreground'>—</p>
            )}
            {summary.byMode.map((m) => (
              <div key={m.mode || 'nr'} className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>
                  {daywiseModeLabel(m.mode)} ({m.count})
                </span>
                <span className='font-medium'>{formatCurrency(m.net)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp className='h-5 w-5' />
              Collection Report
            </CardTitle>
            {canExport && (
              <div className='flex gap-2'>
              <Button variant='outline' size='sm' onClick={handleExportPdf} disabled={exportingPdf}>
                {exportingPdf ? (
                  <BeatLoader size={8} color='currentColor' />
                ) : (
                  <>
                    <FileText className='h-4 w-4 mr-2' />
                    Download PDF
                  </>
                )}
              </Button>
              <Button variant='outline' size='sm' onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <BeatLoader size={8} color='currentColor' />
                ) : (
                  <>
                    <Download className='h-4 w-4 mr-2' />
                    Export Excel
                  </>
                )}
              </Button>
              </div>
            )}
          </div>

          <div className='flex flex-col gap-3 pt-4 sm:flex-row sm:items-end'>
            <div className='flex-1 space-y-1.5'>
              <Label htmlFor='daywise-search' className='text-xs'>Search</Label>
              <div className='relative'>
                <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  id='daywise-search'
                  placeholder='Learner, receipt no, roll no, reference, payer or fee category'
                  className='pl-8'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className='space-y-1.5 sm:w-56'>
              <Label className='text-xs'>Payment Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue placeholder='All Modes' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MODES}>All Modes</SelectItem>
                  {allModes.map((m) => (
                    <SelectItem key={m.mode || 'nr'} value={m.mode}>
                      {daywiseModeLabel(m.mode)} ({m.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filtersActive && (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  setSearch('');
                  setMode(ALL_MODES);
                }}
              >
                <X className='h-4 w-4 mr-1' />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className='space-y-8'>
          {sections.length === 0 ? (
            <div className='text-center py-8'>
              <CalendarDays className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>No Collections</h3>
              <p className='text-muted-foreground'>
                {filtersActive
                  ? 'No receipts match your search or payment mode.'
                  : 'No receipts in the selected date range and filters.'}
              </p>
            </div>
          ) : (
            sections.map((day) => (
              <section key={day.date} className='space-y-3'>
                <div className='flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between'>
                  <h3 className='text-base font-semibold'>{formatDate(day.date)}</h3>
                  <p className='text-sm text-muted-foreground'>
                    {day.count} {day.count === 1 ? 'receipt' : 'receipts'} ·{' '}
                    <span className='font-semibold text-green-600'>{formatCurrency(day.net)}</span>
                  </p>
                </div>

                <div className='overflow-x-auto rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt No</TableHead>
                        <TableHead>Learner</TableHead>
                        <TableHead>Program / Sem</TableHead>
                        <TableHead>Fee Category</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Reference / Txn</TableHead>
                        <TableHead>Paid / Credited</TableHead>
                        <TableHead>Payer</TableHead>
                        <TableHead>Collected By</TableHead>
                        <TableHead className='text-right'>Amount</TableHead>
                        <TableHead className='text-right'>Refunds</TableHead>
                        <TableHead className='text-right'>Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {day.rows.map((r) => (
                        <TableRow key={r.receipt_id}>
                          <TableCell className='font-medium whitespace-nowrap'>
                            {r.receipt_number}
                          </TableCell>
                          <TableCell>
                            <div className='font-medium'>{learnerName(r)}</div>
                            {r.roll_number && (
                              <div className='text-xs text-muted-foreground'>{r.roll_number}</div>
                            )}
                            <div className='text-xs text-muted-foreground'>{r.institution_name}</div>
                          </TableCell>
                          <TableCell className='text-sm'>
                            <div>{r.program_name || '—'}</div>
                            {r.semester_name && (
                              <div className='text-xs text-muted-foreground'>{r.semester_name}</div>
                            )}
                          </TableCell>
                          <TableCell className='text-sm max-w-[220px]'>
                            {r.category_breakdown && r.category_breakdown.length > 1 ? (
                              <div className='space-y-0.5'>
                                {r.category_breakdown.map((c) => (
                                  <div key={c.category} className='flex justify-between gap-2'>
                                    <span>{c.category}</span>
                                    <span className='text-muted-foreground whitespace-nowrap'>
                                      {formatCurrency(Number(c.amount) || 0)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              r.categories || <span className='text-muted-foreground'>—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={MODE_CLASS[r.payment_mode] ?? 'bg-muted text-muted-foreground'}>
                              {daywiseModeLabel(r.payment_mode)}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-sm max-w-[220px]'>
                            {transactionDetail(r) || <span className='text-muted-foreground'>—</span>}
                          </TableCell>
                          <TableCell className='text-sm whitespace-nowrap'>
                            <div>{shortDate(r.payment_paid_date) || '—'}</div>
                            {r.date_of_credit && (
                              <div className='text-xs text-muted-foreground'>
                                Credited {shortDate(r.date_of_credit)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className='text-sm'>
                            <div>{r.payer_name || '—'}</div>
                            {r.payer_contact && (
                              <div className='text-xs text-muted-foreground'>{r.payer_contact}</div>
                            )}
                          </TableCell>
                          <TableCell className='text-sm'>
                            {r.collected_by || <span className='text-muted-foreground'>System</span>}
                          </TableCell>
                          <TableCell className='text-right'>
                            <span className={r.has_refunds ? 'text-muted-foreground line-through' : 'font-semibold'}>
                              {formatCurrency(r.payment_amount)}
                            </span>
                          </TableCell>
                          <TableCell className='text-right'>
                            {r.has_refunds ? (
                              <span className='font-semibold text-red-600'>
                                -{formatCurrency(r.total_refunds)}
                              </span>
                            ) : (
                              <span className='text-muted-foreground'>-</span>
                            )}
                          </TableCell>
                          <TableCell className='text-right font-semibold text-green-600'>
                            {formatCurrency(r.net_amount)}
                          </TableCell>
                        </TableRow>
                      ))}

                      {day.byMode.map((m) => (
                        <TableRow key={`${day.date}-${m.mode || 'nr'}`} className='bg-muted/40'>
                          <TableCell colSpan={9} className='text-sm text-right text-muted-foreground'>
                            {daywiseModeLabel(m.mode)} ({m.count})
                          </TableCell>
                          <TableCell className='text-right text-sm'>{formatCurrency(m.gross)}</TableCell>
                          <TableCell className='text-right text-sm'>
                            {m.refunds > 0 ? `-${formatCurrency(m.refunds)}` : '-'}
                          </TableCell>
                          <TableCell className='text-right text-sm font-medium'>{formatCurrency(m.net)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className='bg-muted font-semibold'>
                        <TableCell colSpan={9} className='text-right'>
                          Day Total ({day.count})
                        </TableCell>
                        <TableCell className='text-right'>{formatCurrency(day.gross)}</TableCell>
                        <TableCell className='text-right text-red-600'>
                          {day.refunds > 0 ? `-${formatCurrency(day.refunds)}` : '-'}
                        </TableCell>
                        <TableCell className='text-right text-green-600'>{formatCurrency(day.net)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </section>
            ))
          )}

          {sections.length > 1 && (
            <div className='flex flex-col gap-1 border-t pt-4 sm:flex-row sm:items-baseline sm:justify-between'>
              <span className='font-semibold'>Grand Total ({summary.count} receipts, {sections.length} days)</span>
              <span className='text-lg font-bold text-green-600'>{formatCurrency(summary.net)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
