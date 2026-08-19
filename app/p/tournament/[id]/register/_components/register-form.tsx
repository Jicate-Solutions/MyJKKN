'use client';

// Public self-service registration form (Sports Tournament v2). Hybrid: a signed-in JKKN
// user is auto-linked (no contact needed for individuals); a guest enters contact details.
// Created: 2026-06-23.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  Check,
  ChevronsUpDown,
  ListChecks,
  PencilLine,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { queryKeys } from '@/lib/query/query-keys';
import { SchoolMasterService } from '@/lib/services/school-master-service';
import { TEAM_SPORTS } from '@/types/health-sports';
import { EventRazorpayHostedRedirect } from '@/components/events/event-razorpay-hosted-redirect';
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
import type { EventRegistrationFormField } from '@/types/tournament';
import type { ParticipantOrgType } from '@/types/events';

const SCHOOL_SEARCH_LIMIT = 50;

// Searchable pick-from-directory control for an EXTERNAL registrant's school /
// club, backed by the global School Master directory (school_master). Searches
// by name across all districts (server-side, trigram-backed ILIKE, debounced),
// with a manual free-text fallback for schools not in the directory. Keeps the
// display name as the stored label and exposes the picked row's id.
function SchoolDirectoryPicker({
  value,
  schoolId,
  onChange,
}: {
  value: string;
  schoolId: string | null;
  onChange: (next: { name: string; schoolId: string | null }) => void;
}) {
  const [mode, setMode] = useState<'select' | 'manual'>(() =>
    schoolId ? 'select' : value ? 'manual' : 'select',
  );
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounceValue(searchTerm, 300);

  const { data: result, isFetching } = useQuery({
    queryKey: queryKeys.schoolMaster.list({ search: debouncedSearch, limit: SCHOOL_SEARCH_LIMIT }),
    queryFn: () =>
      SchoolMasterService.getSchools({ search: debouncedSearch, limit: SCHOOL_SEARCH_LIMIT }),
    // Only hit the directory once the picker is actually opened.
    enabled: mode === 'select' && open,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const schools = result?.schools ?? [];
  const total = result?.total ?? 0;

  if (mode === 'manual') {
    return (
      <div className="space-y-1.5">
        <Input
          placeholder="Type your school / club name"
          value={value}
          onChange={(e) => onChange({ name: e.target.value, schoolId: null })}
        />
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => {
            setSearchTerm(value?.trim() ?? '');
            setMode('select');
          }}
        >
          <ListChecks className="mr-1 h-3 w-3" />
          Pick from the school directory
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
          >
            <span className="truncate">{value || 'Search your school / club'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-full"
          style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '280px' }}
          align="start"
        >
          {/* Server-side search — cmdk's own filtering is disabled. */}
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search school name…"
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              {isFetching ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    No match — use &ldquo;not listed&rdquo; below to type it in.
                  </CommandEmpty>
                  <CommandGroup>
                    {schools.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={s.id}
                        onSelect={() => {
                          onChange({ name: s.school_name, schoolId: s.id });
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            schoolId === s.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">
                          {s.school_name}
                          {s.district ? (
                            <span className="text-muted-foreground"> · {s.district}</span>
                          ) : null}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {total > schools.length && (
                    <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                      Showing {schools.length} of {total} — type to narrow down.
                    </div>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 text-xs"
        onClick={() => setMode('manual')}
      >
        <PencilLine className="mr-1 h-3 w-3" />
        My school / club isn&apos;t listed
      </Button>
    </div>
  );
}

interface DivisionLite {
  id: string;
  sport: string;
  gender: string | null;
  age_band: string | null;
  format: string;
  config: Record<string, unknown>;
  eligibility: Record<string, unknown>;
}

interface SectionLite {
  id: string;
  title: string;
  fields: EventRegistrationFormField[];
}

function divLabel(d: DivisionLite) {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null].filter(Boolean).join(' · ');
}
function feeOf(d?: DivisionLite) {
  return d ? Number((d.config as { entry_fee?: number })?.entry_fee ?? 0) || 0 : 0;
}

export function RegisterForm({
  eventId,
  formId,
  divisions,
  signedInName,
  isLearner,
  sections,
  participantOrgType,
}: {
  eventId: string;
  /**
   * Which of the event's registration forms these answers belong to. Sent with
   * the submission so `custom_fields` stays interpretable once the event has
   * more than one form, and so the server validates against THIS form's fields.
   * Null when the event has no form at all.
   */
  formId: string | null;
  divisions: DivisionLite[];
  signedInName: string | null;
  isLearner: boolean;
  sections: SectionLite[];
  /**
   * Whether external entrants come from schools or colleges (events
   * .participant_org_type). Drives the institution field: 'school' keeps the
   * school_master directory picker, 'college' uses free text, since visiting
   * colleges are not in a school directory.
   */
  participantOrgType: ParticipantOrgType;
}) {
  const isCollegeTournament = participantOrgType === 'college';
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? '');
  const [entryName, setEntryName] = useState('');
  const [isExternal, setIsExternal] = useState(!isLearner);
  const [institution, setInstitution] = useState('');
  const [institutionSchoolId, setInstitutionSchoolId] = useState<string | null>(null);
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<{ member_name: string; jersey_no?: string }[]>([{ member_name: '' }]);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rzp, setRzp] = useState<{
    orderId: string;
    keyId: string;
    amountPaise: number;
    customer: { name?: string; email?: string; phone?: string };
  } | null>(null);

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
          institution_school_id: isExternal ? institutionSchoolId : null,
          participant_gender: gender || null,
          participant_age: age ? Number(age) : null,
          participant_phone: phone.trim() || null,
          participant_email: email.trim() || null,
          members: isTeam ? members.filter((m) => m.member_name.trim()) : undefined,
          form_id: formId,
          custom_fields: customFields,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(body.error || `Failed (${res.status})`);
      if (body.razorpay_order_id && body.razorpay_key_id) {
        setRzp({
          orderId: body.razorpay_order_id,
          keyId: body.razorpay_key_id,
          amountPaise: body.amount_paise ?? 0,
          customer: body.customer ?? {},
        });
        return;
      }
      setAccessCode(typeof body.access_code === 'string' ? body.access_code : null);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  if (rzp) {
    return (
      <EventRazorpayHostedRedirect
        eventId={eventId}
        razorpayKeyId={rzp.keyId}
        razorpayOrderId={rzp.orderId}
        amountPaise={rzp.amountPaise}
        currency="INR"
        customer={rzp.customer}
        description="Tournament entry fee"
        cancelPath={`/p/tournament/${eventId}/register`}
      />
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-semibold">You&apos;re registered!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {fee > 0
            ? 'Your registration is recorded — your payment is being confirmed.'
            : 'No entry fee for this division.'}{' '}
          See you at the tournament.
        </p>

        {accessCode && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              Your access code
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="select-all font-mono text-2xl font-bold tracking-[0.3em] text-emerald-900">
                {accessCode}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Copy access code"
                onClick={() => {
                  navigator.clipboard?.writeText(accessCode).then(
                    () => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    },
                    () => {},
                  );
                }}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-emerald-800">
              This is your code to check your results and passes — keep it safe.
            </p>
          </div>
        )}
      </div>
    );
  }

  // KEEP IN SYNC: the standard fields below are mirrored, read-only, in the
  // organizer's form builder — see standard-fields-card.tsx under
  // app/(routes)/events/tournament/[id]/registration-form/_components/.
  // Adding, removing or renaming a field here means updating STANDARD_FIELDS
  // there, or the builder will describe a form that no longer exists.
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

      {/* The directory picker is school-only: school_master holds schools, so on a
          college tournament every entrant would have to click "not listed" and type
          it anyway. isCollegeTournament therefore switches BOTH the label and the
          control, not just the wording. A JKKN registrant (isExternal off) always
          gets free text — their own college is not in a school directory either. */}
      <div className="space-y-1.5">
        <Label>{isExternal && !isCollegeTournament ? 'School / club' : 'College'}</Label>
        {isExternal && !isCollegeTournament ? (
          <SchoolDirectoryPicker
            value={institution}
            schoolId={institutionSchoolId}
            onChange={({ name, schoolId }) => {
              setInstitution(name);
              setInstitutionSchoolId(schoolId);
            }}
          />
        ) : (
          <Input
            value={institution}
            onChange={(e) => {
              setInstitution(e.target.value);
              setInstitutionSchoolId(null);
            }}
            placeholder="e.g. JKKN College of Engineering"
          />
        )}
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

      {sections.map((section) => (
        <div key={section.id} className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">{section.title}</p>
          {section.fields
            .filter((f) => isFieldVisible(f, customFields))
            .map((f) => (
              <DynamicFieldInput
                key={f.id}
                field={f}
                value={customFields[f.field_key]}
                // Tournaments share this control, so they get working uploads
                // too. Without the context the file input renders disabled —
                // correct for the builder preview, wrong for a live form.
                // formId can be null on a tournament with no form row yet; the
                // control degrades to the disabled state rather than posting an
                // upload with no form to attach it to.
                uploadContext={formId ? { eventId, formId } : undefined}
                onChange={(v) => setCustomFields((prev) => ({ ...prev, [f.field_key]: v }))}
              />
            ))}
        </div>
      ))}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Button className="w-full" onClick={submit} disabled={busy || !divisionId || !entryName.trim()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {fee > 0 ? `Register & pay ₹${fee}` : 'Register'}
      </Button>
    </div>
  );
}
