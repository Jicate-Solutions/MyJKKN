'use client';

/**
 * "Assign people" — pick who carries out an approved idea, as many as needed.
 *
 * Search is server-side (/api/improvement/assignable-users): a department owner
 * usually cannot read other people's profiles. Saving goes through
 * fn_improvement_set_assignees, which is the authority on who may assign — this
 * component only decides what to offer.
 *
 * The result list is rendered inline, not in a popover: a popover inside a
 * Radix Dialog races the dialog's focus trap and its clicks get swallowed.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, UserPlus, Users, X } from 'lucide-react';
import {
  ImprovementService,
  type ImprovementAssignableUser,
  type ImprovementIdeaAssignee
} from '@/lib/services/improvement/improvement-service';

interface IdeaAssigneesEditorProps {
  ideaId: string;
  current: ImprovementIdeaAssignee[];
  /** Called after a successful save. */
  onSaved: () => void;
}

const DEBOUNCE_MS = 250;

function sameSet(a: ImprovementIdeaAssignee[], b: ImprovementIdeaAssignee[]) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p.id));
  return b.every((p) => ids.has(p.id));
}

export function IdeaAssigneesEditor({
  ideaId,
  current,
  onSaved
}: IdeaAssigneesEditorProps) {
  const [picked, setPicked] = useState<ImprovementIdeaAssignee[]>(current);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ImprovementAssignableUser[]>([]);
  const [needsQuery, setNeedsQuery] = useState(true);
  const [minQuery, setMinQuery] = useState(3);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // A different idea, or a fresh read of this one: start from what is saved.
  useEffect(() => {
    setPicked(current);
    setTerm('');
    setResults([]);
    setNeedsQuery(true);
  }, [ideaId, current]);

  // Debounced: one request per pause in typing, not one per keystroke.
  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setResults([]);
      setNeedsQuery(true);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await ImprovementService.searchAssignableUsers(q);
        if (cancelled) return;
        setResults(found.users);
        setNeedsQuery(found.needsQuery);
        setMinQuery(found.minQuery);
      } catch (err) {
        if (cancelled) return;
        setResults([]);
        toast.error(err instanceof Error ? err.message : 'The search failed.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  const unchanged = sameSet(picked, current);

  const add = (user: ImprovementAssignableUser) => {
    if (pickedIds.has(user.id)) return;
    setPicked((prev) => [
      ...prev,
      { id: user.id, name: user.name || user.email || 'Unnamed' }
    ]);
  };

  const remove = (id: string) =>
    setPicked((prev) => prev.filter((p) => p.id !== id));

  const save = async () => {
    if (saving || unchanged) return;
    setSaving(true);
    try {
      await ImprovementService.setAssignees(
        ideaId,
        picked.map((p) => p.id)
      );
      toast.success(
        picked.length === 0
          ? 'Nobody is assigned to this idea now.'
          : `Assigned to ${picked.map((p) => p.name).join(', ')}.`
      );
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to assign people to this idea.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 p-4 dark:border-sky-900 dark:from-sky-950/40 dark:to-indigo-950/40">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white">
          <Users className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Assign people</p>
          <p className="text-muted-foreground text-xs">
            Add the people who should work on this, and remove anyone who is not
            needed. Everyone added is notified.
          </p>
        </div>
      </div>

      {/* Who is picked */}
      {picked.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nobody is assigned yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map((person) => (
            <li
              key={person.id}
              className="bg-background flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-3 text-xs font-medium shadow-sm"
            >
              <span className="max-w-[12rem] truncate">{person.name}</span>
              <button
                type="button"
                onClick={() => remove(person.id)}
                disabled={saving}
                aria-label={`Remove ${person.name}`}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex h-5 w-5 items-center justify-center rounded-full"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name or email"
          aria-label="Search for people to assign"
          className="bg-background h-10 rounded-xl pr-9 pl-9 text-base sm:text-sm"
        />
        {searching && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {term.trim() !== '' && (
        <div className="bg-background max-h-56 overflow-y-auto rounded-xl border">
          {results.length === 0 ? (
            <p className="text-muted-foreground p-3 text-xs">
              {needsQuery
                ? `Type at least ${minQuery} characters to search.`
                : searching
                  ? 'Searching…'
                  : 'Nobody found with that name or email.'}
            </p>
          ) : (
            <ul className="divide-y">
              {results.map((user) => {
                const already = pickedIds.has(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => add(user)}
                      disabled={already}
                      className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {user.name || user.email || 'Unnamed'}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {[user.role, user.email].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {already ? (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          Added
                        </span>
                      ) : (
                        <UserPlus className="h-4 w-4 shrink-0 text-sky-600" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving || unchanged}
          className="h-10 w-full bg-sky-600 text-white hover:bg-sky-700 sm:w-auto"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save assignment
        </Button>
      </div>
    </div>
  );
}
