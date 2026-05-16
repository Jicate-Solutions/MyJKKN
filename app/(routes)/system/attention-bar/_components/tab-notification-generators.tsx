'use client';

/**
 * Tab 8 — Notification Generators
 *
 * Lists the 8 rows in notification_generator_config (Wave B.1 substrate +
 * Wave B.2 refactors). Director can edit each generator's JSONB config,
 * toggle is_active, supply a change_reason for audit, and review recent
 * audit activity.
 *
 * Spec: standing rule "Every policy decision is a config-row" — see
 * docs/architecture/config-table-pattern.md and
 * memory: feedback_policy_decisions_must_be_config_rows.md.
 *
 * Q2 twin-check: closest twin is tab-rules-editor.tsx (Sheet-based JSON editor).
 * Match: ~70% structural overlap on JSONB textarea + parse-on-blur + save.
 * Decision: bespoke because the data shape (single config row per generator,
 * no priority/page/role columns, audit trail is per-row) is different.
 *
 * Permission: attention_bar.rules.manage (enforced server-side at /api/...).
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  AlertCircle,
  Bell,
  Clock,
  History,
  Pencil,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
} from 'lucide-react';

interface GeneratorRow {
  id: string;
  generator_name: string;
  description: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface AuditRow {
  id: string;
  generator_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_at: string;
  changed_by: string | null;
  reason: string | null;
  old_config: Record<string, unknown> | null;
  new_config: Record<string, unknown> | null;
}

interface ApiResponse {
  rows: GeneratorRow[];
  audit: AuditRow[];
}

async function fetchGenerators(): Promise<ApiResponse> {
  const res = await fetch('/api/attention-bar/admin/notification-generators');
  if (!res.ok) throw new Error('Failed to load generators');
  return res.json();
}

async function patchGenerator(
  name: string,
  body: { config?: Record<string, unknown>; is_active?: boolean; reason?: string }
): Promise<{ row: GeneratorRow }> {
  const res = await fetch(`/api/attention-bar/admin/notification-generators/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save');
  }
  return res.json();
}

const CATEGORY_BADGE: Record<string, string> = {
  'dashboard:approval': 'bg-amber-100 text-amber-900 hover:bg-amber-200',
  'dashboard:escalation': 'bg-red-100 text-red-900 hover:bg-red-200',
  'dashboard:rescue': 'bg-blue-100 text-blue-900 hover:bg-blue-200',
  'dashboard:anomaly': 'bg-purple-100 text-purple-900 hover:bg-purple-200',
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

export function TabNotificationGenerators() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<GeneratorRow | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notification-generators'],
    queryFn: fetchGenerators,
    staleTime: 30_000,
  });

  return (
    <div className='space-y-6 py-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Bell className='h-5 w-5 text-indigo-500' />
          <h3 className='text-lg font-semibold'>Notification Generators</h3>
          <Badge variant='outline' className='ml-2'>{data?.rows.length ?? 0}</Badge>
        </div>
        <Button variant='ghost' size='sm' onClick={() => refetch()}>
          <RefreshCw className='h-4 w-4' />
        </Button>
      </div>

      <p className='text-sm text-muted-foreground'>
        Each row drives one notification generator function (overdue invoices, stale leads, leave approvals, etc.).
        Editing a row changes the policy <strong>without</strong> a deploy — every save is captured to the audit table.
      </p>

      {isLoading && (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          {[...Array(8)].map((_, i) => (
            <Card key={i} className='animate-pulse'>
              <CardContent className='pt-6 h-36' />
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className='border-destructive'>
          <CardContent className='pt-6'>
            <p className='text-destructive text-sm flex items-center gap-2'>
              <AlertCircle className='h-4 w-4' />
              Failed to load generators. Check server logs.
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {data.rows.map(row => {
              const cat = (row.config?.category as string) ?? 'unknown';
              const batchLimit =
                (row.config?.batch_limit as number) ??
                (row.config?.batch_limit_outer as number) ??
                '—';
              return (
                <Card key={row.id} className={!row.is_active ? 'opacity-60' : ''}>
                  <CardHeader className='pb-3 pt-4 px-4'>
                    <div className='flex items-center justify-between gap-2'>
                      <CardTitle className='text-base font-mono'>{row.generator_name}</CardTitle>
                      <div className='flex items-center gap-2'>
                        {row.is_active ? (
                          <Badge variant='outline' className='text-xs'>active</Badge>
                        ) : (
                          <Badge variant='secondary' className='text-xs'>disabled</Badge>
                        )}
                      </div>
                    </div>
                    {row.description && (
                      <p className='text-xs text-muted-foreground line-clamp-2 pt-1'>
                        {row.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className='px-4 pb-4 space-y-2'>
                    <div className='flex items-center gap-2 flex-wrap text-xs'>
                      <Badge className={CATEGORY_BADGE[cat] ?? 'bg-muted'}>{cat}</Badge>
                      <span className='text-muted-foreground'>batch: {String(batchLimit)}</span>
                      <span className='text-muted-foreground flex items-center gap-1'>
                        <Clock className='h-3 w-3' /> updated {formatRelative(row.updated_at)}
                      </span>
                    </div>
                    <div className='flex items-center justify-between pt-2'>
                      <span className='text-xs text-muted-foreground'>
                        {Object.keys(row.config ?? {}).length} config keys
                      </span>
                      <Button size='sm' variant='outline' onClick={() => setEditing(row)}>
                        <Pencil className='h-3 w-3 mr-1.5' /> Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent activity feed */}
          {data.audit.length > 0 && (
            <Card>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base flex items-center gap-2'>
                  <History className='h-5 w-5 text-indigo-500' />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {data.audit.slice(0, 10).map(a => (
                    <div
                      key={a.id}
                      className='flex items-start justify-between gap-3 py-2 border-b last:border-0 text-sm'
                    >
                      <div className='flex items-center gap-2 min-w-0'>
                        <Badge
                          variant={a.operation === 'UPDATE' ? 'default' : 'secondary'}
                          className='text-[10px]'
                        >
                          {a.operation}
                        </Badge>
                        <span className='font-mono text-xs truncate'>{a.generator_name}</span>
                        {a.reason && (
                          <span className='text-xs text-muted-foreground italic truncate'>
                            — {a.reason}
                          </span>
                        )}
                      </div>
                      <span className='text-xs text-muted-foreground whitespace-nowrap'>
                        {formatRelative(a.changed_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <NotificationGeneratorEditor
        row={editing}
        onClose={(saved) => {
          setEditing(null);
          if (saved) {
            queryClient.invalidateQueries({ queryKey: ['notification-generators'] });
          }
        }}
        onError={(msg) => toast({ title: 'Save failed', description: msg, variant: 'destructive' })}
        onSuccess={() => toast({ title: 'Generator updated', description: 'Config saved + audit row written.' })}
      />
    </div>
  );
}

interface EditorProps {
  row: GeneratorRow | null;
  onClose: (saved: boolean) => void;
  onError: (msg: string) => void;
  onSuccess: () => void;
}

function NotificationGeneratorEditor({ row, onClose, onError, onSuccess }: EditorProps) {
  const [configText, setConfigText] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [reason, setReason] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (row) {
      setConfigText(JSON.stringify(row.config ?? {}, null, 2));
      setIsActive(row.is_active);
      setReason('');
      setParseError(null);
    }
  }, [row]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error('No row to save');
      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(configText);
      } catch (e) {
        throw new Error('Invalid JSON: ' + (e as Error).message);
      }
      if (typeof parsedConfig !== 'object' || parsedConfig === null || Array.isArray(parsedConfig)) {
        throw new Error('Config must be a JSON object (not array or primitive)');
      }
      return patchGenerator(row.generator_name, {
        config: parsedConfig,
        is_active: isActive,
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose(true);
    },
    onError: (err: Error) => onError(err.message),
  });

  function handleConfigBlur() {
    try {
      JSON.parse(configText);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
    }
  }

  if (!row) return <Sheet open={false} onOpenChange={() => onClose(false)}><SheetContent /></Sheet>;

  const isDirty =
    configText !== JSON.stringify(row.config ?? {}, null, 2) ||
    isActive !== row.is_active ||
    reason.trim().length > 0;

  return (
    <Sheet open={!!row} onOpenChange={(open) => !open && onClose(false)}>
      <SheetContent className='sm:max-w-2xl flex flex-col'>
        <SheetHeader>
          <SheetTitle className='flex items-center gap-2 font-mono'>
            <Settings2 className='h-5 w-5 text-indigo-500' />
            {row.generator_name}
          </SheetTitle>
          <SheetDescription>
            Editing the config row drives <code className='text-xs'>fn_get_generator_config(&apos;{row.generator_name}&apos;, fallback)</code>.
            Hardcoded fallback inside the generator function still applies if config is missing or invalid — your edits are reversible.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto space-y-4 py-4 px-1'>
          {row.description && (
            <div className='text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2'>
              {row.description}
            </div>
          )}

          <div className='flex items-center justify-between gap-3 px-1'>
            <Label htmlFor='nge-active' className='text-sm'>
              <span className='font-medium'>Active</span>
              <span className='text-muted-foreground ml-2 text-xs'>
                {isActive ? 'fn reads this row' : 'fn falls back to hardcoded baseline'}
              </span>
            </Label>
            <Switch id='nge-active' checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <Label htmlFor='nge-config' className='text-sm font-medium'>
                Config (JSON)
              </Label>
              {parseError ? (
                <span className='text-xs text-destructive flex items-center gap-1'>
                  <AlertCircle className='h-3 w-3' /> Invalid JSON
                </span>
              ) : (
                <span className='text-xs text-muted-foreground'>
                  {Object.keys(row.config ?? {}).length} keys
                </span>
              )}
            </div>
            <Textarea
              id='nge-config'
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              onBlur={handleConfigBlur}
              className='font-mono text-xs min-h-[400px]'
              spellCheck={false}
            />
            {parseError && (
              <p className='text-xs text-destructive bg-destructive/10 rounded px-2 py-1'>
                {parseError}
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='nge-reason' className='text-sm font-medium'>
              Reason for change
              <span className='text-muted-foreground ml-2 text-xs'>(audit trail)</span>
            </Label>
            <Input
              id='nge-reason'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='e.g. raised batch_limit to 800 — Q2 backlog spike'
              maxLength={500}
            />
          </div>
        </div>

        <SheetFooter className='flex-shrink-0 gap-2'>
          <Button variant='outline' onClick={() => onClose(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isDirty || !!parseError || mutation.isPending}
          >
            {mutation.isPending ? (
              <Sparkles className='h-4 w-4 mr-1.5 animate-spin' />
            ) : (
              <Save className='h-4 w-4 mr-1.5' />
            )}
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
