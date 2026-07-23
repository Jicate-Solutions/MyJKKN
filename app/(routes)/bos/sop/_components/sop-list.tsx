'use client';

// app/(routes)/bos/sop/_components/sop-list.tsx
//
// List view for SOP documents. Filters: status, category, language, full-text
// search on title/description. Each row links to the editor; per-row actions:
// view, edit, duplicate (TODO), delete.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { FileText, Plus, Pencil, Trash2, Eye, Languages } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { useBosSopDocuments, useDeleteBosSopDocument } from '@/hooks/bos/use-bos-sop';
import {
  SOP_CATEGORIES, SOP_CATEGORY_LABELS,
  SOP_LANGUAGES, SOP_LANGUAGE_LABELS,
  SOP_STATUSES, SOP_STATUS_LABELS,
  type SopCategory, type SopLanguage, type SopStatus,
} from '@/types/bos-sop';

const STATUS_VARIANT: Record<SopStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  review: 'secondary',
  approved: 'default',
  archived: 'destructive',
};

export function SopList() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SopStatus | 'all'>('all');
  const [category, setCategory] = useState<SopCategory | 'all'>('all');
  const [language, setLanguage] = useState<SopLanguage | 'all'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useBosSopDocuments({
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    category: category === 'all' ? undefined : category,
    language: language === 'all' ? undefined : language,
    page,
    limit: 20,
    sortBy: 'updated_at',
    sortOrder: 'desc',
  });

  const deleteMutation = useDeleteBosSopDocument();

  const rows = data?.data ?? [];
  const total = data?.metadata.total ?? 0;
  const totalPages = data?.metadata.totalPages ?? 1;

  return (
    <div className='space-y-4'>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center flex-1'>
          <Input
            placeholder='Search title or description…'
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className='sm:max-w-xs'
          />
          <Select value={status} onValueChange={(v) => { setStatus(v as SopStatus | 'all'); setPage(1); }}>
            <SelectTrigger className='sm:w-36'><SelectValue placeholder='Status' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All statuses</SelectItem>
              {SOP_STATUSES.map((s) => <SelectItem key={s} value={s}>{SOP_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => { setCategory(v as SopCategory | 'all'); setPage(1); }}>
            <SelectTrigger className='sm:w-44'><SelectValue placeholder='Category' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All categories</SelectItem>
              {SOP_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{SOP_CATEGORY_LABELS[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={language} onValueChange={(v) => { setLanguage(v as SopLanguage | 'all'); setPage(1); }}>
            <SelectTrigger className='sm:w-40'><SelectValue placeholder='Language' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All languages</SelectItem>
              {SOP_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{SOP_LANGUAGE_LABELS[l]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => router.push('/bos/sop/new')}>
          <Plus className='h-4 w-4 mr-1' /> New SOP
        </Button>
      </div>

      {/* ── List ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className='space-y-2'>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-20 w-full' />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className='py-12 text-center text-sm text-muted-foreground'>
            <FileText className='h-10 w-10 mx-auto mb-3 opacity-50' />
            No SOP documents yet. Click <strong>New SOP</strong> to create one.
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-3'>
          {rows.map((row) => (
            <Card key={row.id} className='hover:shadow-md transition-shadow'>
              <CardContent className='p-4 flex items-center gap-3'>
                <FileText className='h-5 w-5 text-muted-foreground shrink-0' />
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <h3 className='font-medium truncate'>{row.title}</h3>
                    <Badge variant={STATUS_VARIANT[row.status]} className='text-[10px]'>
                      {SOP_STATUS_LABELS[row.status]}
                    </Badge>
                    <Badge variant='outline' className='text-[10px]'>
                      {SOP_CATEGORY_LABELS[row.category]}
                    </Badge>
                    {row.language !== 'en' && (
                      <Badge variant='secondary' className='text-[10px]'>
                        <Languages className='h-3 w-3 mr-1' />
                        {SOP_LANGUAGE_LABELS[row.language]}
                      </Badge>
                    )}
                    <span className='text-xs text-muted-foreground'>v{row.current_version}</span>
                  </div>
                  {row.description && (
                    <p className='text-xs text-muted-foreground truncate mt-1'>{row.description}</p>
                  )}
                  <p className='text-[11px] text-muted-foreground mt-1'>
                    Updated {format(new Date(row.updated_at), 'dd MMM yyyy HH:mm')}
                  </p>
                </div>
                <div className='flex items-center gap-1 shrink-0'>
                  <Button variant='ghost' size='sm' onClick={() => router.push(`/bos/sop/${row.id}`)} title='View'>
                    <Eye className='h-4 w-4' />
                  </Button>
                  <Button variant='ghost' size='sm' onClick={() => router.push(`/bos/sop/${row.id}/edit`)} title='Edit'>
                    <Pencil className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive'
                    title='Delete'
                    onClick={() => {
                      if (window.confirm(`Delete "${row.title}"? This cannot be undone.`)) {
                        deleteMutation.mutate(row.id);
                      }
                    }}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>
            Showing {rows.length} of {total} · Page {page} / {totalPages}
          </span>
          <div className='flex gap-1'>
            <Button size='sm' variant='outline' disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size='sm' variant='outline' disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
