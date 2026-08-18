'use client';

// Appoint a Senior Peer Mentor — the shared picker.
//
// Used by BOTH the event page's volunteers card (feedback-volunteers-section)
// and the mentor console (/mentors). It was duplicated in the two files, which
// let the eligibility copy drift; one copy now, so the year-band wording and the
// search affordances can only ever change in one place.
//
// Eligibility is enforced server-side by fn_induction_assignable_peer_mentors
// (2nd year up to the mentor year — 3rd, or the final year of a 2-year PG).
// The search box is a thin pass-through: the RPC matches name, register/roll
// number, college email, student email, mobile and programme as %value%.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionVolunteerService,
  type AssignablePeerMentor,
} from '@/lib/services/induction/induction-volunteer-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { UserPlus, Loader2, Search, X, Mail, Phone, GraduationCap, SearchX } from 'lucide-react';

/** The RPC caps its result set — keep in sync so the "refine your search" hint is honest. */
const RESULT_LIMIT = 25;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function AppointMentorDialog({
  eventId,
  onAppointed,
  triggerLabel = 'Appoint Senior Peer Mentor',
}: {
  eventId: string;
  onAppointed: () => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssignablePeerMentor[]>([]);
  const [searching, setSearching] = useState(false);
  const [appointing, setAppointing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await InductionVolunteerService.assignablePeerMentors(eventId, query);
        if (active) setResults(r);
      } catch {
        /* surfaced on appoint */
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, eventId]);

  // Reset the box between openings — a stale query from last time reads as "no
  // eligible seniors exist", which is the exact confusion this dialog must avoid.
  useEffect(() => { if (!open) { setQuery(''); setResults([]); } }, [open]);

  const appoint = async (m: AssignablePeerMentor) => {
    setAppointing(m.learner_id);
    try {
      await InductionVolunteerService.appointVolunteer(eventId, m.learner_id);
      toast.success(`${m.full_name} is now a Senior Peer Mentor.`);
      setOpen(false);
      onAppointed();
    } catch (e: any) {
      toast.error(`Couldn't appoint: ${e.message ?? e}`);
    } finally {
      setAppointing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="h-3.5 w-3.5 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-5 pb-3 space-y-1.5 text-left">
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
            Appoint a Senior Peer Mentor
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            <span className="font-medium text-foreground">2nd- and 3rd-year students</span> of this
            college can be Senior Peer Mentors (for a 2-year PG programme, its final year). The list
            below is already filtered to them — freshers being inducted here can&apos;t be appointed.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3 space-y-1.5 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-9 h-10"
              placeholder="Search name, register number, college email or mobile…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Partial matches work anywhere in the value — type <code className="font-mono">98765</code> or{' '}
            <code className="font-mono">@jkkn</code> and it still finds them. Most senior listed first.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-[14rem]">
          {searching ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
              <SearchX className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {query ? `No eligible student matches “${query}”.` : 'No appointable Senior Peer Mentors found.'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {query
                  ? 'Try part of the name, register number, college email or mobile instead.'
                  : 'Every eligible 2nd/3rd-year student is either already a mentor here, or their programme duration / semester is not filled in yet.'}
              </p>
            </div>
          ) : (
            <>
              {results.map((m) => (
                <button
                  key={m.learner_id}
                  type="button"
                  onClick={() => appoint(m)}
                  disabled={!!appointing}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    'hover:border-primary hover:bg-primary/5 focus-visible:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(m.full_name)}
                  </span>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{m.full_name}</span>
                      {m.year_of_study != null && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                          Year {m.year_of_study}
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground truncate">
                      {m.register_number ?? '—'}
                      {m.program_name ? <span className="mx-1.5 opacity-40">•</span> : null}
                      {m.program_name}
                    </div>

                    {(m.college_email || m.student_email || m.student_mobile) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {(m.college_email || m.student_email) && (
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{m.college_email || m.student_email}</span>
                          </span>
                        )}
                        {m.student_mobile && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {m.student_mobile}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="shrink-0 pt-0.5">
                    {appointing === m.learner_id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <UserPlus className="h-4 w-4 text-primary" />}
                  </span>
                </button>
              ))}

              {results.length >= RESULT_LIMIT && (
                // The RPC hard-caps at RESULT_LIMIT. Say so, rather than letting an
                // admin conclude the 26th student simply isn't eligible.
                <p className="pt-1 text-[11px] text-muted-foreground text-center">
                  Showing the first {RESULT_LIMIT} matches — keep typing to narrow it down.
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
