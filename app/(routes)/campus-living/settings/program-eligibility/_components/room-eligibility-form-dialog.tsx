'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useRoomEligibilityRules,
  useEligibilityDegrees,
  useEligibilityDepartments,
  useEligibilityPrograms,
  useEligibilitySemesters,
  useEligibilityBlocks,
  useEligibilityRooms,
} from '@/hooks/campus-living/use-room-eligibility';
import { useEligibilityInstitutions } from '@/hooks/campus-living/use-program-eligibility';
import { useBlockInstitutions } from '@/hooks/campus-living/use-hostel-blocks';
import type { RoomEligibilityRuleRow } from '@/types/room-eligibility';

type Scope = 'block' | 'floor' | 'rooms';
const ANY = '__any__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  // Optional prefill. Edit mode locks institution to the rule's institution.
  institutionId?: string;
  rule?: RoomEligibilityRuleRow | null;
}

export function RoomEligibilityFormDialog({
  open,
  onOpenChange,
  mode,
  institutionId,
  rule,
}: Props) {
  // Mutations are institution-agnostic; subscribe to the page's "all" cache.
  const { createRule, updateRule } = useRoomEligibilityRules(null);
  const { institutions, loading: instLoading } = useEligibilityInstitutions();

  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [blockId, setBlockId] = useState('');
  const [scope, setScope] = useState<Scope>('block');
  const [floor, setFloor] = useState<string>('');
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [degreeId, setDegreeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  // ORDERED. Position 1 is the semester auto-allocation fills first; the array
  // order is persisted as-is and read back by fn_auto_allocate_classic, so it
  // must never be sorted for display. Empty = any semester.
  const [semesterIds, setSemesterIds] = useState<string[]>([]);
  const [ruleName, setRuleName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = mode === 'edit';

  // Block-first flow: blocks (global physical targets) load on open. The cohort
  // predicate (degree cascade) is institution-scoped, and the institution itself
  // is constrained to the block's served colleges (hostel_block_institutions).
  const { options: blocks, loading: blocksLoading } = useEligibilityBlocks(open);
  const { data: blockInstitutions = [], isLoading: blockInstLoading } =
    useBlockInstitutions(blockId);
  const { options: degrees } = useEligibilityDegrees(
    open ? selectedInstitution || null : null
  );
  const { options: departments } = useEligibilityDepartments(degreeId || null);
  const { options: programs } = useEligibilityPrograms(departmentId || null);
  const { options: semesters } = useEligibilitySemesters(programId || null);
  const { rooms, loading: roomsLoading } = useEligibilityRooms(blockId || null);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    if (isEdit && rule) {
      setSelectedInstitution(rule.institution_id);
      setBlockId(rule.block_id);
      setFloor(rule.floor != null ? String(rule.floor) : '');
      setRoomIds(rule.room_ids ?? []);
      setScope(
        (rule.room_ids?.length ?? 0) > 0 ? 'rooms' : rule.floor != null ? 'floor' : 'block'
      );
      setDegreeId(rule.degree_id ?? '');
      setDepartmentId(rule.department_id ?? '');
      setProgramId(rule.program_id ?? '');
      setSemesterIds(rule.semester_ids ?? []);
      setRuleName(rule.rule_name ?? '');
      setIsActive(rule.is_active);
    } else {
      setSelectedInstitution(institutionId ?? '');
      setBlockId('');
      setScope('block');
      setFloor('');
      setRoomIds([]);
      setDegreeId('');
      setDepartmentId('');
      setProgramId('');
      setSemesterIds([]);
      setRuleName('');
      setIsActive(true);
    }
  }, [open, isEdit, rule, institutionId]);

  // Switching institution clears the cohort predicate (degree/department/program/
  // semester are institution-scoped); the physical block target stays.
  const onInstitutionChange = (value: string) => {
    setSelectedInstitution(value);
    setDegreeId('');
    setDepartmentId('');
    setProgramId('');
    setSemesterIds([]);
  };

  // Block drives BOTH the rooms that exist and which colleges are offered
  // (served-only). Changing it clears the physical sub-target and the cohort
  // selection so a now-unserved institution can't survive a block change.
  const onBlockChange = (value: string) => {
    setBlockId(value);
    setScope('block');
    setFloor('');
    setRoomIds([]);
    setSelectedInstitution('');
    setDegreeId('');
    setDepartmentId('');
    setProgramId('');
    setSemesterIds([]);
  };

  // Institution options = ONLY the colleges this block serves
  // (hostel_block_institutions), primary first then by name. A rule for an
  // unserved college could never allocate (fn_room_serves_institution), so it
  // isn't offered. Edit-mode keeps the rule's own institution visible even if
  // the block↔college link changed after the rule was created.
  const institutionOptions = useMemo(() => {
    const nameById = new Map(institutions.map((i) => [i.id, i.name] as const));
    const opts = [...blockInstitutions]
      .sort((a, b) =>
        a.is_primary === b.is_primary
          ? (a.institution_name ?? nameById.get(a.institution_id) ?? '').localeCompare(
              b.institution_name ?? nameById.get(b.institution_id) ?? ''
            )
          : a.is_primary
            ? -1
            : 1
      )
      .map((bi) => ({
        value: bi.institution_id,
        label: `${bi.institution_name ?? nameById.get(bi.institution_id) ?? 'Unknown'}${
          bi.is_primary ? ' (primary)' : ''
        }`,
      }));
    if (isEdit && selectedInstitution && !opts.some((o) => o.value === selectedInstitution)) {
      opts.unshift({
        value: selectedInstitution,
        label: `${rule?.institution_name ?? nameById.get(selectedInstitution) ?? 'Unknown'} (not linked to block)`,
      });
    }
    return opts;
  }, [blockInstitutions, institutions, isEdit, selectedInstitution, rule]);

  // Distinct floors in the chosen block (for the 'floor' scope dropdown).
  const floorsInBlock = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b),
    [rooms]
  );

  // Group the block's rooms by category, then by floor within each category, so
  // the picker is identifiable both by category (AC Single, Non-AC Shared, …)
  // and floor. Rooms with no category fall into an "Uncategorized" group rather
  // than vanishing. Each level exposes its own room-id set for select-all.
  const roomsByCategory = useMemo(() => {
    const map = new Map<
      string,
      { name: string; rooms: typeof rooms; floors: Map<number, typeof rooms> }
    >();
    for (const r of rooms) {
      const key = r.category_id ?? '__uncat__';
      const group =
        map.get(key) ??
        { name: r.category_name ?? 'Uncategorized', rooms: [] as typeof rooms, floors: new Map() };
      group.rooms.push(r);
      const floorRooms = group.floors.get(r.floor) ?? ([] as typeof rooms);
      floorRooms.push(r);
      group.floors.set(r.floor, floorRooms);
      map.set(key, group);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([key, g]) => ({
        key,
        name: g.name,
        rooms: g.rooms,
        floors: Array.from(g.floors.entries()).sort((a, b) => a[0] - b[0]),
      }));
  }, [rooms]);

  const toggleRoom = (id: string) =>
    setRoomIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const toggleRoomGroup = (groupRoomIds: string[], allSelected: boolean) =>
    setRoomIds((prev) =>
      allSelected
        ? prev.filter((id) => !groupRoomIds.includes(id))
        : Array.from(new Set([...prev, ...groupRoomIds]))
    );

  // Summary of the current selection: room count + total beds (capacity) +
  // filled (occupied) beds across the chosen rooms, so the operator sees how
  // much they're actually reserving — not just the room count.
  const selectedSummary = useMemo(() => {
    const chosen = rooms.filter((r) => roomIds.includes(r.id));
    return {
      count: roomIds.length,
      capacity: chosen.reduce((s, r) => s + (r.capacity ?? 0), 0),
      filled: chosen.reduce((s, r) => s + (r.occupied ?? 0), 0),
    };
  }, [rooms, roomIds]);

  // Semester picker helpers. Selection order IS the fill order, so `add`
  // appends and the arrows swap neighbours — nothing here sorts the list.
  const addSemester = (id: string) =>
    setSemesterIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const removeSemester = (id: string) =>
    setSemesterIds((prev) => prev.filter((x) => x !== id));
  const moveSemester = (index: number, delta: number) =>
    setSemesterIds((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  // Edit mode renders the chips before the program cascade has loaded its
  // options, so seed labels from the names the rule already carries.
  const semesterLabel = useMemo(() => {
    const m = new Map<string, string>();
    rule?.semester_ids?.forEach((id, i) =>
      m.set(id, rule.semester_names?.[i] ?? 'Unknown semester')
    );
    semesters.forEach((s) => m.set(s.id, s.label));
    return m;
  }, [rule, semesters]);

  const unpickedSemesters = useMemo(
    () => semesters.filter((s) => !semesterIds.includes(s.id)),
    [semesters, semesterIds]
  );

  const canSave =
    !!selectedInstitution &&
    !!blockId &&
    (scope !== 'floor' || floor !== '') &&
    (scope !== 'rooms' || roomIds.length > 0);

  const handleSave = async () => {
    try {
      setSubmitting(true);
      const payload = {
        floor: scope === 'floor' ? Number(floor) : null,
        room_ids: scope === 'rooms' ? roomIds : [],
        degree_id: degreeId || null,
        department_id: departmentId || null,
        program_id: programId || null,
        semester_ids: semesterIds,
        rule_name: ruleName.trim() || null,
        is_active: isActive,
      };
      if (isEdit && rule) {
        await updateRule(rule.id, payload);
        toast.success('Room eligibility rule updated');
      } else {
        await createRule({ institution_id: selectedInstitution, block_id: blockId, ...payload });
        toast.success('Room eligibility rule added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save rule');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Room Eligibility Rule' : 'Add Room Eligibility Rule'}
          </DialogTitle>
          <DialogDescription>
            Reserve a block / floor / set of rooms for a specific cohort. Rooms a
            rule covers admit only matching learners; uncovered rooms stay open to
            all. Leave an academic level as &ldquo;Any&rdquo; to wildcard it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Block first — it's the physical target AND it constrains which
              colleges (and rooms) the rule can use. Then the institution, limited
              to the colleges this block serves. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Block</Label>
              <Select value={blockId} onValueChange={onBlockChange} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue placeholder={blocksLoading ? 'Loading…' : 'Select block'} />
                </SelectTrigger>
                <SelectContent>
                  {blocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Institution</Label>
              <SearchableSelect
                value={selectedInstitution}
                onValueChange={onInstitutionChange}
                options={institutionOptions}
                placeholder={blockId ? 'Select an institution' : 'Select a block first'}
                emptyMessage="No colleges linked to this block."
                loading={instLoading || blockInstLoading}
                disabled={isEdit || !blockId}
                modal
              />
              {blockId && !blockInstLoading && institutionOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  This block has no linked colleges. Add one in the block&rsquo;s
                  Colleges card before reserving rooms for a cohort.
                </p>
              )}
            </div>
          </div>

          {/* Scope within the block */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)} disabled={!blockId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Whole block</SelectItem>
                  <SelectItem value="floor">Specific floor</SelectItem>
                  <SelectItem value="rooms">Specific rooms</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'floor' && (
              <div className="space-y-2">
                <Label>Floor</Label>
                <Select value={floor} onValueChange={setFloor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select floor" />
                  </SelectTrigger>
                  <SelectContent>
                    {floorsInBlock.map((f) => (
                      <SelectItem key={f} value={String(f)}>
                        {f === 0 ? 'Ground floor' : `Floor ${f}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {scope === 'rooms' && (
            <div className="space-y-2">
              <Label>
                Rooms{' '}
                {selectedSummary.count > 0 && (
                  <span className="text-muted-foreground font-normal">
                    ({selectedSummary.count} {selectedSummary.count === 1 ? 'room' : 'rooms'} ·{' '}
                    {selectedSummary.capacity} {selectedSummary.capacity === 1 ? 'bed' : 'beds'} ·{' '}
                    {selectedSummary.filled} filled)
                  </span>
                )}
              </Label>
              {roomsLoading ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading rooms…
                </div>
              ) : rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No student rooms in this block.</p>
              ) : (
                <div className="space-y-4 max-h-[280px] overflow-y-auto rounded-md border p-3">
                  {roomsByCategory.map((cat) => {
                    const catIds = cat.rooms.map((r) => r.id);
                    const catAllSelected = catIds.every((id) => roomIds.includes(id));
                    // Per-category bed totals (planned capacity vs live free beds)
                    // so the operator sees how much they're reserving at a glance.
                    const catCap = cat.rooms.reduce((s, r) => s + (r.capacity ?? 0), 0);
                    const catFree = cat.rooms.reduce((s, r) => s + (r.available ?? 0), 0);
                    return (
                      <div key={cat.key} className="space-y-2">
                        {/* Category header — select-all across every floor in this category */}
                        <div className="flex items-center justify-between border-b pb-1">
                          <span className="text-sm font-semibold text-foreground">
                            {cat.name}{' '}
                            <span className="font-normal text-muted-foreground">
                              ({cat.rooms.length} {cat.rooms.length === 1 ? 'room' : 'rooms'} · {catFree}/{catCap} beds free)
                            </span>
                          </span>
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={() => toggleRoomGroup(catIds, catAllSelected)}
                          >
                            {catAllSelected ? 'clear all' : 'select all'}
                          </button>
                        </div>
                        {/* Floor sub-groups within the category */}
                        {cat.floors.map(([f, frooms]) => {
                          const fIds = frooms.map((r) => r.id);
                          const fAllSelected = fIds.every((id) => roomIds.includes(id));
                          return (
                            <div key={f} className="space-y-1 pl-2">
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() => toggleRoomGroup(fIds, fAllSelected)}
                              >
                                {f === 0 ? 'Ground floor' : `Floor ${f}`} — {fAllSelected ? 'clear' : 'select all'}
                              </button>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {frooms.map((r) => (
                                  <label key={r.id} className="flex items-start gap-1.5 text-sm cursor-pointer">
                                    <Checkbox
                                      className="mt-0.5"
                                      checked={roomIds.includes(r.id)}
                                      onCheckedChange={() => toggleRoom(r.id)}
                                    />
                                    <span className="leading-tight">
                                      {r.room_number}
                                      <span
                                        className={`block text-[10px] ${r.available === 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                                      >
                                        {r.available}/{r.capacity} free
                                      </span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Academic predicate */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Degree <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={degreeId || ANY} onValueChange={(v) => { const nv = v === ANY ? '' : v; setDegreeId(nv); setDepartmentId(''); setProgramId(''); setSemesterIds([]); }}>
                <SelectTrigger><SelectValue placeholder="Any degree" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any degree</SelectItem>
                  {degrees.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Department <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={departmentId || ANY} onValueChange={(v) => { const nv = v === ANY ? '' : v; setDepartmentId(nv); setProgramId(''); setSemesterIds([]); }} disabled={!degreeId}>
                <SelectTrigger><SelectValue placeholder="Any department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any department</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Program <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={programId || ANY} onValueChange={(v) => { const nv = v === ANY ? '' : v; setProgramId(nv); setSemesterIds([]); }} disabled={!departmentId}>
                <SelectTrigger><SelectValue placeholder="Any program" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any program</SelectItem>
                  {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Semesters (year) — a rule may cover SEVERAL, and the order is the
              auto-allocation fill order, so this is a list rather than a select.
              Full width: it sits outside the two-column academic grid above. */}
          <div className="space-y-2">
            <Label>
              Semesters (year){' '}
              <span className="text-muted-foreground font-normal">
                (optional — fill order)
              </span>
            </Label>
            {!programId ? (
              <p className="text-sm text-muted-foreground">
                Pick a program first — semesters belong to a program.
              </p>
            ) : semesters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active semesters on this program.
              </p>
            ) : (
              <div className="space-y-3 rounded-md border p-3">
                {semesterIds.length > 0 && (
                  <ol className="space-y-1.5">
                    {semesterIds.map((id, i) => (
                      <li
                        key={id}
                        className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm">
                          {semesterLabel.get(id) ?? 'Unknown semester'}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => moveSemester(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${semesterLabel.get(id) ?? 'semester'} earlier`}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => moveSemester(i, 1)}
                          disabled={i === semesterIds.length - 1}
                          aria-label={`Move ${semesterLabel.get(id) ?? 'semester'} later`}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeSemester(id)}
                          aria-label={`Remove ${semesterLabel.get(id) ?? 'semester'}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
                {unpickedSemesters.length > 0 && (
                  <div className="space-y-1.5">
                    {semesterIds.length > 0 && (
                      <p className="text-xs font-medium text-muted-foreground">
                        Add another
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {unpickedSemesters.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => addSemester(s.id)}
                          className="rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          + {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {semesterIds.length === 0
                ? 'None selected — the rule applies to any semester of this program.'
                : `Auto-allocation places ${semesterLabel.get(semesterIds[0]) ?? 'the first semester'} into these rooms first, then works down the list.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Rule name <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g., Dental PDS Year-1 — A Block floor 1" />
          </div>

          <div className="flex flex-row items-center justify-between rounded-lg border p-3">
            <Label className="text-sm">Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
