'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Users, CheckCircle2, Star, Loader2 } from 'lucide-react';
import { APPATHON_ROLES } from '@/lib/constants/startup-studio/roles';
import {
  useMyRoleCard,
  useTeamRoleCards,
  useSubmitRoleCard,
} from '@/hooks/startup-studio/use-role-cards';
import type { EventTeamMember } from '@/types/startup-studio';

// ── Zod schema ────────────────────────────────────────────────────────────────

const roleCardSchema = z.object({
  self_roles: z
    .array(z.string())
    .min(1, 'Pick at least 1 role')
    .max(2, 'Pick at most 2 roles'),
  proud_of: z
    .string()
    .min(10, 'Minimum 10 characters')
    .max(150, 'Maximum 150 characters'),
  peer_tags: z.record(z.string(), z.string().min(1, 'Required')),
});

type RoleCardFormValues = z.infer<typeof roleCardSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface RoleCardSectionProps {
  submissionId: string;
  teamId: string;
  profileId: string;
  learnerId: string | null;
  teamMembers: EventTeamMember[];
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RoleCardSection({
  submissionId,
  teamId,
  profileId,
  learnerId,
  teamMembers,
}: RoleCardSectionProps) {
  const { data: myCard, isLoading: myCardLoading } = useMyRoleCard(submissionId);
  const { data: teamCards, isLoading: teamCardsLoading } = useTeamRoleCards(submissionId);
  const submitRoleCard = useSubmitRoleCard();

  const acceptedMembers = teamMembers.filter((m) => m.status === 'accepted');
  const otherMembers = acceptedMembers.filter(
    (m) => m.profile_id !== profileId && m.profile_id !== null
  );
  const completedCount = teamCards?.length ?? 0;
  const totalCount = acceptedMembers.length;

  const form = useForm<RoleCardFormValues>({
    resolver: zodResolver(roleCardSchema),
    defaultValues: {
      self_roles: [],
      proud_of: '',
      peer_tags: Object.fromEntries(otherMembers.map((m) => [m.profile_id!, ''])),
    },
  });

  if (myCardLoading || teamCardsLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ── Already submitted: success summary ─────────────────────────────────────
  if (myCard) {
    return (
      <Card className="border-green-200 bg-green-50/40 dark:border-green-900/40 dark:bg-green-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Your Role Card is submitted!
            </span>
            <ProgressBadge completed={completedCount} total={totalCount} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Your roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {myCard.self_roles.map((roleId) => {
                const role = APPATHON_ROLES.find((r) => r.id === roleId);
                return (
                  <Badge key={roleId} variant="secondary">
                    {role?.label ?? roleId}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Most proud of
            </p>
            <p className="text-sm leading-relaxed">{myCard.proud_of}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const watchedRoles = form.watch('self_roles');
  const watchedProudOf = form.watch('proud_of');

  const onSubmit = (values: RoleCardFormValues) => {
    const peer_tags = Object.entries(values.peer_tags).map(
      ([tagged_profile_id, tagged_role]) => ({ tagged_profile_id, tagged_role })
    );

    submitRoleCard.mutate({
      submission_id: submissionId,
      team_id: teamId,
      profile_id: profileId,
      learner_id: learnerId,
      self_roles: values.self_roles,
      proud_of: values.proud_of,
      peer_tags,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            Your Role Card
          </span>
          <ProgressBadge completed={completedCount} total={totalCount} />
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Team submission complete! Now each team member fills their individual Role Card.
        </p>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* Field 1: Self Roles */}
            <FormField
              control={form.control}
              name="self_roles"
              render={() => (
                <FormItem>
                  <FormLabel>
                    What was your main role in the team? Pick 1–2.{' '}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {APPATHON_ROLES.map((role) => {
                      const checked = watchedRoles.includes(role.id);
                      const disabled = !checked && watchedRoles.length >= 2;
                      return (
                        <label
                          key={role.id}
                          className={[
                            'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                            checked
                              ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20'
                              : 'border-border hover:border-muted-foreground/40',
                            disabled ? 'opacity-40 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(chk) => {
                              const current = form.getValues('self_roles');
                              form.setValue(
                                'self_roles',
                                chk
                                  ? [...current, role.id]
                                  : current.filter((r) => r !== role.id),
                                { shouldValidate: true }
                              );
                            }}
                            className="mt-0.5 shrink-0"
                          />
                          <div>
                            <p className="text-sm font-medium leading-none">{role.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {role.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Field 2: Proud Of */}
            <FormField
              control={form.control}
              name="proud_of"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    In one sentence, what are you most proud of from this Appathon?{' '}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., I got 15 classmates to sign up and use the app"
                      maxLength={150}
                    />
                  </FormControl>
                  <div className="flex items-center justify-between mt-1">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {watchedProudOf.length}/150
                    </span>
                  </div>
                </FormItem>
              )}
            />

            {/* Field 3: Peer Tags */}
            {otherMembers.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Tag your teammates</p>
                {otherMembers.map((member) => (
                  <FormField
                    key={member.profile_id}
                    control={form.control}
                    name={`peer_tags.${member.profile_id}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-normal">
                          What was{' '}
                          <span className="font-medium">
                            {member.full_name ?? member.email}
                          </span>
                          &apos;s biggest contribution?{' '}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {APPATHON_ROLES.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitRoleCard.isPending}
              className="w-full sm:w-auto gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitRoleCard.isPending ? 'Submitting...' : 'Submit Role Card'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ── Progress Badge ────────────────────────────────────────────────────────────

function ProgressBadge({ completed, total }: { completed: number; total: number }) {
  return (
    <Badge
      variant={completed === total && total > 0 ? 'default' : 'secondary'}
      className="gap-1 text-xs font-normal"
    >
      <Users className="h-3 w-3" />
      {completed} of {total} completed
    </Badge>
  );
}
