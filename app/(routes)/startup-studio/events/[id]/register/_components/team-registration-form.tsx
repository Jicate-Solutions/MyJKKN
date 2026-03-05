'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  ArrowLeft,
  Users,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useSSEvent, useRegisterTeam } from '@/hooks/startup-studio';

interface TeamRegistrationFormProps {
  eventId: string;
}

interface MemberSlot {
  user_id: string;
  display_label: string;
  department: string;
  has_laptop: boolean;
}

const EMPTY_MEMBER: MemberSlot = {
  user_id: '',
  display_label: '',
  department: '',
  has_laptop: false,
};

export function TeamRegistrationForm({ eventId }: TeamRegistrationFormProps) {
  const router = useRouter();
  const { data: eventRaw, isLoading: eventLoading, error: eventError } = useSSEvent(eventId);
  const registerTeam = useRegisterTeam();

  const event = eventRaw as any;

  const [teamName, setTeamName] = useState('');
  const [problemIdea, setProblemIdea] = useState('');
  const [members, setMembers] = useState<MemberSlot[]>([
    { ...EMPTY_MEMBER },
    { ...EMPTY_MEMBER },
  ]);
  const [teamLeadIndex, setTeamLeadIndex] = useState<string>('0');
  const [validationError, setValidationError] = useState('');

  const addMember = useCallback(() => {
    if (members.length < 5) {
      setMembers((prev) => [...prev, { ...EMPTY_MEMBER }]);
    }
  }, [members.length]);

  const removeMember = useCallback(
    (index: number) => {
      if (members.length <= 2) return;
      setMembers((prev) => prev.filter((_, i) => i !== index));
      // Adjust team lead index if needed
      const leadIdx = parseInt(teamLeadIndex);
      if (index === leadIdx) {
        setTeamLeadIndex('0');
      } else if (index < leadIdx) {
        setTeamLeadIndex(String(leadIdx - 1));
      }
    },
    [members.length, teamLeadIndex]
  );

  const updateMember = useCallback(
    (index: number, field: keyof MemberSlot, value: string | boolean) => {
      setMembers((prev) =>
        prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
      );
    },
    []
  );

  const validate = (): boolean => {
    if (!teamName.trim()) {
      setValidationError('Team name is required.');
      return false;
    }

    const filledMembers = members.filter((m) => m.user_id.trim());
    if (filledMembers.length < 2) {
      setValidationError('At least 2 members are required (enter email or user ID for each).');
      return false;
    }

    const leadIdx = parseInt(teamLeadIndex);
    if (!members[leadIdx]?.user_id.trim()) {
      setValidationError('The selected team lead must have a user ID or email.');
      return false;
    }

    setValidationError('');
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const leadIdx = parseInt(teamLeadIndex);
    const memberData = members
      .filter((m) => m.user_id.trim())
      .map((m, i) => ({
        user_id: m.user_id.trim(),
        department: m.department.trim() || undefined,
        is_anchor: members.indexOf(m) === leadIdx,
        has_laptop: m.has_laptop,
      }));

    try {
      await registerTeam.mutateAsync({
        eventId,
        data: {
          name: teamName.trim(),
          problem_idea: problemIdea.trim() || undefined,
          members: memberData,
        },
      });
      router.push(`/startup-studio/events/${eventId}`);
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to register team. Please try again.');
    }
  };

  if (eventLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (eventError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load event details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Register Team</h1>
          {event?.name && (
            <p className="text-sm text-muted-foreground mt-1">
              Event: {event.name}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {registerTeam.isSuccess && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Team registered successfully! Redirecting...</AlertDescription>
        </Alert>
      )}

      {/* Team Info */}
      <Card>
        <CardHeader>
          <CardTitle>Team Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name *</Label>
            <Input
              id="team-name"
              placeholder="Enter your team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="problem-idea">Problem Idea / Description</Label>
            <Textarea
              id="problem-idea"
              placeholder="Briefly describe the problem your team wants to solve"
              value={problemIdea}
              onChange={(e) => setProblemIdea(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members ({members.length}/5)
            </CardTitle>
            {members.length < 5 && (
              <Button variant="outline" size="sm" onClick={addMember}>
                <Plus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Team Lead</Label>
            <RadioGroup
              value={teamLeadIndex}
              onValueChange={setTeamLeadIndex}
              className="flex flex-wrap gap-4"
            >
              {members.map((_, index) => (
                <div key={index} className="flex items-center gap-2">
                  <RadioGroupItem value={String(index)} id={`lead-${index}`} />
                  <Label htmlFor={`lead-${index}`} className="text-sm font-normal cursor-pointer">
                    Member {index + 1}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {members.map((member, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 space-y-3 relative"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">
                  Member {index + 1}
                  {parseInt(teamLeadIndex) === index && (
                    <span className="ml-2 text-xs text-primary font-semibold">
                      (Team Lead)
                    </span>
                  )}
                </h4>
                {members.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMember(index)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`member-${index}-id`}>
                    User Email or ID *
                  </Label>
                  <Input
                    id={`member-${index}-id`}
                    placeholder="user@jkkn.ac.in"
                    value={member.user_id}
                    onChange={(e) =>
                      updateMember(index, 'user_id', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`member-${index}-dept`}>Department</Label>
                  <Input
                    id={`member-${index}-dept`}
                    placeholder="e.g., CSE, ECE, MBA"
                    value={member.department}
                    onChange={(e) =>
                      updateMember(index, 'department', e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={`member-${index}-laptop`}
                  checked={member.has_laptop}
                  onCheckedChange={(checked) =>
                    updateMember(index, 'has_laptop', checked === true)
                  }
                />
                <Label
                  htmlFor={`member-${index}-laptop`}
                  className="text-sm font-normal cursor-pointer"
                >
                  Has Laptop
                </Label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={registerTeam.isPending}
        >
          {registerTeam.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registering...
            </>
          ) : (
            'Register Team'
          )}
        </Button>
      </div>
    </div>
  );
}
