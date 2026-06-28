'use client';

// Multi-select picker for a session's resource persons — links to REAL MyJKKN
// users (staff + students), not free text. Email + role are shown so the
// coordinator picks the right person among same-name users (there are 11+
// "Ranjith"s and ~20 "Priyadharshini"s in the directory). Selection is always
// INDIVIDUAL — a department is never itself a speaker.
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InductionSpeakersService, type DirectoryUser } from '@/lib/services/induction/induction-speakers-service';
import { X, Search, UserPlus } from 'lucide-react';

export function SessionSpeakerPicker({
  value,
  onChange,
  disabled,
}: {
  value: DirectoryUser[];
  onChange: (users: DirectoryUser[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [openList, setOpenList] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = new Set(value.map((u) => u.id));

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
            <Badge key={u.id} variant="secondary" className="gap-1 pr-1">
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
