'use client';

// Public self-service registration form (Sports Tournament v2). Hybrid: a signed-in JKKN
// user is auto-linked (no contact needed for individuals); a guest enters contact details.
// Created: 2026-06-23.

import { useMemo, useState } from 'react';
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
import { Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { TEAM_SPORTS } from '@/types/health-sports';

interface DivisionLite {
  id: string;
  sport: string;
  gender: string | null;
  age_band: string | null;
  format: string;
  config: Record<string, unknown>;
  eligibility: Record<string, unknown>;
}

function divLabel(d: DivisionLite) {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null].filter(Boolean).join(' · ');
}
function feeOf(d?: DivisionLite) {
  return d ? Number((d.config as { entry_fee?: number })?.entry_fee ?? 0) || 0 : 0;
}

export function RegisterForm({
  eventId,
  divisions,
  signedInName,
  isLearner,
}: {
  eventId: string;
  divisions: DivisionLite[];
  signedInName: string | null;
  isLearner: boolean;
}) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? '');
  const [entryName, setEntryName] = useState('');
  const [isExternal, setIsExternal] = useState(!isLearner);
  const [institution, setInstitution] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<{ member_name: string; jersey_no?: string }[]>([{ member_name: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const division = useMemo(() => divisions.find((d) => d.id === divisionId), [divisions, divisionId]);
  const isTeam = division ? (TEAM_SPORTS as readonly string[]).includes(division.sport) : false;
  const fee = feeOf(division);

  function setMember(i: number, patch: Partial<{ member_name: string; jersey_no?: string }>) {
    setMembers((m) => m.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function submit() {
    setError(null);
    if (!divisionId || !entryName.trim()) {
      setError('Please pick a division and enter a name.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/tournament/${eventId}/public-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division_id: divisionId,
          entry_type: isTeam ? 'team' : 'individual',
          entry_name: entryName.trim(),
          is_external: isExternal,
          institution_name: institution.trim() || null,
          participant_gender: gender || null,
          participant_age: age ? Number(age) : null,
          participant_phone: phone.trim() || null,
          participant_email: email.trim() || null,
          members: isTeam ? members.filter((m) => m.member_name.trim()) : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(body.error || `Failed (${res.status})`);
      if (body.payment_url) {
        window.location.href = body.payment_url; // go pay
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-semibold">You&apos;re registered!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {fee > 0 ? 'Your payment is confirmed.' : 'No entry fee for this division.'} See you at the tournament.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      {signedInName ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Signed in as <span className="font-medium">{signedInName}</span>
          {isLearner ? ' — your result will be linked to your JKKN profile.' : '.'}
        </p>
      ) : (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Registering as a guest. JKKN students can{' '}
          <a href="/auth/login" className="font-medium underline">sign in</a> first so wins post to their profile.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Event / division</Label>
        <Select value={divisionId} onValueChange={setDivisionId}>
          <SelectTrigger><SelectValue placeholder="Pick a division" /></SelectTrigger>
          <SelectContent>
            {divisions.map((d) => (
              <SelectItem key={d.id} value={d.id}>{divLabel(d)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {division && (
          <p className="text-xs text-muted-foreground">
            {isTeam ? 'Team event' : 'Individual event'}{fee > 0 ? ` · Entry fee ₹${fee}` : ' · Free entry'}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>{isTeam ? 'Team name' : 'Your name'}</Label>
        <Input value={entryName} onChange={(e) => setEntryName(e.target.value)} placeholder={isTeam ? 'e.g. Engineering Eagles' : 'Your full name'} />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label className="text-sm">External (non-JKKN)</Label>
          <p className="text-xs text-muted-foreground">Turn on if you&apos;re not from a JKKN institution.</p>
        </div>
        <Switch checked={isExternal} onCheckedChange={setIsExternal} />
      </div>

      <div className="space-y-1.5">
        <Label>{isExternal ? 'Club / organization' : 'College'}</Label>
        <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder={isExternal ? 'e.g. City Sports Club' : 'e.g. JKKN College of Engineering'} />
      </div>

      {!isTeam && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Age</Label>
            <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 19" />
          </div>
        </div>
      )}

      {isTeam && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Roster</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setMembers((m) => [...m, { member_name: '' }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add player
            </Button>
          </div>
          {members.map((m, i) => (
            <div key={i} className="flex items-end gap-2">
              <Input className="flex-1" value={m.member_name} onChange={(e) => setMember(i, { member_name: e.target.value })} placeholder="Player name" />
              <Input className="w-20" value={m.jersey_no ?? ''} onChange={(e) => setMember(i, { jersey_no: e.target.value })} placeholder="No." />
              <Button type="button" variant="ghost" size="icon" disabled={members.length <= 1} onClick={() => setMembers((mm) => mm.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {(isExternal || !signedInName) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contact number" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Button className="w-full" onClick={submit} disabled={busy || !divisionId || !entryName.trim()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {fee > 0 ? `Register & pay ₹${fee}` : 'Register'}
      </Button>
    </div>
  );
}
