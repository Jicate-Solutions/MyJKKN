'use client';

import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  type CorrelationLevel,
  type CourseMappingRow,
  type PoPsoScopeKey,
  useBosPoPsoCourseMappings,
  useSaveCourseMappings,
} from '@/hooks/bos/use-bos-po-pso';

interface CourseMappingMatrixProps {
  scopeKey: PoPsoScopeKey;
  poCodes: string[];
  psoCodes: string[];
  /** CAS notates correlation as L/M/H; engineering as 1/2/3. */
  isCAS: boolean;
}

type Levels = Record<string, CorrelationLevel>;
type EditState = Record<string, { po_levels: Levels; pso_levels: Levels }>;

const LETTER: Record<CorrelationLevel, string> = { 0: '', 1: 'L', 2: 'M', 3: 'H' };

function cycle(level: CorrelationLevel): CorrelationLevel {
  return ((level + 1) % 4) as CorrelationLevel;
}

function cellClass(level: CorrelationLevel): string {
  switch (level) {
    case 3: return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100';
    case 2: return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
    case 1: return 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100';
    default: return 'text-muted-foreground';
  }
}

/**
 * Course × PO/PSO matrix (HOD mapping entry). Columns are the ACTIVE PO and
 * PSO codes of the selected programme + regulation — the same rows the PO
 * and PSO tabs maintain, so the header never drifts from the master.
 *
 * A course without an explicit row shows the level DERIVED from its latest
 * syllabus CO-PO matrix ("from syllabus"). Clicking a cell cycles
 * blank → 1 → 2 → 3 (shown as L/M/H for CAS); Save upserts the edited rows.
 */
export function CourseMappingMatrix({ scopeKey, poCodes, psoCodes, isCAS }: CourseMappingMatrixProps) {
  const query = useBosPoPsoCourseMappings(scopeKey);
  const save = useSaveCourseMappings(scopeKey);
  // Pending edits live only for this scope: the parent remounts the
  // workspace (React `key`) whenever institution/programme/regulation change.
  const [edits, setEdits] = useState<EditState>({});

  const courses = useMemo(() => query.data?.courses ?? [], [query.data]);
  const canEdit = query.data?.can_edit ?? false;
  const dirtyCount = Object.keys(edits).length;

  const levelsFor = (row: CourseMappingRow) => edits[row.course_code] ?? { po_levels: row.po_levels, pso_levels: row.pso_levels };

  const render = (level: CorrelationLevel) =>
    level === 0 ? '–' : isCAS ? LETTER[level] : String(level);

  const onCell = (row: CourseMappingRow, group: 'po_levels' | 'pso_levels', code: string) => {
    if (!canEdit) return;
    const current = levelsFor(row);
    const next = cycle(current[group][code] ?? 0);
    const updated = { ...current[group] };
    if (next === 0) delete updated[code]; else updated[code] = next;
    setEdits((prev) => ({
      ...prev,
      [row.course_code]: { ...current, [group]: updated },
    }));
  };

  const handleSave = async () => {
    const rows = courses
      .filter((c) => edits[c.course_code])
      .map((c) => ({
        course_code: c.course_code,
        course_name: c.course_name,
        course_id: c.course_id,
        po_levels: edits[c.course_code].po_levels,
        pso_levels: edits[c.course_code].pso_levels,
      }));
    if (rows.length === 0) return;
    try {
      await save.mutateAsync(rows);
      toast.success(`Mapping saved for ${rows.length} course${rows.length !== 1 ? 's' : ''}`);
      setEdits({});
    } catch { /* toasted in onError */ }
  };

  if (query.isLoading) {
    return (
      <div className='space-y-2'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-40 w-full' />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className='text-sm text-destructive py-4'>
        {query.error instanceof Error ? query.error.message : 'Failed to load course mapping'}
      </p>
    );
  }

  if (poCodes.length === 0 && psoCodes.length === 0) {
    return (
      <div className='text-center py-10 border rounded-md border-dashed'>
        <p className='text-sm text-muted-foreground'>
          Add POs / PSOs in the tabs above first — the mapping columns come from those active outcomes.
        </p>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className='text-center py-10 border rounded-md border-dashed'>
        <p className='text-sm text-muted-foreground'>
          No courses found for this programme and regulation. Courses appear here once a learning pathway exists under a board governing this programme.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-2 flex-wrap'>
        <div className='flex items-center gap-2 flex-wrap text-xs text-muted-foreground'>
          <span>Click a cell to set the correlation:</span>
          {([1, 2, 3] as CorrelationLevel[]).map((l) => (
            <span key={l} className={cn('rounded px-1.5 py-0.5 font-medium', cellClass(l))}>
              {render(l)} = {l === 1 ? 'Low' : l === 2 ? 'Medium' : 'High'}
            </span>
          ))}
          <span>· blank = no correlation</span>
        </div>
        {canEdit && (
          <div className='flex items-center gap-2'>
            {dirtyCount > 0 && (
              <Button variant='ghost' size='sm' onClick={() => setEdits({})} disabled={save.isPending}>
                <RotateCcw className='h-3.5 w-3.5 mr-1' />
                Discard
              </Button>
            )}
            <Button size='sm' onClick={handleSave} disabled={save.isPending || dirtyCount === 0}>
              {save.isPending ? <Loader2 className='h-3 w-3 mr-1 animate-spin' /> : <Save className='h-3 w-3 mr-1' />}
              Save Mapping{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
            </Button>
          </div>
        )}
      </div>

      <div className='rounded-md border overflow-x-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='min-w-[110px] sticky left-0 bg-background z-10'>Course Code</TableHead>
              <TableHead className='min-w-[200px]'>Course Name</TableHead>
              {poCodes.map((c) => (
                <TableHead key={c} className='text-center px-1 min-w-[48px]'>{c}</TableHead>
              ))}
              {psoCodes.map((c) => (
                <TableHead key={c} className='text-center px-1 min-w-[52px] border-l'>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map((row) => {
              const lv = levelsFor(row);
              const dirty = !!edits[row.course_code];
              return (
                <TableRow key={row.course_code} className={dirty ? 'bg-primary/5' : undefined}>
                  <TableCell className='sticky left-0 bg-background z-10'>
                    <span className='font-mono text-xs'>{row.course_code}</span>
                  </TableCell>
                  <TableCell className='text-sm'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span>{row.course_name || <span className='text-muted-foreground italic'>—</span>}</span>
                      {row.semester != null && (
                        <Badge variant='outline' className='text-[10px]'>Sem {row.semester}</Badge>
                      )}
                      {row.source === 'syllabus' && !dirty && (
                        <Badge variant='secondary' className='text-[10px]'>from learning pathway</Badge>
                      )}
                      {dirty && <Badge className='text-[10px]'>edited</Badge>}
                    </div>
                  </TableCell>
                  {poCodes.map((c) => {
                    const level = lv.po_levels[c] ?? 0;
                    return (
                      <TableCell key={c} className='p-0 text-center'>
                        <button
                          type='button'
                          disabled={!canEdit}
                          onClick={() => onCell(row, 'po_levels', c)}
                          className={cn(
                            'w-full h-10 text-sm font-medium transition-colors',
                            canEdit && 'hover:ring-1 hover:ring-primary/40 cursor-pointer',
                            cellClass(level)
                          )}
                          aria-label={`${row.course_code} ${c} ${render(level) || 'none'}`}
                        >
                          {render(level)}
                        </button>
                      </TableCell>
                    );
                  })}
                  {psoCodes.map((c) => {
                    const level = lv.pso_levels[c] ?? 0;
                    return (
                      <TableCell key={c} className='p-0 text-center border-l'>
                        <button
                          type='button'
                          disabled={!canEdit}
                          onClick={() => onCell(row, 'pso_levels', c)}
                          className={cn(
                            'w-full h-10 text-sm font-medium transition-colors',
                            canEdit && 'hover:ring-1 hover:ring-primary/40 cursor-pointer',
                            cellClass(level)
                          )}
                          aria-label={`${row.course_code} ${c} ${render(level) || 'none'}`}
                        >
                          {render(level)}
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
