'use client';
// app/(routes)/resource-management/suggested-places/page.tsx
//
// Places suggested by the old InstaSolver site, for the estate office to confirm.
//
// Director rulings (30 Sep – 1 Oct 2026): the place list is built from the old
// InstaSolver site's place names plus MyJKKN's resources; each estate office
// confirms once. So this page shows a college's suggested places that do not
// already exist as resources; the estate office ticks the real ones and one
// tap creates them as "Spaces & Venues" resources. NOTHING is created until
// that tap.
//
// The suggestions are data/instasolver/suggested-places.json — an aggregate
// only (college label, place, how many old reports), rebuilt by
// scripts/instasolver/build-suggested-places.ts. The old site's college labels
// are matched to MyJKKN colleges by name pattern
// (lib/instasolver/suggested-places.ts). Hostels, the main office, Jicate,
// the incubation cell and buses belong to no single college; they are listed
// under "Shared places" for the estate office to place under the college it
// has picked.
//
// Created through ResourceService.createResource with the signed-in person's
// session, so row-level security and the existing duplicate-name check apply.
// New resources get their sticker code from the database trigger on insert;
// qrCodeService's generate-or-fetch is called afterwards as a safety net.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2, MapPin } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ParentCategoryService } from '@/lib/services/resource-management/parent-category-service';
import { ResourceService } from '@/lib/services/resource-management/resource-service';
import { qrCodeService } from '@/lib/services/resource-management/qr-code-service';
import {
  isCollegeLabel,
  labelMatchesInstitution,
  normalisePlaceName,
  type SuggestedPlace,
} from '@/lib/instasolver/suggested-places';
import type { CreateResourceDto } from '@/types/resource-management';
import suggestedPlaces from '@/data/instasolver/suggested-places.json';

const SPACES_CATEGORY_NAME = 'spaces & venues';
const ALL_PLACES = suggestedPlaces as SuggestedPlace[];

function keyOf(p: SuggestedPlace): string {
  return `${p.institution}\u0000${p.place}`;
}

export default function SuggestedPlacesPage() {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { profile } = useAuth();
  const { institutions } = useUserInstitutionAccess();
  const canCreate = isSuperAdmin || canAccess('resources.resources', 'create');

  const [institutionId, setInstitutionId] = useState<string>('');
  const [spacesCategoryId, setSpacesCategoryId] = useState<string | null>(null);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    ParentCategoryService.getParentCategoriesForSelect()
      .then((cats) => {
        const hit = cats.find((c) => c.name.trim().toLowerCase() === SPACES_CATEGORY_NAME);
        setSpacesCategoryId(hit?.id ?? null);
        if (!hit) setError('The "Spaces & Venues" category was not found, so places cannot be created.');
      })
      .catch(() => setError('Could not load the categories. Refresh to try again.'));
  }, []);

  useEffect(() => {
    if (!institutionId && institutions.length > 0) {
      setInstitutionId(institutions[0].institution_id);
    }
  }, [institutions, institutionId]);

  const institutionName =
    institutions.find((i) => i.institution_id === institutionId)?.institution_name ?? '';

  const loadExisting = useCallback(async () => {
    if (!institutionId) return;
    setLoading(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: qErr } = await (supabase as any)
        .from('resources')
        .select('name')
        .eq('institution_id', institutionId)
        .limit(5000);
      if (qErr) throw qErr;
      setExistingNames(
        new Set(((data ?? []) as Array<{ name: string }>).map((r) => normalisePlaceName(r.name)))
      );
    } catch {
      setError('Could not load this college’s existing rooms and items.');
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    setTicked(new Set());
    setDone(null);
    void loadExisting();
  }, [loadExisting]);

  const { collegePlaces, sharedPlaces } = useMemo(() => {
    const notYetThere = (p: SuggestedPlace) => !existingNames.has(normalisePlaceName(p.place));
    return {
      collegePlaces: ALL_PLACES.filter(
        (p) => labelMatchesInstitution(p.institution, institutionName) && notYetThere(p)
      ),
      sharedPlaces: ALL_PLACES.filter((p) => !isCollegeLabel(p.institution) && notYetThere(p)),
    };
  }, [existingNames, institutionName]);

  const toggle = (p: SuggestedPlace, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(keyOf(p));
      else next.delete(keyOf(p));
      return next;
    });

  const create = useCallback(async () => {
    if (!spacesCategoryId || !profile?.id || !institutionId) return;
    const chosen = [...collegePlaces, ...sharedPlaces].filter((p) => ticked.has(keyOf(p)));
    if (chosen.length === 0) return;
    setCreating(true);
    setError(null);
    setDone(null);
    let made = 0;
    const failures: string[] = [];
    for (const p of chosen) {
      const dto: CreateResourceDto = {
        name: p.place,
        description: `Suggested from the old InstaSolver site (${p.report_count} past report${p.report_count === 1 ? '' : 's'}); confirmed by the estate office.`,
        parent_category_id: spacesCategoryId,
        institution_id: institutionId,
        status: 'available',
        booking_type: 'no_booking',
        booking_config: {} as CreateResourceDto['booking_config'],
        approval_config: {} as CreateResourceDto['approval_config'],
        reminder_config: {} as CreateResourceDto['reminder_config'],
        access_roles: [],
        custom_attributes: {},
        tags: ['instasolver-suggested'],
      };
      try {
        const created = await ResourceService.createResource(dto, profile.id);
        try {
          await qrCodeService.generateQrTokenForResource(created.id);
        } catch {
          // The insert trigger normally sets it; the sticker page retries.
        }
        made += 1;
      } catch (e: unknown) {
        failures.push(`${p.place}: ${e instanceof Error ? e.message : 'could not be created'}`);
      }
    }
    setCreating(false);
    setTicked(new Set());
    if (made > 0) {
      setDone(`${made} place${made === 1 ? '' : 's'} added. Print their stickers from QR stickers.`);
    }
    if (failures.length > 0) setError(failures.join(' · '));
    await loadExisting();
  }, [spacesCategoryId, profile?.id, institutionId, collegePlaces, sharedPlaces, ticked, loadExisting]);

  if (permissionsLoading) {
    return (
      <ContentLayout title="Suggested places">
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </ContentLayout>
    );
  }

  if (!canCreate) {
    return (
      <ContentLayout title="Suggested places">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">You don&apos;t have access to add places</p>
              <p className="text-sm text-muted-foreground">
                Confirming suggested places needs permission to create resources. Ask your estate
                office or an administrator.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const renderList = (list: SuggestedPlace[], emptyText: string) =>
    list.length === 0 ? (
      <p className="text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <ul className="divide-y rounded-md border">
        {list.map((p) => {
          const id = `sp-${keyOf(p).replace(/[^a-zA-Z0-9]+/g, '-')}`;
          return (
            <li key={keyOf(p)} className="flex items-center gap-3 px-3 py-3">
              <Checkbox
                id={id}
                checked={ticked.has(keyOf(p))}
                onCheckedChange={(v) => toggle(p, v === true)}
                className="h-5 w-5"
              />
              <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
                <span className="font-medium">{p.place}</span>
                {!isCollegeLabel(p.institution) && !p.place.startsWith(p.institution) ? (
                  <span className="text-muted-foreground"> · {p.institution}</span>
                ) : null}
              </Label>
              <span className="text-xs text-muted-foreground">
                {p.report_count} old report{p.report_count === 1 ? '' : 's'}
              </span>
            </li>
          );
        })}
      </ul>
    );

  return (
    <ContentLayout title="Suggested places">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          These places were named in reports on the old InstaSolver site and are not yet rooms or
          items in Resource Management. Tick the ones that are real, then add them. Nothing is added
          until you tap the button.
        </p>

        <div className="max-w-md space-y-1.5">
          <Label>College</Label>
          <Select value={institutionId || undefined} onValueChange={setInstitutionId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a college" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.institution_id} value={inst.institution_id}>
                  {inst.institution_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {done ? (
          <div className="flex items-start gap-2 rounded-md border border-green-600/40 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{done}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <MapPin className="h-4 w-4" /> This college
              </h2>
              {renderList(
                collegePlaces,
                'No suggestions left for this college — every suggested place is already a room or item, or the old site had none.'
              )}
            </section>
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Shared places</h2>
              <p className="text-sm text-muted-foreground">
                Hostels, the main office, buses and similar belong to no single college. Only tick
                the ones that belong under the college chosen above.
              </p>
              {renderList(sharedPlaces, 'No shared places left to add.')}
            </section>
          </>
        )}

        <div className="sticky bottom-0 bg-background/95 py-3">
          <Button
            className="h-12 w-full text-base sm:w-auto"
            onClick={create}
            disabled={ticked.size === 0 || creating || !spacesCategoryId}
          >
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add {ticked.size} place{ticked.size === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
