'use client';

// Which posts an institution has.
//
//   Shared posts     Principal, Vice Principal, IQAC … — ticked per institution.
//   Only this one    posts created here belong to THIS institution alone: no
//                    other institution sees or can tick them, and the name can
//                    repeat elsewhere (each college may have its own "Dean").
//
// Group-level posts (Managing Director …) are not offered here — they are
// appointed once, from the Group leadership section.
//
// A post name is a designation only: it grants NO access. The server refuses to
// remove a post that still has a holder, and its message is shown verbatim.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Settings2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LEADERSHIP_QK, useLeadershipPostCatalog } from '@/hooks/use-leadership';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export function ManagePosts({
  institutionId,
  appliedCodes,
}: {
  institutionId: string;
  appliedCodes: string[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(appliedCodes);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const catalog = useLeadershipPostCatalog(institutionId, open);
  const shared = (catalog.data ?? []).filter((p) => !p.owned);
  const own = (catalog.data ?? []).filter((p) => p.owned);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: LEADERSHIP_QK.detail(institutionId) }),
      qc.invalidateQueries({ queryKey: LEADERSHIP_QK.overview }),
      qc.invalidateQueries({ queryKey: LEADERSHIP_QK.catalog(institutionId) }),
    ]);

  const toggle = (code: string) =>
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  async function saveShared() {
    setBusy(true);
    const sb = createClientSupabaseClient() as any;
    const { error } = await sb.rpc('fn_set_institution_leadership_posts', {
      p_institution_id: institutionId,
      p_codes: selected,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Posts updated for this institution.');
    setOpen(false);
    await refresh();
  }

  async function addOwn() {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    const sb = createClientSupabaseClient() as any;
    const { error } = await sb.rpc('fn_create_leadership_post', {
      p_label: label,
      p_scope: 'institution',
      p_institution_id: institutionId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${label}" added for this institution.`);
    setNewLabel('');
    await refresh();
  }

  // Retire, not hard-delete: the catalog row is kept for history. The server
  // refuses while anyone still holds the post.
  async function deleteOwn(code: string, label: string) {
    setBusy(true);
    const sb = createClientSupabaseClient() as any;
    const { error } = await sb.rpc('fn_update_leadership_post', {
      p_code: code,
      p_label: label,
      p_retire: true,
    });
    setBusy(false);
    setConfirmDelete(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${label}" deleted.`);
    await refresh();
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setSelected(appliedCodes);
          setOpen(true);
        }}
      >
        <Settings2 className="mr-2 h-4 w-4" />
        Manage posts for this institution
      </Button>
    );
  }

  return (
    <div className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
      <div>
        <p className="text-sm font-medium">Shared posts</p>
        <p className="text-xs text-muted-foreground">
          Untick a post that does not exist here (it must be empty first).
        </p>
        <ul className="mt-2 space-y-2">
          {shared.map((p) => (
            <li key={p.code}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(p.code)}
                  onChange={() => toggle(p.code)}
                  disabled={busy}
                />
                <span className="flex-1">
                  {p.label}
                  {p.description && (
                    <span className="block text-xs text-muted-foreground">{p.description}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
          {catalog.isLoading && <li className="text-xs text-muted-foreground">Loading posts…</li>}
        </ul>
        <Button
          size="sm"
          className="mt-3"
          disabled={busy || selected.length === 0}
          onClick={() => void saveShared()}
        >
          Save shared posts
        </Button>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium">Only for this institution</p>
        <p className="text-xs text-muted-foreground">
          Created here and visible nowhere else. A post name is a designation only — it does not
          grant any access.
        </p>

        <ul className="mt-2 space-y-2">
          {own.length === 0 && !catalog.isLoading && (
            <li className="text-xs text-muted-foreground">No institution-only posts yet.</li>
          )}
          {own.map((p) => (
            <li key={p.code} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{p.label}</span>
              {confirmDelete === p.code ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-destructive">Delete "{p.label}"?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7"
                    disabled={busy}
                    onClick={() => void deleteOwn(p.code, p.label)}
                  >
                    Yes, delete
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setConfirmDelete(null)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => setConfirmDelete(p.code)}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Add a post, e.g. Dean"
            maxLength={60}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addOwn();
              }
            }}
          />
          <Button size="sm" variant="secondary" disabled={busy || !newLabel.trim()} onClick={() => void addOwn()}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
        Close
      </Button>
    </div>
  );
}
