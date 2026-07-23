'use client';

// app/(routes)/learners/enquiries/[id]/_components/checklist-tab.tsx
//
// Checklist tab on the enquiry page. Fetches the aggregated checklist for
// the learner (resolved via get_learner_checklist RPC) and lets admins
// toggle items done/undone. Each toggle also fires an audit row on the
// activities timeline via the mark_checklist_item RPC.
//
// Marking is permission-gated by admission.enquiries.checklist.mark — users
// with only .view see the items read-only.

import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ClipboardCheck, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDateTimeDMY } from '@/lib/utils/date-format';

interface ChecklistItem {
  item_id: string;
  item_title: string;
  item_description: string | null;
  is_required: boolean;
  order_index: number;
  is_done: boolean;
  marked_by: string | null;
  marked_by_name: string | null;
  marked_at: string | null;
}

interface ChecklistGroup {
  checklist_id: string;
  checklist_name: string;
  checklist_desc: string | null;
  scope_type: 'institution' | 'degree' | 'department' | 'program';
  scope_label: string | null;
  items: ChecklistItem[];
}

const SCOPE_LABELS: Record<ChecklistGroup['scope_type'], string> = {
  institution: 'Institution-wide',
  degree: 'Degree',
  department: 'Department',
  program: 'Programme-specific',
};

export function ChecklistTab({ learnerProfileId }: { learnerProfileId: string }) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canMark = isSuperAdmin || canAccess('admission.enquiries.checklist', 'mark');

  const [groups, setGroups] = useState<ChecklistGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admission/enquiries/${learnerProfileId}/checklist`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to load checklist');
        return;
      }
      setGroups(json.groups ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerProfileId]);

  const { totalItems, doneItems } = useMemo(() => {
    if (!groups) return { totalItems: 0, doneItems: 0 };
    let total = 0;
    let done = 0;
    for (const g of groups) {
      total += g.items.length;
      done += g.items.filter((i) => i.is_done).length;
    }
    return { totalItems: total, doneItems: done };
  }, [groups]);

  const percent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const handleToggle = async (item: ChecklistItem) => {
    if (!canMark) return;
    // Optimistic update
    setGroups((prev) =>
      prev?.map((g) => ({
        ...g,
        items: g.items.map((it) =>
          it.item_id === item.item_id ? { ...it, is_done: !item.is_done } : it,
        ),
      })) ?? null,
    );

    const res = await fetch(`/api/admission/enquiries/${learnerProfileId}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.item_id, is_done: !item.is_done }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Update failed');
      // Roll back optimistic change by refetching
      load();
      return;
    }
    // Refetch to pick up marked_by_name / marked_at from server
    load();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist</CardTitle>
          <CardDescription>Admission verification items for this learner</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-10 text-muted-foreground">
            <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No checklists configured for this learner&apos;s programme yet.</p>
            <p className="text-xs mt-1">
              Admins can create one under{' '}
              <a href="/admission/settings/checklists" className="text-primary underline">
                Settings → Checklists
              </a>.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Checklist</CardTitle>
            <CardDescription>
              {doneItems} of {totalItems} items complete{!canMark && ' (read-only)'}
            </CardDescription>
          </div>
          <div className="w-40">
            <Progress value={percent} className="h-2" />
            <p className="text-xs text-muted-foreground text-right mt-1">{percent}%</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.checklist_id}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium">{g.checklist_name}</h3>
                <Badge variant="outline" className="text-xs">
                  {SCOPE_LABELS[g.scope_type]}
                  {g.scope_label && ` · ${g.scope_label}`}
                </Badge>
              </div>
              {g.checklist_desc && (
                <p className="text-xs text-muted-foreground mb-2">{g.checklist_desc}</p>
              )}
              <ul className="space-y-2">
                {g.items.map((item) => (
                  <li
                    key={item.item_id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={item.is_done}
                      disabled={!canMark}
                      onCheckedChange={() => handleToggle(item)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${item.is_done ? 'line-through text-muted-foreground' : ''}`}>
                          {item.item_title}
                        </span>
                        {item.is_required && (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">
                            Required
                          </Badge>
                        )}
                      </div>
                      {item.item_description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.item_description}</p>
                      )}
                      {item.is_done && item.marked_at && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="h-3 w-3" aria-hidden />
                          <span className="font-medium text-foreground/80">
                            {item.marked_by_name ?? 'Unknown user'}
                          </span>
                          <span aria-hidden>·</span>
                          <span>{formatDateTimeDMY(item.marked_at)}</span>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
