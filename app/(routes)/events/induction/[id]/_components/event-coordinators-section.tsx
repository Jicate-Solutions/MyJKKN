'use client';

// Per-event induction coordinators — lets the Induction Lead (or super-admin)
// appoint coordinators scoped to THIS SPECIFIC induction. Hidden entirely for
// anyone who can't manage.
//
// THE ONLY PLACE COORDINATORS ARE APPOINTED, since 2026-08-18. The list page
// used to carry a second panel that granted a college-wide
// 'induction_coordinator' role — a row in user_roles carrying induction.manage
// over every induction that college runs — while grouping people by college in a
// way that read as a per-college appointment. Nothing synced the two, so the
// same person could hold both and appear in both places. That panel is gone and
// its RPCs are dropped; see
// 20260818091000_induction_retire_collegewide_coordinator_role.sql. The list
// page now READS these appointments back into its Coordinators column.
//
// Still additive to induction_lead / induction.manage, which remain
// permission-based and unaffected.
import { useEffect, useState, useCallback } from 'react';
import {
  InductionService, type EventCoordinator, type AssignableStaff,
} from '@/lib/services/induction/induction-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { UserCog, UserPlus, X, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

export function EventCoordinatorsSection({ eventId }: { eventId: string }) {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [coords, setCoords] = useState<EventCoordinator[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const can = await InductionService.canManageEventCoordinators(eventId);
    setCanManage(can);
    if (!can) { setLoading(false); return; }
    try {
      const c = await InductionService.listEventCoordinators(eventId);
      setCoords(c);
    } catch (e: any) {
      toast.error(`Couldn't load coordinators: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  if (canManage === false) return null;
  if (canManage === null || loading) return null;

  const remove = async (userId: string, name: string) => {
    try {
      await InductionService.removeEventCoordinator(eventId, userId);
      toast.success(`Removed ${name} as this induction's coordinator.`);
      load();
    } catch (e: any) {
      toast.error(`Couldn't remove: ${e.message ?? e}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" /> Coordinators
        </CardTitle>
        <CardDescription>
          Appoint who runs THIS induction (sessions, attendance, feedback, batches). This is the
          only place induction coordinators are appointed — they appear against this induction on
          the Induction list. Visible to the Induction Lead and admins only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {coords.length === 0 ? (
              <span className="text-xs text-muted-foreground">No coordinator assigned yet</span>
            ) : (
              coords.map((c) => (
                <Badge key={c.user_id} variant="secondary" className="gap-1 pr-1">
                  {c.full_name}
                  <button
                    type="button"
                    aria-label={`Remove ${c.full_name}`}
                    onClick={() => remove(c.user_id, c.full_name)}
                    className="ml-0.5 rounded hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <AssignEventDialog eventId={eventId} onAssigned={load} />
        </div>
      </CardContent>
    </Card>
  );
}

function AssignEventDialog({ eventId, onAssigned }: { eventId: string; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssignableStaff[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await InductionService.assignableEventStaff(eventId, query);
        if (active) setResults(r);
      } catch {
        /* surfaced on assign */
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, eventId]);

  const assign = async (s: AssignableStaff) => {
    setAssigning(s.id);
    try {
      await InductionService.assignEventCoordinator(eventId, s.id);
      toast.success(`${s.full_name} is now this induction's coordinator.`);
      setOpen(false);
      onAssigned();
    } catch (e: any) {
      toast.error(`Couldn't assign: ${e.message ?? e}`);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserPlus className="h-3.5 w-3.5 mr-1" /> Assign</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign coordinator</DialogTitle>
          <DialogDescription>Pick a staff member to run this specific induction.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name or email…"
            value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
        <div className="max-h-72 overflow-auto space-y-1">
          {searching ? (
            <p className="text-sm text-muted-foreground py-2">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No staff found.</p>
          ) : (
            results.map((s) => (
              <button key={s.id} type="button" onClick={() => assign(s)} disabled={!!assigning}
                className="w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left hover:border-primary disabled:opacity-50">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.email} · {s.role}</div>
                </div>
                {assigning === s.id
                  ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  : <UserPlus className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
