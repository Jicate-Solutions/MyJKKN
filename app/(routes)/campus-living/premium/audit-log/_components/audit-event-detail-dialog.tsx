'use client';

// ============================================================================
// Premium Room Phase 2 — Audit Event Detail Dialog
// ============================================================================
// Shows a single audit row with full before/after JSON diff. Read-only.
// ============================================================================

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PremiumAuditLogRow } from '@/types/campus-living/premium-audit';

interface Props {
  row: PremiumAuditLogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditEventDetailDialog({ row, open, onOpenChange }: Props) {
  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Audit event detail
            <Badge variant="outline" className="font-mono text-xs">
              {row.event_type}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {row.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
            <DetailRow label="When" value={formatTimestamp(row.created_at)} />
            <DetailRow label="Actor" value={row.actor_name ?? 'System'} />
            <DetailRow label="Actor email" value={row.actor_email ?? '—'} />
            <DetailRow label="Allocation ID" value={row.allocation_id ?? '—'} mono />
            <DetailRow label="Learner" value={row.learner_name ?? '—'} />
            <DetailRow label="Learner ID" value={row.learner_id ?? '—'} mono />
            <DetailRow label="Institution ID" value={row.institution_id ?? '—'} mono />
            <DetailRow label="Block / Room / Bed" value={
              `${truncate(row.block_id)} / ${truncate(row.room_id)} / ${truncate(row.bed_id)}`
            } mono />
            <DetailRow
              label="Tier"
              value={
                row.old_tier_key && row.old_tier_key !== row.new_tier_key
                  ? `${row.old_tier_key} → ${row.new_tier_key ?? '—'}`
                  : (row.new_tier_key ?? '—')
              }
            />
            {row.override_reason && (
              <DetailRow
                label="Override reason"
                value={row.override_reason}
                wide
              />
            )}
          </div>

          {(row.old_value || row.new_value) && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Snapshot diff</h4>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs uppercase text-muted-foreground">Before</div>
                  <pre className="max-h-[260px] overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                    {prettyJson(row.old_value)}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-muted-foreground">After</div>
                  <pre className="max-h-[260px] overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                    {prettyJson(row.new_value)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {row.metadata && Object.keys(row.metadata).length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">Metadata</h4>
              <pre className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                {prettyJson(row.metadata)}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={mono ? 'break-all font-mono text-xs' : 'text-sm'}>{value}</div>
    </div>
  );
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
