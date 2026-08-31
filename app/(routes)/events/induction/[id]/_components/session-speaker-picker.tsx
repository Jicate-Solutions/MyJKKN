'use client';

// Resource-person picker — type-segmented (Facilitator = staff, Learner =
// learners_profiles, Guest = an outside speaker with NO login account).
// Facilitators filter by institution + department; learners by the institution →
// degree → department → program → semester → section cascade.
//
// Guests (Director decision D11): an outside speaker is saved ONCE in
// event_guest_speakers and reused across colleges, so the list shows where each
// one has already spoken — that history is what tells two similarly-named guests
// apart. A guest and an account-holder are carried in the same selected list and
// saved by the same call; the RPC routes each id to its identity space, and the
// link row enforces exactly one of the two.
// Spec: specs/pre-onboarding-induction-access-2026-06-29.md
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
  guestSubtitle,
  type DirectoryUser,
  type GuestSpeakerRow,
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
import { X, Search, UserPlus, AlertTriangle, GraduationCap, Briefcase, Users, UserRound } from 'lucide-react';

const ANY = '__any__';
type PersonType = 'facilitator' | 'learner' | 'anyone' | 'guest';

/** "3 sessions · last: Fresher Induction 2026 · JKKN College of Arts and Science" */
function guestHistoryLine(g: GuestSpeakerRow): string {
  if (!g.sessions_count) return 'Not linked to any session yet';
  const bits = [`${g.sessions_count} session${g.sessions_count === 1 ? '' : 's'}`];
  if (g.last_event_name) bits.push(`last: ${g.last_event_name}`);
  if (g.colleges_label) bits.push(g.colleges_label);
  return bits.join(' · ');
}

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
  excludeSessionId,
}: {
  value: DirectoryUser[];
  onChange: (users: DirectoryUser[]) => void;
  disabled?: boolean;
  /** the session's window (datetime-local strings). When both are set, the picker
   *  checks each selected person against the availability brain and warns on a
   *  teaching / meeting / event-speaking clash. Advisory — never blocks. */
  sessionStart?: string;
  sessionEnd?: string;
  /** the session being EDITED. Its own already-saved speaker rows are not a
   *  clash with themselves — without this, re-opening a saved session reported
   *  every resource person on it as hard double-booked against that same
   *  session, and it could never be saved again. Undefined when creating. */
  excludeSessionId?: string | null;
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
  const [guestResults, setGuestResults] = useState<GuestSpeakerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "This guest isn't saved yet" form. Only full name is required — an outside
  // speaker often arrives with nothing else known.
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [gName, setGName] = useState('');
  const [gDesignation, setGDesignation] = useState('');
  const [gOrganization, setGOrganization] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [savingGuest, setSavingGuest] = useState(false);

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
    // Two identity spaces, ONE spine: account-holders answer via fn_people_conflicts,
    // guests via fn_guest_speaker_conflicts. Rows share a shape and are merged into
    // the single map the chips and the two banners already render, so a guest is
    // double-booked on exactly the same terms as anyone else.
    const profileIds = value.filter((u) => u.kind !== 'guest').map((u) => u.id);
    const guestIds = value.filter((u) => u.kind === 'guest').map((u) => u.id);
    if ((!profileIds.length && !guestIds.length) || !hasWindow) { setConflicts({}); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rows = await PersonAvailabilityService.getPeopleConflicts(ids, startIso, endIso, excludeSessionId);
        const [people, guests] = await Promise.all([
          PersonAvailabilityService.getPeopleConflicts(profileIds, startIso, endIso),
          PersonAvailabilityService.getGuestConflicts(guestIds, startIso, endIso),
        ]);
        if (cancelled) return;
        const grouped: Record<string, PersonConflict[]> = {};
        for (const r of [...people, ...guests]) {
          const k = r.profile_id ?? r.guest_id;
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
  }, [idsKey, startIso, endIso, hasWindow, excludeSessionId]);

  // Tiered policy: a meeting OR event-speaking clash is a HARD block (a person
  // truly can't be in two of those at once); a teaching/class clash is a SOFT
  // advisory (often covered by a substitute). The save handler enforces the block.
  const isHardConflict = (c: PersonConflict) => c.source === 'meeting' || c.source === 'event';
  const hardConflicted = value.filter((u) => (conflicts[u.id] ?? []).some(isHardConflict));
  const softConflicted = value.filter((u) => (conflicts[u.id] ?? []).some((c) => !isHardConflict(c)));

  // Filtered candidate search (debounced) — by type + filters + name.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (type === 'guest') {
          setGuestResults(await InductionSpeakersService.searchGuestSpeakers(query));
          setResults([]);
        } else {
          const rows =
            type === 'facilitator'
              ? await InductionSpeakersService.searchFacilitators({
                  institutionId, departmentId, query,
                })
              : type === 'learner'
                ? await InductionSpeakersService.searchLearnerSpeakers({
                    institutionId, degreeId, departmentId, programId, semesterId, sectionId, query,
                  })
                : await InductionSpeakersService.searchDirectory({ institutionId, query });
          setResults(rows);
          setGuestResults([]);
        }
      } catch (e: any) {
        toast.error(`Search failed: ${e.message ?? e}`);
        setResults([]);
        setGuestResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, institutionId, degreeId, departmentId, programId, semesterId, sectionId, query]);

  const visibleResults = results.filter((r) => !selectedIds.has(r.id));
  const visibleGuests = guestResults.filter((g) => !selectedIds.has(g.guest_id));

  const add = (r: ResourcePersonResult) => {
    if (selectedIds.has(r.id)) return;
    onChange([...value, {
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      role: type === 'learner' ? 'Learner' : type === 'facilitator' ? 'Facilitator' : (r.sub_label || 'Resource person'),
      kind: 'profile',
    }]);
  };
  const addGuest = (g: GuestSpeakerRow) => {
    if (selectedIds.has(g.guest_id)) return;
    onChange([...value, {
      id: g.guest_id,
      full_name: g.guest_name,
      email: g.guest_email,
      role: guestSubtitle(g) || 'Guest',
      kind: 'guest',
    }]);
  };
  const remove = (id: string) => onChange(value.filter((u) => u.id !== id));

  const resetGuestForm = () => {
    setGName(''); setGDesignation(''); setGOrganization(''); setGEmail(''); setGPhone('');
    setShowGuestForm(false);
  };
  const saveGuest = async () => {
    if (!gName.trim()) { toast.error('The guest needs a name.'); return; }
    setSavingGuest(true);
    try {
      const created = await InductionSpeakersService.createGuestSpeaker({
        full_name: gName, designation: gDesignation, organization: gOrganization,
        email: gEmail, phone: gPhone,
      });
      addGuest(created);
      resetGuestForm();
      toast.success('Guest saved — reusable for any college from now on.');
    } catch (e: any) {
      toast.error(`Couldn't save the guest: ${e.message ?? e}`);
    } finally {
      setSavingGuest(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((u) => (
            <Badge
              key={u.id}
              variant="secondary"
              className={`gap-1 pr-1 ${
                (conflicts[u.id] ?? []).some(isHardConflict)
                  ? 'ring-1 ring-red-400'
                  : conflicts[u.id]?.length
                    ? 'ring-1 ring-amber-400'
                    : ''
              }`}
            >
              {(conflicts[u.id] ?? []).some(isHardConflict) ? (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              ) : conflicts[u.id]?.length ? (
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              ) : null}
              <span>{u.full_name || u.email || u.id.slice(0, 8)}</span>
              {u.kind === 'guest' && (
                <span className="rounded bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">Guest</span>
              )}
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

      {/* HARD conflict (meeting / event) — blocks the save (admins can override). */}
      {hasWindow && hardConflicted.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-[11px] text-red-900 dark:border-red-700/50 dark:bg-red-950/40 dark:text-red-200">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Double-booked — can&apos;t be assigned at this time
          </div>
          <ul className="space-y-0.5">
            {hardConflicted.map((u) => (
              <li key={u.id}>
                <span className="font-medium">{u.full_name || u.email}</span>:{' '}
                {(conflicts[u.id] ?? []).filter(isHardConflict).map((c) => c.label + (fmtRange(c) ? ` (${fmtRange(c)})` : '')).join('; ')}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-red-700 dark:text-red-300/80">A meeting or another event clashes — pick another time, or an admin can force it when saving.</p>
        </div>
      )}

      {/* SOFT conflict (teaching) — advisory only, never blocks. */}
      {hasWindow && softConflicted.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Teaching a class at this time
          </div>
          <ul className="space-y-0.5">
            {softConflicted.map((u) => (
              <li key={u.id}>
                <span className="font-medium">{u.full_name || u.email}</span>:{' '}
                {(conflicts[u.id] ?? []).filter((c) => !isHardConflict(c)).map((c) => c.label + (fmtRange(c) ? ` (${fmtRange(c)})` : '')).join('; ')}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-amber-700 dark:text-amber-300/80">You can still assign them — a class overlap is often covered by a substitute.</p>
        </div>
      )}

      {/* type toggle */}
      <div className="inline-flex rounded-md border p-0.5">
        {([['facilitator', 'Facilitator', Briefcase], ['learner', 'Learner', GraduationCap], ['anyone', 'Anyone', Users], ['guest', 'Guest (no login)', UserRound]] as const).map(([t, lbl, Icon]) => (
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

      {/* filters — a guest belongs to no college, so none of these apply to them */}
      {type !== 'guest' && (
      <div className="grid grid-cols-2 gap-2">
        <FilterSelect label="Institution" value={institutionId} onChange={onInstitution} disabled={disabled}
          placeholder="Any institution" options={institutions.map((i) => ({ id: i.id, name: i.name }))} />
        {type === 'learner' && (
          <FilterSelect label="Degree" value={degreeId} onChange={onDegree} disabled={disabled}
            placeholder="Any degree" options={(degrees as any[]).map((d) => ({ id: d.id, name: d.degree_name }))} />
        )}
        {type !== 'anyone' && (
          <FilterSelect label="Department" value={departmentId} onChange={onDepartment} disabled={disabled}
            placeholder="Any department" options={(departments as any[]).map((d) => ({ id: d.id, name: d.department_name }))} />
        )}
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
      )}

      {/* name search */}
      <div className="flex items-center gap-2 rounded-md border px-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={type === 'learner' ? 'Search learners by name or roll no…' : type === 'anyone' ? 'Search all users by name or email…' : type === 'guest' ? 'Search saved guests by name, organisation or email…' : 'Search team members by name or ID…'}
          className="border-0 focus-visible:ring-0 px-0 h-9"
        />
      </div>

      {/* results */}
      <div className="rounded-md border max-h-56 overflow-y-auto">
        {searching ? (
          <div className="p-2 space-y-1"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : type === 'guest' ? (
          visibleGuests.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No saved guest matches. Add them below — you only have to do it once.
            </p>
          ) : (
            visibleGuests.map((g) => (
              <button
                key={g.guest_id}
                type="button"
                disabled={disabled}
                onClick={() => addGuest(g)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{g.guest_name}</span>
                  {guestSubtitle(g) && (
                    <span className="text-[11px] text-muted-foreground truncate">· {guestSubtitle(g)}</span>
                  )}
                </span>
                {/* the history is what tells two guests of the same name apart */}
                <span className="pl-[22px] text-[11px] text-muted-foreground truncate">{guestHistoryLine(g)}</span>
              </button>
            ))
          )
        ) : visibleResults.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {type === 'anyone'
              ? 'No matching users. Type a name/email or pick an institution.'
              : `No matching ${type === 'learner' ? 'learners' : 'staff'}. Narrow the filters or check the name.`}
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

      {/* add a guest who is not saved yet */}
      {type === 'guest' && (
        showGuestForm ? (
          <div className="space-y-2 rounded-md border p-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px] text-muted-foreground">Full name (required)</Label>
                <Input className="h-8 text-xs" value={gName} disabled={savingGuest}
                  onChange={(e) => setGName(e.target.value)} placeholder="Dr. A. Kumar" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Designation</Label>
                <Input className="h-8 text-xs" value={gDesignation} disabled={savingGuest}
                  onChange={(e) => setGDesignation(e.target.value)} placeholder="Chief Physiotherapist" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Organisation</Label>
                <Input className="h-8 text-xs" value={gOrganization} disabled={savingGuest}
                  onChange={(e) => setGOrganization(e.target.value)} placeholder="Where they work" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Email</Label>
                <Input className="h-8 text-xs" value={gEmail} disabled={savingGuest}
                  onChange={(e) => setGEmail(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Phone</Label>
                <Input className="h-8 text-xs" value={gPhone} disabled={savingGuest}
                  onChange={(e) => setGPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" className="h-7 text-xs" onClick={saveGuest} disabled={savingGuest || disabled}>
                {savingGuest ? 'Saving…' : 'Save and add'}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={resetGuestForm} disabled={savingGuest}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled}
            onClick={() => { setShowGuestForm(true); setGName(query.trim()); }}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> This guest is not saved yet
          </Button>
        )
      )}

      <p className="text-[11px] text-muted-foreground">
        {type === 'guest'
          ? 'An outside speaker with no JKKN login. Save them once — every college can then pick the same record, and you can see where they have already spoken.'
          : 'Pick the actual people who led this session. A department is not a speaker. Someone from outside with no login account goes under Guest.'}
      </p>
    </div>
  );
}
