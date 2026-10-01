'use client';

// "Add post" — pick WHERE first, then name the post.
//
//   Common for all institutions   a group-level post (Managing Director …): one
//                                 holder for the whole group. Admin-only; the
//                                 server enforces it and disables nothing here
//                                 but the option.
//   Specific institutions         the post is created for each ticked
//                                 institution, owned by it alone (each gets its
//                                 own holder; other institutions never see it).
//
// A post name is a designation only — it grants no access.

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LEADERSHIP_QK, useGroupLeadership } from '@/hooks/use-leadership';
import type { OverviewRow } from '@/lib/organizations/leadership-stats';
import { createClientSupabaseClient } from '@/lib/supabase/client';

type Target = 'group' | 'institutions';

export function AddPostDialog({ institutions }: { institutions: OverviewRow[] }) {
  const qc = useQueryClient();
  const canGroup = useGroupLeadership().data?.can_manage_group === true;

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>('institutions');
  const [picked, setPicked] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return institutions.filter((i) => !q || i.institution_name.toLowerCase().includes(q));
  }, [institutions, filter]);

  const name = label.trim();
  const ready = name.length >= 2 && (target === 'group' || picked.length > 0);

  function reset() {
    setTarget('institutions');
    setPicked([]);
    setLabel('');
    setFilter('');
  }

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function create() {
    setBusy(true);
    const sb = createClientSupabaseClient() as any;

    if (target === 'group') {
      const { error } = await sb.rpc('fn_create_leadership_post', { p_label: name, p_scope: 'group' });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`"${name}" added for all institutions.`);
    } else {
      // One post per ticked institution. Each is independent, so report the ones
      // that failed by name instead of aborting on the first.
      const failed: string[] = [];
      let lastError = '';
      for (const id of picked) {
        const { error } = await sb.rpc('fn_create_leadership_post', {
          p_label: name,
          p_scope: 'institution',
          p_institution_id: id,
        });
        if (error) {
          failed.push(institutions.find((i) => i.institution_id === id)?.institution_name ?? id);
          lastError = error.message;
        }
      }
      setBusy(false);
      if (failed.length === picked.length) {
        toast.error(lastError);
        return;
      }
      if (failed.length > 0) {
        toast.error(`Not added for: ${failed.join(', ')}. ${lastError}`);
      } else {
        toast.success(`"${name}" added for ${picked.length} institution${picked.length === 1 ? '' : 's'}.`);
      }
    }

    setOpen(false);
    reset();
    await Promise.all([
      qc.invalidateQueries({ queryKey: LEADERSHIP_QK.group }),
      qc.invalidateQueries({ queryKey: LEADERSHIP_QK.overview }),
      qc.invalidateQueries({ queryKey: ['organizations', 'leadership', 'detail'] }),
      qc.invalidateQueries({ queryKey: ['organizations', 'leadership', 'catalog'] }),
    ]);
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Add post
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return;
          setOpen(o);
          if (!o) reset();
        }}
      >
        {/* DialogContent has no max-height of its own; a long institution list
            would otherwise push the buttons off screen. */}
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a leadership post</DialogTitle>
            <DialogDescription>
              Choose where the post applies, then name it. A post is a designation only — it does
              not grant any access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">1. Where does it apply?</legend>

              <label
                className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                  canGroup ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                } ${target === 'group' ? 'border-primary' : 'border-border'}`}
              >
                <input
                  type="radio"
                  name="target"
                  className="mt-1"
                  checked={target === 'group'}
                  disabled={!canGroup || busy}
                  onChange={() => setTarget('group')}
                />
                <span>
                  <span className="font-medium">Common for all institutions</span>
                  <span className="block text-xs text-muted-foreground">
                    One holder for the whole group, e.g. Managing Director.
                    {!canGroup && ' Only an admin can add these.'}
                  </span>
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
                  target === 'institutions' ? 'border-primary' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="target"
                  className="mt-1"
                  checked={target === 'institutions'}
                  disabled={busy}
                  onChange={() => setTarget('institutions')}
                />
                <span>
                  <span className="font-medium">Specific institutions</span>
                  <span className="block text-xs text-muted-foreground">
                    Each ticked institution gets its own post and its own holder.
                  </span>
                </span>
              </label>

              {target === 'institutions' && (
                <div className="space-y-2 pl-1 pt-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Search institutions…"
                      className="h-8"
                      aria-label="Search institutions"
                    />
                    <button
                      type="button"
                      className="shrink-0 text-xs text-primary hover:underline"
                      onClick={() =>
                        setPicked(
                          picked.length === institutions.length ? [] : institutions.map((i) => i.institution_id),
                        )
                      }
                    >
                      {picked.length === institutions.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {shown.map((i) => (
                      <li key={i.institution_id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={picked.includes(i.institution_id)}
                            onChange={() => toggle(i.institution_id)}
                            disabled={busy}
                          />
                          {i.institution_name}
                        </label>
                      </li>
                    ))}
                    {shown.length === 0 && (
                      <li className="text-xs text-muted-foreground">No institutions match.</li>
                    )}
                  </ul>
                  <p className="text-xs text-muted-foreground">{picked.length} selected</p>
                </div>
              )}
            </fieldset>

            <div>
              <label htmlFor="new-post-name" className="mb-1 block text-sm font-medium">
                2. Post name
              </label>
              <Input
                id="new-post-name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={target === 'group' ? 'e.g. Managing Director' : 'e.g. Dean'}
                maxLength={60}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ready && !busy) {
                    e.preventDefault();
                    void create();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!ready || busy} onClick={() => void create()}>
              {busy ? 'Adding…' : 'Add post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
