'use client';

/**
 * Online Meetings — inviting colleagues.
 *
 * Three ways in, because that is how meetings actually get called: by naming
 * people, by naming a department, or by naming an institution.
 *
 * A bulk invite RESOLVES BEFORE IT COMMITS. The host sees how many people it
 * would actually add and confirms. An institution-wide invite can otherwise
 * generate hundreds of participant rows and hundreds of emails from a single
 * careless click, and the first anybody hears about it is the reply-all.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Building, Loader2, Search, Users2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  inviteInternalAction,
  inviteScopeAction,
  listDepartmentsAction,
  previewScopeAction,
  searchColleaguesAction,
  type ColleagueOption,
} from '../../_actions/meeting-actions';

interface Props {
  meetingId: string;
  institutionId: string;
}

export function InviteColleagues({ meetingId, institutionId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ColleagueOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingScope, setPendingScope] = useState<
    { kind: 'department'; departmentId: string } | { kind: 'institution'; institutionId: string } | null
  >(null);

  useEffect(() => {
    void listDepartmentsAction(institutionId).then((r) => {
      if (r.success) setDepartments(r.data);
    });
  }, [institutionId]);

  // Debounced search. Two characters minimum, matching the server guard.
  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      const r = await searchColleaguesAction(institutionId, term);
      setSearching(false);
      if (r.success) setResults(r.data);
    }, 300);
    return () => clearTimeout(id);
  }, [term, institutionId]);

  function toggle(profileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  function inviteSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const r = await inviteInternalAction(meetingId, institutionId, [...selected]);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.data.skipped > 0
          ? `${r.data.added} invited, ${r.data.skipped} already on the list.`
          : `${r.data.added} colleague(s) invited.`,
      );
      setSelected(new Set());
      setTerm('');
      setResults([]);
      router.refresh();
    });
  }

  function askScope(
    scope:
      | { kind: 'department'; departmentId: string }
      | { kind: 'institution'; institutionId: string },
  ) {
    startTransition(async () => {
      const r = await previewScopeAction(scope);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setPendingScope(scope);
      setPreview(
        r.data.capped
          ? `That resolves to more than the ${r.data.resolved} people this can invite at once. Invite them in smaller groups.`
          : `That will invite ${r.data.resolved} people${
              r.data.sample.length > 0 ? `, starting with ${r.data.sample.slice(0, 3).join(', ')}` : ''
            }.`,
      );
    });
  }

  function commitScope() {
    if (!pendingScope) return;
    startTransition(async () => {
      const r = await inviteScopeAction(meetingId, institutionId, pendingScope);
      setPreview(null);
      setPendingScope(null);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.data.added} colleague(s) invited.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Invite colleagues</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="c-search">Search by name</Label>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="c-search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Start typing a name…"
              className="pl-8"
            />
          </div>

          {searching && (
            <p className="text-xs text-muted-foreground">Searching…</p>
          )}

          {results.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {results.map((c) => (
                <label
                  key={c.profileId}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.profileId)}
                    onChange={() => toggle(c.profileId)}
                  />
                  <span>{c.name}</span>
                  {c.departmentName && (
                    <span className="text-xs text-muted-foreground">
                      · {c.departmentName}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          {term.trim().length >= 2 && !searching && results.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nobody matched. Staff with no institution email have no MyJKKN
              account and cannot be invited &mdash; add them as a guest instead.
            </p>
          )}

          {selected.size > 0 && (
            <Button size="sm" onClick={inviteSelected} disabled={pending} className="gap-1.5">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Invite {selected.size} selected
            </Button>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>Or invite a whole group</Label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Choose a department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!departmentId || pending}
              onClick={() => askScope({ kind: 'department', departmentId })}
              className="gap-1.5"
            >
              <Users2 className="h-3.5 w-3.5" aria-hidden />
              Whole department
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => askScope({ kind: 'institution', institutionId })}
              className="gap-1.5"
            >
              <Building className="h-3.5 w-3.5" aria-hidden />
              Whole institution
            </Button>
          </div>

          {preview && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm">{preview}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={commitScope} disabled={pending}>
                  Yes, invite them
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPreview(null);
                    setPendingScope(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            A group invite is expanded into named people straight away, so the
            attendance report lists individuals rather than a group.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
