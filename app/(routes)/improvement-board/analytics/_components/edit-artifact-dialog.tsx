'use client';

// Review & approve dialog for a department playbook artifact. A manager edits
// the AI draft's items (filling in real details), then approves — the edited
// content is saved on approval (fn_mba_dept_artifact_approve takes p_content).
// For the organogram, the "who holds it" field is backed by a datalist of REAL
// people connected to the area (/api/mba/dept-artifacts/people), so holders come
// from actual MyJKKN records rather than "[Manager to complete]" placeholders.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

type ArtifactType = 'organogram' | 'sop' | 'workflow';
interface Person {
  id: string;
  name: string | null;
  email: string | null;
}
interface Props {
  areaId: string;
  areaLabel: string;
  artifactType: ArtifactType;
  content: Record<string, unknown>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApproved: () => void;
}

const LABEL: Record<ArtifactType, string> = {
  organogram: 'Organogram',
  sop: 'Standard Operating Procedure',
  workflow: 'Workflow',
};
const LIST_KEY: Record<ArtifactType, string> = {
  organogram: 'roles',
  sop: 'steps',
  workflow: 'stages',
};
const FIELDS: Record<ArtifactType, Array<{ key: string; label: string; people?: boolean }>> = {
  organogram: [
    { key: 'title', label: 'Role' },
    { key: 'holder', label: 'Who holds it', people: true },
  ],
  sop: [
    { key: 'title', label: 'Step' },
    { key: 'detail', label: 'What happens' },
  ],
  workflow: [
    { key: 'name', label: 'Stage' },
    { key: 'action', label: 'What happens' },
  ],
};

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export function EditArtifactDialog({
  areaId,
  areaLabel,
  artifactType,
  content,
  open,
  onOpenChange,
  onApproved,
}: Props) {
  const listKey = LIST_KEY[artifactType];
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(asArray(content[listKey]).map((r) => ({ ...r })));
    if (artifactType === 'organogram') {
      fetch(`/api/mba/dept-artifacts/people?area_id=${encodeURIComponent(areaId)}`)
        .then((r) => (r.ok ? r.json() : { people: [] }))
        .then((j: { people?: Person[] }) => setPeople(j.people ?? []))
        .catch(() => setPeople([]));
    }
  }, [open, content, listKey, artifactType, areaId]);

  function updateRow(i: number, field: string, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, {}]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function approve() {
    setSaving(true);
    try {
      const edited = { ...content, [listKey]: rows };
      const supabase = createClientSupabaseClient() as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
      await supabase.rpc('fn_mba_dept_artifact_approve', {
        p_area_id: areaId,
        p_artifact_type: artifactType,
        p_content: edited,
        p_review_notes: null,
      });
      onOpenChange(false);
      onApproved();
    } finally {
      setSaving(false);
    }
  }

  const fields = FIELDS[artifactType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Review &amp; approve — {areaLabel} · {LABEL[artifactType]}
          </DialogTitle>
          <DialogDescription>
            Fill in the real details, then approve. For the organogram you can pick people
            already connected to this department, or type a name.
          </DialogDescription>
        </DialogHeader>

        {people.length > 0 && (
          <datalist id={`people-${artifactType}`}>
            {people.map((p) => (
              <option key={p.id} value={p.name ?? p.email ?? ''} />
            ))}
          </datalist>
        )}

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div
              key={i}
              className="relative grid gap-2 rounded-md border p-2 pr-8 sm:grid-cols-2"
            >
              {fields.map((f) => (
                <div key={f.key}>
                  <Label className="text-muted-foreground text-xs">{f.label}</Label>
                  <Input
                    value={str(row[f.key])}
                    list={f.people ? `people-${artifactType}` : undefined}
                    onChange={(e) => updateRow(i, f.key, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                aria-label="Remove this row"
                onClick={() => removeRow(i)}
                className="text-muted-foreground hover:text-destructive absolute right-1.5 top-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nothing here yet — add the first item below, or approve as-is.
            </p>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
            <Plus className="mr-1 h-3 w-3" />
            Add row
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={approve}
            disabled={saving}
          >
            {saving ? 'Approving…' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
