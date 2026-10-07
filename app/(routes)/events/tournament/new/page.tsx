'use client';

// Create Sports Tournament — writes an `events` row (event_type='sports_tournament')
// plus one seeded division PER SELECTED SPORT. Minimal PR1 form: name, sports,
// level, scope, gender, format, dates, registration window, venue (optional),
// is_public, external reg.
// Created: 2026-06-22 (Sports Tournament PR1).
//
// Sports is multi-select because a tournament routinely runs several games on
// one set of dates, venue and registration link (Chess + Carrom, say). Each
// pick becomes its own division, which is what the registration form's
// "Event / division" picker and the per-division fixtures are keyed on.
// Categories (Open / Men's / Women's / Mixed) are picked PER SPORT, several at
// once (2026-10-07): Volleyball Men's + Women's and Basketball Men's only makes
// three divisions. The other division fields (level, format, age band, entry
// fee) apply to every division created here; edit one afterwards to vary them.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useCreateTournament } from '@/hooks/events/use-tournaments';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  HostInstitutionsPicker,
  hostInstitutionsDto,
  type HostInstitutionsValue,
} from '../_components/host-institutions-picker';
import { JKKN_SPORTS, SPORT_LEVELS } from '@/types/health-sports';
import { TOURNAMENT_FORMATS, DIVISION_GENDERS } from '@/types/tournament';
import type { SportLevel } from '@/types/health-sports';
import type {
  TournamentFormat,
  TournamentScope,
  DivisionGender,
} from '@/types/tournament';
import { Loader2 } from 'lucide-react';

export default function CreateTournamentPage() {
  const router = useRouter();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  // Convenience default: pre-select the first accessible institution, but the
  // picker stays visible and editable — explicit per the product decision.
  // Derived (not synced via effect+setState) so there's no extra render pass:
  // institutionIdOverride is null until the user actually picks one.
  const [hostsOverride, setHostsOverride] = useState<HostInstitutionsValue | null>(null);
  const firstId = institutions[0]?.id ?? '';
  const hosts: HostInstitutionsValue =
    hostsOverride ?? { primaryId: firstId, hostIds: firstId ? [firstId] : [] };
  const institutionId = hosts.primaryId;
  const createMutation = useCreateTournament();

  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    name: '',
    sports: [JKKN_SPORTS[0]] as string[],
    // Categories chosen for each picked sport; a newly picked sport starts at Open.
    categories: { [JKKN_SPORTS[0]]: ['open'] } as Record<string, DivisionGender[]>,
    level: 'intra_college' as SportLevel,
    scope: 'institution' as TournamentScope,
    format: 'knockout' as TournamentFormat,
    age_band: '',
    entry_fee: '',
    start_date: '',
    end_date: '',
    registration_open_date: '',
    registration_close_date: '',
    venue: '',
    description: '',
    is_public: false,
    allow_external_registration: false,
  });

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Keep the catalog's own order regardless of click order, so the divisions
  // (and therefore the registration picker) read the same way every time.
  const toggleSport = (sport: string, checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      sports: checked
        ? JKKN_SPORTS.filter((s) => s === sport || prev.sports.includes(s))
        : prev.sports.filter((s) => s !== sport),
      categories: checked
        ? { ...prev.categories, [sport]: prev.categories[sport]?.length ? prev.categories[sport] : ['open'] }
        : prev.categories,
    }));

  // Categories keep the DIVISION_GENDERS order, whatever order they were clicked in.
  const toggleCategory = (sport: string, gender: DivisionGender) =>
    setForm((prev) => {
      const current = prev.categories[sport] ?? [];
      const next = current.includes(gender)
        ? current.filter((g) => g !== gender)
        : DIVISION_GENDERS.map((g) => g.value).filter((g) => g === gender || current.includes(g));
      return { ...prev, categories: { ...prev.categories, [sport]: next } };
    });

  const sportsWithoutCategory = form.sports.filter((s) => !(form.categories[s]?.length));
  const divisionCount = form.sports.reduce((n, s) => n + (form.categories[s]?.length ?? 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !institutionId || form.sports.length === 0 || sportsWithoutCategory.length > 0) return;

    try {
      const event = await createMutation.mutateAsync({
        ...hostInstitutionsDto(hosts),
        name: form.name.trim(),
        description: form.description || undefined,
        scope: form.scope,
        year: currentYear,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        registration_open_date: form.registration_open_date || undefined,
        registration_close_date: form.registration_close_date || undefined,
        venue: form.venue || undefined,
        is_public: form.is_public,
        allow_external_registration: form.allow_external_registration,
        // One division per sport AND category picked for it. They share the
        // level / format / age band / fee set above — vary one from Edit afterwards.
        divisions: form.sports
          .flatMap((sport) => (form.categories[sport] ?? []).map((gender) => ({ sport, gender })))
          .map(({ sport, gender }, i) => ({
            sport,
            gender,
            age_band: form.age_band.trim() || undefined,
            format: form.format,
            level: form.level,
            sort_order: i,
            config: form.entry_fee ? { entry_fee: Number(form.entry_fee) } : undefined,
          })),
      });
      // PR1 has no per-tournament detail page yet (arrives in PR2). Return to the
      // list, where the newly created tournament now appears.
      void event;
      router.push('/events/tournament');
    } catch {
      // handled by mutation toast
    }
  };

  return (
    <ContentLayout title="Create Sports Tournament">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Tournaments', href: '/events/tournament' },
          { label: 'New' },
        ]}
      />

      <div className="mx-auto mt-6 max-w-full">
        <Card>
          <CardHeader>
            <CardTitle>Create Sports Tournament</CardTitle>
            <CardDescription>
              Set up a new tournament with one division per sport picked. You can
              add more sports later from Edit Tournament, and set up registration
              and fixtures after creating it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Host Institution(s) */}
              <HostInstitutionsPicker
                id="host_institution"
                institutions={institutions}
                loading={institutionsLoading}
                value={hosts}
                onChange={setHostsOverride}
              />

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Tournament Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g. JKKN Inter-College Volleyball Championship"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  required
                />
              </div>

              {/* Sports (multi-select) + Level */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Sports *</Label>
                  {/* Scrolls rather than growing, so picking many sports never
                      pushes the rest of the form off screen. */}
                  <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border p-2">
                    {JKKN_SPORTS.map((s) => (
                      <label
                        key={s}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={form.sports.includes(s)}
                          onCheckedChange={(c) => toggleSport(s, c === true)}
                        />
                        <span className="leading-tight">{s}</span>
                      </label>
                    ))}
                  </div>
                  <p
                    className={
                      form.sports.length === 0
                        ? 'text-xs text-destructive'
                        : 'text-xs text-muted-foreground'
                    }
                  >
                    {form.sports.length === 0
                      ? 'Pick at least one sport.'
                      : `${form.sports.length} picked — choose each one's categories below.`}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select value={form.level} onValueChange={(v) => update('level', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPORT_LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Scope + Format */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select value={form.scope} onValueChange={(v) => update('scope', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="institution">Institution only (Intra-College)</SelectItem>
                      <SelectItem value="all_jkkn">All JKKN (Inter-College / District+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={form.format} onValueChange={(v) => update('format', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOURNAMENT_FORMATS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Categories per sport — each sport + category becomes a division */}
              {form.sports.length > 0 && (
                <div className="space-y-2">
                  <Label>Categories for each sport *</Label>
                  <div className="divide-y rounded-md border">
                    {form.sports.map((sport) => {
                      const picked = form.categories[sport] ?? [];
                      return (
                        <div key={sport} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
                          <span className="text-sm font-medium sm:w-56 sm:shrink-0">{sport}</span>
                          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${sport} categories`}>
                            {DIVISION_GENDERS.map((g) => {
                              const on = picked.includes(g.value);
                              return (
                                <button
                                  key={g.value}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggleCategory(sport, g.value)}
                                  className={
                                    on
                                      ? 'rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                                      : 'rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted'
                                  }
                                >
                                  {g.label}
                                </button>
                              );
                            })}
                          </div>
                          {picked.length === 0 && (
                            <span className="text-xs text-destructive">Pick at least one</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {divisionCount} division{divisionCount === 1 ? '' : 's'} will be created — one for each sport
                    and category picked.
                  </p>
                </div>
              )}

              {/* Age band */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="age_band">Age Band (optional)</Label>
                  <Input
                    id="age_band"
                    placeholder="e.g. U-19, Open"
                    value={form.age_band}
                    onChange={(e) => update('age_band', e.target.value)}
                  />
                </div>
              </div>

              {/* Entry Fee */}
              <div className="space-y-2">
                <Label htmlFor="entry_fee">Entry Fee (₹, optional)</Label>
                <Input
                  id="entry_fee"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0 = free entry"
                  value={form.entry_fee}
                  onChange={(e) => update('entry_fee', e.target.value)}
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => update('start_date', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={form.end_date}
                    onChange={(e) => update('end_date', e.target.value)}
                  />
                </div>
              </div>

              {/* Registration window */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reg_open">Registration Opens</Label>
                  <Input
                    id="reg_open"
                    type="date"
                    value={form.registration_open_date}
                    onChange={(e) => update('registration_open_date', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg_close">Registration Closes</Label>
                  <Input
                    id="reg_close"
                    type="date"
                    value={form.registration_close_date}
                    onChange={(e) => update('registration_close_date', e.target.value)}
                  />
                </div>
              </div>

              {/* Venue */}
              <div className="space-y-2">
                <Label htmlFor="venue">Venue (optional)</Label>
                <Input
                  id="venue"
                  placeholder="e.g. JKKN Sports Complex, Main Ground"
                  value={form.venue}
                  onChange={(e) => update('venue', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to set later. Court/ground bookings are added with fixtures.
                </p>
              </div>

              {/* Toggles */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="is_public">Public scoreboard</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow a no-login public view (live in a later phase).
                    </p>
                  </div>
                  <Switch
                    id="is_public"
                    checked={form.is_public}
                    onCheckedChange={(v) => update('is_public', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allow_external">Allow external teams</Label>
                    <p className="text-xs text-muted-foreground">
                      Non-JKKN teams/players can register.
                    </p>
                  </div>
                  <Switch
                    id="allow_external"
                    checked={form.allow_external_registration}
                    onCheckedChange={(v) => update('allow_external_registration', v)}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the tournament…"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/events/tournament')}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    !form.name.trim() ||
                    !institutionId ||
                    form.sports.length === 0 ||
                    sportsWithoutCategory.length > 0
                  }
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Tournament
                </Button>
              </div>

              {!institutionId && (
                <p className="text-sm text-destructive">
                  No institution selected — pick an institution before creating.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
