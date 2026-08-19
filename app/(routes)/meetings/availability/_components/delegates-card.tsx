'use client';

// app/(routes)/meetings/availability/_components/delegates-card.tsx
//
// "Who can manage my calendar" — a host names a delegate (typically a PA) who
// can see that host's meetings on /calendar.
//
// Replaces the workaround of handing a PA the `principal` role, which made the
// platform believe a college had two principals and silently blocked that
// college's auto-booked meetings (the engine will not book when any participant
// has no Google Calendar connection).
//
// Pattern mirrors integration-prefs-card.tsx: client mutation through a server
// action + toast + useTransition.

import { useState, useTransition } from 'react';
import { Loader2, UserPlus, X, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDelegate, removeDelegate, type Delegate } from './delegates-actions';

export function DelegatesCard({ initial }: { initial: Delegate[] }) {
  const [delegates, setDelegates] = useState<Delegate[]>(initial);
  const [email, setEmail] = useState('');
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAdd = () => {
    const wanted = email.trim();
    if (!wanted) {
      toast.error('Please enter the person’s email address.');
      return;
    }
    startTransition(async () => {
      const res = await addDelegate(wanted);
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Could not give that person access.');
        return;
      }
      const added = res.data;
      setDelegates((prev) =>
        prev.some((d) => d.delegateProfileId === added.delegateProfileId)
          ? prev
          : [...prev, added],
      );
      setEmail('');
      toast.success(`${added.fullName} can now see your meetings.`);
    });
  };

  const handleRemove = (d: Delegate) => {
    setBusyId(d.delegateProfileId);
    startTransition(async () => {
      const res = await removeDelegate(d.delegateProfileId);
      setBusyId(null);
      if (!res.success) {
        toast.error(res.error ?? 'Could not remove that person.');
        return;
      }
      setDelegates((prev) => prev.filter((x) => x.delegateProfileId !== d.delegateProfileId));
      toast.success(`${d.fullName} no longer sees your meetings.`);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" aria-hidden />
          Who can manage my calendar
        </CardTitle>
        <CardDescription>
          Give an assistant access to your meetings — they&apos;ll see them on the calendar
          alongside their own. This does not give them any of your other permissions, and it
          only covers your meetings, not your college&apos;s.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {delegates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nobody else can see your meetings yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {delegates.map((d) => (
              <li key={d.delegateProfileId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{d.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(d)}
                  disabled={isPending}
                  aria-label={`Remove ${d.fullName}`}
                >
                  {busyId === d.delegateProfileId ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <X className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <Label htmlFor="delegate-email" className="text-xs">
            Add someone by their JKKN email
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="delegate-email"
              type="email"
              inputMode="email"
              placeholder="name@jkkn.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              disabled={isPending}
              className="sm:flex-1"
            />
            <Button onClick={handleAdd} disabled={isPending} size="sm" className="sm:w-auto">
              {isPending && busyId === null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              )}
              Give access
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
