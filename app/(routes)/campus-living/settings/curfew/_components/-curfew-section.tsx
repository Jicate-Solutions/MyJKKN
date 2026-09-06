'use client';
// ============================================================================
// Admin — Hostel Curfew Policy (chrome-less section)
// ----------------------------------------------------------------------------
// The working editor body for the curfew policy admin, extracted verbatim from
// curfew/page.tsx so it can be reused both as the standalone page body AND
// inlined inside the unified Campus Living config sections (which can't host a
// page that wraps its own ContentLayout / PermissionGuard).
//
// This component renders NO ContentLayout, NO PermissionGuard and NO page-level
// chrome — only the cards/forms/tables/state/hooks that do the work. The
// standalone page keeps its outer chrome and renders <CurfewSection /> in place
// of the old inline body, so it renders byte-for-byte identically.
//
// Manages active curfew rules in the hostel_curfew_policies table.
// Rules span 4 dimensions: institution × gender × day_of_week × direction.
// Resolution: strictest active rule wins per direction (MIN for entry, MAX
// for exit). The "Resolution preview" panel hits fn_get_curfew live so a
// Director can sanity-check the rule for any (institution, gender, day) tuple.
//
// Spec lock: 2026-05-25 (chairperson + Director).
// ============================================================================

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Plus, Pencil, Power, PowerOff, ShieldAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  type CurfewDirection,
  type CurfewGender,
  type CurfewPolicyInput,
  type CurfewPolicyRow,
  type DayOfWeek,
  DOW_LABELS,
  ALL_DAYS,
  describeCurfewRule,
} from '@/lib/services/hostel/curfew-policy-service';
import {
  useCreateCurfewPolicy,
  useCurfewPolicies,
  useResolvedCurfew,
  useToggleCurfewPolicyActive,
  useUpdateCurfewPolicy,
} from '@/hooks/hostel/use-curfew-policies';

// ---------------------------------------------------------------------------
// Institutions picker (minimal, local — mirrors useInstitutionsForOverridePicker)
// ---------------------------------------------------------------------------
function useInstitutionsForPicker() {
  return useQuery({
    queryKey: ['hostel-curfew', 'institutions'] as const,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('institutions')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Default-state empty input
// ---------------------------------------------------------------------------
const EMPTY_INPUT: CurfewPolicyInput = {
  institution_id: null,
  gender: 'both',
  day_of_week: null,
  direction: 'entry',
  curfew_time: '22:00',
  description: '',
  is_active: true,
};

// ---------------------------------------------------------------------------
// Section (chrome-less editor body)
// ---------------------------------------------------------------------------
export function CurfewSection() {
  const policies = useCurfewPolicies();
  const institutions = useInstitutionsForPicker();
  const toggleActive = useToggleCurfewPolicyActive();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CurfewPolicyInput>(EMPTY_INPUT);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Resolution preview state
  const [previewInst, setPreviewInst] = useState<string | null>(null);
  const [previewGender, setPreviewGender] = useState<CurfewGender>('boys');
  const [previewDay, setPreviewDay] = useState<DayOfWeek>(1);
  const previewQuery = useResolvedCurfew(previewInst, previewGender, previewDay, true);

  // Map institution_id → name for table rendering
  const instNameById = useMemo(() => {
    const map = new Map<string, string>();
    (institutions.data ?? []).forEach((i) => map.set(i.id, i.name));
    return map;
  }, [institutions.data]);

  function openCreate() {
    setEditingId(null);
    setDraft(EMPTY_INPUT);
    setDialogOpen(true);
  }

  function openEdit(row: CurfewPolicyRow) {
    setEditingId(row.id);
    setDraft({
      institution_id: row.institution_id,
      gender: row.gender,
      day_of_week: row.day_of_week,
      direction: row.direction,
      curfew_time: row.curfew_time.slice(0, 5),
      description: row.description ?? '',
      is_active: row.is_active,
    });
    setDialogOpen(true);
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              <h1 className="text-2xl font-semibold">Curfew Rules</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-3xl mt-1">
              Active curfew rules apply per institution, gender, day-of-week, and direction
              (entry / exit). When multiple rules apply, the strictest one wins —{' '}
              <span className="font-medium">earliest</span> time for entry,{' '}
              <span className="font-medium">latest</span> time for exit.
            </p>
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" /> Add rule
          </Button>
        </div>

        {/* Rules table */}
        <Card>
          <CardHeader>
            <CardTitle>All curfew rules</CardTitle>
            <CardDescription>
              Disabled rules are kept for audit history; they don&apos;t participate in resolution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {policies.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : policies.error ? (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Failed to load rules</AlertTitle>
                <AlertDescription>{(policies.error as Error).message}</AlertDescription>
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institution</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>English description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(policies.data ?? []).map((row) => {
                    const instName = row.institution_id
                      ? instNameById.get(row.institution_id) ?? '—'
                      : 'All institutions';
                    return (
                      <TableRow key={row.id} className={row.is_active ? '' : 'opacity-50'}>
                        <TableCell>{instName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.gender}</Badge>
                        </TableCell>
                        <TableCell>{row.day_of_week ? DOW_LABELS[row.day_of_week] : 'Every day'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.direction}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.curfew_time.slice(0, 5)}</TableCell>
                        <TableCell className="max-w-md text-sm text-muted-foreground">
                          {describeCurfewRule(row, instName === 'All institutions' ? null : instName)}
                        </TableCell>
                        <TableCell>
                          {row.is_active ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                          ) : (
                            <Badge variant="outline">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggleActive.isPending}
                            onClick={() =>
                              toggleActive.mutate({ id: row.id, isActive: !row.is_active })
                            }
                            title={row.is_active ? 'Disable rule' : 'Enable rule'}
                          >
                            {row.is_active ? (
                              <PowerOff className="h-3.5 w-3.5" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(policies.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        No curfew rules yet. Click <strong>Add rule</strong> to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Resolution preview */}
        <Card>
          <CardHeader>
            <CardTitle>Resolution preview</CardTitle>
            <CardDescription>
              Pick any (institution, gender, day) tuple to see the effective curfew a resident
              would experience. Live read from <code className="text-xs">fn_get_curfew()</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Institution</Label>
                <Select
                  value={previewInst ?? '__GLOBAL__'}
                  onValueChange={(v) => setPreviewInst(v === '__GLOBAL__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__GLOBAL__">All institutions (global only)</SelectItem>
                    {(institutions.data ?? []).map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select
                  value={previewGender}
                  onValueChange={(v) => setPreviewGender(v as CurfewGender)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boys">Boys</SelectItem>
                    <SelectItem value="girls">Girls</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Day of week</Label>
                <Select
                  value={String(previewDay)}
                  onValueChange={(v) => setPreviewDay(Number(v) as DayOfWeek)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {DOW_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-4">
              {previewQuery.isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : previewQuery.error ? (
                <p className="text-sm text-destructive">
                  {(previewQuery.error as Error).message}
                </p>
              ) : (previewQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active curfew rule matches this tuple. Residents see no enforced curfew.
                </p>
              ) : (
                <div className="space-y-2">
                  {(previewQuery.data ?? []).map((r) => (
                    <div key={r.direction} className="flex items-center gap-3">
                      <Badge variant="secondary">{r.direction}</Badge>
                      <span className="font-mono text-sm">{r.curfew_time.slice(0, 5)}</span>
                      <span className="text-sm text-muted-foreground">
                        {r.direction === 'entry'
                          ? `must be inside by ${r.curfew_time.slice(0, 5)}`
                          : `cannot leave before ${r.curfew_time.slice(0, 5)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit dialog */}
      <CurfewRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        draft={draft}
        setDraft={setDraft}
        institutions={institutions.data ?? []}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Dialog component
// ---------------------------------------------------------------------------
function CurfewRuleDialog({
  open,
  onOpenChange,
  editingId,
  draft,
  setDraft,
  institutions,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editingId: string | null;
  draft: CurfewPolicyInput;
  setDraft: (d: CurfewPolicyInput) => void;
  institutions: { id: string; name: string }[];
}) {
  const create = useCreateCurfewPolicy();
  const update = useUpdateCurfewPolicy();

  const isSaving = create.isPending || update.isPending;

  function save() {
    const onDone = () => onOpenChange(false);
    if (editingId) {
      update.mutate({ id: editingId, patch: draft }, { onSuccess: onDone });
    } else {
      create.mutate(draft, { onSuccess: onDone });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit curfew rule' : 'Add curfew rule'}</DialogTitle>
          <DialogDescription>
            Leave Institution as <em>All institutions</em> for a global default. Leave Day as{' '}
            <em>Every day</em> for an always-on rule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Institution</Label>
            <Select
              value={draft.institution_id ?? '__GLOBAL__'}
              onValueChange={(v) =>
                setDraft({ ...draft, institution_id: v === '__GLOBAL__' ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__GLOBAL__">All institutions (global)</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Gender</Label>
              <Select
                value={draft.gender}
                onValueChange={(v) => setDraft({ ...draft, gender: v as CurfewGender })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="boys">Boys</SelectItem>
                  <SelectItem value="girls">Girls</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Day of week</Label>
              <Select
                value={draft.day_of_week ? String(draft.day_of_week) : '__ALL__'}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    day_of_week: v === '__ALL__' ? null : (Number(v) as DayOfWeek),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">Every day</SelectItem>
                  {ALL_DAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {DOW_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select
                value={draft.direction}
                onValueChange={(v) => setDraft({ ...draft, direction: v as CurfewDirection })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entry (must be inside by)</SelectItem>
                  <SelectItem value="exit">Exit (cannot leave before)</SelectItem>
                  <SelectItem value="both">Both (entry & exit)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Curfew time</Label>
              <Input
                type="time"
                value={draft.curfew_time}
                onChange={(e) => setDraft({ ...draft, curfew_time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Textarea
              rows={2}
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="e.g. Saturday night extension approved by hostel committee"
            />
          </div>

          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">
            <strong>Preview:</strong>{' '}
            {describeCurfewRule(
              {
                id: 'preview',
                institution_id: draft.institution_id ?? null,
                gender: draft.gender,
                day_of_week: draft.day_of_week ?? null,
                direction: draft.direction,
                curfew_time: draft.curfew_time.length === 5 ? `${draft.curfew_time}:00` : draft.curfew_time,
                description: draft.description ?? null,
                is_active: draft.is_active ?? true,
                created_at: '',
                updated_at: '',
                updated_by: null,
              },
              draft.institution_id
                ? institutions.find((i) => i.id === draft.institution_id)?.name ?? null
                : null
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving}>
            {editingId ? 'Save changes' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
