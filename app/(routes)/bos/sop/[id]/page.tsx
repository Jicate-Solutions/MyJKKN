'use client';

// app/(routes)/bos/sop/[id]/page.tsx
//
// Read-only document view. Renders the Tiptap content through the shared
// SopEditor in readOnly mode. Provides export, print, and open-editor buttons.

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit2, Download, Printer, MessageSquare, History } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useBosSopDocument } from '@/hooks/bos/use-bos-sop';
import {
  SOP_CATEGORY_LABELS, SOP_LANGUAGE_LABELS, SOP_STATUS_LABELS,
  type SopDocContent,
} from '@/types/bos-sop';

import { SopEditor } from '../_components/sop-editor';
import { SopCommentsPanel } from '../_components/sop-comments-panel';
import { SopVersionHistory } from '../_components/sop-version-history';
import { downloadSopExport } from '@/lib/sop/download';
import { toast } from 'react-hot-toast';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  review: 'outline',
  approved: 'default',
  archived: 'destructive',
};

export default function ViewSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: doc, isLoading, error } = useBosSopDocument(id);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const initialContent = useMemo<SopDocContent>(
    () => doc?.content ?? { type: 'doc', content: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc?.id],
  );

  const handleExport = async (format: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt') => {
    if (!doc) return;
    try {
      await downloadSopExport(doc.id, doc.title, format);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${format.toUpperCase()} export failed`);
    }
  };

  const handlePrint = () => handleExport('pdf');

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-8 w-40' />
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-[600px] w-full' />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className='py-16 text-center text-sm text-muted-foreground'>
        SOP document not found or you don&apos;t have access.
        <div className='mt-4'>
          <Button onClick={() => router.push('/bos/sop')}>Back to list</Button>
        </div>
      </div>
    );
  }

  const updatedAt = new Date(doc.updated_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className='space-y-4'>
      {/* ── Action bar ───────────────────────────────────────────────── */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.push('/bos/sop')}
          className='gap-1 self-start'
        >
          <ArrowLeft className='h-4 w-4' /> Back to SOP list
        </Button>

        <div className='flex items-center gap-2 flex-wrap'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setHistoryOpen(true)}
          >
            <History className='h-4 w-4 mr-1' />
            History (v{doc.current_version})
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setCommentsOpen(true)}
          >
            <MessageSquare className='h-4 w-4 mr-1' />
            Comments
          </Button>
          <Button size='sm' variant='outline' onClick={handlePrint}>
            <Printer className='h-4 w-4 mr-1' /> Print / PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='sm' variant='outline'>
                <Download className='h-4 w-4 mr-1' /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => handleExport('docx')}>Word (.doc)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('html')}>HTML</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('markdown')}>Markdown</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('txt')}>Plain text</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size='sm' onClick={() => router.push(`/bos/sop/${id}/edit`)}>
            <Edit2 className='h-4 w-4 mr-1' /> Edit
          </Button>
        </div>
      </div>

      {/* ── Document header ──────────────────────────────────────────── */}
      <div className='rounded-lg border bg-card p-4 space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-xl font-semibold flex-1 min-w-0'>{doc.title}</h1>
          <Badge variant={STATUS_VARIANT[doc.status] ?? 'secondary'}>
            {SOP_STATUS_LABELS[doc.status] ?? doc.status}
          </Badge>
        </div>
        {doc.description && (
          <p className='text-sm text-muted-foreground'>{doc.description}</p>
        )}
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
          <span>Category: <strong>{SOP_CATEGORY_LABELS[doc.category] ?? doc.category}</strong></span>
          <span>Language: <strong>{SOP_LANGUAGE_LABELS[doc.language] ?? doc.language}</strong></span>
          <span>Version: <strong>v{doc.current_version}</strong></span>
          <span>Updated: <strong>{updatedAt}</strong></span>
        </div>
      </div>

      {/* ── Read-only editor canvas ───────────────────────────────────── */}
      <SopEditor
        key={doc.id}
        initialContent={initialContent}
        readOnly
      />

      {/* ── Side panels ──────────────────────────────────────────────── */}
      <SopCommentsPanel
        documentId={doc.id}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />
      <SopVersionHistory
        documentId={doc.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
