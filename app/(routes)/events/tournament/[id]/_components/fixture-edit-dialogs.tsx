'use client';

// Organiser tools for a generated bracket (2026-10-06):
//   - EditMatchSideDialog: put a different entry into an unplayed knockout side
//     (a no-show replaced) or fill the empty side of a bye (a late entry placed);
//   - SpotEntryDialog: register a walk-in after registration closed, with the
//     division's eligibility and entry fee still enforced.
// The server holds every rule (fn_tournament_set_match_side, /spot-entry); the
// helpers here only decide what to offer, so the UI never shows a button the
// server would refuse.

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useSetMatchSide } from '@/hooks/events/use-tournament-fixtures';
import { useAddSpotEntry } from '@/hooks/events/use-tournament-registrations';
import {
  DOUBLES_ROSTER_SIZE,
  SPOT_ENTRY_PAYMENT_METHODS,
  divisionPlayType,
  isTeamDivision,
  type EligibilityRules,
  type SpotEntryPaymentMethod,
  type TournamentDivision,
  type TournamentEntry,
  type TournamentMatch,
} from '@/types/tournament';

const ACTIVE = new Set(['registered', 'confirmed']);
const isUnplayed = (m: TournamentMatch) =>
  (m.status === 'pending' || m.status === 'scheduled') && !m.winner_entry_id;

/** Sides of `match` that no earlier match feeds (only those can be set by hand). */
function freeSlots(match: TournamentMatch, matches: TournamentMatch[]): ('a' | 'b')[] {
  const fed = new Set(matches.filter((f) => f.next_match_id === match.id).map((f) => f.next_slot));
  return (['a', 'b'] as const).filter((s) => !fed.has(s));
}

/**
 * The sides an organiser may change on this match, mirroring
 * fn_tournament_set_match_side. Empty = no edit button.
 */
export function editableSlots(match: TournamentMatch, matches: TournamentMatch[]): ('a' | 'b')[] {
  const free = freeSlots(match, matches);
  if (isUnplayed(match)) return free;
  if (match.status === 'bye') {
    const next = match.next_match_id ? matches.find((m) => m.id === match.next_match_id) : null;
    if (next && !isUnplayed(next)) return [];
    return free.filter((s) => (s === 'a' ? !match.side_a_entry_id : !match.side_b_entry_id));
  }
  return [];
}

/** Active entries of the division that are not anywhere in its bracket yet. */
export function unplacedEntries(entries: TournamentEntry[], matches: TournamentMatch[]): TournamentEntry[] {
  const placed = new Set<string>();
  for (const m of matches) {
    if (m.side_a_entry_id) placed.add(m.side_a_entry_id);
    if (m.side_b_entry_id) placed.add(m.side_b_entry_id);
  }
  return entries.filter((e) => ACTIVE.has(e.status) && !placed.has(e.id));
}

export function EditMatchSideDialog({
  eventId,
  match,
  matches,
  entries,
  open,
  onOpenChange,
}: {
  eventId: string;
  match: TournamentMatch;
  matches: TournamentMatch[];
  entries: TournamentEntry[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const setSide = useSetMatchSide(eventId);
  const slots = editableSlots(match, matches);
  const candidates = useMemo(() => unplacedEntries(entries, matches), [entries, matches]);
  const [slot, setSlot] = useState<'a' | 'b' | ''>(slots.length === 1 ? slots[0] : '');
  const [entryId, setEntryId] = useState('');

  const isBye = match.status === 'bye';
  const sideName = (s: 'a' | 'b') => (s === 'a' ? match.side_a_name : match.side_b_name);
  const replacing = slot ? sideName(slot) : null;
  const byeHolder = match.side_a_name ?? match.side_b_name;

  function submit() {
    if (!slot || !entryId || setSide.isPending) return;
    // The occupant this dialog showed: the server refuses the change if someone
    // else altered the side since (e.g. two organisers filling the same bye).
    const expected = (slot === 'a' ? match.side_a_entry_id : match.side_b_entry_id) ?? null;
    setSide.mutate(
      { matchId: match.id, dto: { slot, entry_id: entryId, expected_entry_id: expected } },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isBye ? 'Fill the bye' : 'Change a team in this match'}</DialogTitle>
          <DialogDescription>
            {(match.side_a_name ?? 'TBD')} vs {(match.side_b_name ?? 'TBD')}
            {match.round_label ? ` · ${match.round_label}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {!isBye && slots.length > 1 && (
            <div className="space-y-1.5">
              <Label>Side to change</Label>
              <Select value={slot} onValueChange={(v) => setSlot(v as 'a' | 'b')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a side" />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s} value={s}>
                      {sideName(s) ?? 'Empty side'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{isBye ? 'Entry to play this match' : 'Put in'}</Label>
            {candidates.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Every active entry of this division is already in the bracket. Add a spot entry first.
              </p>
            ) : (
              <Select value={entryId} onValueChange={setEntryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an entry not yet in the bracket" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.entry_name}
                      {e.institution_name ? ` · ${e.institution_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isBye && byeHolder && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {byeHolder} had a bye into the next round. They will play this match instead.
            </p>
          )}
          {!isBye && replacing && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {replacing} will be taken out of the bracket and marked withdrawn.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setSide.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={setSide.isPending || !slot || !entryId}>
            {setSide.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MemberRow {
  member_name: string;
}

export function SpotEntryDialog({
  eventId,
  division,
  divisionLabel,
  open,
  onOpenChange,
}: {
  eventId: string;
  division: TournamentDivision;
  divisionLabel: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const add = useAddSpotEntry(eventId);
  const isTeam = isTeamDivision(division);
  const isDoubles = divisionPlayType(division.config) === 'doubles';
  const rules = (division.eligibility ?? {}) as EligibilityRules;
  const fee = Number((division.config as { entry_fee?: number } | null)?.entry_fee ?? 0) || 0;
  const needsGender = rules.gender === 'male' || rules.gender === 'female';
  const needsAge = rules.min_age != null || rules.max_age != null;

  const [name, setName] = useState('');
  const [isExternal, setIsExternal] = useState(false);
  const [regNo, setRegNo] = useState('');
  const [institution, setInstitution] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [members, setMembers] = useState<MemberRow[]>(
    Array.from({ length: isDoubles ? DOUBLES_ROSTER_SIZE : isTeam ? 1 : 0 }, () => ({ member_name: '' }))
  );
  const [feeCollected, setFeeCollected] = useState(false);
  const [method, setMethod] = useState<SpotEntryPaymentMethod | ''>('');
  const [reference, setReference] = useState('');

  const namedMembers = members.filter((m) => m.member_name.trim());
  const rosterOk = !isTeam || (isDoubles ? namedMembers.length === DOUBLES_ROSTER_SIZE : namedMembers.length > 0);
  const feeOk = fee === 0 || (feeCollected && !!method && (method === 'cash' || !!reference.trim()));
  const canSubmit = !!name.trim() && rosterOk && feeOk && !add.isPending;

  // One key per opened form: the server returns the same entry for a repeat of
  // this submission (double click, retry), so a fee is never recorded twice.
  const [requestKey] = useState(() => crypto.randomUUID());
  // Blocks a second click before React re-renders with isPending.
  const submitting = useRef(false);

  function submit() {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    add.mutate({
      request_key: requestKey,
      division_id: division.id,
      entry_name: name.trim(),
      learner_register_number: !isExternal && regNo.trim() ? regNo.trim() : null,
      is_external: isExternal,
      institution_name: institution.trim() || null,
      participant_phone: phone.trim() || null,
      participant_gender: gender || null,
      participant_age: age ? Number(age) : null,
      members: isTeam ? namedMembers.map((m) => ({ member_name: m.member_name.trim() })) : undefined,
      fee_collected: fee > 0 ? feeCollected : undefined,
      payment_method: fee > 0 && method ? method : null,
      payment_reference: fee > 0 ? reference.trim() || null : null,
    }, {
      onSuccess: () => onOpenChange(false),
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !add.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add spot entry</DialogTitle>
          <DialogDescription>
            {divisionLabel}. Eligibility is checked as for online registration. Place the entry in the
            bracket afterwards with Edit teams or Fill bye.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{isTeam ? 'Team name *' : 'Player name *'}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isExternal} onCheckedChange={(c) => setIsExternal(c === true)} />
            From outside JKKN
          </label>

          {!isExternal && (
            <div className="space-y-1.5">
              <Label>
                {isTeam ? 'Captain register / roll number' : 'Register / roll number'}
                {rules.students_only ? ' *' : ''}
              </Label>
              <Input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="Links the JKKN learner" />
              {rules.students_only && (
                <p className="text-[11px] text-muted-foreground">
                  Students-only division: the entry is refused without a JKKN learner number.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Institution / college</Label>
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </div>
            {needsGender && (
              <div className="space-y-1.5">
                <Label>Gender{regNo.trim() && !isExternal ? '' : ' *'}</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {needsAge && (
              <div className="space-y-1.5">
                <Label>Age</Label>
                <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
            )}
          </div>

          {isTeam && (
            <div className="space-y-1.5">
              <Label>{isDoubles ? `Players (exactly ${DOUBLES_ROSTER_SIZE}) *` : 'Roster *'}</Label>
              {members.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={m.member_name}
                    placeholder={`Player ${i + 1}`}
                    onChange={(e) =>
                      setMembers((prev) => prev.map((x, j) => (j === i ? { member_name: e.target.value } : x)))
                    }
                  />
                  {!isDoubles && members.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMembers((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove player ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {!isDoubles && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMembers((prev) => [...prev, { member_name: '' }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add player
                </Button>
              )}
            </div>
          )}

          {fee > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Entry fee ₹{fee.toLocaleString('en-IN')}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={feeCollected} onCheckedChange={(c) => setFeeCollected(c === true)} />
                Fee collected at the desk
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Paid by *</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as SpotEntryPaymentMethod)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPOT_ENTRY_PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reference{method && method !== 'cash' ? ' *' : ''}</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={method === 'cash' ? 'Receipt no. (optional)' : 'Transaction ID'}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={add.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
