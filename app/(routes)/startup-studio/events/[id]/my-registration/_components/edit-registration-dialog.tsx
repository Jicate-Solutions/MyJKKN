'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Github, Loader2, MapPin, Rocket, Sparkles } from 'lucide-react';
import { useUpdateRegistration } from '@/hooks/startup-studio/use-sarvam-galatta';
import type { SarvamGalattaRegistration } from '@/types/sarvam-galatta';

const editSchema = z.object({
  team_name: z.string().min(2, 'Team name must be at least 2 characters'),
  project_url: z.string().url('Must be a valid URL').or(z.literal('')),
  github_url: z
    .string()
    .refine((v) => !v || v.includes('github.com'), { message: 'Must be a GitHub URL' })
    .or(z.literal('')),
  supabase_project_url: z
    .string()
    .refine((v) => !v || v.includes('supabase.co'), { message: 'Must be a Supabase project URL' })
    .or(z.literal('')),
  gemini_page_url: z.string().url('Must be a valid URL').or(z.literal('')),
  maps_page_url: z.string().url('Must be a valid URL').or(z.literal('')),
});

type EditFormValues = z.infer<typeof editSchema>;

interface EditRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registration: SarvamGalattaRegistration;
}

export function EditRegistrationDialog({
  open,
  onOpenChange,
  registration,
}: EditRegistrationDialogProps) {
  const update = useUpdateRegistration();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      team_name: registration.team_name ?? '',
      project_url: registration.project_url ?? '',
      github_url: registration.github_url ?? '',
      supabase_project_url: registration.supabase_project_url ?? '',
      gemini_page_url: registration.gemini_page_url ?? '',
      maps_page_url: registration.maps_page_url ?? '',
    },
  });

  function onSubmit(values: EditFormValues) {
    update.mutate(
      {
        sarvamGalattaId: registration.id,
        updates: {
          team_name: values.team_name,
          project_url: values.project_url || undefined,
          github_url: values.github_url || undefined,
          supabase_project_url: values.supabase_project_url || undefined,
          gemini_page_url: values.gemini_page_url || undefined,
          maps_page_url: values.maps_page_url || undefined,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Registration</DialogTitle>
          <DialogDescription>
            Update your project details. You can edit your submission anytime.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* Team name */}
            <FormField
              control={form.control}
              name="team_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team / Project Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. FarmBot AI" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Project URLs */}
            <FormField
              control={form.control}
              name="project_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Rocket className="h-3.5 w-3.5 text-emerald-600" />
                    Project URL
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="github_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Github className="h-3.5 w-3.5" />
                    GitHub Repository
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://github.com/..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supabase_project_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supabase Project URL</FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://...supabase.co" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* API Usage Pages */}
            <FormField
              control={form.control}
              name="gemini_page_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Page using Gemini in your app
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://your-project.lovable.app/chat" />
                  </FormControl>
                  <FormDescription className="text-xs">
                    URL of the page where your app uses the Gemini API
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maps_page_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-red-500" />
                    Page using Maps in your app
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://your-project.lovable.app/map" />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Leave blank if your project doesn't use Google Maps
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={update.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={update.isPending}>
                {update.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
