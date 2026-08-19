'use client';

// Picks a REAL MyJKKN person for an organogram role, and records WHICH one.
//
// The old field was a plain input backed by a <datalist>: it captured a name
// string and nothing else, so the choice could never be stored as data. This
// keeps the free-typed fallback (a holder who has no MyJKKN record) but reports
// the picked person's team member id alongside the text.
//
// Search hits /api/mba/dept-artifacts/people, which is permission-gated, needs a
// real search term and caps its results — so this never becomes a directory dump.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Check, Loader2, X } from 'lucide-react';

export interface PickedPerson {
  name: string;
  staffId: string | null;
}

interface Person {
  staff_id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  designation: string | null;
  source: 'posted_associate' | 'me' | 'directory';
}

interface Props {
  areaId: string;
  value: PickedPerson;
  onChange: (next: PickedPerson) => void;
}

const DEBOUNCE_MS = 250;

export function PersonPicker({ areaId, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [needsQuery, setNeedsQuery] = useState(true);
  const [minQuery, setMinQuery] = useState(3);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/mba/dept-artifacts/people?area_id=${encodeURIComponent(areaId)}&q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) {
          setPeople([]);
          return;
        }
        const json = (await res.json()) as {
          people?: Person[];
          needs_query?: boolean;
          min_query?: number;
        };
        setPeople(json.people ?? []);
        setNeedsQuery(json.needs_query ?? false);
        if (typeof json.min_query === 'number') setMinQuery(json.min_query);
      } catch {
        setPeople([]);
      } finally {
        setLoading(false);
      }
    },
    [areaId],
  );

  // Debounced: one request per pause in typing, not one per keystroke.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(term), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, term, search]);

  // Close when the click lands outside (a Dialog swallows blur ordering).
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function pick(p: Person) {
    onChange({ name: p.name ?? p.email ?? '', staffId: p.staff_id });
    setOpen(false);
  }

  const linked = Boolean(value.staffId);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Input
          value={value.name}
          placeholder="Search by name or email"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            // Typing by hand un-links the record — the text no longer stands for
            // the person who was picked.
            setTerm(e.target.value);
            onChange({ name: e.target.value, staffId: null });
            setOpen(true);
          }}
          className={`h-8 text-sm ${linked ? 'pr-14' : 'pr-7'}`}
        />
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {loading && <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />}
          {linked && (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Linked to a MyJKKN record" />
              <button
                type="button"
                aria-label="Unlink this person"
                onClick={() => onChange({ name: '', staffId: null })}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
      </div>

      {open && (
        <div className="bg-popover absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border shadow-md">
          {people.length === 0 ? (
            <p className="text-muted-foreground p-2 text-xs">
              {needsQuery
                ? `Type at least ${minQuery} characters to search MyJKKN.`
                : loading
                  ? 'Searching…'
                  : 'Nobody found. You can still type a name — it will be saved as text.'}
            </p>
          ) : (
            <ul className="py-1">
              {people.map((p) => (
                <li key={p.staff_id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="hover:bg-accent flex w-full flex-col items-start px-2 py-1.5 text-left"
                  >
                    <span className="text-xs font-medium">{p.name ?? p.email ?? 'Unnamed'}</span>
                    <span className="text-muted-foreground text-[11px]">
                      {[p.designation, p.email].filter(Boolean).join(' · ')}
                      {p.source === 'me' && ' · you'}
                      {p.source === 'posted_associate' && ' · posted to this area'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!linked && value.name.trim() !== '' && (
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          Saved as text — not linked to a MyJKKN record.
        </p>
      )}
    </div>
  );
}
