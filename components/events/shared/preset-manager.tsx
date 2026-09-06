'use client';

// components/events/shared/preset-manager.tsx
// Events Platform Promotion PR9 — manage OFFICIAL + PERSONAL presets for an event type
// (decisions #4/#5). Surfaced inside the Create-an-Event flow and at /events/presets.
//
//   • Lists official presets (everyone) + the caller's personal presets.
//   • Copy an official preset → a personal copy you can tweak.
//   • Edit / delete your own personal presets.
//   • Publish a new official preset (admins / events.presets.manage holders only).
//
// Selecting a preset calls `onApply(config)` so the create wizard can prefill from it.

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Copy, Pencil, Trash2, Check, Loader2, Star, User } from 'lucide-react';
import {
  useEventPresets,
  useCopyPresetToPersonal,
  useUpdatePreset,
  useDeletePreset,
} from '@/hooks/events/shared/use-event-presets';
import { usePermissions } from '@/hooks/use-permissions';
import { EVENT_TOOL_LABELS } from '@/types/events-presets';
import type { EventPreset, PresetConfig, EventToolKey } from '@/types/events-presets';

interface PresetManagerProps {
  /** event_type discriminator the presets are keyed on (e.g. 'sports_tournament'). */
  eventType: string;
  /** Optional human label for the type, shown in copy. */
  eventTypeLabel?: string;
  /** Called when the user applies a preset — the wizard prefills its form from this. */
  onApply?: (config: PresetConfig, preset: EventPreset) => void;
  /** When true, render a compact picker (used inside the wizard). */
  compact?: boolean;
}

function ToolChips({ tools }: { tools?: EventToolKey[] }) {
  if (!tools || tools.length === 0) {
    return <span className="text-xs text-muted-foreground">No tools enabled</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tools.map((t) => (
        <Badge key={t} variant="secondary" className="text-[10px]">
          {EVENT_TOOL_LABELS[t] ?? t}
        </Badge>
      ))}
    </div>
  );
}

export function PresetManager({
  eventType,
  eventTypeLabel,
  onApply,
  compact = false,
}: PresetManagerProps) {
  const { data: presets = [], isLoading } = useEventPresets(eventType);
  const { can } = usePermissions();
  const canManageOfficial = can('events.presets.manage');

  const copyMutation = useCopyPresetToPersonal(eventType);
  const updateMutation = useUpdatePreset(eventType);
  const deleteMutation = useDeletePreset(eventType);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EventPreset | null>(null);

  const official = presets.filter((p) => p.scope === 'official');
  const personal = presets.filter((p) => p.scope === 'personal');

  const startEdit = (p: EventPreset) => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const saveEdit = async (p: EventPreset) => {
    if (!editName.trim()) return;
    await updateMutation.mutateAsync({ id: p.id, patch: { name: editName } });
    setEditingId(null);
  };

  const renderPreset = (p: EventPreset, isPersonal: boolean) => (
    <div
      key={p.id}
      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          {isPersonal ? (
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          {editingId === p.id ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 max-w-[220px] text-sm"
              autoFocus
            />
          ) : (
            <span className="truncate text-sm font-medium">{p.name}</span>
          )}
          <Badge variant={isPersonal ? 'outline' : 'default'} className="text-[10px]">
            {isPersonal ? 'Personal' : 'Official'}
          </Badge>
        </div>
        <ToolChips tools={p.config?.enabled_tools} />
        {(p.config?.fee ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">Fee: ₹{p.config.fee}</p>
        )}
        {p.config?.divisions && p.config.divisions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Divisions: {p.config.divisions.join(', ')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {onApply && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => onApply(p.config ?? {}, p)}
          >
            <Check className="h-3.5 w-3.5" />
            Use
          </Button>
        )}
        {!isPersonal && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={copyMutation.isPending}
            onClick={() => copyMutation.mutate({ source: p })}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
        )}
        {isPersonal &&
          (editingId === p.id ? (
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={updateMutation.isPending}
              onClick={() => saveEdit(p)}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => startEdit(p)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(p)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ))}
      </div>
    </div>
  );

  const body = (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading presets…
        </div>
      ) : presets.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No presets yet for {eventTypeLabel ?? 'this event type'}.
          {canManageOfficial
            ? ' Publish an official preset to give coordinators a head start.'
            : ' Official presets published by admins will appear here.'}
        </p>
      ) : (
        <>
          {official.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Official presets
              </p>
              {official.map((p) => renderPreset(p, false))}
            </div>
          )}
          {personal.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                My presets
              </p>
              {personal.map((p) => renderPreset(p, true))}
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this preset?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be permanently removed from your
              presets. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (compact) return body;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Presets {eventTypeLabel ? `· ${eventTypeLabel}` : ''}
        </CardTitle>
        <CardDescription>
          Reusable setups. Copy an official preset to make it your own, or apply one to
          prefill a new event.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
