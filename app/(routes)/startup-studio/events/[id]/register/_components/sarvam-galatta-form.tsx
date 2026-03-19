'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import {
  AlertCircle, CheckCircle2, Clock, Eye, EyeOff, Github,
  Key, Loader2, MapPin, Rocket, Sparkles, User,
} from 'lucide-react';
import { useStudentAutoFill, useRegisterSarvamGalatta } from '@/hooks/startup-studio/use-sarvam-galatta';
import type { StartupEvent } from '@/types/startup-studio';
import type { StudentAutoFillProfile } from '@/types/sarvam-galatta';

// ---------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------

const schema = z.object({
  team_name: z.string().min(2, 'Team name must be at least 2 characters'),
  project_url: z.string().url('Must be a valid URL (e.g. https://...)').or(z.literal('')),
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

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function getTimeRemaining(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m remaining`;
}

// ---------------------------------------------------------------
// Auto-fill profile display section
// ---------------------------------------------------------------

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border bg-white/60 px-3 py-2 dark:bg-white/5">
        {value ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
            <span className="text-sm font-medium">{value}</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground italic">Not available</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Main form
// ---------------------------------------------------------------

interface SarvamGalattaFormProps {
  event: StartupEvent;
  autoFill: StudentAutoFillProfile | null;
}

function SarvamGalattaFormInner({ event, autoFill }: SarvamGalattaFormProps) {
  const [showGemini, setShowGemini] = useState(false);
  const [showMaps, setShowMaps] = useState(false);

  const register = useRegisterSarvamGalatta(event.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      team_name: '',
      project_url: '',
      github_url: '',
      supabase_project_url: '',
      gemini_api_key: '',
      google_maps_api_key: '',
    },
  });

  function onSubmit(values: FormValues) {
    register.mutate({
      team_name: values.team_name,
      project_url: values.project_url || undefined,
      github_url: values.github_url || undefined,
      supabase_project_url: values.supabase_project_url || undefined,
      gemini_api_key: values.gemini_api_key,
      google_maps_api_key: values.google_maps_api_key || undefined,
    });
  }

  const deadline = event.registration_deadline;
  const timeLeft = deadline ? getTimeRemaining(deadline) : null;
  const isUrgent = deadline ? new Date(deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000 : false;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* Deadline Banner */}
        {deadline && (
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${
            isUrgent
              ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
              : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'
          }`}>
            <Clock className={`h-5 w-5 shrink-0 ${isUrgent ? 'text-red-600' : 'text-amber-600'}`} />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${isUrgent ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>
                Registration closes soon
              </p>
              <p className={`text-xs ${isUrgent ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                Deadline: Sunday, March 22, 2026 at 11:59 PM IST
              </p>
            </div>
            <Badge
              variant="outline"
              className={isUrgent
                ? 'border-red-300 bg-red-100/60 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
                : 'border-amber-300 bg-amber-100/60 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
              }
            >
              {timeLeft}
            </Badge>
          </div>
        )}

        {/* Auto-filled profile section */}
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/40 dark:border-green-900 dark:from-green-950/30 dark:to-emerald-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-green-600" />
              Your Profile Information
            </CardTitle>
            <CardDescription className="text-xs">
              Auto-filled from your learner profile — read only
            </CardDescription>
          </CardHeader>
          <CardContent>
            {autoFill ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ProfileField label="Full Name" value={autoFill.full_name} />
                  <ProfileField label="Institution" value={autoFill.institution_name} />
                  <ProfileField label="Department" value={autoFill.department_name} />
                  <ProfileField label="Program" value={autoFill.program_name} />
                  <ProfileField label="Semester" value={autoFill.semester_name} />
                  <ProfileField label="Section" value={autoFill.section_name} />
                </div>
                {(!autoFill.institution_name || !autoFill.program_name) && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Some profile fields are incomplete. You can still register — contact admin to complete your academic profile.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Your learner profile could not be found. You can still register — contact admin to link your profile.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team / Project name */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Team / Project Name</CardTitle>
            <CardDescription className="text-xs">What is your project or team called?</CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="team_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Team / Project Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. FarmBot AI" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Project URLs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-emerald-600" />
              Project Links
            </CardTitle>
            <CardDescription className="text-xs">Share where your project lives</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="project_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Project URL <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://your-project.lovable.app" />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Your Lovable or Vercel deployed project URL
                  </FormDescription>
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
                    GitHub Repository <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://github.com/username/repo" />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Make sure the repository is public
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supabase_project_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Supabase Project URL <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://your-project.supabase.co" />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Your Supabase project REST API base URL
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4 text-blue-600" />
              API Keys
            </CardTitle>
            <CardDescription className="text-xs">
              Required for project verification. Keys are stored securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            <FormField
              control={form.control}
              name="gemini_api_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Google Gemini API Key <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showGemini ? 'text' : 'password'}
                        placeholder="AIza••••••••••••••••••••••••••••••••••••••"
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
                  <FormDescription className="flex items-start gap-1.5 rounded-md border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-xs dark:border-amber-900 dark:bg-amber-950/20">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                    <span>
                      <strong>Required.</strong> Your project must use Google Gemini API. Key is used for verification only.
                    </span>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="google_maps_api_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-red-500" />
                    Google Maps API Key
                    <Badge variant="secondary" className="ml-1 text-xs font-normal">Optional</Badge>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showMaps ? 'text' : 'password'}
                        placeholder="AIza••••••••••••••••••••••••••••••••••••••"
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
                    Only required if your project uses Google Maps
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full"
          disabled={register.isPending}
          size="lg"
        >
          {register.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registering…
            </>
          ) : (
            'Register for Sarvam Galatta'
          )}
        </Button>

        {deadline && (
          <p className="text-center text-xs text-muted-foreground">
            Deadline: Sunday, March 22, 2026 · 11:59 PM IST
          </p>
        )}
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------
// Exported wrapper — fetches auto-fill then renders form
// ---------------------------------------------------------------

export function SarvamGalattaForm({ event }: { event: StartupEvent }) {
  const { data: autoFill, isPending } = useStudentAutoFill();

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <SarvamGalattaFormInner event={event} autoFill={autoFill ?? null} />;
}
