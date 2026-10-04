'use client';

// Notes on an issue or requirement. Staff (CAO, and the team working an issue)
// can mark a note internal — hidden from the reporter by RLS, not by this
// component. A reporter's own note is always visible.

import { useState } from 'react';
import { format } from 'date-fns';
import { Lock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useInstaSolverMutation, useNotes } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverActivityService } from '@/lib/services/instasolver/activity-service';
import type { EntityType } from '@/types/instasolver';

export function NotesPanel({
  entity,
  id,
  canWrite,
  canWriteInternal
}: {
  entity: EntityType;
  id: number;
  canWrite: boolean;
  canWriteInternal: boolean;
}) {
  const { data: notes, isLoading } = useNotes(entity, id);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(canWriteInternal);
  const add = useInstaSolverMutation(
    () => InstaSolverActivityService.addNote(entity, id, text, canWriteInternal && internal),
    'Note added'
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? null : !notes?.length ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{n.author?.full_name ?? 'Someone'}</span>
                  <span>{format(new Date(n.created_at), 'dd MMM yyyy, hh:mm a')}</span>
                  {n.is_internal && (
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <Lock className="h-3 w-3" /> Internal
                    </Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{n.note}</p>
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              add.mutate(undefined, { onSuccess: () => setText('') });
            }}
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a note…"
              rows={3}
              maxLength={2000}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {canWriteInternal ? (
                <div className="flex items-center gap-2">
                  <Switch id={`internal-${entity}-${id}`} checked={internal} onCheckedChange={setInternal} />
                  <Label htmlFor={`internal-${entity}-${id}`} className="text-sm font-normal">
                    Internal (hidden from the reporter)
                  </Label>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Visible to the CAO and the team working on it.</span>
              )}
              <Button type="submit" size="sm" disabled={!text.trim() || add.isPending}>
                {add.isPending ? 'Adding…' : 'Add note'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
