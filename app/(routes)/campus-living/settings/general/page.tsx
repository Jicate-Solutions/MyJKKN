'use client';

/**
 * General Settings — /campus-living/settings/general
 *
 * Wired 2026-04-24 (Agent G — settings real-save). Previous page (Agent D,
 * PR #449) was display-only with all inputs disabled because the
 * `hostel_general_settings` table didn't exist. Agent F ships the table in
 * a parallel PR; this page now reads + writes against it.
 *
 * One row per institution, upserted on conflict (institution_id). A "dirty"
 * flag tracks whether local state has diverged from the server payload; Save
 * is only enabled when dirty + caller has edit permission.
 *
 * Permission gate: `campus_living.settings.edit` or super_admin.
 *
 * NOTE: Academic-year + semester selects are intentionally wired in this
 * iteration (they persist as free-form strings) — a proper join to
 * `academic_years` is deferred to the migrations team alongside Agent F's
 * follow-up.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Loader2, Info } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useHostelGeneralSettings,
  useUpsertHostelGeneralSettings,
  type HostelGeneralSettingsUpsert,
} from '@/hooks/campus-living/use-hostel-general-settings';

/** Local form shape — wider than the DB type so we can hold "unsaved" defaults. */
type FormState = {
  current_academic_year_id: string | null;
  current_semester: string | null;
  curfew_start_time: string;
  curfew_end_time: string;
  curfew_enforcement_enabled: boolean;
  visitor_hours_start: string;
  visitor_hours_end: string;
  visitor_require_id_proof: boolean;
  mess_meal_cutoff_hours: number;
  mess_guest_meal_price: number;
  mess_allow_opt_out: boolean;
};

const DEFAULTS: FormState = {
  current_academic_year_id: null,
  current_semester: 'even',
  curfew_start_time: '22:00',
  curfew_end_time: '06:00',
  curfew_enforcement_enabled: true,
  visitor_hours_start: '09:00',
  visitor_hours_end: '18:00',
  visitor_require_id_proof: true,
  mess_meal_cutoff_hours: 2,
  mess_guest_meal_price: 150,
  mess_allow_opt_out: true,
};

/** Trim the TIME value so a roundtrip through postgres (returns "22:00:00")
 *  doesn't flag the form as dirty. */
function normalizeTime(v: string | null | undefined): string {
  if (!v) return '';
  // Accept both "HH:MM" and "HH:MM:SS"; keep only HH:MM.
  return v.length >= 5 ? v.slice(0, 5) : v;
}

export default function GeneralSettingsPage() {
  // NEVER destructure `user` — use `profile` (memory: PR #407 pattern).
  const { profile } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? undefined;
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = useHostelGeneralSettings(institutionId);
  const upsertMut = useUpsertHostelGeneralSettings();

  /** Seed the form from DB, falling back to DEFAULTS when no row exists yet. */
  const initialForm = useMemo<FormState>(() => {
    if (!settings) return DEFAULTS;
    return {
      current_academic_year_id: settings.current_academic_year_id ?? null,
      current_semester: settings.current_semester ?? DEFAULTS.current_semester,
      curfew_start_time: normalizeTime(settings.curfew_start_time),
      curfew_end_time: normalizeTime(settings.curfew_end_time),
      curfew_enforcement_enabled: settings.curfew_enforcement_enabled,
      visitor_hours_start: normalizeTime(settings.visitor_hours_start),
      visitor_hours_end: normalizeTime(settings.visitor_hours_end),
      visitor_require_id_proof: settings.visitor_require_id_proof,
      mess_meal_cutoff_hours: settings.mess_meal_cutoff_hours,
      mess_guest_meal_price: Number(settings.mess_guest_meal_price),
      mess_allow_opt_out: settings.mess_allow_opt_out,
    };
  }, [settings]);

  const [form, setForm] = useState<FormState>(initialForm);

  // Re-sync when server payload lands; preserves pending local edits via the
  // shallow-equal comparison against `form`.
  useEffect(() => {
    setForm(initialForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialForm]);

  const isDirty = useMemo(() => {
    return (Object.keys(form) as (keyof FormState)[]).some(
      (k) => form[k] !== initialForm[k],
    );
  }, [form, initialForm]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    if (!institutionId) {
      toast.error(
        'No institution context — select an institution before saving.',
      );
      return;
    }

    // Validate numeric fields before hitting the network.
    if (!Number.isFinite(form.mess_meal_cutoff_hours) || form.mess_meal_cutoff_hours < 0) {
      toast.error('Meal cutoff hours must be a non-negative number.');
      return;
    }
    if (!Number.isFinite(form.mess_guest_meal_price) || form.mess_guest_meal_price < 0) {
      toast.error('Guest meal price must be a non-negative number.');
      return;
    }

    const payload: HostelGeneralSettingsUpsert = {
      current_academic_year_id: form.current_academic_year_id,
      current_semester: form.current_semester,
      curfew_start_time: form.curfew_start_time,
      curfew_end_time: form.curfew_end_time,
      curfew_enforcement_enabled: form.curfew_enforcement_enabled,
      visitor_hours_start: form.visitor_hours_start,
      visitor_hours_end: form.visitor_hours_end,
      visitor_require_id_proof: form.visitor_require_id_proof,
      mess_meal_cutoff_hours: form.mess_meal_cutoff_hours,
      mess_guest_meal_price: form.mess_guest_meal_price,
      mess_allow_opt_out: form.mess_allow_opt_out,
    };

    try {
      await upsertMut.mutateAsync({
        institutionId,
        payload,
        updatedBy: profile?.id ?? null,
      });
      // No need to clear dirty — the query invalidation re-seeds initialForm.
    } catch {
      // hook handles the toast
    }
  };

  return (
    <ContentLayout title="General Settings">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">General Settings</h1>
            <p className="text-muted-foreground">
              Basic campus living configuration. Saves to{' '}
              <code>hostel_general_settings</code>.
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
              You can view general settings but editing requires the{' '}
              <code>campus_living.settings.edit</code> permission.
            </AlertDescription>
          </Alert>
        ) : null}

        {!institutionId ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pick an institution</AlertTitle>
            <AlertDescription>
              General settings are per-institution. Super admins must switch
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

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading general settings...
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Academic Configuration</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Current Academic Year</Label>
                  <Input
                    type="text"
                    placeholder="e.g. 2025-26"
                    value={form.current_academic_year_id ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField(
                        'current_academic_year_id',
                        e.target.value || null,
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Free-form for now; a proper selector against{' '}
                    <code>academic_years</code> lands in a follow-up.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Current Semester</Label>
                  <Select
                    value={form.current_semester ?? 'even'}
                    disabled={!canEdit}
                    onValueChange={(v) => setField('current_semester', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="odd">Odd Semester</SelectItem>
                      <SelectItem value="even">Even Semester</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Curfew Settings</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Curfew Start Time</Label>
                  <Input
                    type="time"
                    value={form.curfew_start_time}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField('curfew_start_time', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Curfew End Time</Label>
                  <Input
                    type="time"
                    value={form.curfew_end_time}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField('curfew_end_time', e.target.value)
                    }
                  />
                </div>
                <div className="flex items-center justify-between sm:col-span-2">
                  <div>
                    <Label>Enable Curfew Enforcement</Label>
                    <p className="text-sm text-muted-foreground">
                      Flag late entries in the access log
                    </p>
                  </div>
                  <Switch
                    checked={form.curfew_enforcement_enabled}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      setField('curfew_enforcement_enabled', v)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Visitor Settings</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Visitor Hours Start</Label>
                  <Input
                    type="time"
                    value={form.visitor_hours_start}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField('visitor_hours_start', e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Visitor Hours End</Label>
                  <Input
                    type="time"
                    value={form.visitor_hours_end}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField('visitor_hours_end', e.target.value)
                    }
                  />
                </div>
                <div className="flex items-center justify-between sm:col-span-2">
                  <div>
                    <Label>Require ID Proof</Label>
                    <p className="text-sm text-muted-foreground">
                      Mandatory for all visitors at check-in
                    </p>
                  </div>
                  <Switch
                    checked={form.visitor_require_id_proof}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      setField('visitor_require_id_proof', v)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mess Settings</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Meal Booking Cutoff (hours before)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.mess_meal_cutoff_hours}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField(
                        'mess_meal_cutoff_hours',
                        e.target.value === ''
                          ? 0
                          : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Guest Meal Price (INR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.mess_guest_meal_price}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField(
                        'mess_guest_meal_price',
                        e.target.value === ''
                          ? 0
                          : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="flex items-center justify-between sm:col-span-2">
                  <div>
                    <Label>Allow Meal Opt-out</Label>
                    <p className="text-sm text-muted-foreground">
                      Students can opt out of individual meals
                    </p>
                  </div>
                  <Switch
                    checked={form.mess_allow_opt_out}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      setField('mess_allow_opt_out', v)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
