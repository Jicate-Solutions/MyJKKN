'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAddCdcEnrollment } from '@/hooks/cdc/use-cdc-training';
import {
  useLearnersForPicker,
  useDetailedLearnersForPicker,
  type DetailedLearnerOption,
} from '@/hooks/cdc/use-cdc-pickers';
import type { CdcTrainingEnrollment } from '@/types/cdc/training';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programmeId: string;
  // Current enrollments on the page — used to skip learners already enrolled
  // so the bulk insert never produces duplicate rows.
  existingEnrollments: CdcTrainingEnrollment[];
}

// Picker labels are built server-side as "First Last (REGISTER_NO)".
// Pull the register number out of the trailing parentheses so a pasted
// roll/register number can be matched against it case-insensitively.
function registerNumberFromLabel(label: string): string {
  const match = label.match(/\(([^)]*)\)\s*$/);
  return (match ? match[1] : '').trim().toLowerCase();
}

// Sentinel for the "All" choice in the filter Selects. Radix forbids an
// empty-string SelectItem value (and a CI gate enforces it), so we use a
// non-empty token and treat it as "no filter on this dimension".
const ALL = '__all__';

// Distinct {id, name} options for a dimension, drawn from the loaded learners.
// Skips learners with a null id/name on that dimension; sorted by name.
function distinctDimension(
  learners: DetailedLearnerOption[],
  idKey: 'program_id' | 'department_id' | 'batch_id',
  nameKey: 'program_name' | 'department_name' | 'batch_name',
): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const l of learners) {
    const id = l[idKey];
    const name = l[nameKey];
    if (id && name) map.set(id, name);
  }
  return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function BulkEnrollDialog({ open, onOpenChange, programmeId, existingEnrollments }: Props) {
  const addMutation = useAddCdcEnrollment();
  const [submitting, setSubmitting] = useState(false);

  const alreadyEnrolledIds = useMemo(
    () => new Set(existingEnrollments.map((e) => e.learner_id)),
    [existingEnrollments],
  );

  // Shared enroll executor (used by both tabs). Reuses the single-enroll mutation
  // per learner — its onSuccess refreshes the page list + invalidates queries.
  // Returns counts so each caller can compose its own summary toast.
  async function bulkEnroll(learnerIds: string[]): Promise<{ enrolled: number; failed: number }> {
    const results = await Promise.allSettled(
      learnerIds.map((learner_id) => addMutation.mutateAsync({ programme_id: programmeId, learner_id })),
    );
    let enrolled = 0;
    let failed = 0;
    for (const r of results) r.status === 'fulfilled' ? (enrolled += 1) : (failed += 1);
    return { enrolled, failed };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Mode 1: Filter & select (BUG-004199)
  // ──────────────────────────────────────────────────────────────────────────
  const { data: detailed, isLoading: detailedLoading } = useDetailedLearnersForPicker(open);
  const [programFilter, setProgramFilter] = useState<string>(ALL);
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [batchFilter, setBatchFilter] = useState<string>(ALL);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allLearners = useMemo(() => detailed ?? [], [detailed]);
  const programOptions = useMemo(() => distinctDimension(allLearners, 'program_id', 'program_name'), [allLearners]);
  const departmentOptions = useMemo(() => distinctDimension(allLearners, 'department_id', 'department_name'), [allLearners]);
  const batchOptions = useMemo(() => distinctDimension(allLearners, 'batch_id', 'batch_name'), [allLearners]);

  // Learners matching the active filters, EXCLUDING any already enrolled (so the
  // list only ever offers people who can actually be added).
  const filteredLearners = useMemo(() => {
    return allLearners.filter((l) => {
      if (alreadyEnrolledIds.has(l.id)) return false;
      if (programFilter !== ALL && l.program_id !== programFilter) return false;
      if (departmentFilter !== ALL && l.department_id !== departmentFilter) return false;
      if (batchFilter !== ALL && l.batch_id !== batchFilter) return false;
      return true;
    });
  }, [allLearners, alreadyEnrolledIds, programFilter, departmentFilter, batchFilter]);

  const filteredIds = useMemo(() => filteredLearners.map((l) => l.id), [filteredLearners]);
  const selectedInView = filteredIds.filter((id) => selectedIds.has(id)).length;
  const allInViewSelected = filteredIds.length > 0 && selectedInView === filteredIds.length;

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function handleFilterEnroll() {
    if (submitting) return;
    const ids = filteredIds.filter((id) => selectedIds.has(id)); // only still-visible selected learners
    if (ids.length === 0) return;
    setSubmitting(true);
    const { enrolled, failed } = await bulkEnroll(ids);
    setSubmitting(false);

    const summary = failed ? `Enrolled ${enrolled}, ${failed} failed` : `Enrolled ${enrolled}`;
    if (failed === 0) toast.success(summary);
    else toast.warning(summary);

    setSelectedIds(new Set());
    if (failed === 0) onOpenChange(false);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Mode 2: Paste register numbers (existing behaviour)
  // ──────────────────────────────────────────────────────────────────────────
  const { data: learnerOptions, isLoading: learnersLoading } = useLearnersForPicker();
  const [raw, setRaw] = useState('');
  const [notFound, setNotFound] = useState<string[]>([]);

  const byRegisterNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of learnerOptions ?? []) {
      const reg = registerNumberFromLabel(opt.label);
      if (reg) map.set(reg, opt.value);
    }
    return map;
  }, [learnerOptions]);

  async function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // One register number per line; drop blanks and de-dupe within the paste.
    const lines = Array.from(
      new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean)),
    );
    if (lines.length === 0) return;

    const toEnroll: string[] = [];
    const skipped: string[] = [];
    const missing: string[] = [];

    for (const line of lines) {
      const learnerId = byRegisterNumber.get(line.toLowerCase());
      if (!learnerId) missing.push(line);
      else if (alreadyEnrolledIds.has(learnerId)) skipped.push(line);
      else toEnroll.push(learnerId);
    }

    setSubmitting(true);
    const { enrolled, failed } = await bulkEnroll(toEnroll);
    setSubmitting(false);
    setNotFound(missing);

    const parts = [`Enrolled ${enrolled}`];
    if (skipped.length) parts.push(`skipped ${skipped.length} (already enrolled)`);
    if (missing.length) parts.push(`${missing.length} not found`);
    if (failed) parts.push(`${failed} failed`);
    const summary = parts.join(', ');
    if (enrolled > 0 && failed === 0) toast.success(summary);
    else if (enrolled === 0 && (skipped.length || missing.length) && failed === 0) toast.info(summary);
    else toast.warning(summary);

    // Keep the dialog open if there are unmatched lines so the user can correct them.
    if (missing.length === 0) {
      setRaw('');
      onOpenChange(false);
    }
  }

  function handleClose() {
    setRaw('');
    setNotFound([]);
    setSelectedIds(new Set());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Add Learners</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="filter" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="filter">Filter &amp; select</TabsTrigger>
            <TabsTrigger value="paste">Paste numbers</TabsTrigger>
          </TabsList>

          {/* ── Filter & select ─────────────────────────────────────────── */}
          <TabsContent value="filter" className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Program</Label>
                <Select value={programFilter} onValueChange={setProgramFilter}>
                  <SelectTrigger><SelectValue placeholder="All programs" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All programs</SelectItem>
                    {programOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {departmentOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Batch</Label>
                <Select value={batchFilter} onValueChange={setBatchFilter}>
                  <SelectTrigger><SelectValue placeholder="All batches" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All batches</SelectItem>
                    {batchOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={allInViewSelected}
                    onCheckedChange={(c) => toggleSelectAll(c === true)}
                    disabled={filteredLearners.length === 0}
                    aria-label="Select all filtered learners"
                  />
                  Select all ({filteredLearners.length})
                </label>
                <span className="text-xs text-muted-foreground">{selectedInView} selected</span>
              </div>
              <ScrollArea className="h-64">
                {detailedLoading ? (
                  <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading learners…
                  </p>
                ) : filteredLearners.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    No enrollable learners match these filters (already-enrolled learners are hidden).
                  </p>
                ) : (
                  <ul className="divide-y">
                    {filteredLearners.map((l) => (
                      <li key={l.id}>
                        <label className="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                          <Checkbox
                            className="mt-0.5"
                            checked={selectedIds.has(l.id)}
                            onCheckedChange={(c) => toggleOne(l.id, c === true)}
                            aria-label={`Select ${l.name}`}
                          />
                          <span className="min-w-0">
                            <span className="font-medium">{l.name}</span>
                            {l.register_number && (
                              <span className="text-muted-foreground"> ({l.register_number})</span>
                            )}
                            <span className="block text-xs text-muted-foreground truncate">
                              {[l.program_name, l.department_name, l.batch_name].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={handleClose}>Close</Button>
              <Button type="button" onClick={handleFilterEnroll} disabled={submitting || selectedInView === 0}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enroll{selectedInView > 0 ? ` ${selectedInView}` : ''}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── Paste register numbers ──────────────────────────────────── */}
          <TabsContent value="paste" className="pt-2">
            <form onSubmit={handlePasteSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk_rolls">Register / Roll numbers</Label>
                <Textarea
                  id="bulk_rolls"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={'One per line, e.g.\n21CS001\n21CS002\n21CS003'}
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Paste one register number per line. Learners already enrolled are skipped.
                </p>
              </div>

              {notFound.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  <p className="font-medium text-amber-800">
                    {notFound.length} not found — no matching learner:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-amber-700 max-h-32 overflow-y-auto">
                    {notFound.map((line) => (
                      <li key={line} className="font-mono text-xs">{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" type="button" onClick={handleClose}>Close</Button>
                <Button type="submit" disabled={submitting || learnersLoading || raw.trim().length === 0}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Enroll
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
