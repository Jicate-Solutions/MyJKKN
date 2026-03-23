'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ExportBugsDialogProps {
  modules: { name: string; count: number }[];
}

export function ExportBugsDialog({ modules }: ExportBugsDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [includeConsoleLogs, setIncludeConsoleLogs] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const payload: Record<string, unknown> = {
        include_console_logs: includeConsoleLogs
      };
      if (selectedModule !== 'all') payload.module_name = selectedModule;
      if (selectedStatus !== 'all') payload.status = selectedStatus;

      const response = await fetch('/api/bug-reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error ?? 'Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bug-reports-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Bug reports exported successfully');
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const totalCount =
    selectedModule === 'all'
      ? modules.reduce((sum, m) => sum + m.count, 0)
      : (modules.find((m) => m.name === selectedModule)?.count ?? 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm'>
          <Download className='w-4 h-4 mr-2' />
          Export for AI
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Export Bug Reports</DialogTitle>
          <DialogDescription>
            Download structured markdown files to share with AI agents for
            batch resolution.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label>Module</Label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  All Modules ({modules.reduce((s, m) => s + m.count, 0)} bugs)
                </SelectItem>
                {modules.map((mod) => (
                  <SelectItem key={mod.name} value={mod.name}>
                    {mod.name} ({mod.count} bugs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label>Status Filter</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Statuses</SelectItem>
                <SelectItem value='new'>New</SelectItem>
                <SelectItem value='seen'>Seen</SelectItem>
                <SelectItem value='in_progress'>In Progress</SelectItem>
                <SelectItem value='resolved'>Resolved</SelectItem>
                <SelectItem value='wont_fix'>Won&apos;t Fix</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='flex items-center gap-2'>
            <Checkbox
              id='consoleLogs'
              checked={includeConsoleLogs}
              onCheckedChange={(v) => setIncludeConsoleLogs(!!v)}
            />
            <Label htmlFor='consoleLogs' className='cursor-pointer'>
              Include console logs (larger file size)
            </Label>
          </div>

          {totalCount > 0 && (
            <p className='text-sm text-muted-foreground'>
              Will export{' '}
              <strong>{totalCount}</strong> bug report
              {totalCount !== 1 ? 's' : ''} as a ZIP of markdown files.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || totalCount === 0}
          >
            {isExporting ? (
              <>
                <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                Exporting...
              </>
            ) : (
              <>
                <Download className='w-4 h-4 mr-2' />
                Download ZIP
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
