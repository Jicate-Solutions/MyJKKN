'use client';

// Store Kits — rules admin (central store team, decision 22).
// Rules list + rule dialog + per-rule detail (items / members / resolve)
// + collection windows. Spec: specs/store-kit-entitlements-spec-2026-07-12.md

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Play, Package, Users, CalendarRange, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useKitRules, useCreateKitRule, useUpdateKitRule,
  useKitRuleItems, useAddKitRuleItem, useRemoveKitRuleItem,
  useKitRuleMembers, useAddKitRuleMember, useRemoveKitRuleMember,
  useKitWindows, useCreateKitWindow, useToggleKitWindow,
  useResolveKitRule, useRevokeKitRuleEntitlements,
  useKitInstitutions, useKitPrograms, useKitDepartments,
} from '@/hooks/ims/use-ims-kits';
import { ImsKitService, type KitRule, type KitPerson } from '@/lib/services/ims/kit-service';

const ANY = '__any__'; // Radix Select forbids value="" (repo CI gate)

export default function KitRulesPage() {
  return (
    <ImsPageGuard module="ims.kits" action="manage">
      <ContentLayout title="Store Kits — Rules">
        <KitRulesInner />
      </ContentLayout>
    </ImsPageGuard>
  );
}

function KitRulesInner() {
  const { data: rules = [], isLoading } = useKitRules();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KitRule | null>(null);
  const [selected, setSelected] = useState<KitRule | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Who gets which kit. One rulebook for all colleges — handovers happen at the central store.
        </p>
        <Button className="shrink-0" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New Rule
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Hostel filter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rules.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No kit rules yet — create the first one.</TableCell></TableRow>
              )}
              {rules.map((r) => (
                <TableRow
                  key={r.id}
                  className={selected?.id === r.id ? 'bg-muted/50' : 'cursor-pointer'}
                  onClick={() => setSelected(r)}
                >
                  <TableCell className="font-medium">{r.rule_name}</TableCell>
                  <TableCell><Badge variant="outline">{r.audience}</Badge></TableCell>
                  <TableCell>{r.rule_kind}</TableCell>
                  <TableCell>{r.hostel_status}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? 'default' : 'secondary'}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="sm"
                      onClick={(e) => { e.stopPropagation(); setEditing(r); setDialogOpen(true); }}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && <RuleDetail rule={selected} />}

      <WindowsCard />

      <RuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}

// ── Rule create/edit dialog ──────────────────────────────────────────────
function RuleDialog({
  open, onOpenChange, editing,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: KitRule | null }) {
  const createRule = useCreateKitRule();
  const updateRule = useUpdateKitRule();
  const [name, setName] = useState(editing?.rule_name ?? '');
  const [audience, setAudience] = useState<string>(editing?.audience ?? 'learner');
  const [kind, setKind] = useState<string>(editing?.rule_kind ?? 'criteria');
  const [institutionId, setInstitutionId] = useState<string>(editing?.institution_id ?? ANY);
  const [programId, setProgramId] = useState<string>(editing?.program_id ?? ANY);
  const [departmentId, setDepartmentId] = useState<string>(editing?.department_id ?? ANY);
  const [yearLevel, setYearLevel] = useState<string>(editing?.year_level?.toString() ?? ANY);
  const [hostelStatus, setHostelStatus] = useState<string>(editing?.hostel_status ?? 'any');
  const [isActive, setIsActive] = useState<boolean>(editing?.is_active ?? true);

  const { data: institutions = [] } = useKitInstitutions();
  const { data: programs = [] } = useKitPrograms(institutionId === ANY ? undefined : institutionId);
  const { data: departments = [] } = useKitDepartments(institutionId === ANY ? undefined : institutionId);

  // Re-seed local state on every open (MED-4 #2000): the old guard keyed on
  // currentId, so reopening "New Rule" (currentId stays 'new') kept the last
  // rule's values. An effect keyed on the open transition reseeds every time.
  const currentId = editing?.id ?? 'new';
  useEffect(() => {
    if (!open) return;
    setName(editing?.rule_name ?? '');
    setAudience(editing?.audience ?? 'learner');
    setKind(editing?.rule_kind ?? 'criteria');
    setInstitutionId(editing?.institution_id ?? ANY);
    setProgramId(editing?.program_id ?? ANY);
    setDepartmentId(editing?.department_id ?? ANY);
    setYearLevel(editing?.year_level?.toString() ?? ANY);
    setHostelStatus(editing?.hostel_status ?? 'any');
    setIsActive(editing?.is_active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentId]);

  const save = async () => {
    if (!name.trim()) { toast.error('Rule name is required'); return; }
    const dto = {
      rule_name: name.trim(),
      audience,
      rule_kind: kind,
      institution_id: institutionId === ANY ? null : institutionId,
      program_id: audience === 'learner' && programId !== ANY ? programId : null,
      department_id: audience === 'staff' && departmentId !== ANY ? departmentId : null,
      year_level: audience === 'learner' && yearLevel !== ANY ? Number(yearLevel) : null,
      hostel_status: audience === 'learner' ? hostelStatus : 'any',
      is_active: isActive,
    };
    try {
      if (editing) await updateRule.mutateAsync({ id: editing.id, dto: dto as Partial<KitRule> });
      else await createRule.mutateAsync(dto as Parameters<typeof createRule.mutateAsync>[0]);
      toast.success(editing ? 'Rule updated' : 'Rule created');
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Kit Rule' : 'New Kit Rule'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Rule name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. B.Pharm Year 1 kit" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Audience</Label>
              <Select value={audience} onValueChange={setAudience} disabled={!!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="learner">Learners</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Targeting</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="criteria">By criteria</SelectItem>
                  <SelectItem value="handpicked">Hand-picked list</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === 'criteria' && (
            <>
              <div>
                <Label>College</Label>
                <Select value={institutionId} onValueChange={setInstitutionId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All colleges</SelectItem>
                    {institutions.map((i: { id: string; name: string }) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {audience === 'learner' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Program</Label>
                    <Select value={programId} onValueChange={setProgramId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>Any program</SelectItem>
                        {programs.map((p: { id: string; program_name: string }) => (
                          <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Year level</Label>
                    <Select value={yearLevel} onValueChange={setYearLevel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY}>Any year</SelectItem>
                        {[1, 2, 3, 4, 5, 6].map((y) => (
                          <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Department</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Any department</SelectItem>
                      {departments.map((d: { id: string; department_name: string }) => (
                        <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {audience === 'learner' && (
                <div>
                  <Label>Hostel filter</Label>
                  <Select value={hostelStatus} onValueChange={setHostelStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Everyone</SelectItem>
                      <SelectItem value="hosteler">Hostelers only</SelectItem>
                      <SelectItem value="day_scholar">Day scholars only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} id="rule-active" />
            <Label htmlFor="rule-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={createRule.isPending || updateRule.isPending}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rule detail: items + members + resolve ──────────────────────────────
function RuleDetail({ rule }: { rule: KitRule }) {
  const { data: items = [] } = useKitRuleItems(rule.id);
  const { data: members = [] } = useKitRuleMembers(rule.id);
  const addItem = useAddKitRuleItem();
  const removeItem = useRemoveKitRuleItem(rule.id);
  const addMember = useAddKitRuleMember();
  const removeMember = useRemoveKitRuleMember(rule.id);
  const resolve = useResolveKitRule();
  const revoke = useRevokeKitRuleEntitlements();

  const [itemTerm, setItemTerm] = useState('');
  const [itemResults, setItemResults] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [qty, setQty] = useState('1');
  const [cadence, setCadence] = useState('yearly');
  const [memberTerm, setMemberTerm] = useState('');
  const [memberResults, setMemberResults] = useState<KitPerson[]>([]);
  const [applyExisting, setApplyExisting] = useState(false);

  const searchItems = async (t: string) => {
    setItemTerm(t);
    setItemResults(t.trim().length >= 2 ? await ImsKitService.searchItems(t) : []);
  };
  const searchMembers = async (t: string) => {
    setMemberTerm(t);
    setMemberResults(t.trim().length >= 2 ? await ImsKitService.searchPeople(t, rule.audience) : []);
  };

  const runResolve = async () => {
    try {
      const res = await resolve.mutateAsync({ ruleId: rule.id, applyToExisting: applyExisting });
      toast.success(`Granted: ${res.inserted} new · ${res.existing_touched} existing checked · ${res.reopened} reopened`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Resolve failed');
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Items in “{rule.rule_name}”
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{it.item?.name ?? it.item_id} × {it.quantity}</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline">{it.cadence === 'yearly' ? 'Every year' : 'Once'}</Badge>
                <Button variant="ghost" size="sm" onClick={() => removeItem.mutate(it.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </span>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}

          <div className="space-y-2 border-t pt-3">
            <Input placeholder="Search store items…" value={itemTerm} onChange={(e) => searchItems(e.target.value)} />
            {itemResults.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{r.name}{r.code ? ` (${r.code})` : ''}</span>
                <span className="flex items-center gap-2">
                  <Input className="w-16 h-8" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
                  <Select value={cadence} onValueChange={setCadence}>
                    <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yearly">Every year</SelectItem>
                      <SelectItem value="once">Once</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={async () => {
                    try {
                      await addItem.mutateAsync({ rule_id: rule.id, item_id: r.id, quantity: Number(qty) || 1, cadence });
                      setItemTerm(''); setItemResults([]);
                      toast.success('Item added');
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : 'Add failed');
                    }
                  }}>Add</Button>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            {rule.rule_kind === 'handpicked' ? 'Hand-picked people' : 'Grant entitlements'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rule.rule_kind === 'handpicked' && (
            <>
              <p className="text-sm text-muted-foreground">{members.length} person(s) on this list.</p>
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm rounded border p-2">
                  <span className="font-mono text-xs">{m.learner_id ?? m.staff_id}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeMember.mutate(m.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Input
                placeholder={`Search ${rule.audience === 'learner' ? 'learners (name / register no)' : 'staff (name)'}…`}
                value={memberTerm}
                onChange={(e) => searchMembers(e.target.value)}
              />
              {memberResults.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.name}{p.register_number ? ` · ${p.register_number}` : ''}</span>
                  <Button size="sm" onClick={async () => {
                    try {
                      await addMember.mutateAsync({
                        rule_id: rule.id,
                        ...(p.kind === 'learner' ? { learner_id: p.id } : { staff_id: p.id }),
                      });
                      setMemberTerm(''); setMemberResults([]);
                      toast.success('Added to list');
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : 'Add failed');
                    }
                  }}>Add</Button>
                </div>
              ))}
            </>
          )}

          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-existing"
                checked={applyExisting}
                onCheckedChange={(v) => setApplyExisting(v === true)}
              />
              <Label htmlFor="apply-existing" className="text-sm">
                Also top-up people who already have this kit (higher quantity wins)
              </Label>
            </div>
            <Button onClick={runResolve} disabled={resolve.isPending} className="w-full">
              <Play className="h-4 w-4 mr-2" />
              {resolve.isPending ? 'Granting…' : 'Grant entitlements now'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Safe to run repeatedly — newcomers get their kit, nobody is granted twice,
              and a repeated year never re-issues a received kit.
            </p>
            {/* D33: fat-finger undo — pull back not-yet-collected grants. */}
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={revoke.isPending}
              onClick={async () => {
                if (!window.confirm(
                  'Pull back entitlements from this rule that NOBODY has collected yet? ' +
                  'Anything already collected (even partly) is kept. This cannot be undone.'
                )) return;
                try {
                  const res = await revoke.mutateAsync(rule.id);
                  toast.success(`Revoked ${res.revoked} uncollected entitlement(s)`);
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : 'Revoke failed');
                }
              }}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              {revoke.isPending ? 'Revoking…' : 'Revoke uncollected (undo a mistaken grant)'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Collection windows (D20) ─────────────────────────────────────────────
function WindowsCard() {
  const { data: windows = [] } = useKitWindows();
  const createWindow = useCreateKitWindow();
  const toggleWindow = useToggleKitWindow();
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4" /> Collection windows
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          People collect during announced windows; latecomers need a staff approval at the counter.
          No windows = collect anytime.
        </p>
        {windows.map((w) => (
          <div key={w.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>
              <span className="font-medium">{w.label}</span>{' '}
              <span className="text-muted-foreground">
                {new Date(w.starts_at).toLocaleDateString()} → {new Date(w.ends_at).toLocaleDateString()}
                {w.rule_id ? '' : ' · all rules'}
              </span>
            </span>
            <Button
              variant={w.is_active ? 'secondary' : 'outline'} size="sm"
              onClick={() => toggleWindow.mutate({ id: w.id, is_active: !w.is_active })}
            >
              {w.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div>
            <Label className="text-xs">Label</Label>
            <Input className="w-52" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Odd-sem opening wave" />
          </div>
          <div>
            <Label className="text-xs">Starts</Label>
            <Input className="w-44" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Ends</Label>
            <Input className="w-44" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button onClick={async () => {
            if (!label.trim() || !start || !end) { toast.error('Label, start and end are required'); return; }
            // LOW-6 (#2000): reject an inverted / zero-length window client-side
            // (the DB CHECK also enforces it, but fail fast with a clear message).
            if (new Date(end) <= new Date(start)) { toast.error('End must be after start'); return; }
            try {
              await createWindow.mutateAsync({
                label: label.trim(),
                starts_at: new Date(start).toISOString(),
                ends_at: new Date(end).toISOString(),
              });
              setLabel(''); setStart(''); setEnd('');
              toast.success('Window created');
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : 'Create failed');
            }
          }}>
            <Plus className="h-4 w-4 mr-1" /> Add window
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
