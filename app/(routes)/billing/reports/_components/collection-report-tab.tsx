'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Download,
  TrendingUp,
  ReceiptIndianRupee,
  Search,
  Wallet,
  X
} from 'lucide-react';
import {
  useCollectionFullSet,
  useReportExport
} from '@/hooks/billing/use-billing-reports';
import { REPORT_PAGE_SIZE } from '@/lib/services/billing/reports/report-filter-params';
import { ReportPagination } from './report-pagination';
import type {
  BillingReportFilters,
  CollectionReport
} from '@/types/billing-schedule';

interface CollectionReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

const ALL_MODES = '_all_';

/** Known billing_receipts.payment_mode values. `combined` is real and carries
 *  serious money (14 receipts, ~₹1.32 crore), so it must not fall through to a
 *  default — it previously rendered as a green "Cash" badge. */
const PAYMENT_MODE_META: Record<string, { label: string; className: string }> = {
  cash: { label: 'Cash', className: 'bg-green-100 text-green-800' },
  online: { label: 'Online', className: 'bg-blue-100 text-blue-800' },
  bank_transfer: { label: 'Bank Transfer', className: 'bg-purple-100 text-purple-800' },
  dd: { label: 'DD', className: 'bg-orange-100 text-orange-800' },
  cheque: { label: 'Cheque', className: 'bg-gray-100 text-gray-800' },
  combined: { label: 'Combined', className: 'bg-amber-100 text-amber-800' }
};

/** Any mode not in the map keeps its raw value and a neutral style, so an
 *  unrecognised mode reads as unknown rather than being mislabelled. */
function modeMeta(mode: string | null | undefined) {
  if (!mode) return { label: 'Not Recorded', className: 'bg-muted text-muted-foreground' };
  return (
    PAYMENT_MODE_META[mode] ?? {
      label: mode.replace(/_/g, ' '),
      className: 'bg-muted text-muted-foreground'
    }
  );
}

export function CollectionReportTab({
  filters,
  canExport
}: CollectionReportTabProps) {
  // Whole filtered set, so the totals below and the search cover every matching
  // receipt rather than one page. Institution / academic year / date come from
  // the shared filter panel above and are applied server-side by the RPC.
  const { rows, truncated, loading, error, refetch } = useCollectionFullSet(filters);
  const { exportReport, loading: exportLoading } = useReportExport();

  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<string>(ALL_MODES);
  const [page, setPage] = useState(1);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-IN');

  // Search first: the payment-mode cards reflect the search but NOT the mode
  // selector, so picking a mode narrows the table while the breakdown above it
  // still shows how that money splits across every mode.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
      return (
        name.includes(q) ||
        (r.receipt_number || '').toLowerCase().includes(q) ||
        (r.roll_number || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  /** Per-mode net totals, descending by amount. Derived from the data rather
   *  than a hardcoded list, so a mode nobody anticipated still shows up. */
  const modeTotals = useMemo(() => {
    const totals = new Map<string, { count: number; net: number; gross: number }>();
    for (const r of searched) {
      const key = r.payment_mode || '';
      const bucket = totals.get(key) ?? { count: 0, net: 0, gross: 0 };
      bucket.count += 1;
      bucket.net += r.net_amount || 0;
      bucket.gross += r.payment_amount || 0;
      totals.set(key, bucket);
    }
    return Array.from(totals.entries())
      .map(([key, v]) => ({ mode: key, ...v }))
      .sort((a, b) => b.net - a.net);
  }, [searched]);

  const visible = useMemo(
    () => (mode === ALL_MODES ? searched : searched.filter((r) => (r.payment_mode || '') === mode)),
    [searched, mode]
  );

  const totals = useMemo(
    () => ({
      net: visible.reduce((s, r) => s + (r.net_amount || 0), 0),
      refunds: visible.reduce((s, r) => s + (r.total_refunds || 0), 0)
    }),
    [visible]
  );

  // Clamped rather than reset in an effect: when a filter change shrinks the
  // result set, the old page number can point past the end, which would render
  // an empty table with working pagination controls.
  const pageCount = Math.max(1, Math.ceil(visible.length / REPORT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows: CollectionReport[] = visible.slice(
    (safePage - 1) * REPORT_PAGE_SIZE,
    safePage * REPORT_PAGE_SIZE
  );

  const filtersActive = search.trim() !== '' || mode !== ALL_MODES;

  const handleExport = async () => {
    try {
      await exportReport('collection', filters, {
        format: 'csv',
        include_summary: true,
        include_charts: false
      });
    } catch (err) {
      console.error('Export failed:', err);
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
          <Button variant='outline' onClick={refetch}>
            Try Again
          </Button>
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
              Showing the first 10,000 receipts only — the totals below are
              partial. Narrow the institution or date range for exact figures.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards — now over the whole filtered set, not just one page. */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Transactions</CardTitle>
            <ReceiptIndianRupee className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {visible.length.toLocaleString('en-IN')}
            </div>
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
            <div className='text-2xl font-bold text-green-600'>
              {formatCurrency(totals.net)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Refunds</CardTitle>
            <AlertCircle className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(totals.refunds)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Collection by Payment Mode */}
      {modeTotals.length > 0 && (
        <div>
          <h3 className='text-lg font-medium'>Collection by Payment Mode</h3>
          <p className='text-sm text-muted-foreground mb-3'>
            Net of refunds, across every receipt matching the filters above.
            Independent of the Payment Mode selector below.
          </p>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            {modeTotals.map((m) => {
              const meta = modeMeta(m.mode);
              return (
                <Card key={m.mode || 'not_recorded'}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium capitalize'>
                      {meta.label}
                    </CardTitle>
                    <Wallet className='h-4 w-4 text-muted-foreground' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-green-600'>
                      {formatCurrency(m.net)}
                    </div>
                    <p className='text-xs text-muted-foreground mt-1'>
                      {m.count.toLocaleString('en-IN')}{' '}
                      {m.count === 1 ? 'receipt' : 'receipts'}
                      {totals.net > 0 &&
                        ` · ${((m.net / modeTotals.reduce((s, x) => s + x.net, 0)) * 100).toFixed(1)}%`}
                    </p>
                    {m.gross !== m.net && (
                      <p className='text-xs text-muted-foreground'>
                        {formatCurrency(m.gross)} before refunds
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Collection Report Table */}
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp className='h-5 w-5' />
              Collection Report
            </CardTitle>
            {canExport && (
              <Button
                variant='outline'
                size='sm'
                onClick={handleExport}
                disabled={exportLoading}
              >
                {exportLoading ? (
                  <BeatLoader size={8} color='currentColor' />
                ) : (
                  <>
                    <Download className='h-4 w-4 mr-2' />
                    Export
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Search + payment mode. Both filter the already-fetched set, so
              they apply instantly with no extra request. */}
          <div className='flex flex-col gap-3 pt-4 sm:flex-row sm:items-end'>
            <div className='flex-1 space-y-1.5'>
              <Label htmlFor='collection-search' className='text-xs'>
                Search
              </Label>
              <div className='relative'>
                <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  id='collection-search'
                  placeholder='Learner name, receipt number or roll number'
                  className='pl-8'
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <div className='space-y-1.5 sm:w-56'>
              <Label className='text-xs'>Payment Mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  setMode(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder='All Modes' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MODES}>All Modes</SelectItem>
                  {modeTotals.map((m) => (
                    <SelectItem key={m.mode || 'not_recorded'} value={m.mode}>
                      {modeMeta(m.mode).label} ({m.count})
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
                  setPage(1);
                }}
              >
                <X className='h-4 w-4 mr-1' />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {pageRows.length === 0 ? (
            <div className='text-center py-8'>
              <TrendingUp className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>No Collections</h3>
              <p className='text-muted-foreground'>
                {filtersActive
                  ? 'No receipts match your search or payment mode.'
                  : 'No collections found matching the current filters.'}
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Learner</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Payment Mode</TableHead>
                    <TableHead className='text-right'>Receipt Amount</TableHead>
                    <TableHead className='text-right'>Refunds</TableHead>
                    <TableHead className='text-right'>Net Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((collection) => {
                    const meta = modeMeta(collection.payment_mode);
                    return (
                      <TableRow key={collection.receipt_id}>
                        <TableCell className='font-medium'>
                          #{collection.receipt_number}
                        </TableCell>
                        <TableCell>{formatDate(collection.receipt_date)}</TableCell>
                        <TableCell>
                          <div>
                            <div className='font-medium'>
                              {`${collection.first_name} ${
                                collection.last_name || ''
                              }`.trim()}
                            </div>
                            {collection.roll_number && (
                              <div className='text-sm text-muted-foreground'>
                                {collection.roll_number}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{collection.institution_name}</TableCell>
                        <TableCell>
                          <Badge className={`${meta.className} capitalize`}>
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <span
                            className={`font-semibold ${
                              collection.has_refunds
                                ? 'text-muted-foreground line-through'
                                : 'text-blue-600'
                            }`}
                          >
                            {formatCurrency(collection.payment_amount)}
                          </span>
                        </TableCell>
                        <TableCell className='text-right'>
                          {collection.has_refunds ? (
                            <span className='font-semibold text-red-600'>
                              -{formatCurrency(collection.total_refunds)}
                            </span>
                          ) : (
                            <span className='text-muted-foreground'>-</span>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          <span
                            className={`font-semibold ${
                              collection.has_refunds
                                ? 'text-green-600'
                                : 'text-blue-600'
                            }`}
                          >
                            {formatCurrency(collection.net_amount)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <ReportPagination
            page={safePage}
            pageSize={REPORT_PAGE_SIZE}
            totalCount={visible.length}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
