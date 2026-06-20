'use client';

import { use, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDate } from '@/lib/utils';
import { useParentConcern } from '@/hooks/parent/use-parent-features';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';

export default function ConcernThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: thread, isLoading } = useParentConcern(id);
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  if (isLoading || !thread) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await ParentFeatures.replyConcern(id, reply.trim());
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['parent-concern'] });
      queryClient.invalidateQueries({ queryKey: ['parent-concerns'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-3">
        <h1 className="font-bold leading-snug">{thread.subject}</h1>
        <span className="text-xs capitalize text-muted-foreground">{thread.status.replace('_', ' ')}</span>
      </div>

      <div className="flex-1 space-y-3">
        {thread.messages.map((m) => (
          <div key={m.id} className={cn('flex', m.senderType === 'parent' ? 'justify-end' : 'justify-start')}>
            <Card
              className={cn(
                'max-w-[80%] p-3 text-sm',
                m.senderType === 'parent' ? 'bg-[#0b6d41] text-white' : 'bg-white'
              )}
            >
              <p className="whitespace-pre-line">{m.message}</p>
              <p className={cn('mt-1 text-[10px]', m.senderType === 'parent' ? 'text-white/70' : 'text-muted-foreground')}>
                {formatDate(m.createdAt)}
              </p>
            </Card>
          </div>
        ))}
      </div>

      {thread.status !== 'closed' && (
        <div className="sticky bottom-20 mt-4 flex gap-2">
          <Input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type a reply…"
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <Button onClick={send} disabled={sending} className="bg-[#0b6d41] hover:bg-[#0a5733]">
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
