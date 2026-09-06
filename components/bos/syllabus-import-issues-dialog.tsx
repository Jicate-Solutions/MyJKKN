'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';

export interface ImportWarning {
  section: string;
  row?: number;
  message: string;
}

export interface ImportSummaryCounts {
  objectives?: number;
  clos?: number;
  units?: number;
  practical_topics?: number;
  textbooks?: number;
  references?: number;
  web_resources?: number;
  pedagogy?: number;
  po_mapping_rows?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: ImportWarning[];
  summary?: ImportSummaryCounts;
}

const SECTION_LABELS: Array<[keyof ImportSummaryCounts, string]> = [
  ['objectives', 'Objectives'],
  ['clos', 'COs'],
  ['units', 'Units'],
  ['practical_topics', 'Practical Topics'],
  ['textbooks', 'Textbooks'],
  ['references', 'References'],
  ['web_resources', 'Web Resources'],
  ['pedagogy', 'Pedagogy'],
  ['po_mapping_rows', 'PO Mapping'],
];

export function SyllabusImportIssuesDialog({
  open,
  onOpenChange,
  warnings,
  summary = {},
}: Props) {
  const bySection = new Map<string, ImportWarning[]>();
  for (const w of warnings) {
    const list = bySection.get(w.section) ?? [];
    list.push(w);
    bySection.set(w.section, list);
  }

  const filledSections = SECTION_LABELS.filter(([key]) => (summary[key] ?? 0) > 0);
  const totalRowsImported = SECTION_LABELS.reduce(
    (sum, [key]) => sum + (summary[key] ?? 0),
    0,
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className='max-w-3xl max-h-[85vh] overflow-y-auto'>
        <AlertDialogHeader>
          <div className='flex items-center gap-3'>
            <div className='h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center shrink-0'>
              <AlertTriangle className='h-5 w-5 text-amber-600 dark:text-amber-400' />
            </div>
            <div>
              <AlertDialogTitle className='text-xl font-bold'>
                Import Issues
              </AlertDialogTitle>
              <AlertDialogDescription className='text-sm text-muted-foreground mt-1'>
                {warnings.length === 0
                  ? 'Import completed cleanly.'
                  : `${warnings.length} issue${warnings.length === 1 ? '' : 's'} found. Successfully parsed data has already been loaded into the form — review and save, or correct your file and re-import.`}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className='space-y-4'>
          <div className='grid grid-cols-3 gap-3'>
            <div className='bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3'>
              <div className='text-xs text-green-600 dark:text-green-400 font-medium mb-1'>Rows imported</div>
              <div className='text-2xl font-bold text-green-700 dark:text-green-300'>{totalRowsImported}</div>
            </div>
            <div className='bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3'>
              <div className='text-xs text-blue-600 dark:text-blue-400 font-medium mb-1'>Sections filled</div>
              <div className='text-2xl font-bold text-blue-700 dark:text-blue-300'>{filledSections.length}</div>
            </div>
            <div className='bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3'>
              <div className='text-xs text-amber-600 dark:text-amber-400 font-medium mb-1'>Issues</div>
              <div className='text-2xl font-bold text-amber-700 dark:text-amber-300'>{warnings.length}</div>
            </div>
          </div>

          <div className='border rounded-lg p-3'>
            <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2'>Section status</h4>
            <div className='flex flex-wrap gap-2'>
              {SECTION_LABELS.map(([key, label]) => {
                const count = summary[key] ?? 0;
                const ok = count > 0;
                return (
                  <Badge
                    key={key}
                    variant='outline'
                    className={
                      ok
                        ? 'bg-green-50 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-200'
                        : 'bg-muted/60 text-muted-foreground'
                    }
                  >
                    {ok ? <CheckCircle2 className='h-3 w-3 mr-1' /> : <XCircle className='h-3 w-3 mr-1' />}
                    {label}
                    {ok && <span className='ml-1 font-mono'>({count})</span>}
                  </Badge>
                );
              })}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className='space-y-3'>
              <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Details</h4>
              {Array.from(bySection.entries()).map(([section, list]) => (
                <div
                  key={section}
                  className='border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-900/5'
                >
                  <div className='flex items-center gap-2 mb-2'>
                    <Badge variant='outline' className='text-xs bg-amber-100 text-amber-800 border-amber-300'>
                      {section}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>
                      {list.length} issue{list.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className='space-y-1'>
                    {list.map((w, i) => (
                      <li
                        key={`${section}-${i}`}
                        className='flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200'
                      >
                        <AlertTriangle className='h-3 w-3 mt-0.5 flex-shrink-0' />
                        <span>
                          {w.row != null && (
                            <span className='font-mono text-xs mr-1 text-muted-foreground'>
                              Row {w.row}:
                            </span>
                          )}
                          {w.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className='bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
              <h4 className='font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1'>Common fixes:</h4>
              <ul className='text-xs text-blue-700 dark:text-blue-300 space-y-1'>
                <li>• Each row in Objectives / COs needs a non-empty Description.</li>
                <li>• Each row in Units needs a Unit value (I, II, III, …).</li>
                <li>• PO Mapping rows need a CO column like "CO1", "CO2", etc.</li>
                <li>• Sheet names must match: Objectives, COs, Units, Textbooks, References, WebResources, Pedagogy, PO_Mapping.</li>
              </ul>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <Button onClick={() => onOpenChange(false)} className='bg-green-600 hover:bg-green-700'>
            Continue to form
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}