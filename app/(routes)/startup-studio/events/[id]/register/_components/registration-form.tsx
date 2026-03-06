'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useRegisterTeam } from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, Users } from 'lucide-react';
import type { StartupEvent } from '@/types/startup-studio';

const registrationSchema = z.object({
  team_name: z.string().min(2, 'Team name must be at least 2 characters'),
  problem_idea: z.string().min(20, 'Problem idea must be at least 20 characters'),
  institution_id: z.string().optional(),
});

type FormValues = z.infer<typeof registrationSchema>;

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.from('institutions').select('id, name').order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

export function RegistrationForm({ event }: { event: StartupEvent }) {
  const { profile } = useAuth();
  const registerTeam = useRegisterTeam();
  const isSuperAdmin =
    (profile as any)?.is_super_admin ||
    ['super_admin', 'admin', 'administrator'].includes(profile?.role || '');
  const needsInstitutionPicker = isSuperAdmin && !profile?.institution_id;
  const { data: institutions = [] } = useInstitutions();

  const form = useForm<FormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { team_name: '', problem_idea: '', institution_id: '' },
  });

  const onSubmit = (values: FormValues) => {
    registerTeam.mutate({
      event_id: event.id,
      team_name: values.team_name,
      problem_idea: values.problem_idea,
      institution_id: values.institution_id || undefined,
      members: [],
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Team Details</CardTitle>
            <CardDescription>
              Register your team. After registering, you can invite teammates from your My Team page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="team_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter your team name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="problem_idea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Problem / Idea</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What problem will your team solve? (minimum 20 characters)"
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {needsInstitutionPicker && (
              <FormField
                control={form.control}
                name="institution_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select institution" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Users className="h-5 w-5 shrink-0" />
              <p className="text-sm">
                After registering, invite up to{' '}
                <strong>{(event.config?.team_max_size || 5) - 1}</strong> teammates from the{' '}
                <strong>My Team</strong> page using the student search.
              </p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={registerTeam.isPending}>
          {registerTeam.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering...</>
          ) : (
            'Register Team & Get Team Code'
          )}
        </Button>
      </form>
    </Form>
  );
}
