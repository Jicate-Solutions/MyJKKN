'use client';

import { useEffect, useState } from 'react';
import { Filter, Download, Loader2, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import {
  BULK_EDIT_STATUS_OPTIONS,
  type BulkEditDownloadFilters
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';
import toast from 'react-hot-toast';

const ALL = '__ALL__';
const UNSPECIFIED = 'unspecified';
const DOWNLOAD_CAP = 5000;

interface Opt { id: string; name: string; }

export function BulkEditFilterPanel({
  onDownloaded
}: {
  onDownloaded: (count: number) => void;
}) {
  const [filters, setFilters] = useState<BulkEditDownloadFilters>({});
  const [institutions, setInstitutions] = useState<Opt[]>([]);
  const [academicYears, setAcademicYears] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Load institutions + categories once.
  useEffect(() => {
    // College-only — bulk edit must never reach school-fee bills.
    OrganizationService.getInstitutionNames(true, undefined, 'institution')
      .then((rows: any[]) => setInstitutions(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => {});
    BillingCategoryService.getActiveBillingCategories()
      .then((rows: any[]) => setCategories(rows.map((r) => ({ id: r.id, name: r.category_name }))))
      .catch(() => {});
  }, []);

  // Load academic years (optionally scoped to the chosen institution).
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    let q = (supabase as any)
      .from('academic_years')
      .select('id, academic_year_name')
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });
    if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);
    q.then(({ data }: any) =>
      setAcademicYears((data ?? []).map((r: any) => ({ id: r.id, name: r.academic_year_name })))
    );
  }, [filters.institution_id]);

  const buildQuery = (): string => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v as string); });
    return qs.toString();
  };

  // Debounced live count.
  useEffect(() => {
    let cancelled = false;
    setCountLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/billing/schedule/bills/bulk-edit/count?${buildQuery()}`, {
          signal: AbortSignal.timeout(30000)
        });
        const data = await res.json();
        if (!cancelled) { setCount(data.count ?? 0); setCountLoading(false); }
      } catch {
        if (!cancelled) { setCount(null); setCountLoading(false); }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.institution_id, filters.item_category_id, filters.status, filters.academic_year_id, filters.due_date_from, filters.due_date_to]);

  const setF = (key: keyof BulkEditDownloadFilters, value: string | undefined) =>
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === 'institution_id') next.academic_year_id = undefined; // AY list is institution-scoped
      return next;
    });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/billing/schedule/bills/bulk-edit/template?${buildQuery()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Download failed');
      }
      const billsCount = parseInt(res.headers.get('X-Bills-Count') || '0', 10);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-bills-bulk-edit-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(billsCount > 0 ? `Downloaded ${billsCount} bill(s).` : 'No bills matched — file is empty.');
      onDownloaded(billsCount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const capped = (count ?? 0) > DOWNLOAD_CAP;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm flex items-center gap-2'>
          <Filter className='h-4 w-4 text-violet-600' /> Filter bills to edit
        </CardTitle>
        <CardDescription className='text-xs'>
          Pick the bills to download. Leave a filter blank to include everything.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <Picker label='Institution' value={filters.institution_id} options={institutions}
            placeholder='All institutions' onChange={(v) => setF('institution_id', v)} />
          <Picker label='Academic Year' value={filters.academic_year_id} options={academicYears}
            placeholder='All years' extra={[{ id: UNSPECIFIED, name: 'Unspecified (no year)' }]}
            onChange={(v) => setF('academic_year_id', v)} />
          <Picker label='Billing Category' value={filters.item_category_id} options={categories}
            placeholder='All categories' onChange={(v) => setF('item_category_id', v)} />
          <div>
            <Label className='text-xs'>Status</Label>
            <Select value={filters.status ?? ALL} onValueChange={(v) => setF('status', v === ALL ? undefined : v)}>
              <SelectTrigger className='mt-1'><SelectValue placeholder='All statuses' /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {BULK_EDIT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className='text-xs'>Due date from</Label>
            <Input className='mt-1' type='date' value={filters.due_date_from ?? ''}
              onChange={(e) => setF('due_date_from', e.target.value || undefined)} />
          </div>
          <div>
            <Label className='text-xs'>Due date to</Label>
            <Input className='mt-1' type='date' value={filters.due_date_to ?? ''}
              onChange={(e) => setF('due_date_to', e.target.value || undefined)} />
          </div>
        </div>

        {/* Live count */}
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
          capped ? 'border-amber-200 bg-amber-50 text-amber-900'
                 : 'border-violet-200 bg-violet-50 text-violet-900'}`}>
          <FileSpreadsheet className='h-3.5 w-3.5 mt-0.5' />
          <div className='flex-1'>
            {countLoading && count === null
              ? <span className='flex items-center gap-1'><Loader2 className='h-3 w-3 animate-spin' /> Counting…</span>
              : count === null
                ? 'Could not count bills.'
                : <p className='font-medium'>{count.toLocaleString('en-IN')} bill{count !== 1 ? 's' : ''} match this filter</p>}
            {capped && <p className='mt-0.5'>⚠ Export caps at {DOWNLOAD_CAP.toLocaleString('en-IN')} rows. Narrow the filter to include all bills.</p>}
          </div>
        </div>

        {count === 0 && (
          <Alert className='py-2'><AlertCircle className='h-4 w-4' />
            <AlertDescription className='text-xs'>No bills match — adjust the filters above.</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleDownload} disabled={downloading || count === 0} className='w-full'>
          {downloading
            ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Building file…</>
            : <><Download className='mr-2 h-4 w-4' /> Download bills to edit</>}
        </Button>
      </CardContent>
    </Card>
  );
}

function Picker({
  label, value, options, placeholder, onChange, extra = []
}: {
  label: string;
  value: string | undefined;
  options: Opt[];
  placeholder: string;
  onChange: (v: string | undefined) => void;
  extra?: Opt[];
}) {
  return (
    <div>
      <Label className='text-xs'>{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger className='mt-1'><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {extra.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
