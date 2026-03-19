'use client';

import { useState } from 'react';
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
import { Eye, EyeOff, Github, Key, Loader2, MapPin, Rocket, Sparkles } from 'lucide-react';
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
  gemini_api_key: z.string().min(10, 'Gemini API key is required'),
  google_maps_api_key: z.string().optional(),
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
  const [showGemini, setShowGemini] = useState(false);
  const [showMaps, setShowMaps] = useState(false);
  const update = useUpdateRegistration();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      team_name: registration.team_name ?? '',
      project_url: registration.project_url ?? '',
      github_url: registration.github_url ?? '',
      supabase_project_url: registration.supabase_project_url ?? '',
      gemini_api_key: registration.gemini_api_key ?? '',
      google_maps_api_key: registration.google_maps_api_key ?? '',
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
          gemini_api_key: values.gemini_api_key,
          google_maps_api_key: values.google_maps_api_key || undefined,
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
            Update your project details before the deadline (Sunday 11:59 PM).
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

            {/* API Keys */}
            <FormField
              control={form.control}
              name="gemini_api_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Gemini API Key <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showGemini ? 'text' : 'password'}
                        placeholder="AIza••••••••••••••••••••••••••"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                        onClick={() => setShowGemini((v) => !v)}
                        tabIndex={-1}
                      >
                        {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="google_maps_api_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-red-500" />
                    Google Maps API Key
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showMaps ? 'text' : 'password'}
                        placeholder="AIza••••••••••••••••••••••••••"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                        onClick={() => setShowMaps((v) => !v)}
                        tabIndex={-1}
                      >
                        {showMaps ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription className="text-xs">
                    Only needed if your project uses Google Maps
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
