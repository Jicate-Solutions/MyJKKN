'use client';

// Add-entry dialog for a tournament division (Sports Tournament PR2).
// Individual vs team is decided by the division's sport (TEAM_SPORTS → roster).
// Created: 2026-06-22 (Sports Tournament PR2).

import { useMemo, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
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
  const [entryName, setEntryName] = useState('');
  const [isExternal, setIsExternal] = useState(false);
  const [institutionName, setInstitutionName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [members, setMembers] = useState<CreateTeamMemberDto[]>([{ member_name: '', role: 'captain' }]);
  const [paymentMode, setPaymentMode] = useState<'online' | 'offline'>('offline');

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
    setEntryName('');
    setIsExternal(false);
    setInstitutionName('');
    setGender('');
    setAge('');
    setMembers([{ member_name: '', role: 'captain' }]);
    setPaymentMode('offline');
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

  async function submit() {
    if (!divisionId || !entryName.trim()) return;

    const dto: CreateEntryDto = {
      division_id: divisionId,
      entry_type: isTeam ? 'team' : 'individual',
      entry_name: entryName.trim(),
      is_external: isExternal,
      institution_name: institutionName.trim() || null,
      notes: null,
    };

    if (isTeam) {
      dto.members = members
        .filter((m) => m.member_name.trim())
        .map((m) => ({ ...m, member_name: m.member_name.trim() }));
    } else {
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

          {/* Entry name */}
          <div className="space-y-1.5">
            <Label>{isTeam ? 'Team name' : 'Participant name'}</Label>
            <Input
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              placeholder={isTeam ? 'e.g. JKKN Engineering A' : 'e.g. R. Karthik'}
            />
          </div>

          {/* External toggle + institution */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">External (non-JKKN)</Label>
              <p className="text-xs text-muted-foreground">An outside team/player, not a JKKN institution.</p>
            </div>
            <Switch checked={isExternal} onCheckedChange={setIsExternal} />
          </div>
          <div className="space-y-1.5">
            <Label>{isExternal ? 'Organization / Club' : 'Institution / College'}</Label>
            <Input
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder={isExternal ? 'e.g. City Sports Club' : 'e.g. JKKN College of Engineering'}
            />
          </div>

          {/* Individual fields */}
          {!isTeam && (
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
                    <Input
                      value={m.member_name}
                      onChange={(e) => setMember(i, { member_name: e.target.value })}
                      placeholder="Player name"
                    />
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
          <Button onClick={submit} disabled={register.isPending || !divisionId || !entryName.trim()}>
            {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
