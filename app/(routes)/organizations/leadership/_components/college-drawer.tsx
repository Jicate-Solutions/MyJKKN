'use client';

// One college's four senior posts, assignable. Departments/HoD are NOT here —
// they live on /organizations/departments/hod-assignment.
//
// The single write path is fn_set_college_leadership. The basis arguments are
// sent ONLY when the caller has one to record, which keeps this a four-argument
// call that also resolves against the pre-basis function, and leaves an
// already-recorded reason untouched while the holder is unchanged.

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  LEADERSHIP_QK,
  useAppointmentBasis,
  useCollegeLeadership,
  useCollegePeople,
} from '@/hooks/use-leadership';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BASIS_POSTS, personName } from '@/lib/organizations/leadership-stats';
import { BasisEditor, BasisLine } from './basis-parts';
import { LeaderCard } from './leader-card';
import { ManagePosts } from './manage-posts';

// Radix/cmdk reserve the empty string, so "unassign" needs a sentinel that is
// translated back to NULL before it reaches the RPC.
const UNASSIGNED = '__unassigned__';

export function CollegeDrawer({
  institutionId,
  canEdit,
  onClose,
}: {
  institutionId: string | null;
  /** Super admin only. Everyone else gets the same drawer, read-only. */
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingBasis, setEditingBasis] = useState<string | null>(null);
  const [hiding, setHiding] = useState(false);

  const id = institutionId ?? '';
  const detailQuery = useCollegeLeadership(id);
  const peopleQuery = useCollegePeople(canEdit ? id : "");
  const basisQuery = useAppointmentBasis();

  const detail = detailQuery.data ?? null;
  const basisOptions = basisQuery.data ?? [];
  // Inert until the basis migration has landed; failing to read the vocabulary
  // is a soft signal that hides the basis UI and nothing else.
  const basisEnabled = !basisQuery.isError && basisOptions.length > 0;

  const candidateOptions = useMemo(
    () => [
      { value: UNASSIGNED, label: '— Not assigned —' },
      ...(peopleQuery.data ?? []).map((c) => ({
        value: c.id,
        label: c.full_name?.trim() || c.email || 'Unnamed person',
      })),
    ],
    [peopleQuery.data],
  );

  const assign = useCallback(
    async (position: string, rawUserId: string, opts?: { basisCode?: string; basisNote?: string }) => {
      if (!id) return;
      const userId = rawUserId === UNASSIGNED ? null : rawUserId;
      setSavingKey(position);

      const sb = createClientSupabaseClient() as any;
      // Built-in posts keep the standard path (Principal / Vice Principal also
      // maintain the global role). Custom posts are designation records and go
      // through a function that never writes roles.
      const isCustom = detail?.posts.find((p) => p.code === position)?.kind === 'generic';
      const { error } = isCustom
        ? await sb.rpc('fn_set_college_post_holder', {
            p_institution_id: id,
            p_position: position,
            p_user_id: userId,
          })
        : await sb.rpc('fn_set_college_leadership', {
            p_institution_id: id,
            p_position: position,
            p_user_id: userId,
            p_department_id: null,
            ...(opts?.basisCode
              ? { p_basis_code: opts.basisCode, p_basis_note: opts.basisNote ?? null }
              : {}),
          });
      setSavingKey(null);

      if (error) {
        // The RPC raises a plain-English reason for every refusal; show it verbatim.
        toast.error(error.message);
        return;
      }

      const label = detail?.posts.find((p) => p.code === position)?.label ?? 'Post';
      toast.success(
        opts?.basisCode ? `Reason recorded for ${label}.` : userId ? `${label} updated.` : `${label} cleared.`,
      );
      setEditingBasis(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: LEADERSHIP_QK.detail(id) }),
        qc.invalidateQueries({ queryKey: LEADERSHIP_QK.overview }),
      ]);
    },
    [id, qc, detail],
  );

  // Super admin only (enforced by the RPC). Hiding removes the institution from
  // this page for everyone, so the drawer closes; it can be restored from the
  // "Hidden institutions" list. It does not change anyone's access elsewhere.
  async function hideFromPage() {
    if (!id) return;
    setHiding(true);
    const sb = createClientSupabaseClient() as any;
    const { error } = await sb.rpc('fn_set_leadership_institution_hidden', {
      p_institution_id: id,
      p_hidden: true,
    });
    setHiding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${detail?.institution_name ?? 'Institution'} hidden from this page.`);
    onClose();
    await qc.invalidateQueries({ queryKey: LEADERSHIP_QK.overview });
  }

  return (
    <Sheet open={!!institutionId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{detail?.institution_name ?? 'College leadership'}</SheetTitle>
          <SheetDescription>
            {canEdit
              ? "Assign the senior posts that apply to this institution."
              : "The senior posts that apply to this institution. View only."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {detailQuery.isLoading && <Skeleton className="h-64 w-full" />}

          {detailQuery.error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {(detailQuery.error as Error).message}
            </p>
          )}

          {detail && (
            <>
              {canEdit && (
                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <span>
                    <span className="block text-sm font-medium">Shown on this page</span>
                    <span className="block text-xs text-muted-foreground">
                      Turn off to hide this institution from the Leadership page for everyone. You can show it
                      again from Hidden institutions.
                    </span>
                  </span>
                  <Switch
                    checked
                    disabled={hiding}
                    onCheckedChange={() => void hideFromPage()}
                    aria-label="Shown on this page. Turn off to hide."
                  />
                </label>
              )}

              {canEdit && (
                <ManagePosts
                  key={detail.posts.map((p) => p.code).join(',')}
                  institutionId={detail.institution_id}
                  appliedCodes={detail.posts.map((p) => p.code)}
                />
              )}

              {canEdit && detail.committee_id === null && (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  This college has no IQAC committee record yet. Naming a Chairman or Coordinator
                  creates one automatically.
                </p>
              )}

              {detail.posts.map((post) => {
                const key = post.code;
                const holder = post.holder;
                const name = personName(holder);
                // Only Principal and Vice Principal have anywhere to keep a basis —
                // IQAC office bearers live on the committee row.
                const canRecordBasis =
                  basisEnabled && holder !== null && BASIS_POSTS.includes(key);
                return (
                  <div key={key} className="space-y-2 border-b border-border pb-5 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{post.label}</p>
                      {post.description && (
                        <p className="text-xs text-muted-foreground">{post.description}</p>
                      )}
                    </div>
                    <LeaderCard postLabel={post.label} person={holder} />

                    {canRecordBasis && holder && (
                      <>
                        <BasisLine holder={holder} />
                        {!canEdit ? null : editingBasis === key ? (
                          <BasisEditor
                            holder={holder}
                            options={basisOptions}
                            busy={savingKey !== null}
                            onCancel={() => setEditingBasis(null)}
                            onSave={(basisCode, basisNote) =>
                              void assign(key, holder.user_id, { basisCode, basisNote })
                            }
                          />
                        ) : (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-0 text-xs"
                            disabled={savingKey !== null}
                            onClick={() => setEditingBasis(key)}
                          >
                            {holder.basis_code ? 'Change the reason' : 'Record why this post was given'}
                          </Button>
                        )}
                      </>
                    )}

                    {canEdit && (
                      <SearchableSelect
                        value={holder?.user_id ?? UNASSIGNED}
                        onValueChange={(v) => void assign(key, v)}
                        options={candidateOptions}
                        placeholder={name ? 'Change…' : 'Assign someone…'}
                        searchPlaceholder="Search people…"
                        disabled={savingKey !== null}
                        loading={savingKey === key}
                        className="w-full"
                      />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
