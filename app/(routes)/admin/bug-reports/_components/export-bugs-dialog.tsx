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

interface SubModule {
  name: string;
  count: number;
}

interface ModuleEntry {
  name: string;
  count: number;
  subModules: SubModule[];
}

interface ExportBugsDialogProps {
  modules: ModuleEntry[];
}

function formatSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function ExportBugsDialog({ modules }: ExportBugsDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedSubModule, setSelectedSubModule] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [includeConsoleLogs, setIncludeConsoleLogs] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const activeModule = modules.find((m) => m.name === selectedModule);
  const subModules = activeModule?.subModules ?? [];

  const handleModuleChange = (value: string) => {
    setSelectedModule(value);
    setSelectedSubModule('all'); // reset sub-module when module changes
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const payload: Record<string, unknown> = {
        include_console_logs: includeConsoleLogs
      };
      if (selectedModule !== 'all') payload.module_name = selectedModule;
      if (selectedSubModule !== 'all') payload.sub_module_name = selectedSubModule;
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

  // Compute preview count based on selections
  const totalCount = (() => {
    if (selectedModule === 'all') {
      return modules.reduce((sum, m) => sum + m.count, 0);
    }
    if (selectedSubModule === 'all') {
      return activeModule?.count ?? 0;
    }
    return subModules.find((s) => s.name === selectedSubModule)?.count ?? 0;
  })();

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
          {/* Module selector */}
          <div className='space-y-2'>
            <Label>Module</Label>
            <Select value={selectedModule} onValueChange={handleModuleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  All Modules ({modules.reduce((s, m) => s + m.count, 0)} bugs)
                </SelectItem>
                {modules.map((mod) => (
                  <SelectItem key={mod.name} value={mod.name}>
                    {formatSlug(mod.name)} ({mod.count} bugs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-module selector — only shown when a module with sub-modules is selected */}
          {selectedModule !== 'all' && subModules.length > 0 && (
            <div className='space-y-2'>
              <Label>Sub-module</Label>
              <Select value={selectedSubModule} onValueChange={setSelectedSubModule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>
                    All Sub-modules ({activeModule?.count ?? 0} bugs)
                  </SelectItem>
                  {subModules.map((sub) => (
                    <SelectItem key={sub.name} value={sub.name}>
                      {formatSlug(sub.name)} ({sub.count} bugs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status filter */}
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
              Will export <strong>{totalCount}</strong> bug report
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
