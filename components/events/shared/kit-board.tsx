'use client';

// components/events/shared/kit-board.tsx
// Shared kit / t-shirt / merch distribution board for ANY event type (Events Platform Promotion PR8).
// Reads + toggles the tshirt_collected* columns on events_registrations (no dedicated kit table exists;
// the BIB-scanner path lives in the marathon ops pages). Self-contained manual distribution + size
// summary. Read-only when canManage is false.

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Package,
  Search,
  Shirt,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import {
  useEventKitRecipients,
  useEventKitSummary,
  useSetKitCollected,
} from '@/hooks/events/shared/use-event-kit';
import type { EventKitRecipient } from '@/lib/services/events/shared/event-kit-service';

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="text-xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function KitBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const { profile } = useAuth();
  const { data: recipients, isLoading } = useEventKitRecipients(eventId);
  const { data: summary } = useEventKitSummary(eventId);
  const setCollected = useSetKitCollected(eventId);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'collected' | 'pending'>('all');

  const filtered = useMemo(() => {
    const list = recipients ?? [];
    return list.filter((r) => {
      if (filter === 'collected' && !r.collected) return false;
      if (filter === 'pending' && r.collected) return false;
      if (query.trim().length >= 2) {
        const q = query.toLowerCase();
        const hit =
          r.bib_number?.toLowerCase().includes(q) ||
          r.participant_name?.toLowerCase().includes(q) ||
          r.participant_phone?.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [recipients, query, filter]);

  const toggle = (r: EventKitRecipient) => {
    if (!canManage) return;
    setCollected.mutate({
      registrationId: r.id,
      collected: !r.collected,
      operatorId: profile?.id ?? null,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Shirt className="h-4 w-4 text-muted-foreground" />
          Kit / T-shirt Distribution
        </h3>
        <p className="text-sm text-muted-foreground">
          Track kit, t-shirt and merch handout per participant.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Package} label="Total" value={summary?.total ?? 0} />
        <StatCard icon={CheckCircle2} label="Collected" value={summary?.collected ?? 0} />
        <StatCard icon={Shirt} label="Pending" value={summary?.pending ?? 0} />
      </div>

      {/* Size breakdown */}
      {summary && summary.by_size.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.by_size.map((s) => (
            <Badge key={s.size} variant="outline" className="text-[10px]">
              {s.size}: {s.collected}/{s.count}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Search BIB, name, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'pending', 'collected'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              className="h-8 text-xs capitalize"
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No recipients match.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">BIB</TableHead>
                <TableHead className="text-xs">Participant</TableHead>
                <TableHead className="text-xs">Institution</TableHead>
                <TableHead className="text-xs">Size</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                {canManage && <TableHead className="text-right text-xs">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium">{r.bib_number ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{r.participant_name ?? '—'}</div>
                    {r.participant_phone && (
                      <div className="text-[10px] text-muted-foreground">{r.participant_phone}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.institution_name ?? 'External / Individual'}
                  </TableCell>
                  <TableCell className="text-xs">{r.tshirt_size}</TableCell>
                  <TableCell className="text-xs">
                    {r.collected ? (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <CheckCircle2 className="h-3 w-3" /> Collected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.collected ? 'outline' : 'default'}
                        className="h-7 text-xs"
                        disabled={setCollected.isPending}
                        onClick={() => toggle(r)}
                      >
                        {r.collected ? 'Undo' : 'Mark collected'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
