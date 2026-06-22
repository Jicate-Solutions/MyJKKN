'use client';

// Create Sports Tournament — writes an `events` row (event_type='sports_tournament')
// plus one seeded division. Minimal PR1 form: name, sport, level, scope, gender,
// format, dates, registration window, venue (optional), is_public, external reg.
// Created: 2026-06-22 (Sports Tournament PR1).

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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useCreateTournament } from '@/hooks/events/use-tournaments';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
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
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId || profile?.institution_id || '';
  const createMutation = useCreateTournament();

  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    name: '',
    sport: JKKN_SPORTS[0] as string,
    level: 'intra_college' as SportLevel,
    scope: 'institution' as TournamentScope,
    gender: 'open' as DivisionGender,
    format: 'knockout' as TournamentFormat,
    age_band: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !institutionId) return;

    try {
      const event = await createMutation.mutateAsync({
        institution_id: institutionId,
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
        divisions: [
          {
            sport: form.sport,
            gender: form.gender,
            age_band: form.age_band.trim() || undefined,
            format: form.format,
            level: form.level,
            sort_order: 0,
          },
        ],
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

      <div className="mx-auto mt-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Create Sports Tournament</CardTitle>
            <CardDescription>
              Set up a new tournament and its first division. You can add more
              divisions, registration and fixtures after creating it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
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

              {/* Sport + Level */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Sport</Label>
                  <Select value={form.sport} onValueChange={(v) => update('sport', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JKKN_SPORTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

              {/* Gender + Age band */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.gender} onValueChange={(v) => update('gender', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIVISION_GENDERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  disabled={createMutation.isPending || !form.name.trim() || !institutionId}
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
