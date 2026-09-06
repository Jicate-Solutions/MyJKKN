'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Mailbox, Info, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Per-board sender overrides (20260724140000 + 20260725 Model 3) ───────────
// Each board can either (a) send from its own From address on the shared
// institution SMTP account [blank credentials], or (b) authenticate as its own
// mailbox by supplying its own SMTP username + password [Model 3]. A blank
// From email leaves the board on the institution default.

const PASSWORD_MASK = '••••••••';

interface BoardOption {
  id: string;
  board_code: string;
  board_name: string;
  board_type: string | null;
}
interface SenderRow {
  id: string;
  board_id: string;
  sender_email: string;
  sender_name: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  smtp_password: string; // mask ('••••••••') when a secret is stored, else ''
  has_smtp_password: boolean;
}
interface Draft {
  sender_email: string;
  sender_name: string;
  smtp_user: string;
  smtp_password: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  showAdvanced: boolean;
  showPassword: boolean;
}

const emptyDraft = (): Draft => ({
  sender_email: '',
  sender_name: '',
  smtp_user: '',
  smtp_password: '',
  smtp_host: '',
  smtp_port: '',
  smtp_secure: true,
  showAdvanced: false,
  showPassword: false,
});

interface BoardSendersFormProps {
  institutionsId: string | null;
}

export function BoardSendersForm({ institutionsId }: BoardSendersFormProps) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingBoardId, setSavingBoardId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bos', 'board-senders', institutionsId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/board-senders?institutionsId=${institutionsId}`);
      if (!res.ok) throw new Error('Failed to load board senders');
      return res.json() as Promise<{ data: { senders: SenderRow[]; boards: BoardOption[] } }>;
    },
    enabled: !!institutionsId,
    staleTime: 5 * 60 * 1000,
  });

  const boards = data?.data.boards ?? [];
  const senders = data?.data.senders ?? [];

  // Seed drafts from saved rows whenever the data changes.
  useEffect(() => {
    if (!data) return;
    const byBoard = new Map(senders.map((s) => [s.board_id, s]));
    const next: Record<string, Draft> = {};
    for (const b of boards) {
      const s = byBoard.get(b.id);
      next[b.id] = s
        ? {
            sender_email: s.sender_email ?? '',
            sender_name: s.sender_name ?? '',
            smtp_user: s.smtp_user ?? '',
            smtp_password: s.smtp_password ?? '',
            smtp_host: s.smtp_host ?? '',
            smtp_port: s.smtp_port != null ? String(s.smtp_port) : '',
            smtp_secure: s.smtp_secure ?? true,
            showAdvanced: !!(s.smtp_host || s.smtp_port != null),
            showPassword: false,
          }
        : emptyDraft();
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const setField = <K extends keyof Draft>(boardId: string, field: K, value: Draft[K]) =>
    setDrafts((d) => ({ ...d, [boardId]: { ...(d[boardId] ?? emptyDraft()), [field]: value } }));

  const handleSave = async (boardId: string) => {
    if (!institutionsId) return;
    const draft = drafts[boardId] ?? emptyDraft();
    setSavingBoardId(boardId);
    try {
      const res = await fetch('/api/bos/board-senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutions_id: institutionsId,
          board_id: boardId,
          sender_email: draft.sender_email.trim(),
          sender_name: draft.sender_name.trim() || null,
          smtp_user: draft.smtp_user.trim() || null,
          // Mask means "keep existing"; the API skips the column in that case.
          smtp_password: draft.smtp_password,
          // Advanced overrides only when the section is open; otherwise inherit
          // the institution's host/port/TLS (sent as null → cleared).
          smtp_host: draft.showAdvanced ? draft.smtp_host.trim() || null : null,
          smtp_port: draft.showAdvanced && draft.smtp_port ? Number(draft.smtp_port) : null,
          smtp_secure: draft.showAdvanced ? draft.smtp_secure : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      toast.success(
        body.cleared
          ? 'Board sender cleared — uses institution default'
          : 'Board sender saved',
      );
      queryClient.invalidateQueries({ queryKey: ['bos', 'board-senders'] });
    } catch (err) {
      logger.error('academic/bos', 'Board sender save failed', err);
      toast.error((err as Error).message);
    } finally {
      setSavingBoardId(null);
    }
  };

  if (!institutionsId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-semibold flex items-center gap-2'>
          <Mailbox className='h-4 w-4 text-muted-foreground' />
          Board Sender Overrides (optional)
        </CardTitle>
        <CardDescription className='text-xs'>
          Give a board its own From: address — e.g. ECE sends from <code>hodece@…</code>, EEE from{' '}
          <code>hodeee@…</code>. Leave the SMTP username/password blank to send from the shared
          institution account (the address must be a verified send-as alias). Fill them to have the
          board <strong>authenticate as its own mailbox</strong> — no alias needed. Leave the whole row
          blank to use the institution default.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {isLoading ? (
          <div className='space-y-3'>
            {[1, 2, 3].map((i) => <Skeleton key={i} className='h-24 w-full' />)}
          </div>
        ) : boards.length === 0 ? (
          <Alert>
            <AlertDescription className='text-xs flex items-center gap-2'>
              <Info className='h-3.5 w-3.5' />
              No boards found for this institution from COE. Board senders apply once boards exist.
            </AlertDescription>
          </Alert>
        ) : (
          <div className='space-y-3'>
            {boards.map((b) => {
              const draft = drafts[b.id] ?? emptyDraft();
              const ownAccount = !!draft.smtp_user.trim();
              return (
                <div key={b.id} className='rounded-lg border p-3 space-y-3'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-medium'>{b.board_name}</span>
                    {b.board_type && (
                      <span className='text-[11px] uppercase text-muted-foreground'>{b.board_type}</span>
                    )}
                    {ownAccount ? (
                      <Badge variant='outline' className='text-[10px]'>Own mailbox</Badge>
                    ) : draft.sender_email.trim() ? (
                      <Badge variant='outline' className='text-[10px]'>Shared account · From override</Badge>
                    ) : null}
                  </div>

                  {/* From identity */}
                  <div className='grid gap-2 md:grid-cols-2'>
                    <div className='space-y-1'>
                      <Label className='text-[11px] text-muted-foreground'>From email</Label>
                      <Input
                        type='email'
                        value={draft.sender_email}
                        onChange={(e) => setField(b.id, 'sender_email', e.target.value)}
                        placeholder='board.bos@jkkn.ac.in (blank = default)'
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-[11px] text-muted-foreground'>From name</Label>
                      <Input
                        value={draft.sender_name}
                        onChange={(e) => setField(b.id, 'sender_name', e.target.value)}
                        placeholder={`${b.board_code || b.board_name} Board of Studies — JKKN`}
                      />
                    </div>
                  </div>

                  {/* Per-board SMTP credentials (Model 3) */}
                  <div className='grid gap-2 md:grid-cols-2'>
                    <div className='space-y-1'>
                      <Label className='text-[11px] text-muted-foreground'>SMTP username (optional)</Label>
                      <Input
                        value={draft.smtp_user}
                        onChange={(e) => setField(b.id, 'smtp_user', e.target.value)}
                        placeholder='hodece@jkkn.ac.in — blank = shared account'
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-[11px] text-muted-foreground'>SMTP password</Label>
                      <div className='relative'>
                        <Input
                          type={draft.showPassword ? 'text' : 'password'}
                          value={draft.smtp_password}
                          onChange={(e) => setField(b.id, 'smtp_password', e.target.value)}
                          onFocus={() => {
                            if (draft.smtp_password === PASSWORD_MASK) setField(b.id, 'smtp_password', '');
                          }}
                          className='pr-9'
                          placeholder={ownAccount ? 'app password' : 'only if using own mailbox'}
                        />
                        <button
                          type='button'
                          className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                          onClick={() => setField(b.id, 'showPassword', !draft.showPassword)}
                          aria-label={draft.showPassword ? 'Hide password' : 'Show password'}
                        >
                          {draft.showPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Advanced: host / port / TLS (defaults to inherit institution) */}
                  <div>
                    <button
                      type='button'
                      className='flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground'
                      onClick={() => setField(b.id, 'showAdvanced', !draft.showAdvanced)}
                    >
                      {draft.showAdvanced ? <ChevronDown className='h-3.5 w-3.5' /> : <ChevronRight className='h-3.5 w-3.5' />}
                      Advanced: host / port / TLS (default: inherit institution)
                    </button>
                    {draft.showAdvanced && (
                      <div className='mt-2 grid gap-2 md:grid-cols-[2fr,1fr,auto]'>
                        <div className='space-y-1'>
                          <Label className='text-[11px] text-muted-foreground'>SMTP host</Label>
                          <Input
                            value={draft.smtp_host}
                            onChange={(e) => setField(b.id, 'smtp_host', e.target.value)}
                            placeholder='smtp.gmail.com (blank = inherit)'
                          />
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-[11px] text-muted-foreground'>Port</Label>
                          <Input
                            type='number'
                            min={1}
                            max={65535}
                            value={draft.smtp_port}
                            onChange={(e) => setField(b.id, 'smtp_port', e.target.value)}
                            placeholder='587'
                          />
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-[11px] whitespace-nowrap text-muted-foreground'>Secure (TLS)</Label>
                          <div className='flex h-10 items-center'>
                            <Switch
                              checked={draft.smtp_secure}
                              onCheckedChange={(v) => setField(b.id, 'smtp_secure', v)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className='flex justify-end'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleSave(b.id)}
                      disabled={savingBoardId === b.id}
                    >
                      <Save className='mr-2 h-3.5 w-3.5' />
                      {savingBoardId === b.id ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className='text-[11px] text-muted-foreground'>
          On Google Workspace, a shared-account From must be a verified send-as alias, or Gmail rewrites
          it. Giving a board its own mailbox username + app password avoids that entirely.
        </p>
      </CardContent>
    </Card>
  );
}
