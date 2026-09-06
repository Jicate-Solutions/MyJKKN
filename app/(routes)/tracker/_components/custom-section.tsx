'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS: Record<string, { label: string; cls: string }> = {
  not_started: { label: 'Not started', cls: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In progress', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' },
  compliant: { label: 'Compliant', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  at_risk: { label: 'At risk', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  blocked: { label: 'Blocked', cls: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300' },
  na: { label: 'N/A', cls: 'bg-muted text-muted-foreground' },
};
const STATUS_ORDER = ['not_started', 'in_progress', 'at_risk', 'blocked', 'compliant', 'na'];

interface Item {
  id: string;
  title: string;
  description: string | null;
  compliance_status: string;
  due_date: string | null;
}
interface Comment {
  id: string;
  body: string;
  status_change: string | null;
  created_at: string;
  author_id: string;
}
interface Assignee {
  assignee_id: string;
  name: string;
}

export function CustomSection({ sectionId, canWrite }: { sectionId: string; canWrite: boolean }) {
  const supabase = createClientSupabaseClient();
  const [items, setItems] = useState<Item[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('tracker_items')
      .select('id,title,description,compliance_status,due_date')
      .eq('section_id', sectionId)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at');
    setItems((data as Item[]) ?? []);
  }, [sectionId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem() {
    const title = newTitle.trim();
    if (!title) return;
    await (supabase as any).rpc('fn_tracker_add_item', { p_section_id: sectionId, p_title: title });
    setNewTitle('');
    setAdding(false);
    load();
  }

  if (!items) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing tracked here yet.</p>
      )}

      {items.map((item) => (
        <ItemCard key={item.id} item={item} canWrite={canWrite} onChange={load} />
      ))}

      {canWrite &&
        (adding ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder="What needs tracking?"
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
            />
            <Button size="sm" onClick={addItem}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            + Add item
          </Button>
        ))}
    </div>
  );
}

function ItemCard({ item, canWrite, onChange }: { item: Item; canWrite: boolean; onChange: () => void }) {
  const supabase = createClientSupabaseClient();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [assignees, setAssignees] = useState<Assignee[] | null>(null);
  const [newComment, setNewComment] = useState('');
  const [assignQuery, setAssignQuery] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);

  const st = STATUS[item.compliance_status] ?? STATUS.not_started;

  const loadDetail = useCallback(async () => {
    const [c, a] = await Promise.all([
      (supabase as any)
        .from('tracker_comments')
        .select('id,body,status_change,created_at,author_id')
        .eq('item_id', item.id)
        .order('created_at'),
      (supabase as any)
        .from('tracker_item_assignees')
        .select('assignee_id, profiles!tracker_item_assignees_assignee_id_fkey(full_name,email)')
        .eq('item_id', item.id),
    ]);
    setComments((c.data as Comment[]) ?? []);
    setAssignees(
      ((a.data as any[]) ?? []).map((r) => ({
        assignee_id: r.assignee_id,
        name: r.profiles?.full_name || r.profiles?.email || 'Unknown',
      })),
    );
  }, [item.id, supabase]);

  useEffect(() => {
    if (open) loadDetail();
  }, [open, loadDetail]);

  async function setStatus(status: string) {
    await (supabase as any).rpc('fn_tracker_set_status', { p_item_id: item.id, p_status: status });
    onChange();
    if (open) loadDetail();
  }
  async function addComment() {
    const body = newComment.trim();
    if (!body) return;
    await (supabase as any).rpc('fn_tracker_add_comment', { p_item_id: item.id, p_body: body });
    setNewComment('');
    loadDetail();
  }
  async function searchPeople(q: string) {
    setAssignQuery(q);
    if (q.trim().length < 2) return setPeople([]);
    const { data } = await (supabase as any)
      .from('profiles')
      .select('id,full_name,email')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    setPeople(((data as any[]) ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email })));
  }
  async function assign(id: string) {
    await (supabase as any).rpc('fn_tracker_assign', { p_item_id: item.id, p_assignee_id: id });
    setAssignQuery('');
    setPeople([]);
    loadDetail();
  }
  async function unassign(id: string) {
    await (supabase as any).rpc('fn_tracker_unassign', { p_item_id: item.id, p_assignee_id: id });
    loadDetail();
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
        <button
          className="flex-1 text-left text-sm font-medium hover:underline"
          onClick={() => setOpen((o) => !o)}
        >
          {item.title}
        </button>
        {item.due_date && (
          <span className="text-xs text-muted-foreground">due {item.due_date}</span>
        )}
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Details'}
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t px-4 py-3">
          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}

          {canWrite && (
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                    s === item.compliance_status
                      ? STATUS[s].cls
                      : 'border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {STATUS[s].label}
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Owners
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(assignees ?? []).map((a) => (
                <Badge key={a.assignee_id} variant="secondary" className="gap-1">
                  {a.name}
                  {canWrite && (
                    <button onClick={() => unassign(a.assignee_id)} className="ml-1 hover:text-destructive">
                      ×
                    </button>
                  )}
                </Badge>
              ))}
              {(assignees ?? []).length === 0 && <span className="text-xs text-muted-foreground">No owner yet</span>}
            </div>
            {canWrite && (
              <div className="relative mt-2 max-w-xs">
                <input
                  value={assignQuery}
                  onChange={(e) => searchPeople(e.target.value)}
                  placeholder="Assign someone…"
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
                />
                {people.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow">
                    {people.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => assign(p.id)}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Comments &amp; updates
            </div>
            {comments === null ? (
              <Skeleton className="h-10 w-full" />
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No comments yet.</p>
            ) : (
              <ul className="space-y-2">
                {comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    {c.status_change && (
                      <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                        {c.status_change.replace('→', ' → ')}
                      </span>
                    )}
                    {c.body}
                    <span className="ml-2 text-[0.65rem] text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
                />
                <Button size="sm" onClick={addComment}>
                  Post
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
