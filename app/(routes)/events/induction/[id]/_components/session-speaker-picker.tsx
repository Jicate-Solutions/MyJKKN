'use client';

// Multi-select picker for a session's resource persons — links to REAL MyJKKN
// users (staff + students), not free text. Email + role are shown so the
// coordinator picks the right person among same-name users (there are 11+
// "Ranjith"s and ~20 "Priyadharshini"s in the directory). Selection is always
// INDIVIDUAL — a department is never itself a speaker.
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InductionSpeakersService, type DirectoryUser } from '@/lib/services/induction/induction-speakers-service';
import {
  PersonAvailabilityService,
  type PersonConflict,
} from '@/lib/services/availability/person-availability';
import { X, Search, UserPlus, AlertTriangle } from 'lucide-react';

// '<input type=datetime-local>' string (local) -> ISO; '' if missing/invalid.
function toIso(local?: string): string {
  if (!local) return '';
  const d = new Date(local);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function fmtRange(c: PersonConflict): string {
  if (!c.starts_at || !c.ends_at) return '';
  const t = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${t(c.starts_at)}–${t(c.ends_at)}`;
}

export function SessionSpeakerPicker({
  value,
  onChange,
  disabled,
  sessionStart,
  sessionEnd,
}: {
  value: DirectoryUser[];
  onChange: (users: DirectoryUser[]) => void;
  disabled?: boolean;
  /** the session's window (datetime-local strings). When both are set, the picker
   *  checks each selected person against the availability brain and warns on a
   *  teaching / meeting / event-speaking clash. Advisory — never blocks. */
  sessionStart?: string;
  sessionEnd?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [openList, setOpenList] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = new Set(value.map((u) => u.id));

  // ── Availability brain (Limb 2) — conflicts for the SELECTED people at the
  // session window. Advisory: a check failure is swallowed, never blocks saving. ──
  const [conflicts, setConflicts] = useState<Record<string, PersonConflict[]>>({});
  const startIso = toIso(sessionStart);
  const endIso = toIso(sessionEnd);
  const hasWindow = !!startIso && !!endIso && new Date(endIso) > new Date(startIso);
  const idsKey = useMemo(() => value.map((u) => u.id).sort().join(','), [value]);

  useEffect(() => {
    const ids = value.map((u) => u.id);
    if (!ids.length || !hasWindow) { setConflicts({}); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rows = await PersonAvailabilityService.getPeopleConflicts(ids, startIso, endIso);
        if (cancelled) return;
        const grouped: Record<string, PersonConflict[]> = {};
        for (const r of rows) {
          const k = r.profile_id;
          if (!k) continue;
          (grouped[k] ??= []).push(r);
        }
        setConflicts(grouped);
      } catch {
        if (!cancelled) setConflicts({}); // advisory — degrade silently
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, startIso, endIso, hasWindow]);

  const conflictedSelected = value.filter((u) => conflicts[u.id]?.length);

  // debounced directory search
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOpenList(false); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await InductionSpeakersService.searchUsers(q);
        setResults(rows.filter((r) => !selectedIds.has(r.id)));
        setOpenList(true);
      } catch (e: any) {
        toast.error(`User search failed: ${e.message ?? e}`);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const add = useCallback((u: DirectoryUser) => {
    if (selectedIds.has(u.id)) return;
    onChange([...value, u]);
    setQuery('');
    setResults([]);
    setOpenList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange]);

  const remove = (id: string) => onChange(value.filter((u) => u.id !== id));

  return (
    <div className="space-y-2">
      {/* selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((u) => (
            <Badge
              key={u.id}
              variant="secondary"
              className={`gap-1 pr-1 ${conflicts[u.id]?.length ? 'ring-1 ring-amber-400' : ''}`}
            >
              {conflicts[u.id]?.length ? <AlertTriangle className="h-3 w-3 text-amber-500" /> : null}
              <span>{u.full_name || u.email || u.id.slice(0, 8)}</span>
              {u.role && <span className="text-[10px] text-muted-foreground">· {u.role}</span>}
              {!disabled && (
                <button type="button" onClick={() => remove(u.id)} className="ml-0.5 rounded hover:bg-muted-foreground/20" aria-label="Remove">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* availability warning — a person already committed at this session's time.
          Heads-up only; the coordinator can still assign them. */}
      {hasWindow && conflictedSelected.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Already busy at this time
          </div>
          <ul className="space-y-0.5">
            {conflictedSelected.map((u) => (
              <li key={u.id}>
                <span className="font-medium">{u.full_name || u.email}</span>:{' '}
                {conflicts[u.id]
                  .map((c) => c.label + (fmtRange(c) ? ` (${fmtRange(c)})` : ''))
                  .join('; ')}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-amber-700 dark:text-amber-300/80">
            You can still assign them — this is just a heads-up.
          </p>
        </div>
      )}

      {/* search box */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-md border px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search staff or students by name or email…"
            className="border-0 focus-visible:ring-0 px-0 h-9"
            onFocus={() => { if (results.length) setOpenList(true); }}
          />
        </div>

        {openList && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
            {searching ? (
              <div className="p-2 space-y-1"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
            ) : results.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matching users.</p>
            ) : (
              results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => add(u)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{u.full_name || '(no name)'}</span>
                    {u.role && <span className="text-[11px] text-muted-foreground shrink-0">{u.role}</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[45%]">{u.email}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Pick the actual people who led this session — staff or students. A department isn&apos;t a speaker; add its individuals.
      </p>
    </div>
  );
}
