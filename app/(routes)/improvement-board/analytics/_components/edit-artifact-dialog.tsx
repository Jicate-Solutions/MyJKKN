'use client';

// Review & approve dialog for a department playbook artifact. A manager edits
// the AI draft's items (filling in real details), then approves — the edited
// content is saved on approval (fn_mba_dept_artifact_approve takes p_content).
//
// For the organogram, "who holds it" picks a REAL MyJKKN person and records which
// one. On approve the picks are written to hr_additional_roles as data
// (fn_mba_dept_role_assignments_sync), so they SURVIVE a re-draft: content JSON is
// replaced by a fresh AI draft, the assignment rows are not — and this dialog
// pre-fills from them instead of showing "[Manager to complete]" again.

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { PersonPicker } from './person-picker';
import { displayHolder, isUnfilledHolder } from './holder-display';

type ArtifactType = 'organogram' | 'sop' | 'workflow' | 'policy';
/** Content key holding the picked person's team member id, alongside `holder`. */
const HOLDER_ID_KEY = 'holder_staff_id';
/** Assigning a role holder is an officer action; so is signing off a policy. */
const ASSIGN_PERMISSION = 'improvement.area_role.assign';
const POLICY_PERMISSION = 'improvement.area_policy.approve';
interface Assignment {
  role_type: string;
  staff_id: string | null;
  holder_name: string | null;
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
  policy: 'Department Policy',
};
const LIST_KEY: Record<ArtifactType, string> = {
  organogram: 'roles',
  sop: 'steps',
  workflow: 'stages',
  policy: 'clauses',
};
// `long` marks a free-text description field. Those hold a sentence or more, so
// a single-line input truncated them mid-word ("Document which library resources,
// locat…") — a manager could not read the text they were being asked to approve,
// let alone edit its tail. They render as a wrapping, auto-growing textarea.
const FIELDS: Record<
  ArtifactType,
  Array<{ key: string; label: string; people?: boolean; long?: boolean }>
> = {
  organogram: [
    { key: 'title', label: 'Role' },
    { key: 'holder', label: 'Who holds it', people: true },
  ],
  sop: [
    { key: 'title', label: 'Step' },
    { key: 'detail', label: 'What happens', long: true },
  ],
  workflow: [
    { key: 'name', label: 'Stage' },
    { key: 'action', label: 'What happens', long: true },
  ],
  policy: [
    { key: 'title', label: 'Clause' },
    { key: 'text', label: 'What the policy says', long: true },
  ],
};

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return str((e as { message?: unknown }).message);
  }
  return str(e);
}
/** Role titles are edited free-hand — match them the way the database does. */
function normTitle(v: unknown): string {
  return str(v).trim().toLowerCase();
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
  const [saving, setSaving] = useState(false);
  // Assigning a holder writes hr_additional_roles — institution-wide org data — so it is
  // an officer action (CEO / CAO / EAO) held under its own permission, separate from
  // improvement.board.manage. The DB enforces this; this only decides whether to render
  // an editable picker or a read-only value, so a manager is never shown a control whose
  // save would be rejected.
  const [canAssign, setCanAssign] = useState(false);
  // A department policy is an official institution document: signing one off is
  // reserved for the CEO / CAO / EAO. The DB enforces it; this decides whether the
  // dialog offers an Approve button or a plain read-only view, so a manager is
  // never shown a control whose save would be rejected.
  const [canApprovePolicy, setCanApprovePolicy] = useState(false);
  // Why the current holders could not be read, if they could not. Approving while
  // this is set would sync the AI draft's placeholders over what is actually
  // recorded — end-dating real holders — so approve refuses until it clears.
  const [holdersError, setHoldersError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCanAssign(false);
      setCanApprovePolicy(false);
      return;
    }
    // Both checks read the VALUE of the key (user_has_permission compares the
    // stored boolean) — an unticked box in Role Management is key-present-false.
    const needed: string[] = [];
    if (artifactType === 'organogram') needed.push(ASSIGN_PERMISSION);
    if (artifactType === 'policy') needed.push(POLICY_PERMISSION);
    if (needed.length === 0) {
      setCanAssign(false);
      setCanApprovePolicy(false);
      return;
    }

    let cancelled = false;
    const supabase = createClientSupabaseClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    Promise.all(
      needed.map((permission_name) =>
        supabase
          .rpc('user_has_permission', { permission_name })
          .then(({ data }) => data === true)
          .catch(() => false),
      ),
    ).then((results) => {
      if (cancelled) return;
      needed.forEach((key, i) => {
        if (key === ASSIGN_PERMISSION) setCanAssign(results[i]);
        if (key === POLICY_PERMISSION) setCanApprovePolicy(results[i]);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, artifactType]);

  useEffect(() => {
    if (!open) return;
    const base = asArray(content[listKey]).map((r) => ({ ...r }));
    if (artifactType !== 'organogram') {
      setRows(base);
      return;
    }
    setRows(base);

    // Re-draft survival: the fresh AI draft resets every holder to a placeholder,
    // so overlay the assignments that were actually made. They are keyed by role
    // title, which is how the database keys them too.
    let cancelled = false;
    setHoldersError(null);
    fetch(`/api/mba/dept-artifacts/role-assignments?area_id=${encodeURIComponent(areaId)}`)
      .then((r) => {
        // A 403 or 500 used to be turned into an empty list, which is
        // indistinguishable from "nobody holds anything yet" — and that is how a
        // placeholder comes to replace a real holder on approve. Fail loudly instead.
        if (!r.ok) {
          throw new Error(
            r.status === 403
              ? 'you are not allowed to read the current role holders'
              : `the server returned ${r.status}`,
          );
        }
        return r.json() as Promise<{ assignments?: Assignment[] }>;
      })
      .then((j) => {
        if (cancelled) return;
        const byTitle = new Map<string, Assignment>();
        for (const a of j.assignments ?? []) byTitle.set(normTitle(a.role_type), a);
        if (byTitle.size === 0) return;
        setRows((rs) =>
          rs.map((r) => {
            const a = byTitle.get(normTitle(r.title));
            if (!a) return r;
            // A standing row whose "holder" is still the AI's bracketed placeholder
            // means nobody was ever named — carry it back as empty, not as a name.
            const name = isUnfilledHolder(a.holder_name) ? '' : (a.holder_name ?? '');
            return { ...r, holder: name, [HOLDER_ID_KEY]: a.staff_id ?? '' };
          }),
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const why = e instanceof Error ? e.message : 'the request failed';
        setHoldersError(why);
        toast.error(
          `Couldn't load who currently holds each role — ${why}. Close and reopen this before approving.`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, content, listKey, artifactType, areaId]);

  function updateRow(i: number, field: string, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  const updateHolder = useCallback((i: number, name: string, staffId: string | null) => {
    setRows((rs) =>
      rs.map((r, idx) => (idx === i ? { ...r, holder: name, [HOLDER_ID_KEY]: staffId ?? '' } : r)),
    );
  }, []);
  function addRow() {
    setRows((rs) => [...rs, {}]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function approve() {
    // The organogram's holder fields are only trustworthy once the saved holders have
    // been overlaid onto the AI draft. If that read failed, the fields still hold the
    // draft's placeholders, and approving would sync those over the real assignments.
    if (artifactType === 'organogram' && holdersError) {
      toast.error(
        `Can't approve yet — the current role holders could not be read (${holdersError}). Close this dialog and reopen it.`,
      );
      return;
    }
    setSaving(true);
    try {
      const edited = { ...content, [listKey]: rows };
      const supabase = createClientSupabaseClient() as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
      const { error } = await supabase.rpc('fn_mba_dept_artifact_approve', {
        p_area_id: areaId,
        p_artifact_type: artifactType,
        p_content: edited,
        p_review_notes: null,
      });
      if (error) {
        // Keep the dialog open so the manager's edits are preserved and retryable.
        toast.error(`Couldn't approve — ${errMsg(error) || 'please try again.'}`);
        return;
      }

      // Persist the organogram's holders as real rows. Runs AFTER the approve so
      // a failure here can never lose an approval — it is reported, not swallowed.
      if (artifactType === 'organogram') {
        const assignments = rows
          .map((r) => ({
            role_type: str(r.title).trim(),
            staff_id: str(r[HOLDER_ID_KEY]).trim() || null,
            // Send the placeholder THROUGH, unchanged. It must not become a holder —
            // fn_mba_dept_role_assignment_set rejects it outright, and
            // fn_mba_dept_role_assignments_sync reads it as "leave this role alone",
            // keeping the role in the sync's keep-list so any real holder stays put.
            //
            // Blanking it here instead looks tidier and is destructive: a null holder
            // means "the manager deliberately cleared this", which drops the role out
            // of the keep-list and end-dates its genuine holder. Measured against the
            // live function, same failed-overlay case:
            //   placeholder sent through  ->  is_current=true   holder safe
            //   placeholder blanked       ->  is_current=false  holder end-dated
            // isUnfilledHolder stays a DISPLAY concern (see displayHolder) — the
            // screen shows "Not assigned yet", the database still sees the truth.
            holder_note: str(r[HOLDER_ID_KEY]).trim() ? null : str(r.holder).trim() || null,
          }))
          .filter((a) => a.role_type !== '');
        const { error: syncError } = await supabase.rpc('fn_mba_dept_role_assignments_sync', {
          p_area_id: areaId,
          p_assignments: assignments,
        });
        if (syncError) {
          toast.error(
            `Approved, but the role holders were not saved — ${
              errMsg(syncError) || 'please reopen and try again.'
            }`,
          );
        }
      }

      onOpenChange(false);
      onApproved();
    } finally {
      setSaving(false);
    }
  }

  const fields = FIELDS[artifactType];
  // Officers own the policy. Everyone else gets the same dialog, read-only —
  // mirroring how the organogram's holder picker is gated.
  const readOnly = artifactType === 'policy' && !canApprovePolicy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? 'Review' : 'Review & approve'} — {areaLabel} · {LABEL[artifactType]}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'This is the proposed policy. Only the CEO, CAO or Executive Administrative Officer can edit and sign it off, or upload the real document in its place.'
              : artifactType === 'policy'
                ? 'Read each clause, correct anything that is wrong, then sign it off. If the department already has a real policy document, upload that instead — an uploaded document always takes precedence over a draft.'
                : 'Fill in the real details, then approve. For the organogram, search MyJKKN by name or email to pick the person who holds each role — the choice is saved and comes back the next time this playbook is drafted.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div
              key={i}
              className="relative grid gap-2 rounded-md border p-2 pr-8 sm:grid-cols-2"
            >
              {fields.map((f) => (
                <div key={f.key}>
                  <Label className="text-muted-foreground text-xs">{f.label}</Label>
                  {f.long ? (
                    <Textarea
                      value={str(row[f.key])}
                      onChange={(e) => updateRow(i, f.key, e.target.value)}
                      rows={3}
                      readOnly={readOnly}
                      className="min-h-16 resize-y text-sm"
                    />
                  ) : f.people ? (
                    canAssign ? (
                      <PersonPicker
                        areaId={areaId}
                        value={{
                          name: str(row[f.key]),
                          staffId: str(row[HOLDER_ID_KEY]).trim() || null,
                        }}
                        onChange={(next) => updateHolder(i, next.name, next.staffId)}
                      />
                    ) : (
                      // Assigning a holder writes institution-wide org data, so it is
                      // reserved for the CEO / CAO / EAO. Managers still SEE the holder.
                      <div
                        className="bg-muted/40 text-muted-foreground flex h-8 items-center rounded-md border px-2 text-sm"
                        title="Only the CEO, CAO or Executive Administrative Officer can assign a role holder"
                      >
                        {displayHolder(row[f.key])}
                      </div>
                    )
                  ) : (
                    <Input
                      value={str(row[f.key])}
                      onChange={(e) => updateRow(i, f.key, e.target.value)}
                      readOnly={readOnly}
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              ))}
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove this row"
                  onClick={() => removeRow(i)}
                  className="text-muted-foreground hover:text-destructive absolute right-1.5 top-1.5"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {readOnly
                ? 'Nothing here yet.'
                : 'Nothing here yet — add the first item below, or approve as-is.'}
            </p>
          )}
          {!readOnly && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
              <Plus className="mr-1 h-3 w-3" />
              Add row
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={approve}
              disabled={saving || (artifactType === 'organogram' && holdersError !== null)}
              title={
                artifactType === 'organogram' && holdersError
                  ? `The current role holders could not be read (${holdersError}). Close and reopen this dialog.`
                  : undefined
              }
            >
              {saving ? 'Approving…' : artifactType === 'policy' ? 'Sign off' : 'Approve'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
