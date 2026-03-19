'use client';

import { useState, useMemo } from 'react';
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
  AlertCircle, CheckCircle2, Clock, Database, ExternalLink, Eye, EyeOff, Github,
  Loader2, MapPin, Rocket, Sparkles, User,
} from 'lucide-react';
import { useStudentAutoFill, useRegisterSarvamGalatta } from '@/hooks/startup-studio/use-sarvam-galatta';
import type { StartupEvent } from '@/types/startup-studio';
import type {
  StudentAutoFillProfile,
  IndividualRegistrationField,
  SarvamGalattaRegistrationDto,
} from '@/types/sarvam-galatta';

// ---------------------------------------------------------------
// Default fields (Sarvam Galatta spec) — used as fallback when
// event.config.registration_fields is not yet configured.
// ---------------------------------------------------------------

const DEFAULT_FIELDS: IndividualRegistrationField[] = [
  {
    key: 'team_name', label: 'Team / Project Name', type: 'text', required: true,
    placeholder: 'e.g. FarmBot AI', section: 'basic',
  },
  {
    key: 'project_url', label: 'Project URL', type: 'url', required: true,
    placeholder: 'https://your-project.lovable.app',
    description: 'Your Lovable or Vercel deployed project URL',
    icon: 'rocket', section: 'links',
  },
  {
    key: 'github_url', label: 'GitHub Repository', type: 'url', required: true,
    placeholder: 'https://github.com/username/repo',
    description: 'Make sure the repository is public',
    icon: 'github', validation: { must_contain: 'github.com' }, section: 'links',
  },
  {
    key: 'supabase_project_url', label: 'Supabase Project URL', type: 'url', required: true,
    placeholder: 'https://your-project.supabase.co',
    description: 'Your Supabase project REST API base URL',
    icon: 'database', validation: { must_contain: 'supabase.co' }, section: 'links',
  },
];

// ---------------------------------------------------------------
// Static API resource links — shown below the form fields
// Informs students which APIs to use and where to get keys
// ---------------------------------------------------------------

const API_RESOURCES = [
  {
    icon: <Sparkles className="h-4 w-4 text-amber-500" />,
    name: 'Google Gemini API',
    description: 'Required — your project must integrate Gemini AI',
    badge: 'Required',
    badgeClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300',
    url: 'https://aistudio.google.com/app/apikey',
    urlLabel: 'Get API Key at Google AI Studio',
  },
  {
    icon: <MapPin className="h-4 w-4 text-red-500" />,
    name: 'Google Maps API',
    description: 'Optional — only if your project uses maps or location',
    badge: 'Optional',
    badgeClass: 'border-muted text-muted-foreground',
    url: 'https://console.cloud.google.com/apis/library/maps-backend.googleapis.com',
    urlLabel: 'Enable Maps API in Google Cloud Console',
  },
];

// ---------------------------------------------------------------
// Icon map (field.icon → React element)
// ---------------------------------------------------------------

const FIELD_ICONS: Record<string, React.ReactNode> = {
  github:   <Github   className="h-3.5 w-3.5" />,
  rocket:   <Rocket   className="h-3.5 w-3.5 text-emerald-600" />,
  sparkles: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
  map_pin:  <MapPin   className="h-3.5 w-3.5 text-red-500" />,
  database: <Database className="h-3.5 w-3.5 text-violet-600" />,
};

// ---------------------------------------------------------------
// Section card meta (title, description, accent)
// ---------------------------------------------------------------

const SECTION_META: Record<string, {
  title: string;
  description: string;
  icon?: React.ReactNode;
  className?: string;
}> = {
  basic: {
    title: 'Team / Project Name',
    description: 'What is your project or team called?',
  },
  links: {
    title: 'Project Links',
    description: 'Share where your project lives',
    icon: <Rocket className="h-4 w-4 text-emerald-600" />,
  },
  keys: {
    title: 'API Keys',
    description: 'Required for project verification. Keys are stored securely.',
    icon: <Sparkles className="h-4 w-4 text-amber-500" />,
    className: 'border-blue-200 dark:border-blue-900',
  },
};

// ---------------------------------------------------------------
// Dynamic Zod schema built from field config
// ---------------------------------------------------------------

function buildSchema(fields: IndividualRegistrationField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    const mc = field.validation?.must_contain;
    const minLen = field.validation?.min_length ?? 1;

    if (field.type === 'text' || field.type === 'password') {
      const base = z.string().min(minLen, `${field.label} is required`);
      shape[field.key] = field.required ? base : z.string().or(z.literal(''));
    } else {
      // url
      if (mc) {
        const msg = `Must be a ${mc} URL`;
        shape[field.key] = field.required
          ? z.string().min(1, `${field.label} is required`).refine(v => v.includes(mc), { message: msg })
          : z.string().refine(v => !v || v.includes(mc), { message: msg }).or(z.literal(''));
      } else {
        shape[field.key] = field.required
          ? z.string().url('Must be a valid URL')
          : z.string().url('Must be a valid URL').or(z.literal(''));
      }
    }
  }

  return z.object(shape);
}

// ---------------------------------------------------------------
// Auto-fill profile display
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
// Inner form — receives resolved fields from wrapper
// ---------------------------------------------------------------

interface InnerProps {
  event: StartupEvent;
  autoFill: StudentAutoFillProfile | null;
  fields: IndividualRegistrationField[];
}

function SarvamGalattaFormInner({ event, autoFill, fields }: InnerProps) {
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const register = useRegisterSarvamGalatta(event.id);

  const schema = useMemo(() => buildSchema(fields), [fields]);
  const defaultValues = useMemo(
    () => Object.fromEntries(fields.map(f => [f.key, ''])),
    [fields],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // Group fields by section, preserving declaration order
  const sections = useMemo(() => {
    const map = new Map<string, IndividualRegistrationField[]>();
    for (const field of fields) {
      const sec = field.section ?? 'basic';
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(field);
    }
    return map;
  }, [fields]);

  function onSubmit(values: Record<string, string>) {
    register.mutate({
      team_name: values.team_name ?? '',
      project_url: values.project_url || undefined,
      github_url: values.github_url || undefined,
      supabase_project_url: values.supabase_project_url || undefined,
      gemini_api_key: values.gemini_api_key ?? '',
      google_maps_api_key: values.google_maps_api_key || undefined,
    } as SarvamGalattaRegistrationDto);
  }

  const deadline = event.registration_deadline;
  const timeLeft = deadline ? getTimeRemaining(deadline) : null;
  const isUrgent = deadline ? new Date(deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000 : false;
  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
    : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">

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
                Deadline: {deadlineLabel}
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

        {/* Dynamic field sections */}
        {Array.from(sections.entries()).map(([sectionKey, sectionFields]) => {
          const meta = SECTION_META[sectionKey] ?? { title: sectionKey, description: '' };
          return (
            <Card key={sectionKey} className={meta.className}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {meta.icon}
                  {meta.title}
                </CardTitle>
                {meta.description && (
                  <CardDescription className="text-xs">{meta.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {sectionFields.map((field, idx) => (
                  <div key={field.key}>
                    {idx > 0 && <Separator className="mb-4" />}
                    <FormField
                      control={form.control}
                      name={field.key as any}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            {field.icon && FIELD_ICONS[field.icon]}
                            {field.label}
                            {field.required ? (
                              <span className="text-destructive">*</span>
                            ) : (
                              <Badge variant="secondary" className="ml-1 text-xs font-normal">Optional</Badge>
                            )}
                          </FormLabel>
                          <FormControl>
                            {field.type === 'password' ? (
                              <div className="relative">
                                <Input
                                  {...f}
                                  type={showFields[field.key] ? 'text' : 'password'}
                                  placeholder={field.placeholder ?? ''}
                                  className="pr-10"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                                  onClick={() =>
                                    setShowFields(prev => ({ ...prev, [field.key]: !prev[field.key] }))
                                  }
                                  tabIndex={-1}
                                >
                                  {showFields[field.key]
                                    ? <EyeOff className="h-4 w-4" />
                                    : <Eye className="h-4 w-4" />
                                  }
                                </Button>
                              </div>
                            ) : (
                              <Input
                                {...f}
                                type={field.type === 'url' ? 'url' : 'text'}
                                placeholder={field.placeholder ?? ''}
                              />
                            )}
                          </FormControl>
                          {field.description && (
                            <FormDescription className="text-xs">{field.description}</FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {/* API Resources — informational, not inputs */}
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              APIs Required for Your Project
            </CardTitle>
            <CardDescription className="text-xs">
              You must use these APIs when building your application. Click the links below to get your keys.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {API_RESOURCES.map((api, idx) => (
              <div key={api.name}>
                {idx > 0 && <Separator className="mb-4" />}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-md bg-muted/50 shrink-0">{api.icon}</div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{api.name}</p>
                      <Badge variant="outline" className={`text-xs ${api.badgeClass}`}>
                        {api.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{api.description}</p>
                    <a
                      href={api.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {api.urlLabel}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={register.isPending} size="lg">
          {register.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registering…
            </>
          ) : (
            `Register for ${event.name}`
          )}
        </Button>

        {deadlineLabel && (
          <p className="text-center text-xs text-muted-foreground">
            Deadline: {deadlineLabel}
          </p>
        )}
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------
// Exported wrapper — fetches auto-fill, resolves fields from config
// ---------------------------------------------------------------

export function SarvamGalattaForm({ event }: { event: StartupEvent }) {
  // fetchStatus === 'idle' means the query is disabled (non-student role).
  // In TanStack Query v5, isPending is true for BOTH in-flight AND disabled queries,
  // so we must check fetchStatus to avoid an infinite spinner for super admins.
  const { data: autoFill, isPending, fetchStatus } = useStudentAutoFill();

  // Read field definitions from event config, fall back to Sarvam Galatta defaults.
  // This makes the form reusable for any individual-registration event.
  const fields: IndividualRegistrationField[] =
    (event.config as any)?.registration_fields ?? DEFAULT_FIELDS;

  if (isPending && fetchStatus === 'fetching') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <SarvamGalattaFormInner event={event} autoFill={autoFill ?? null} fields={fields} />;
}
