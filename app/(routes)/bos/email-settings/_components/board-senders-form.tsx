'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Mailbox, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Per-board sender overrides (20260724140000) ──────────────────────────────
// Lets ECE / EEE / … each send BoS notices from their own From: address while
// sharing the institution's SMTP account. A blank row means "use the
// institution default sender" configured above.

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
}
// One editable line per board.
interface Draft {
  sender_email: string;
  sender_name: string;
}

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
      next[b.id] = { sender_email: s?.sender_email ?? '', sender_name: s?.sender_name ?? '' };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const setField = (boardId: string, field: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [boardId]: { ...d[boardId], [field]: value } }));

  const handleSave = async (boardId: string) => {
    if (!institutionsId) return;
    const draft = drafts[boardId];
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
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      toast.success(body.cleared ? 'Board sender cleared — uses institution default' : 'Board sender saved');
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
          Give a board its own From: address — e.g. the ECE board sends from <code>ece.bos@…</code> and
          EEE from <code>eee.bos@…</code>. Uses the same SMTP server and credentials above; only the
          visible sender differs. Leave a board blank to use the institution default sender.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {isLoading ? (
          <div className='space-y-3'>
            {[1, 2, 3].map((i) => <Skeleton key={i} className='h-12 w-full' />)}
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
              const draft = drafts[b.id] ?? { sender_email: '', sender_name: '' };
              return (
                <div
                  key={b.id}
                  className='grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr,1.4fr,1.2fr,auto] md:items-end'
                >
                  <div className='text-sm font-medium'>
                    {b.board_name}
                    {b.board_type && (
                      <span className='ml-1 text-[11px] uppercase text-muted-foreground'>
                        {b.board_type}
                      </span>
                    )}
                  </div>
                  <Input
                    type='email'
                    aria-label={`${b.board_name} sender email`}
                    value={draft.sender_email}
                    onChange={(e) => setField(b.id, 'sender_email', e.target.value)}
                    placeholder='board.bos@jkkn.ac.in (blank = default)'
                  />
                  <Input
                    aria-label={`${b.board_name} sender name`}
                    value={draft.sender_name}
                    onChange={(e) => setField(b.id, 'sender_name', e.target.value)}
                    placeholder='ECE Board of Studies — JKKN'
                  />
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
              );
            })}
          </div>
        )}
        <p className='text-[11px] text-muted-foreground'>
          Note: your SMTP provider must permit each address as a send-as alias for the authenticated
          account, or the send may be rejected or rewritten.
        </p>
      </CardContent>
    </Card>
  );
}
