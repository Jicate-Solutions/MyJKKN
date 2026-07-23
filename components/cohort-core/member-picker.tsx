'use client';

// components/cohort-core/member-picker.tsx
// Cohort Core — shared, reusable existing-user directory picker (D9).
// Every cohort member is an EXISTING MyJKKN user, so identity MUST resolve to a
// real profile. This picker searches the profiles directory and can ONLY emit a
// real `profiles.id` (via onSelect) — there is NO free-text submit path. Used
// across all four cohort domains (SF100 / Foundations / CDC / Trainer) to feed
// `member_ref` for member-add. Pair with CohortService.assertMemberIdentity,
// which re-validates the ref server-of-record-side (browser RLS client) on write.
//
// CLIENT-ONLY — uses the session-scoped browser Supabase client (RLS enforced;
// profiles_select_policy lets any authenticated user search the directory).
// Connected to: lib/services/cohort-core/cohort-service.ts (D9 guard)
//               docs/cohort-core/PLAN.md (Phase 6.1 / D9)

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, X, Check } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** A directory hit. `id` is the real `profiles.id` — use it as `member_ref`. */
export interface MemberPickerResult {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  institution_id: string | null;
}

export interface MemberPickerProps {
  /** Called with the picked user. `member.id` is the real profiles.id to store. */
  onSelect: (member: MemberPickerResult) => void;
  /** Controlled current selection (optional) — renders as a clearable chip. */
  value?: MemberPickerResult | null;
  /** Called when the user clears the current selection (shows the X only if set). */
  onClear?: () => void;
  /** Restrict the search to one institution (profiles.institution_id). */
  institutionId?: string;
  /** Restrict to certain profiles.role values (e.g. ['staff'] for mentors). */
  roles?: string[];
  /** Hide users already added (e.g. current roster member_refs). */
  excludeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Min chars before searching (default 2). */
  minChars?: number;
  /** Max results (default 10). */
  limit?: number;
}

// PostgREST `or()` uses commas as separators and treats %,(),* specially — a raw
// user term with those chars would corrupt the filter, so strip them to spaces.
function sanitizeTerm(raw: string): string {
  return raw.replace(/[,()%*]/g, ' ').replace(/\s+/g, ' ').trim();
}

function initials(name: string | null, email: string | null): string {
  const base = (name || email || '?').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Debounced directory search over `profiles`. Returns only real users; the
 * caller can never inject a free-text member because the only value that leaves
 * this hook is a row Supabase returned.
 */
function useMemberDirectorySearch(params: {
  term: string;
  institutionId?: string;
  roles?: string[];
  excludeIds?: string[];
  minChars: number;
  limit: number;
}) {
  const { term, institutionId, roles, excludeIds, minChars, limit } = params;
  const [results, setResults] = useState<MemberPickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounceValue(term, 250);
  // Guard against out-of-order responses clobbering a newer search.
  const reqIdRef = useRef(0);

  useEffect(() => {
    const safe = sanitizeTerm(debounced);
    if (safe.length < minChars) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const reqId = ++reqIdRef.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        let query = (supabase as any)
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, institution_id')
          .eq('is_active', true)
          .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
          .order('full_name', { ascending: true })
          .limit(limit);

        if (institutionId) query = query.eq('institution_id', institutionId);
        if (roles && roles.length > 0) query = query.in('role', roles);

        const { data, error: qErr } = await query;
        if (cancelled || reqId !== reqIdRef.current) return;
        if (qErr) throw qErr;

        const exclude = new Set(excludeIds ?? []);
        setResults(((data as MemberPickerResult[]) || []).filter((r) => !exclude.has(r.id)));
      } catch (e) {
        if (cancelled || reqId !== reqIdRef.current) return;
        console.error('MemberPicker: directory search error:', e);
        setError('Could not search the directory. Try again.');
        setResults([]);
      } finally {
        if (!cancelled && reqId === reqIdRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // excludeIds/roles are arrays — join to a stable dep so identity changes don't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, institutionId, (roles ?? []).join(','), (excludeIds ?? []).join(','), minChars, limit]);

  return { results, loading, error };
}

export function MemberPicker({
  onSelect,
  value = null,
  onClear,
  institutionId,
  roles,
  excludeIds,
  placeholder = 'Search users by name or email…',
  disabled = false,
  className,
  minChars = 2,
  limit = 10,
}: MemberPickerProps) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, loading, error } = useMemberDirectorySearch({
    term,
    institutionId,
    roles,
    excludeIds,
    minChars,
    limit,
  });

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = useCallback(
    (member: MemberPickerResult) => {
      onSelect(member);
      setTerm('');
      setOpen(false);
    },
    [onSelect]
  );

  // Selected chip — the only "value" this component holds is a real picked user.
  if (value) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={value.avatar_url || undefined} alt={value.full_name || ''} />
            <AvatarFallback className="text-xs">
              {initials(value.full_name, value.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {value.full_name || value.email || value.id}
            </div>
            {value.email && (
              <div className="truncate text-xs text-muted-foreground">{value.email}</div>
            )}
          </div>
          <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
        </div>
        {!disabled && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear selected member"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const safeLen = sanitizeTerm(term).length;
  const showDropdown = open && safeLen >= minChars;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={term}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="pl-9"
          // No form submit path — Enter must not emit a free-text value.
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-input bg-popover shadow-md">
          <div className="max-h-64 overflow-y-auto py-1">
            {error && <div className="px-3 py-2 text-sm text-destructive">{error}</div>}

            {!error && !loading && results.length === 0 && (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                No matching users. Members must be existing MyJKKN users.
              </div>
            )}

            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={r.avatar_url || undefined} alt={r.full_name || ''} />
                  <AvatarFallback className="text-xs">
                    {initials(r.full_name, r.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {r.full_name || r.email || r.id}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.email}
                    {r.role ? ` · ${r.role}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MemberPicker;
