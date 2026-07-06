'use client';

// Induction Coordinators panel — lets the Induction Lead (or super-admin) appoint
// each college's coordinator from INSIDE the induction module, instead of the
// global Role Management page. Hidden for everyone else. Backed by the gated RPCs
// in 20260630010000_induction_coordinators_management.sql.
import { useEffect, useState, useCallback } from 'react';
import {
  InductionService, type InductionCoordinator, type AssignableStaff, type InductionCollege,
} from '@/lib/services/induction/induction-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { Building2, UserCog, UserPlus, X, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

export function CoordinatorsPanel() {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [institutions, setInstitutions] = useState<InductionCollege[]>([]);
  const [coords, setCoords] = useState<InductionCoordinator[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const can = await InductionService.canManageCoordinators();
    setCanManage(can);
    if (!can) { setLoading(false); return; }
    try {
      const [insts, c] = await Promise.all([
        InductionService.runningColleges(),
        InductionService.listCoordinators(),
      ]);
      setInstitutions(insts);
      setCoords(c);
    } catch (e: any) {
      toast.error(`Couldn't load coordinators: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Hidden entirely unless the viewer can manage coordinators.
  if (canManage === false) return null;
  if (canManage === null || loading) return null;

  const byInst = (id: string) => coords.filter((c) => c.institution_id === id);

  const remove = async (userId: string, name: string) => {
    try {
      await InductionService.removeCoordinator(userId);
      toast.success(`Removed ${name} as coordinator.`);
      load();
    } catch (e: any) {
      toast.error(`Couldn't remove: ${e.message ?? e}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" /> Induction Coordinators
        </CardTitle>
        <CardDescription>
          Appoint one coordinator per college — they run that college&apos;s induction
          (sessions, speakers, batches, enrolment). Visible to the Induction Lead and admins only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {institutions.map((inst) => (
          <div key={inst.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{inst.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {byInst(inst.id).length === 0 ? (
                <span className="text-xs text-muted-foreground">No coordinator yet</span>
              ) : (
                byInst(inst.id).map((c) => (
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
              <AssignDialog inst={inst} onAssigned={load} />
            </div>
          </div>
        ))}
        {institutions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No college is running an induction yet — once a college has an induction program, it appears here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AssignDialog({ inst, onAssigned }: { inst: InductionCollege; onAssigned: () => void }) {
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
        const r = await InductionService.assignableStaff(inst.id, query);
        if (active) setResults(r);
      } catch {
        /* surfaced on assign */
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, inst.id]);

  const assign = async (s: AssignableStaff) => {
    setAssigning(s.id);
    try {
      await InductionService.assignCoordinator(s.id);
      toast.success(`${s.full_name} is now ${inst.name}'s induction coordinator.`);
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
          <DialogTitle>Assign coordinator — {inst.name}</DialogTitle>
          <DialogDescription>Pick a staff member of {inst.name} to run its induction.</DialogDescription>
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
            <p className="text-sm text-muted-foreground py-2">No staff found in {inst.name}.</p>
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
