'use client';

// Detail modal — opens when a user clicks the checklist Name in the table.
// Read-only view of the checklist with its items, lifecycle, and scope.
// Has an "Edit" button at the footer that closes this modal and triggers the
// parent's edit dialog.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Pencil, ClipboardCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { ChecklistRow } from './columns';

interface ItemRow {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_required: boolean;
  is_active: boolean;
}

const SCOPE_LABEL: Record<ChecklistRow['scope_type'], string> = {
  institution: 'Institution',
  degree: 'Degree',
  department: 'Department',
  program: 'Programme',
};

export function ChecklistDetailDialog({
  checklist,
  onClose,
  onEdit,
}: {
  checklist: ChecklistRow;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admission/settings/checklists/${checklist.id}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          toast.error(json.error ?? 'Failed to load items');
          return;
        }
        setItems(json.items ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checklist.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            {checklist.name}
          </DialogTitle>
          <DialogDescription>
            {checklist.description || 'No description'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 rounded-md border bg-muted/30 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Scope</p>
              <div className="text-sm font-medium flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {SCOPE_LABEL[checklist.scope_type]}
                </Badge>
                <span>{checklist.scope_label ?? '—'}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Applies to lifecycle</p>
              <div className="flex gap-1 flex-wrap mt-0.5">
                {checklist.applies_to_lifecycle.map((lc) => (
                  <Badge key={lc} variant="outline" className="text-xs capitalize">
                    {lc}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="text-sm">
                {checklist.is_active ? (
                  <Badge variant="outline" className="border-emerald-500 text-emerald-700">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                    Archived
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Items</p>
              <p className="text-sm font-medium">{items.length}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
              Items
            </p>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No items in this checklist yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item, idx) => (
                  <li key={item.id} className="flex items-center gap-3 p-2 rounded-md border">
                    <span className="font-mono text-xs text-muted-foreground w-6 text-center">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm">{item.title}</span>
                    {item.is_required && (
                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">
                        Required
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
