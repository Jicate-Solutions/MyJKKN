'use client';

import { useState } from 'react';
import { CalendarClock, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import {
  DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  useAttributionWindowDays,
  useUpsertAttributionWindowDays,
} from './attribution-service';

interface Props {
  canEdit: boolean;
}

/**
 * Editor for the ig.attribution_window_days policy.
 * Director / super_admin can change the attribution window without a deploy.
 */
export function WindowPolicyCard({ canEdit }: Props) {
  const { data, isLoading } = useAttributionWindowDays();
  const upsert = useUpsertAttributionWindowDays();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Attribution window
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-64" />
        </CardContent>
      </Card>
    );
  }

  // Re-mount the editor whenever the server value changes (e.g. after save
  // or reset). The `key={data.value}` on the inner component re-initialises
  // its draft state to match — no setState-in-effect needed.
  return <WindowEditor key={data.value} data={data} canEdit={canEdit} upsert={upsert} />;
}

interface EditorProps {
  data: { value: number; isOverride: boolean; rowId: string | null };
  canEdit: boolean;
  upsert: ReturnType<typeof useUpsertAttributionWindowDays>;
}

function WindowEditor({ data, canEdit, upsert }: EditorProps) {
  const [draft, setDraft] = useState<string>(String(data.value));

  const dirty = String(data.value) !== draft;
  const saving = upsert.isPending;

  async function save() {
    const v = Number.parseInt(draft, 10);
    if (!Number.isFinite(v) || v <= 0 || v > 365) {
      toast.error('Attribution window must be between 1 and 365 days.');
      return;
    }
    try {
      await upsert.mutateAsync(v);
      toast.success(`Attribution window updated to ${v} days.`);
    } catch (e) {
      toast.error(
        `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function resetToDefault() {
    setDraft(String(DEFAULT_ATTRIBUTION_WINDOW_DAYS));
    try {
      await upsert.mutateAsync(DEFAULT_ATTRIBUTION_WINDOW_DAYS);
      toast.success(`Attribution window reset to ${DEFAULT_ATTRIBUTION_WINDOW_DAYS} days.`);
    } catch (e) {
      toast.error(
        `Reset failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Attribution window
          </CardTitle>
          <CardDescription>
            How many days after an Instagram post a new admission lead can
            still be attributed to it. Default {DEFAULT_ATTRIBUTION_WINDOW_DAYS}{' '}
            days.
          </CardDescription>
        </div>
        {data.isOverride ? (
          <Badge variant="default">override active</Badge>
        ) : (
          <Badge variant="secondary">default</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="grid gap-1.5 max-w-xs">
            <Label htmlFor="ig-window">Window (days)</Label>
            <Input
              id="ig-window"
              type="number"
              min={1}
              max={365}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canEdit || saving}
            />
          </div>
          <Button
            size="sm"
            onClick={save}
            disabled={!canEdit || saving || !dirty}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefault}
            disabled={
              !canEdit ||
              saving ||
              data.value === DEFAULT_ATTRIBUTION_WINDOW_DAYS
            }
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
