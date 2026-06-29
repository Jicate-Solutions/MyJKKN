'use client';

// Resource-person picker — type-segmented (Facilitator = staff, Learner =
// learners_profiles). Each candidate resolves to a REAL account (profiles.id),
// which is what event_session_speakers links to, so the save/edit/availability
// flow is unchanged. Facilitators filter by institution + department; learners by
// the institution → degree → department → program → semester → section cascade.
// Only people WITH a login account appear (resource persons = active staff +
// senior-learner mentors). Spec: specs/pre-onboarding-induction-access-2026-06-29.md
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  InductionSpeakersService,
  type DirectoryUser,
  type ResourcePersonResult,
} from '@/lib/services/induction/induction-speakers-service';
import {
  PersonAvailabilityService,
  type PersonConflict,
} from '@/lib/services/availability/person-availability';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { X, Search, UserPlus, AlertTriangle, GraduationCap, Briefcase } from 'lucide-react';

const ANY = '__any__';
type PersonType = 'facilitator' | 'learner';

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

function FilterSelect({ label, value, onChange, options, placeholder, disabled }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? '' : v)} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{placeholder}</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
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
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const [type, setType] = useState<PersonType>('facilitator');
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [institutionId, setInstitutionId] = useState('');
  const [degreeId, setDegreeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResourcePersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = new Set(value.map((u) => u.id));

  // Institutions for the top-level filter.
  useEffect(() => {
    supabase.from('institutions').select('id,name').order('name')
      .then(({ data }) => setInstitutions((data as any) ?? []));
  }, [supabase]);

  // Cascade option sources. Institution-scoped + high limit so the dropdowns are
  // complete (default service limits are small). Children gate on their parent.
  const instFilter = institutionId || undefined;
  const degrees = useDegrees({ institution_id: instFilter, status: 'active', limit: 200 } as any).data?.data ?? [];
  const departments = useDepartments({ institution_id: instFilter, degree_id: degreeId || undefined, limit: 300 } as any).data?.data ?? [];
  const programs = usePrograms({ institution_id: instFilter, degree_id: degreeId || undefined, department_id: departmentId || undefined, limit: 300 } as any).data?.data ?? [];
  const semesters = useSemesters({ institution_id: instFilter, program_id: programId || undefined, limit: 100 } as any, { enabled: !!programId }).data?.data ?? [];
  const sections = useSections({ institution_id: instFilter, semester_id: semesterId || undefined, limit: 100 } as any, { enabled: !!semesterId }).data?.data ?? [];

  // Cascade resets — changing a parent clears its descendants.
  const onInstitution = (v: string) => { setInstitutionId(v); setDegreeId(''); setDepartmentId(''); setProgramId(''); setSemesterId(''); setSectionId(''); };
  const onDegree = (v: string) => { setDegreeId(v); setDepartmentId(''); setProgramId(''); setSemesterId(''); setSectionId(''); };
  const onDepartment = (v: string) => { setDepartmentId(v); setProgramId(''); setSemesterId(''); setSectionId(''); };
  const onProgram = (v: string) => { setProgramId(v); setSemesterId(''); setSectionId(''); };
  const onSemester = (v: string) => { setSemesterId(v); setSectionId(''); };

  // ── Availability brain — conflicts for the SELECTED people at the session
  // window. Advisory: a check failure is swallowed, never blocks saving. ──
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
        if (!cancelled) setConflicts({});
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, startIso, endIso, hasWindow]);

  const conflictedSelected = value.filter((u) => conflicts[u.id]?.length);

  // Filtered candidate search (debounced) — by type + filters + name.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = type === 'facilitator'
          ? await InductionSpeakersService.searchFacilitators({
              institutionId, departmentId, query,
            })
          : await InductionSpeakersService.searchLearnerSpeakers({
              institutionId, degreeId, departmentId, programId, semesterId, sectionId, query,
            });
        setResults(rows);
      } catch (e: any) {
        toast.error(`Search failed: ${e.message ?? e}`);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, institutionId, degreeId, departmentId, programId, semesterId, sectionId, query]);

  const visibleResults = results.filter((r) => !selectedIds.has(r.id));

  const add = (r: ResourcePersonResult) => {
    if (selectedIds.has(r.id)) return;
    onChange([...value, {
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      role: type === 'learner' ? 'Learner' : 'Facilitator',
    }]);
  };
  const remove = (id: string) => onChange(value.filter((u) => u.id !== id));

  return (
    <div className="space-y-3">
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

      {/* availability warning — advisory */}
      {hasWindow && conflictedSelected.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Already busy at this time
          </div>
          <ul className="space-y-0.5">
            {conflictedSelected.map((u) => (
              <li key={u.id}>
                <span className="font-medium">{u.full_name || u.email}</span>:{' '}
                {conflicts[u.id].map((c) => c.label + (fmtRange(c) ? ` (${fmtRange(c)})` : '')).join('; ')}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-amber-700 dark:text-amber-300/80">You can still assign them — this is just a heads-up.</p>
        </div>
      )}

      {/* type toggle */}
      <div className="inline-flex rounded-md border p-0.5">
        {([['facilitator', 'Facilitator', Briefcase], ['learner', 'Learner', GraduationCap]] as const).map(([t, lbl, Icon]) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => setType(t)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {lbl}
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="grid grid-cols-2 gap-2">
        <FilterSelect label="Institution" value={institutionId} onChange={onInstitution} disabled={disabled}
          placeholder="Any institution" options={institutions.map((i) => ({ id: i.id, name: i.name }))} />
        {type === 'learner' && (
          <FilterSelect label="Degree" value={degreeId} onChange={onDegree} disabled={disabled}
            placeholder="Any degree" options={(degrees as any[]).map((d) => ({ id: d.id, name: d.degree_name }))} />
        )}
        <FilterSelect label="Department" value={departmentId} onChange={onDepartment} disabled={disabled}
          placeholder="Any department" options={(departments as any[]).map((d) => ({ id: d.id, name: d.department_name }))} />
        {type === 'learner' && (
          <>
            <FilterSelect label="Program" value={programId} onChange={onProgram} disabled={disabled}
              placeholder="Any program" options={(programs as any[]).map((p) => ({ id: p.id, name: p.program_name }))} />
            <FilterSelect label="Semester" value={semesterId} onChange={onSemester} disabled={disabled || !programId}
              placeholder={programId ? 'Any semester' : 'Pick program first'} options={(semesters as any[]).map((s) => ({ id: s.id, name: s.semester_name }))} />
            <FilterSelect label="Section" value={sectionId} onChange={setSectionId} disabled={disabled || !semesterId}
              placeholder={semesterId ? 'Any section' : 'Pick semester first'} options={(sections as any[]).map((s) => ({ id: s.id, name: s.section_name }))} />
          </>
        )}
      </div>

      {/* name search */}
      <div className="flex items-center gap-2 rounded-md border px-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={type === 'learner' ? 'Search learners by name or roll no…' : 'Search staff by name or staff id…'}
          className="border-0 focus-visible:ring-0 px-0 h-9"
        />
      </div>

      {/* results */}
      <div className="rounded-md border max-h-56 overflow-y-auto">
        {searching ? (
          <div className="p-2 space-y-1"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : visibleResults.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            No matching {type === 'learner' ? 'learners' : 'staff'}. Narrow the filters or check the name.
          </p>
        ) : (
          visibleResults.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={disabled}
              onClick={() => add(r)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="flex items-center gap-2 min-w-0">
                <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{r.full_name || '(no name)'}</span>
                {r.sub_label && <span className="text-[11px] text-muted-foreground shrink-0">· {r.sub_label}</span>}
              </span>
              <span className="text-[11px] text-muted-foreground truncate max-w-[40%]">{r.email}</span>
            </button>
          ))
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Pick the actual people who led this session. Only staff and learners with a login account appear — a department isn&apos;t a speaker.
      </p>
    </div>
  );
}
