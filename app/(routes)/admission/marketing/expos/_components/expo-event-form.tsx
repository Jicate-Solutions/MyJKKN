'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  useExpoMasters,
  useCreateExpoEvent,
  useUpdateExpoEvent,
} from '@/hooks/admission/use-expos';
import { useUsersByRolesForDropdown } from '@/hooks/admission/use-referral-dropdowns';
import { TeamMemberPicker } from './team-member-picker';
import type {
  ExpoEvent,
  CreateExpoEventInput,
  UpdateExpoEventInput,
  CreateExpoTeamMemberInput,
  TravelMode,
  ExpoEventStatus,
} from '@/types/admission';

interface ExpoEventFormProps {
  mode: 'create' | 'edit';
  initialData?: ExpoEvent;
}

const TRAVEL_MODE_OPTIONS: { value: TravelMode; label: string }[] = [
  { value: 'bus', label: 'Bus' },
  { value: 'train', label: 'Train' },
  { value: 'flight', label: 'Flight' },
  { value: 'own_vehicle', label: 'Own Vehicle' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS: { value: ExpoEventStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'confirmed', label: 'Confirmed' },
];

export function ExpoEventForm({ mode, initialData }: ExpoEventFormProps) {
  const router = useRouter();
  const { profile } = useAuth();

  // institution_id is optional — auto-set from profile for tracking, null for super_admin
  const institutionId = initialData?.institution_id ?? profile?.institution_id ?? null;

  // ── Expo Master selection ─────────────────────────────────────────────────
  const [selectedMasterId, setSelectedMasterId] = useState(
    initialData?.expo_master_id ?? ''
  );

  const { data: masters, isLoading: mastersLoading } = useExpoMasters({
    is_active: true,
  });

  // ── Event detail fields ───────────────────────────────────────────────────
  const [eventName, setEventName] = useState(initialData?.event_name ?? '');
  const [organizerName, setOrganizerName] = useState(
    initialData?.organizer_name ?? ''
  );
  const [city, setCity] = useState(initialData?.city ?? '');
  const [venueName, setVenueName] = useState(initialData?.venue_name ?? '');

  // ── Schedule & Logistics ─────────────────────────────────────────────────
  const [startDate, setStartDate] = useState(initialData?.start_date ?? '');
  const [endDate, setEndDate] = useState(initialData?.end_date ?? '');
  const [travelMode, setTravelMode] = useState<TravelMode | ''>(
    initialData?.travel_mode ?? ''
  );
  const [accommodationDetails, setAccommodationDetails] = useState(
    initialData?.accommodation_details ?? ''
  );

  // ── Team ─────────────────────────────────────────────────────────────────
  const [teamLeaderId, setTeamLeaderId] = useState(
    initialData?.team_leader_id ?? ''
  );
  const [teamMembers, setTeamMembers] = useState<CreateExpoTeamMemberInput[]>(
    []
  );

  // ── Approval & Notes ─────────────────────────────────────────────────────
  const [approvedById, setApprovedById] = useState(
    initialData?.approved_by_id ?? ''
  );
  const [eventStatus, setEventStatus] = useState<ExpoEventStatus>(
    initialData?.event_status ?? 'planned'
  );
  const [notes, setNotes] = useState(initialData?.notes ?? '');

  // ── Role-based user dropdowns (faculty + student for team, all staff roles for approver)
  const { data: teamLeaderList = [], isLoading: teamLeaderLoading } =
    useUsersByRolesForDropdown(['faculty', 'student']);
  const { data: approverList = [], isLoading: approverLoading } =
    useUsersByRolesForDropdown(['faculty', 'hod', 'principal', 'administrator', 'super_admin']);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useCreateExpoEvent();
  const updateMutation = useUpdateExpoEvent();

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // ── Auto-fill from expo master ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedMasterId) return;
    const master = masters.find((m) => m.id === selectedMasterId);
    if (!master) return;
    setEventName(master.event_name);
    setOrganizerName(master.organizer_name ?? '');
    setCity(master.city ?? '');
    setVenueName(master.venue_name ?? '');
  }, [selectedMasterId, masters]);

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!eventName.trim()) return 'Event name is required.';
    if (!city.trim()) return 'City is required.';
    if (!startDate) return 'Start date is required.';
    if (!endDate) return 'End date is required.';
    if (endDate < startDate) return 'End date must be on or after start date.';
    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (mode === 'create') {
      const input: CreateExpoEventInput = {
        institution_id: institutionId ?? undefined,
        event_name: eventName.trim(),
        city: city.trim(),
        start_date: startDate,
        end_date: endDate,
        ...(selectedMasterId ? { expo_master_id: selectedMasterId } : {}),
        ...(organizerName.trim()
          ? { organizer_name: organizerName.trim() }
          : {}),
        ...(venueName.trim() ? { venue_name: venueName.trim() } : {}),
        ...(travelMode ? { travel_mode: travelMode } : {}),
        ...(accommodationDetails.trim()
          ? { accommodation_details: accommodationDetails.trim() }
          : {}),
        ...(teamLeaderId ? { team_leader_id: teamLeaderId } : {}),
        ...(approvedById ? { approved_by_id: approvedById } : {}),
        event_status: eventStatus,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(teamMembers.length > 0 ? { team_members: teamMembers } : {}),
      };

      createMutation.mutate(input, {
        onSuccess: () => {
          router.push('/admission/marketing/expos');
        },
      });
    } else {
      if (!initialData?.id) return;

      const input: UpdateExpoEventInput & { id: string } = {
        id: initialData.id,
        event_name: eventName.trim(),
        city: city.trim(),
        start_date: startDate,
        end_date: endDate,
        ...(organizerName.trim()
          ? { organizer_name: organizerName.trim() }
          : {}),
        ...(venueName.trim() ? { venue_name: venueName.trim() } : {}),
        ...(travelMode ? { travel_mode: travelMode } : {}),
        ...(accommodationDetails.trim()
          ? { accommodation_details: accommodationDetails.trim() }
          : {}),
        ...(teamLeaderId ? { team_leader_id: teamLeaderId } : {}),
        ...(approvedById ? { approved_by_id: approvedById } : {}),
        event_status: eventStatus,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };

      updateMutation.mutate(input, {
        onSuccess: () => {
          router.push(`/admission/marketing/expos/${initialData.id}`);
        },
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back link */}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admission/marketing/expos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Expos
          </Link>
        </Button>
      </div>

      {/* ── Section 1: Expo Master Selection ── */}
      <Card>
        <CardHeader>
          <CardTitle>Expo Master</CardTitle>
          <CardDescription>
            Select an existing expo master to auto-fill details, or enter them
            manually below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="expo-master">Expo Master (optional)</Label>
            <Select
              value={selectedMasterId}
              onValueChange={(v) =>
                setSelectedMasterId(v === '__none__' ? '' : v)
              }
              disabled={mastersLoading}
            >
              <SelectTrigger id="expo-master">
                <SelectValue
                  placeholder={
                    mastersLoading ? 'Loading…' : 'Select expo master'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  — Enter details manually —
                </SelectItem>
                {masters.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.event_name}
                    {m.city ? ` — ${m.city}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Event Details ── */}
      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-name">
              Event Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. Engineering Expo 2026"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="organizer-name">Organizer Name</Label>
            <Input
              id="organizer-name"
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
              placeholder="Organizing body or contact"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">
              City <span className="text-destructive">*</span>
            </Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Chennai"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venue-name">Venue Name</Label>
            <Input
              id="venue-name"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="e.g. Convention Centre Hall A"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Schedule & Logistics ── */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule &amp; Logistics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="start-date">
              Start Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="end-date">
              End Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="travel-mode">Travel Mode</Label>
            <Select
              value={travelMode}
              onValueChange={(v) =>
                setTravelMode(v === '__none__' ? '' : (v as TravelMode))
              }
            >
              <SelectTrigger id="travel-mode">
                <SelectValue placeholder="Select travel mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Not specified —</SelectItem>
                {TRAVEL_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="accommodation">Accommodation Details</Label>
            <Textarea
              id="accommodation"
              value={accommodationDetails}
              onChange={(e) => setAccommodationDetails(e.target.value)}
              placeholder="Hotel name, address, booking reference…"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: Team Assignment ── */}
      <Card>
        <CardHeader>
          <CardTitle>Team Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="team-leader">Team Leader</Label>
            <Select
              value={teamLeaderId}
              onValueChange={(v) =>
                setTeamLeaderId(v === '__none__' ? '' : v)
              }
              disabled={teamLeaderLoading}
            >
              <SelectTrigger id="team-leader">
                <SelectValue
                  placeholder={teamLeaderLoading ? 'Loading…' : 'Select team leader'}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {teamLeaderList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === 'create' && (
            <TeamMemberPicker
              members={teamMembers}
              onChange={setTeamMembers}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Section 5: Approval & Notes ── */}
      <Card>
        <CardHeader>
          <CardTitle>Approval &amp; Notes</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="approved-by">Approved By</Label>
            <Select
              value={approvedById}
              onValueChange={(v) =>
                setApprovedById(v === '__none__' ? '' : v)
              }
              disabled={approverLoading}
            >
              <SelectTrigger id="approved-by">
                <SelectValue
                  placeholder={approverLoading ? 'Loading…' : 'Select approver'}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {approverList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === 'edit' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-status">Event Status</Label>
              <Select
                value={eventStatus}
                onValueChange={(v) => setEventStatus(v as ExpoEventStatus)}
              >
                <SelectTrigger id="event-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes or instructions…"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Submit ── */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" type="button" asChild>
          <Link href="/admission/marketing/expos">Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === 'create' ? 'Creating…' : 'Saving…'}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {mode === 'create' ? 'Create Event' : 'Save Changes'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
