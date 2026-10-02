'use client';

// Group-level posts (Managing Director, Joint Managing Director …): ONE holder
// for the whole group, shown once here — never as a per-institution vacancy.
//
// Appointing is admin-only (the server decides, and returns can_manage_group so
// this screen never has to guess: useAuth() has no isSuperAdmin and the SQL
// check is narrower than the client's). Everyone else sees the holders
// read-only. A group post is a designation only and grants no access.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Crown, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LEADERSHIP_QK, useGroupLeadership } from '@/hooks/use-leadership';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { GroupHolderPicker } from './group-holder-picker';
import { LeaderCard } from './leader-card';

export function GroupLeadership() {
  const qc = useQueryClient();
  const group = useGroupLeadership();
  const canManage = group.data?.can_manage_group === true;

  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: LEADERSHIP_QK.group });

  async function run(code: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setSavingCode(code);
    const { error } = await fn();
    setSavingCode(null);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(ok);
    await refresh();
    return true;
  }

  const sb = () => createClientSupabaseClient() as any;

  if (group.isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  // A failure here must not take the rest of the page down.
  if (group.error) return null;

  const posts = group.data?.posts ?? [];
  if (posts.length === 0 && !canManage) return null;

  return (
    <section aria-labelledby="group-leadership-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 bg-gradient-to-r from-fuchsia-700 via-purple-700 to-indigo-800 px-5 py-4 text-white dark:from-fuchsia-900 dark:via-purple-900 dark:to-indigo-950">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
          <Crown className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="group-leadership-title" className="text-lg font-semibold leading-tight">
            Group leadership
          </h2>
          <p className="text-xs text-white/85">
            Common to all JKKN institutions.{' '}
            {canManage
              ? 'A post name is a designation only — it does not grant access.'
              : 'Only an admin can change these.'}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {posts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No group posts yet. Use Add post and choose Common for all institutions, for example
            Managing Director.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((p) => (
            <LeaderCard
              key={p.code}
              size="lg"
              postLabel={p.label}
              person={p.holder}
              vacantText="Not appointed"
              footer={
                canManage && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingCode !== null}
                        onClick={() => setPicking(p.code)}
                      >
                        {p.holder ? 'Change…' : 'Appoint someone…'}
                      </Button>
                      {p.holder && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={savingCode !== null}
                          onClick={() =>
                            void run(
                              p.code,
                              () => sb().rpc('fn_set_group_post_holder', { p_post_code: p.code, p_user_id: null }),
                              `${p.label} cleared.`,
                            )
                          }
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    {confirmDelete === p.code ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-destructive">Delete "{p.label}"?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7"
                          disabled={savingCode !== null}
                          onClick={async () => {
                            await run(
                              p.code,
                              () =>
                                sb().rpc('fn_update_leadership_post', {
                                  p_code: p.code,
                                  p_label: p.label,
                                  p_retire: true,
                                }),
                              `"${p.label}" deleted.`,
                            );
                            setConfirmDelete(null);
                          }}
                        >
                          Yes, delete
                        </Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                        disabled={savingCode !== null}
                        onClick={() => setConfirmDelete(p.code)}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        Delete this post
                      </button>
                    )}

                    <GroupHolderPicker
                      open={picking === p.code}
                      onOpenChange={(o) => setPicking(o ? p.code : null)}
                      postLabel={p.label}
                      currentHolderId={p.holder?.user_id ?? null}
                      onPick={(c) =>
                        run(
                          p.code,
                          () => sb().rpc('fn_set_group_post_holder', { p_post_code: p.code, p_user_id: c.id }),
                          `${p.label} updated.`,
                        )
                      }
                    />
                  </div>
                )
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
