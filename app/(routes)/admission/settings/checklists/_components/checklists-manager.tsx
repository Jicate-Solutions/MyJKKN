'use client';

// Programme Checklists — admin manager UI (v3 layout)
// ---------------------------------------------------------------------------
// Main page = advanced TanStack DataTable (project's <DataTable/>) with
//   • row-selection checkboxes for bulk actions
//   • click-the-name → ChecklistDetailDialog (read-only view + Edit button)
//   • per-row Actions dropdown (View / Edit / Archive-Delete)
//   • global search + pagination + column visibility (built into DataTable)
//
// Server-side scope_label resolution removes the previous race where Target
// cells flashed UUID prefixes until the org-hooks cache filled.

import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/ui/data-table';
import { toast } from 'react-hot-toast';
import { Plus, X, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { buildChecklistColumns, type ChecklistRow } from './columns';
import { ChecklistDetailDialog } from './checklist-detail-dialog';

type ScopeType = 'institution' | 'degree' | 'department' | 'program';

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_required: boolean;
  is_active: boolean;
}

const LIFECYCLE_OPTIONS = ['lead', 'admitted', 'enrolled'] as const;

// ============================================================================
// Top-level ChecklistsManager
// ============================================================================
export function ChecklistsManager() {
  const [checklists, setChecklists] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<ChecklistRow | null>(null);
  const [editing, setEditing] = useState<ChecklistRow | null>(null);
  const [deleting, setDeleting] = useState<ChecklistRow | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admission/settings/checklists${showInactive ? '?include_inactive=true' : ''}`,
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to load checklists');
        return;
      }
      setChecklists(json.checklists ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const columns = useMemo(
    () => buildChecklistColumns({
      onView: (row) => setViewing(row),
      onEdit: (row) => setEditing(row),
      onDelete: (row) => setDeleting(row),
    }),
    [],
  );

  const handleSingleDelete = async (row: ChecklistRow) => {
    const res = await fetch(`/api/admission/settings/checklists/${row.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Delete failed');
      return false;
    }
    toast.success(`Checklist ${json.mode === 'soft' ? 'archived' : 'deleted'}`);
    return true;
  };

  const handleBulk = async (rows: ChecklistRow[]) => {
    let ok = 0;
    let fail = 0;
    for (const r of rows) {
      const success = await handleSingleDelete(r);
      if (success) ok++; else fail++;
    }
    if (fail === 0) toast.success(`${ok} checklists processed`);
    else toast.error(`${ok} ok · ${fail} failed`);
    reload();
  };

  const tableTools = (
    <>
      <Button variant="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>
        {showInactive ? 'Hide archived' : 'Show archived'}
      </Button>
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> Create Checklist
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DataTable<ChecklistRow, unknown>
          columns={columns}
          data={checklists}
          searchPlaceholder="Search checklists by name…"
          filterColumn="name"
          tableTools={tableTools}
          getRowId={(row) => row.id}
          onRefresh={reload}
          onBulkAction={async (rows) => { await handleBulk(rows); }}
          bulkActionConfig={{
            label: 'Archive / Delete',
            icon: Trash2,
            variant: 'destructive',
            confirmTitle: 'Archive / Delete selected checklists?',
            confirmDescription:
              'Each checklist will be archived if any items have been marked on a learner, hard-deleted otherwise.',
          }}
        />
      )}

      {/* Detail modal (click the name) */}
      {viewing && (
        <ChecklistDetailDialog
          checklist={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const target = viewing;
            setViewing(null);
            setEditing(target);
          }}
        />
      )}

      {/* Create modal */}
      {createOpen && (
        <CreateChecklistsDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reload(); }}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <EditChecklistDialog
          checklist={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      {/* Single-row delete confirm */}
      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete checklist?</AlertDialogTitle>
              <AlertDialogDescription>
                If any learner has already marked items here, this checklist is archived
                to preserve audit history. Otherwise it&apos;s hard-deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const target = deleting;
                  setDeleting(null);
                  if (target) {
                    const ok = await handleSingleDelete(target);
                    if (ok) reload();
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </div>
  );
}

// ============================================================================
// CreateChecklistsDialog — scope + multiple checklists (each with N items)
// ============================================================================
interface DraftItem {
  key: string;
  title: string;
  is_required: boolean;
}

interface DraftChecklist {
  key: string;
  name: string;
  description: string;
  lifecycle: string[];
  items: DraftItem[];
}

function newItem(): DraftItem {
  return { key: crypto.randomUUID(), title: '', is_required: false };
}

function newChecklist(): DraftChecklist {
  return {
    key: crypto.randomUUID(),
    name: '',
    description: '',
    lifecycle: ['lead', 'admitted', 'enrolled'],
    items: [newItem()],
  };
}

function CreateChecklistsDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [institutionId, setInstitutionId] = useState('');
  const [degreeId, setDegreeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');

  const { institutions } = useInstitutionsWithAccess();
  const { data: degreesData } = useDegrees({ institution_id: institutionId || undefined });
  const { data: departmentsData } = useDepartments({ degree_id: degreeId || undefined });
  const { data: programsData } = usePrograms({ department_id: departmentId || undefined });

  const degrees = degreesData?.data ?? [];
  const departments = departmentsData?.data ?? [];
  const programs = programsData?.data ?? [];

  const resolvedScope: { scope_type: ScopeType; scope_id: string } | null = useMemo(() => {
    if (programId) return { scope_type: 'program', scope_id: programId };
    if (departmentId) return { scope_type: 'department', scope_id: departmentId };
    if (degreeId) return { scope_type: 'degree', scope_id: degreeId };
    if (institutionId) return { scope_type: 'institution', scope_id: institutionId };
    return null;
  }, [institutionId, degreeId, departmentId, programId]);

  const [drafts, setDrafts] = useState<DraftChecklist[]>([newChecklist()]);
  const [submitting, setSubmitting] = useState(false);

  const updateDraft = (key: string, patch: Partial<DraftChecklist>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const handleSubmit = async () => {
    if (!resolvedScope) {
      toast.error('Pick at least an institution');
      return;
    }
    const validDrafts = drafts.filter((d) => d.name.trim().length > 0);
    if (validDrafts.length === 0) {
      toast.error('Add at least one checklist with a name');
      return;
    }

    setSubmitting(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const d of validDrafts) {
        const res = await fetch('/api/admission/settings/checklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope_type: resolvedScope.scope_type,
            scope_id: resolvedScope.scope_id,
            name: d.name,
            description: d.description || null,
            applies_to_lifecycle: d.lifecycle,
            items: d.items
              .filter((i) => i.title.trim().length > 0)
              .map((i) => ({ title: i.title, is_required: i.is_required })),
          }),
        });
        if (res.ok || res.status === 207) okCount += 1;
        else failCount += 1;
      }
      if (failCount === 0) {
        toast.success(`Created ${okCount} checklist${okCount === 1 ? '' : 's'}`);
        onCreated();
      } else {
        toast.error(`Created ${okCount}, failed ${failCount}`);
        if (okCount > 0) onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Checklists</DialogTitle>
          <DialogDescription>
            Pick a scope, then add one or more checklists. Each checklist can hold
            multiple items. Leave deeper dropdowns blank and the deepest filled level
            becomes the scope.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-4">
          <Label className="text-xs uppercase text-muted-foreground mb-2 block">Hierarchy</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ScopeDropdown
              label="Institution"
              value={institutionId}
              onChange={(v) => { setInstitutionId(v); setDegreeId(''); setDepartmentId(''); setProgramId(''); }}
              options={institutions.map((i) => ({ id: i.id, label: i.name }))}
            />
            <ScopeDropdown
              label="Degree"
              value={degreeId}
              onChange={(v) => { setDegreeId(v); setDepartmentId(''); setProgramId(''); }}
              options={degrees.map((d) => ({ id: d.id, label: d.display_name || d.degree_name }))}
              disabled={!institutionId}
            />
            <ScopeDropdown
              label="Department"
              value={departmentId}
              onChange={(v) => { setDepartmentId(v); setProgramId(''); }}
              options={departments.map((d) => ({ id: d.id, label: d.display_name || d.department_name }))}
              disabled={!degreeId}
            />
            <ScopeDropdown
              label="Programme"
              value={programId}
              onChange={setProgramId}
              options={programs.map((p) => ({ id: p.id, label: p.display_name || p.program_name }))}
              disabled={!departmentId}
            />
          </div>
          {resolvedScope && (
            <p className="text-xs text-muted-foreground mt-2">
              Will create checklists at <strong className="capitalize">{resolvedScope.scope_type}</strong> level.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {drafts.map((d, idx) => (
            <ChecklistDraftCard
              key={d.key}
              index={idx}
              draft={d}
              canRemove={drafts.length > 1}
              onChange={(patch) => updateDraft(d.key, patch)}
              onRemove={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
            />
          ))}
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => setDrafts((prev) => [...prev, newChecklist()])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Checklist
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !resolvedScope}>
            {submitting ? 'Saving…' : 'Save All'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ChecklistDraftCard — one checklist in the create form
// ============================================================================
function ChecklistDraftCard({
  index,
  draft,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  draft: DraftChecklist;
  canRemove: boolean;
  onChange: (patch: Partial<DraftChecklist>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    onChange({
      items: draft.items.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    });
  };

  const addItem = () => onChange({ items: [...draft.items, newItem()] });
  const removeItem = (key: string) =>
    onChange({ items: draft.items.filter((it) => it.key !== key) });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className="text-xs font-mono text-muted-foreground">#{index + 1}</span>
          <Input
            placeholder="Checklist name (e.g. Pre-Admission Documents)"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="flex-1 font-medium"
          />
          {canRemove && (
            <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove checklist">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {expanded && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  rows={1}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Lifecycle stages</Label>
                <div className="flex gap-3 mt-1">
                  {LIFECYCLE_OPTIONS.map((lc) => (
                    <label key={lc} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={draft.lifecycle.includes(lc)}
                        onCheckedChange={(checked) => {
                          onChange({
                            lifecycle: checked
                              ? Array.from(new Set([...draft.lifecycle, lc]))
                              : draft.lifecycle.filter((x) => x !== lc),
                          });
                        }}
                      />
                      <span className="capitalize">{lc}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Items</Label>
              <div className="space-y-1.5 mt-1">
                {draft.items.map((item, i) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground w-6 text-center">{i + 1}</span>
                    <Input
                      placeholder="Item title (e.g. 10th Marksheet collected)"
                      value={item.title}
                      onChange={(e) => updateItem(item.key, { title: e.target.value })}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                      <Checkbox
                        checked={item.is_required}
                        onCheckedChange={(c) => updateItem(item.key, { is_required: c === true })}
                      />
                      Required
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeItem(item.key)}
                      disabled={draft.items.length <= 1}
                      aria-label="Remove item"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2 border-dashed" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ScopeDropdown — one scope-level dropdown in the cascade
// ============================================================================
function ScopeDropdown({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: Array<{ id: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={disabled ? '—' : 'Select'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// EditChecklistDialog — edits ONE checklist + inline items
// ============================================================================
function EditChecklistDialog({
  checklist,
  onClose,
  onSaved,
}: {
  checklist: ChecklistRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(checklist.name);
  const [desc, setDesc] = useState(checklist.description ?? '');
  const [lifecycle, setLifecycle] = useState<string[]>(checklist.applies_to_lifecycle);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemRequired, setNewItemRequired] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admission/settings/checklists/${checklist.id}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Load failed');
        return;
      }
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklist.id]);

  const handleSaveMeta = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admission/settings/checklists/${checklist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: desc || null,
          applies_to_lifecycle: lifecycle,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Save failed');
        return;
      }
      toast.success('Saved');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemTitle.trim()) return;
    const res = await fetch(
      `/api/admission/settings/checklists/${checklist.id}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newItemTitle, is_required: newItemRequired }),
      },
    );
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Add failed');
      return;
    }
    setNewItemTitle('');
    setNewItemRequired(false);
    loadItems();
  };

  const handleDeleteItem = async (itemId: string) => {
    const res = await fetch(
      `/api/admission/settings/checklists/${checklist.id}/items/${itemId}`,
      { method: 'DELETE' },
    );
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Delete failed');
      return;
    }
    loadItems();
  };

  const handleToggleRequired = async (item: ChecklistItem) => {
    const res = await fetch(
      `/api/admission/settings/checklists/${checklist.id}/items/${item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_required: !item.is_required }),
      },
    );
    if (!res.ok) {
      toast.error('Update failed');
      return;
    }
    loadItems();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Checklist</DialogTitle>
          <DialogDescription>Scope binding cannot be changed once a checklist exists.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Lifecycle stages</Label>
            <div className="flex gap-4 mt-2">
              {LIFECYCLE_OPTIONS.map((lc) => (
                <label key={lc} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={lifecycle.includes(lc)}
                    onCheckedChange={(checked) => {
                      setLifecycle((prev) =>
                        checked
                          ? Array.from(new Set([...prev, lc]))
                          : prev.filter((x) => x !== lc),
                      );
                    }}
                  />
                  <span className="capitalize">{lc}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t">
            <Label className="block mb-2">Items</Label>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No items yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground w-6 text-center">
                      {item.order_index + 1}
                    </span>
                    <span className="flex-1">{item.title}</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={item.is_required}
                        onCheckedChange={() => handleToggleRequired(item)}
                      />
                      Required
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2 mt-3">
              <Input
                placeholder="New item title…"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
              />
              <label className="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer">
                <Checkbox
                  checked={newItemRequired}
                  onCheckedChange={(c) => setNewItemRequired(c === true)}
                />
                Required
              </label>
              <Button size="sm" onClick={handleAddItem}>Add</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSaveMeta} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
