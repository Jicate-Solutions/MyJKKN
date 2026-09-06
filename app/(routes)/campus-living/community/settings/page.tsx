'use client';

/**
 * /campus-living/community/settings — Community moderation + display config
 *
 * Wired 2026-05-20 (Agent ξ). Replaces ComingSoon. Reads/writes
 * `hostel_community_config` (one row per institution). Side panel shows
 * the read-only category list from `community_categories` so admins
 * can see what that table actually contains (caste categories, not
 * post-topic categories — labeled as such in-UI).
 *
 * Permission gate: campus_living.settings.edit OR super_admin to write.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, Info, Settings2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCommunityCategories,
  useCommunityConfig,
  useUpsertCommunityConfig,
} from '@/hooks/campus-living/use-community';
import type { HostelCommunityConfigUpsert } from '@/types/campus-living/community';

export const navMeta = {
  invokedFrom: '/campus-living/community',
} as const;

interface FormState {
  show_lc_events: boolean;
  show_lc_announcements: boolean;
  show_lc_polls: boolean;
  max_events_shown: number;
  max_announcements_shown: number;
  max_polls_shown: number;
}

const DEFAULTS: FormState = {
  show_lc_events: true,
  show_lc_announcements: true,
  show_lc_polls: true,
  max_events_shown: 10,
  max_announcements_shown: 5,
  max_polls_shown: 3,
};

export default function CampusLivingCommunitySettingsPage() {
  const { profile } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? undefined;
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const { data: config, isLoading, isError, error } =
    useCommunityConfig(institutionId);
  const { data: categories = [] } = useCommunityCategories();
  const upsertMut = useUpsertCommunityConfig();

  const initialForm = useMemo<FormState>(() => {
    if (!config) return DEFAULTS;
    return {
      show_lc_events: config.show_lc_events ?? DEFAULTS.show_lc_events,
      show_lc_announcements:
        config.show_lc_announcements ?? DEFAULTS.show_lc_announcements,
      show_lc_polls: config.show_lc_polls ?? DEFAULTS.show_lc_polls,
      max_events_shown: config.max_events_shown ?? DEFAULTS.max_events_shown,
      max_announcements_shown:
        config.max_announcements_shown ?? DEFAULTS.max_announcements_shown,
      max_polls_shown: config.max_polls_shown ?? DEFAULTS.max_polls_shown,
    };
  }, [config]);

  const [form, setForm] = useState<FormState>(initialForm);

  useEffect(() => {
    setForm(initialForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialForm]);

  const isDirty = useMemo(
    () =>
      (Object.keys(form) as (keyof FormState)[]).some(
        (k) => form[k] !== initialForm[k],
      ),
    [form, initialForm],
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    if (!institutionId) {
      toast.error('No institution context — pick an institution first.');
      return;
    }
    if (
      [
        form.max_events_shown,
        form.max_announcements_shown,
        form.max_polls_shown,
      ].some((n) => !Number.isFinite(n) || n < 0 || n > 100)
    ) {
      toast.error('Display limits must be between 0 and 100.');
      return;
    }

    const payload: HostelCommunityConfigUpsert = {
      show_lc_events: form.show_lc_events,
      show_lc_announcements: form.show_lc_announcements,
      show_lc_polls: form.show_lc_polls,
      max_events_shown: form.max_events_shown,
      max_announcements_shown: form.max_announcements_shown,
      max_polls_shown: form.max_polls_shown,
    };

    try {
      await upsertMut.mutateAsync({ institutionId, payload });
    } catch {
      // toast handled by hook
    }
  };

  return (
    <ContentLayout title="Community Settings">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Community', href: '/campus-living/community' },
          { label: 'Settings' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href="/campus-living/community">
              <Button variant="ghost" size="sm" className="-ml-3 mb-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Community
              </Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="h-6 w-6 text-primary" />
              Community Settings
            </h1>
            <p className="text-muted-foreground">
              Configure which content types appear on the community
              noticeboard and how many of each are shown. Saves to{' '}
              <code>hostel_community_config</code>.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={!canEdit || !isDirty || upsertMut.isPending}
          >
            {upsertMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        </div>

        {!canEdit ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              You can view community settings but editing requires the{' '}
              <code>campus_living.settings.edit</code> permission.
            </AlertDescription>
          </Alert>
        ) : null}

        {!institutionId ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pick an institution</AlertTitle>
            <AlertDescription>
              Community settings are per-institution. Super admins must switch
              into an institution context before viewing or editing.
            </AlertDescription>
          </Alert>
        ) : null}

        {isError ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load settings</AlertTitle>
            <AlertDescription>
              {(error as Error)?.message ?? 'Unknown error'}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Display rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading…
                </div>
              ) : (
                <>
                  {/* Toggles */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="show-announcements" className="cursor-pointer">
                          Show announcements
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Toggle the announcements feed on the community page.
                        </p>
                      </div>
                      <Switch
                        id="show-announcements"
                        checked={form.show_lc_announcements}
                        onCheckedChange={(v) => setField('show_lc_announcements', v)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="show-events" className="cursor-pointer">
                          Show events
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Toggle the events list on the community page.
                        </p>
                      </div>
                      <Switch
                        id="show-events"
                        checked={form.show_lc_events}
                        onCheckedChange={(v) => setField('show_lc_events', v)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="show-polls" className="cursor-pointer">
                          Show polls
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Toggle polls on the community page.
                        </p>
                      </div>
                      <Switch
                        id="show-polls"
                        checked={form.show_lc_polls}
                        onCheckedChange={(v) => setField('show_lc_polls', v)}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>

                  {/* Limits */}
                  <div className="grid gap-4 sm:grid-cols-3 pt-4 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="max-announcements">Max announcements</Label>
                      <Input
                        id="max-announcements"
                        type="number"
                        min={0}
                        max={100}
                        value={form.max_announcements_shown}
                        onChange={(e) =>
                          setField(
                            'max_announcements_shown',
                            Number.parseInt(e.target.value || '0', 10),
                          )
                        }
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-events">Max events</Label>
                      <Input
                        id="max-events"
                        type="number"
                        min={0}
                        max={100}
                        value={form.max_events_shown}
                        onChange={(e) =>
                          setField(
                            'max_events_shown',
                            Number.parseInt(e.target.value || '0', 10),
                          )
                        }
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-polls">Max polls</Label>
                      <Input
                        id="max-polls"
                        type="number"
                        min={0}
                        max={100}
                        value={form.max_polls_shown}
                        onChange={(e) =>
                          setField(
                            'max_polls_shown',
                            Number.parseInt(e.target.value || '0', 10),
                          )
                        }
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                Categories (read-only)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                The <code>community_categories</code> table on production
                stores caste categories used by other modules, not
                noticeboard topic tags. Surfaced here for transparency.
              </p>
              <div className="space-y-1.5">
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rows</p>
                ) : (
                  categories.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium">{c.name}</span>
                      <Badge
                        variant="secondary"
                        className={
                          c.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-600'
                        }
                      >
                        {c.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
