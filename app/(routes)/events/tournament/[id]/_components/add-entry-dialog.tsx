'use client';

// Add-entry dialog for a tournament division (Sports Tournament PR2; participant
// picker rework 2026-07). Individual vs team is decided by the division's sport
// (TEAM_SPORTS → roster). The organizer FIRST chooses the participant type:
//   - "JKKN Student"  → search current (active) learners by name / register no /
//     college email and PICK one — the entry links to their learner record
//     (learner_id) so wins post to their athlete profile. Free-text names are
//     not allowed on this path; only student-role users can be participants.
//   - "Non-JKKN"      → manual name + institution/school name (is_external).
// For linked students, gender/DOB come from their learner profile server-side,
// so those inputs only appear on the external path.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  Check,
  X,
  GraduationCap,
  Building2,
  Mail,
} from 'lucide-react';
import { TEAM_SPORTS } from '@/types/health-sports';
import { TEAM_MEMBER_ROLES } from '@/types/tournament';
import type { TournamentDivision, CreateEntryDto, CreateTeamMemberDto } from '@/types/tournament';
import { useRegisterEntry } from '@/hooks/events/use-tournament-registrations';

function divisionLabel(d: TournamentDivision): string {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

function feeOf(d: TournamentDivision | undefined): number {
  if (!d) return 0;
  return Number((d.config as { entry_fee?: number })?.entry_fee ?? 0) || 0;
}

type ParticipantType = 'jkkn' | 'external';

type LearnerHit = {
  id: string;
  name: string;
  register_number: string | null;
  college_email: string | null;
  institution_name: string | null;
};

/**
 * Learner search combobox. Typing searches CURRENT (active) learners via the
 * organizer-gated /learner-search route by name / register number / college
 * email; results show the name + college email so the organizer can confirm
 * the right student before picking.
 */
function LearnerSearchInput({
  value,
  linkedId,
  eventId,
  onText,
  onPick,
  onClear,
  placeholder,
}: {
  value: string;
  linkedId: string | null;
  eventId: string;
  onText: (text: string) => void;
  onPick: (hit: LearnerHit) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<LearnerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (linkedId) return; // already linked — don't keep searching
    const term = value.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/events/tournament/learner-search?q=${encodeURIComponent(term)}&event_id=${encodeURIComponent(eventId)}`
        );
        const json = await res.json().catch(() => ({}));
        if (active) {
          setResults(json.results ?? []);
          setOpen(true);
        }
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [value, linkedId, eventId]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 pr-8"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onText(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {linkedId ? (
          <button
            type="button"
            onClick={onClear}
            title="Unlink learner"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : loading ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open && !linkedId && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.length === 0 && !loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No matching students found.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                // onMouseDown (not onClick) so the pick fires before the input blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(r);
                  setOpen(false);
                }}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.name || 'Unnamed learner'}</span>
                  {r.register_number && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.register_number}
                    </span>
                  )}
                </span>
                {r.college_email && (
                  <span className="truncate text-xs text-muted-foreground">{r.college_email}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Card shown once a JKKN student has been picked — name + college email + college. */
function PickedLearnerCard({ learner, onClear }: { learner: LearnerHit; onClear: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">{learner.name}</span>
          {learner.register_number && (
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {learner.register_number}
            </span>
          )}
        </p>
        {learner.college_email && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            {learner.college_email}
          </p>
        )}
        {learner.institution_name && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            {learner.institution_name}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        title="Choose a different student"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function AddEntryDialog({
  eventId,
  divisions,
  open,
  onOpenChange,
  defaultDivisionId,
}: {
  eventId: string;
  divisions: TournamentDivision[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDivisionId?: string;
}) {
  const register = useRegisterEntry(eventId);

  const [divisionId, setDivisionId] = useState(defaultDivisionId ?? divisions[0]?.id ?? '');
  const [participantType, setParticipantType] = useState<ParticipantType>('jkkn');
  const [entryName, setEntryName] = useState('');
  const [searchText, setSearchText] = useState('');
  const [pickedLearner, setPickedLearner] = useState<LearnerHit | null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [members, setMembers] = useState<CreateTeamMemberDto[]>([{ member_name: '', role: 'captain' }]);
  const [paymentMode, setPaymentMode] = useState<'online' | 'offline'>('offline');

  const isExternal = participantType === 'external';

  const division = useMemo(
    () => divisions.find((d) => d.id === divisionId),
    [divisions, divisionId]
  );
  const isTeam = useMemo(
    () => (division ? (TEAM_SPORTS as readonly string[]).includes(division.sport) : false),
    [division]
  );
  const fee = feeOf(division);

  function reset() {
    setParticipantType('jkkn');
    setEntryName('');
    setSearchText('');
    setPickedLearner(null);
    setInstitutionName('');
    setGender('');
    setAge('');
    setMembers([{ member_name: '', role: 'captain' }]);
    setPaymentMode('offline');
  }

  function switchType(t: ParticipantType) {
    setParticipantType(t);
    // Identity fields don't carry across types.
    setPickedLearner(null);
    setSearchText('');
    if (t === 'jkkn') setInstitutionName('');
    // Roster links are JKKN-only.
    if (t === 'external') {
      setMembers((m) => m.map((row) => ({ ...row, learner_id: null })));
    }
  }

  function addMember() {
    setMembers((m) => [...m, { member_name: '', role: 'player' }]);
  }
  function removeMember(i: number) {
    setMembers((m) => m.filter((_, idx) => idx !== i));
  }
  function setMember(i: number, patch: Partial<CreateTeamMemberDto>) {
    setMembers((m) => m.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  // Individual JKKN entries must be a picked student; everything else needs a name.
  const canSubmit =
    !!divisionId &&
    (!isTeam && !isExternal ? !!pickedLearner : !!entryName.trim());

  async function submit() {
    if (!canSubmit) return;

    const individualJkkn = !isTeam && !isExternal && pickedLearner;

    const dto: CreateEntryDto = {
      division_id: divisionId,
      entry_type: isTeam ? 'team' : 'individual',
      entry_name: individualJkkn ? pickedLearner.name : entryName.trim(),
      is_external: isExternal,
      institution_name: individualJkkn
        ? pickedLearner.institution_name
        : institutionName.trim() || null,
      notes: null,
    };

    if (isTeam) {
      dto.members = members
        .filter((m) => m.member_name.trim())
        .map((m) => ({ ...m, member_name: m.member_name.trim() }));
    } else if (individualJkkn) {
      // Linked student: gender/DOB resolve from their learner profile server-side.
      dto.learner_id = pickedLearner.id;
      dto.participant_email = pickedLearner.college_email;
    } else {
      dto.learner_id = null;
      dto.participant_gender = gender || null;
      dto.participant_age = age ? Number(age) : null;
    }

    if (fee > 0) dto.payment_mode = paymentMode;

    const result = await register.mutateAsync(dto);
    if (result.payment_url) window.open(result.payment_url, '_blank', 'noopener');
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Entry</DialogTitle>
          <DialogDescription>
            Register a {isTeam ? 'team (with roster)' : 'participant'} into a division.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Division */}
          <div className="space-y-1.5">
            <Label>Division</Label>
            <Select value={divisionId} onValueChange={setDivisionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a division" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {divisionLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {division && (
              <p className="text-xs text-muted-foreground">
                {isTeam ? 'Team sport' : 'Individual event'} · Format: {division.format}
                {fee > 0 ? ` · Entry fee: ₹${fee}` : ' · No entry fee'}
              </p>
            )}
          </div>

          {/* Participant type — chosen FIRST; drives every identity field below. */}
          <div className="space-y-1.5">
            <Label>{isTeam ? 'Team type' : 'Participant type'}</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Participant type">
              <button
                type="button"
                role="radio"
                aria-checked={!isExternal}
                onClick={() => switchType('jkkn')}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                  !isExternal
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40'
                    : 'hover:bg-accent'
                }`}
              >
                <GraduationCap
                  className={`mt-0.5 h-4 w-4 shrink-0 ${!isExternal ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                />
                <span>
                  <span className="block text-sm font-medium">JKKN Student</span>
                  <span className="block text-xs text-muted-foreground">
                    Search &amp; link a current student
                  </span>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isExternal}
                onClick={() => switchType('external')}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                  isExternal
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40'
                    : 'hover:bg-accent'
                }`}
              >
                <Building2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${isExternal ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                />
                <span>
                  <span className="block text-sm font-medium">Non-JKKN</span>
                  <span className="block text-xs text-muted-foreground">
                    Outside participant — enter details manually
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Identity */}
          {!isTeam && !isExternal ? (
            /* JKKN individual: search-and-pick a current student (no free text). */
            <div className="space-y-1.5">
              <Label>Participant (JKKN student)</Label>
              {pickedLearner ? (
                <PickedLearnerCard
                  learner={pickedLearner}
                  onClear={() => {
                    setPickedLearner(null);
                    setSearchText('');
                  }}
                />
              ) : (
                <>
                  <LearnerSearchInput
                    value={searchText}
                    linkedId={null}
                    eventId={eventId}
                    placeholder="Search by name, register number or college email"
                    onText={setSearchText}
                    onPick={(hit) => {
                      setPickedLearner(hit);
                      setSearchText('');
                    }}
                    onClear={() => setPickedLearner(null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Only current JKKN students can be selected. Their college email and
                    institution fill in automatically.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Team name (both types) OR external individual name. */}
              <div className="space-y-1.5">
                <Label>{isTeam ? 'Team name' : 'Participant name'}</Label>
                <Input
                  value={entryName}
                  onChange={(e) => setEntryName(e.target.value)}
                  placeholder={isTeam ? 'e.g. JKKN Engineering A' : 'e.g. R. Karthik'}
                />
              </div>
              {/* Institution / school — manual for external; also kept for teams. */}
              <div className="space-y-1.5">
                <Label>{isExternal ? 'Institution / School name' : 'Institution / College'}</Label>
                <Input
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder={
                    isExternal ? 'e.g. Govt. Hr. Sec. School, Komarapalayam' : 'e.g. JKKN College of Engineering'
                  }
                />
              </div>
            </>
          )}

          {/* Individual eligibility fields — external only (linked students derive
              gender/DOB from their learner profile server-side). */}
          {!isTeam && isExternal && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Age</Label>
                <Input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 19"
                />
              </div>
            </div>
          )}

          {/* Team roster */}
          {isTeam && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Roster</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMember}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add player
                </Button>
              </div>
              {members.map((m, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {isExternal ? (
                      <Input
                        value={m.member_name}
                        onChange={(e) => setMember(i, { member_name: e.target.value })}
                        placeholder="Player name"
                      />
                    ) : (
                      <LearnerSearchInput
                        value={m.member_name}
                        linkedId={m.learner_id ?? null}
                        eventId={eventId}
                        placeholder="Search student by name / register no / email"
                        onText={(t) => setMember(i, { member_name: t, learner_id: null })}
                        onPick={(hit) => setMember(i, { member_name: hit.name, learner_id: hit.id })}
                        onClear={() => setMember(i, { learner_id: null })}
                      />
                    )}
                  </div>
                  <div className="w-20 space-y-1">
                    <Input
                      value={m.jersey_no ?? ''}
                      onChange={(e) => setMember(i, { jersey_no: e.target.value })}
                      placeholder="No."
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Select
                      value={m.role ?? 'player'}
                      onValueChange={(v) => setMember(i, { role: v as CreateTeamMemberDto['role'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAM_MEMBER_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMember(i)}
                    disabled={members.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Payment mode (paid divisions only) */}
          {fee > 0 && (
            <div className="space-y-1.5">
              <Label>Payment</Label>
              <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as 'online' | 'offline')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Collect offline (mark paid later)</SelectItem>
                  <SelectItem value="online">Generate online payment link (₹{fee})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={register.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={register.isPending || !canSubmit}>
            {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
