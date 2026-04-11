'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateCycle, useActiveEvents } from '@/hooks/startup-studio';

export function NewCycleForm() {
  const router = useRouter();
  const createCycle = useCreateCycle();
  const { data: eventsRaw, isLoading: eventsLoading } = useActiveEvents();

  const events = (eventsRaw as any)?.data || (Array.isArray(eventsRaw) ? eventsRaw : []);

  const [name, setName] = useState('');
  const [eventId, setEventId] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: Record<string, any> = {};
    if (name.trim()) data.name = name.trim();
    if (eventId && eventId !== 'none') data.event_id = eventId;

    try {
      const result = await createCycle.mutateAsync(data);
      const newId = (result as any)?.id || (result as any)?.data?.id;
      toast.success('Cycle created successfully');

      if (newId) {
        router.push(`/startup-studio/cycles/${newId}`);
      } else {
        router.push('/startup-studio/cycles');
      }
    } catch {
      toast.error('Failed to create cycle');
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-blue-600" />
          New Innovation Cycle
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Cycle Name (optional)</Label>
            <Input
              id="name"
              placeholder="e.g., Water Conservation Sprint"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Give your cycle a descriptive name, or leave blank for auto-naming
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event">Event (optional)</Label>
            {eventsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger id="event">
                  <SelectValue placeholder="Select an event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No event</SelectItem>
                  {events.map((event: any) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Link this cycle to a hackathon, sprint, or other event
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={createCycle.isPending}>
              {createCycle.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Create Cycle
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/startup-studio/cycles')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
