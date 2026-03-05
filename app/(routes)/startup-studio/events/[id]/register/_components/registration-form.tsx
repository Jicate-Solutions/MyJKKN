'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Trash2, Laptop, Loader2 } from 'lucide-react';
import type { StartupEvent } from '@/types/startup-studio';

const memberSchema = z.object({
  email: z.string().email('Valid email required'),
  full_name: z.string().optional(),
  student_id: z.string().optional(),
  has_laptop: z.boolean().default(false),
});

const registrationSchema = z.object({
  team_name: z.string().min(2, 'Team name must be at least 2 characters'),
  problem_idea: z.string().min(20, 'Problem idea must be at least 20 characters'),
  institution_id: z.string().optional(),
  members: z.array(memberSchema).min(1, 'Add at least one team member'),
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
  const maxSize = event.config?.team_max_size || 5;
  const isSuperAdmin = (profile as any)?.is_super_admin || profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';
  const needsInstitutionPicker = isSuperAdmin && !profile?.institution_id;
  const { data: institutions = [] } = useInstitutions();

  const form = useForm<FormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      team_name: '',
      problem_idea: '',
      institution_id: '',
      members: [
        {
          email: profile?.email || '',
          full_name: profile?.full_name || '',
          student_id: '',
          has_laptop: false,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'members',
  });

  const onSubmit = (values: FormValues) => {
    registerTeam.mutate({
      event_id: event.id,
      team_name: values.team_name,
      problem_idea: values.problem_idea,
      institution_id: values.institution_id || undefined,
      members: values.members.map((member) => ({
        email: member.email,
        full_name: member.full_name || '',
        student_id: member.student_id || '',
        has_laptop: member.has_laptop,
      })),
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Team Details</CardTitle>
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
                      rows={3}
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Team Members ({fields.length}/{maxSize})</CardTitle>
              {fields.length < maxSize && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ email: '', full_name: '', student_id: '', has_laptop: false })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Member {index + 1} {index === 0 && '(You - Team Leader)'}
                  </span>
                  {index > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name={`members.${index}.email`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="email@example.com" readOnly={index === 0} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`members.${index}.full_name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Full name" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`members.${index}.student_id`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Student ID</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 22CS101" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name={`members.${index}.has_laptop`}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0 flex items-center gap-1">
                        <Laptop className="h-4 w-4" /> Has Laptop
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={registerTeam.isPending}>
          {registerTeam.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering...</>
          ) : (
            'Register Team'
          )}
        </Button>
      </form>
    </Form>
  );
}
