'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCategorySyncPreview,
  useSyncLearnerCategories,
} from '@/hooks/campus-living/use-program-eligibility';
import type { CategorySyncPreviewRow } from '@/types/program-eligibility';

const REASON_LABEL: Record<CategorySyncPreviewRow['reason'], string> = {
  band_match: 'Fee band matched',
  classic_default_fee_unknown: 'Classic default — no usable academic fee',
  classic_default_no_band: 'Classic default — no band covers fee',
  no_academic_bill: 'Skipped — no academic bill',
};

const REASON_BADGE: Record<CategorySyncPreviewRow['reason'], string> = {
  band_match: 'border-emerald-400 text-emerald-700 dark:text-emerald-400',
  classic_default_fee_unknown: 'border-amber-400 text-amber-700 dark:text-amber-400',
  classic_default_no_band: 'border-amber-400 text-amber-700 dark:text-amber-400',
  no_academic_bill: 'text-muted-foreground',
};

const inr = (n: number | null) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

// Radix Select forbids an empty-string item value, so "All" uses a sentinel.
const ALL = '__all__';

function ToolbarSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className='h-9 w-full sm:w-[180px]'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Distinct, sorted values present in the loaded preview rows.
const distinct = (
  rows: CategorySyncPreviewRow[],
  pick: (r: CategorySyncPreviewRow) => string | null
) =>
  Array.from(new Set(rows.map(pick).filter((v): v is string => !!v))).sort(
    (a, b) => a.localeCompare(b)
  );

function Transition({ from, to }: { from: string | null; to: string | null }) {
  if ((from ?? null) === (to ?? null)) {
    return <span className='text-sm'>{to ?? '—'}</span>;
  }
  return (
    <span className='flex items-center gap-1 text-sm'>
      <span className='text-muted-foreground line-through'>{from ?? '—'}</span>
      <ArrowRight className='h-3 w-3 shrink-0 text-muted-foreground' />
      <span className='font-medium'>{to ?? '—'}</span>
    </span>
  );
}

/**
 * Fee-condition sync with a mandatory dry-run preview: opening the dialog
 * evaluates every active hostel learner against the Category Eligibility
 * conditions (fn_preview_hostel_fee_categories — read-only) and shows the
 * matched condition + proposed room/mess categories. The final "Sync now"
 * button then runs the real write-back (fn_apply_hostel_fee_categories_bulk).
 */
export function SyncCategoriesButton() {
  const { isSuperAdmin, can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [search, setSearch] = useState('');
  const [institution, setInstitution] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [semester, setSemester] = useState(ALL);
  const preview = useCategorySyncPreview(open);
  const sync = useSyncLearnerCategories();

  const institutionOptions = useMemo(
    () => distinct(preview.rows, (r) => r.institution_name),
    [preview.rows]
  );
  const programOptions = useMemo(
    () => distinct(preview.rows, (r) => r.program_name),
    [preview.rows]
  );
  const semesterOptions = useMemo(
    () => distinct(preview.rows, (r) => r.semester_name),
    [preview.rows]
  );

  const resetFilters = () => {
    setOnlyChanges(false);
    setSearch('');
    setInstitution(ALL);
    setProgram(ALL);
    setSemester(ALL);
  };

  const stats = useMemo(() => {
    const s = { changes: 0, band: 0, classic: 0, skipped: 0 };
    for (const r of preview.rows) {
      if (r.will_change) s.changes++;
      if (r.reason === 'band_match') s.band++;
      else if (r.reason === 'no_academic_bill') s.skipped++;
      else s.classic++;
    }
    return s;
  }, [preview.rows]);

  // Changed rows first so the operator sees the effect without scrolling.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = preview.rows.filter((r) => {
      if (onlyChanges && !r.will_change) return false;
      if (institution !== ALL && r.institution_name !== institution) return false;
      if (program !== ALL && r.program_name !== program) return false;
      if (semester !== ALL && r.semester_name !== semester) return false;
      if (q) {
        const hay = [r.learner_name, r.roll_number, r.program_name, r.quota_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...rows].sort((a, b) => Number(b.will_change) - Number(a.will_change));
  }, [preview.rows, onlyChanges, search, institution, program, semester]);

  const filtering =
    search.trim() !== '' || institution !== ALL || program !== ALL || semester !== ALL;

  // Mirror the RPC's own campus_living.settings.edit gate so the button only
  // shows for users who can actually run it.
  if (!isSuperAdmin && !can('campus_living.settings.edit')) return null;

  const handleSync = async () => {
    if (sync.isPending) return; // guard the mutateAsync/commit race (double-click)
    try {
      const { scanned, updated } = await sync.mutateAsync(null);
      toast.success(
        `Synced fee-condition categories — updated ${updated} of ${scanned} bill student${
          scanned === 1 ? '' : 's'
        }.`
      );
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to sync learner categories.'
      );
    }
  };

  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        <RefreshCw className='h-4 w-4 mr-2' />
        Sync to Learner Profiles
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetFilters(); }}>
        <DialogContent className='w-[95vw] max-w-[95vw] sm:max-w-[980px] max-h-[90vh] flex flex-col'>
          <DialogHeader>
            <DialogTitle>Preview: apply fee conditions to learner profiles</DialogTitle>
            <DialogDescription>
              Every active hosteler is evaluated against the Category Eligibility
              conditions below — nothing is written until you press Sync now.
              Allocated learners keep their assigned room&apos;s category; existing
              values are overwritten when the condition changes, never wiped.
            </DialogDescription>
          </DialogHeader>

          {preview.loading ? (
            <div className='flex items-center justify-center py-16 text-muted-foreground'>
              <Loader2 className='h-5 w-5 mr-2 animate-spin' /> Evaluating conditions for all hostel learners…
            </div>
          ) : preview.error ? (
            <div className='py-12 text-center text-sm text-destructive'>{preview.error}</div>
          ) : (
            <>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
                <div className='relative flex-1 sm:max-w-[240px]'>
                  <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder='Search learner, roll no…'
                    className='h-9 pl-8'
                  />
                </div>
                <ToolbarSelect
                  placeholder='All institutions'
                  value={institution}
                  options={institutionOptions}
                  onChange={setInstitution}
                />
                <ToolbarSelect
                  placeholder='All programs'
                  value={program}
                  options={programOptions}
                  onChange={setProgram}
                />
                <ToolbarSelect
                  placeholder='All semesters'
                  value={semester}
                  options={semesterOptions}
                  onChange={setSemester}
                />
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant={stats.changes > 0 ? 'default' : 'secondary'}>
                  {stats.changes} will change
                </Badge>
                <Badge variant='outline' className='border-emerald-400 text-emerald-700 dark:text-emerald-400'>
                  {stats.band} fee band matched
                </Badge>
                <Badge variant='outline' className='border-amber-400 text-amber-700 dark:text-amber-400'>
                  {stats.classic} Classic default
                </Badge>
                <Badge variant='outline' className='text-muted-foreground'>
                  {stats.skipped} skipped (no academic bill)
                </Badge>
                {(filtering || onlyChanges) && (
                  <span className='text-xs text-muted-foreground'>
                    Showing {visibleRows.length} of {preview.rows.length} learners
                  </span>
                )}
                <label className='ml-auto flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={onlyChanges}
                    onCheckedChange={(v) => setOnlyChanges(v === true)}
                  />
                  Only show changes
                </label>
              </div>

              <div className='flex-1 min-h-0 overflow-y-auto rounded-md border'>
                <Table>
                  <TableHeader className='sticky top-0 bg-background z-10'>
                    <TableRow>
                      <TableHead>Learner</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Quota</TableHead>
                      <TableHead className='text-right'>Admission-year fee</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Room Category</TableHead>
                      <TableHead>Mess Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className='h-24 text-center text-muted-foreground'>
                          {onlyChanges || filtering
                            ? 'No learners match the current search / filters.'
                            : 'No active hostel learners found.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleRows.map((r) => (
                        <TableRow key={r.learner_id} className={r.will_change ? 'bg-primary/5' : ''}>
                          <TableCell>
                            <span className='font-medium'>{r.learner_name ?? '—'}</span>
                            {r.roll_number && (
                              <span className='block text-xs text-muted-foreground'>{r.roll_number}</span>
                            )}
                          </TableCell>
                          <TableCell className='text-sm'>{r.program_name ?? '—'}</TableCell>
                          <TableCell className='text-sm'>{r.semester_name ?? '—'}</TableCell>
                          <TableCell className='text-sm'>{r.quota_name ?? 'Any'}</TableCell>
                          <TableCell className='text-right text-sm tabular-nums'>
                            {inr(r.band_fee)}
                            {r.band_academic_year_name && (
                              <span className='block text-xs font-normal text-muted-foreground'>
                                {r.band_academic_year_name}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant='outline' className={`font-normal ${REASON_BADGE[r.reason]}`}>
                              {REASON_LABEL[r.reason]}
                            </Badge>
                            {r.is_allocated && (
                              <span className='block text-xs text-muted-foreground mt-0.5'>
                                Allocated — room locked
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Transition from={r.current_room} to={r.new_room} />
                          </TableCell>
                          <TableCell>
                            <Transition from={r.current_mess} to={r.new_mess} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)} disabled={sync.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSync}
              disabled={preview.loading || !!preview.error || sync.isPending || stats.changes === 0}
            >
              {sync.isPending && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
              {stats.changes === 0 && !preview.loading
                ? 'Nothing to sync'
                : `Sync now (${stats.changes} change${stats.changes === 1 ? '' : 's'})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
