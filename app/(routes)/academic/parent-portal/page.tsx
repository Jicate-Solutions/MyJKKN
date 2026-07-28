'use client';

/**
 * Staff admin — Parent Portal content (Phase A.5). Cascading MULTI-select
 * targeting: super_admin → any institution; other staff → their OWN only; then
 * programs (multi) → sections (multi) → learners (multi), all optional. Each
 * form fans out one row per selected target. Labels adapt via school-label-adapter.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, BookOpenCheck, Trophy, Building2, Users, CalendarDays } from 'lucide-react';
import { adaptLabel } from '@/lib/utils/school-label-adapter';
import { usePermissions } from '@/hooks/use-permissions';
import type { InstitutionType } from '@/hooks/use-institution-type';
import {
  ParentPortalAdminService,
  type PPInstitution,
  type PPProgram,
  type PPSection,
  type PPLearner,
  type PPTarget,
} from '@/lib/services/academic/parent-portal-admin-service';
import { MultiSelect } from './_components/multi-select';
import { AnnouncementForm } from './_components/announcement-form';
import { HomeworkForm } from './_components/homework-form';
import { AchievementForm } from './_components/achievement-form';
import { EventForm } from './_components/event-form';
import { RecentList } from './_components/recent-list';
import { ParentUsersPanel } from './_components/parent-users-panel';
import { useTabParam } from '@/hooks/use-tab-param';

// Consumed by scripts/generate-route-manifest.ts so the sidebar, tab nav, and
// command palette all show the same Megaphone icon (was inferring 'FileText').
export const navMeta = { label: 'Parent Portal', icon: 'Megaphone' };

const PARENT_PORTAL_TABS = [
  'announcements',
  'homework',
  'achievements',
  'events',
  'users',
] as const;

function ParentPortalAdminPageInner() {
  const [institutions, setInstitutions] = useState<PPInstitution[]>([]);
  const [programs, setPrograms] = useState<PPProgram[]>([]);
  const [sections, setSections] = useState<PPSection[]>([]);
  const [learners, setLearners] = useState<PPLearner[]>([]);
  const [target, setTarget] = useState<PPTarget>({ institutionId: '', programIds: [], sectionIds: [], learnerIds: [] });
  const [lists, setLists] = useState<{ ann: any[]; hw: any[]; ach: any[]; ev: any[] }>({ ann: [], hw: [], ach: [], ev: [] });
  const [forbidden, setForbidden] = useState(false);
  const [activeTab, setActiveTab] = useTabParam('announcements', PARENT_PORTAL_TABS);
  const { canAccess } = usePermissions();
  const canUserData = canAccess('academic', 'parent_portal.user_data.manage');

  const selected = institutions.find((i) => i.id === target.institutionId);
  const entity = (selected?.entity_type ?? 'institution') as InstitutionType;
  const label = useCallback((s: string) => adaptLabel(s, entity), [entity]);

  // institutions (role-scoped) on mount
  useEffect(() => {
    ParentPortalAdminService.getOptions().then((r) => {
      if (r.status === 403) return setForbidden(true);
      setInstitutions(r.json.institutions ?? []);
      if (r.json.institutions?.length)
        setTarget((t) => (t.institutionId ? t : { ...t, institutionId: r.json.institutions[0].id }));
    });
  }, []);

  // programs + sections cascade; prune selected sections that fall away
  useEffect(() => {
    if (!target.institutionId) return;
    ParentPortalAdminService.getOptions({ institutionId: target.institutionId, programIds: target.programIds }).then((r) => {
      setPrograms(r.json.programs ?? []);
      const secs = r.json.sections ?? [];
      setSections(secs);
      setTarget((t) => {
        const valid = t.sectionIds.filter((id) => secs.some((s) => s.id === id));
        return valid.length === t.sectionIds.length ? t : { ...t, sectionIds: valid, learnerIds: [] };
      });
    });
  }, [target.institutionId, target.programIds]);

  // learners cascade; prune selected learners that fall away
  useEffect(() => {
    if (!target.sectionIds.length) {
      setLearners([]);
      return;
    }
    ParentPortalAdminService.getOptions({ institutionId: target.institutionId, sectionIds: target.sectionIds }).then((r) => {
      const lrn = r.json.learners ?? [];
      setLearners(lrn);
      setTarget((t) => {
        const valid = t.learnerIds.filter((id) => lrn.some((l) => l.id === id));
        return valid.length === t.learnerIds.length ? t : { ...t, learnerIds: valid };
      });
    });
  }, [target.institutionId, target.sectionIds]);

  const reload = useCallback(async (instId: string) => {
    if (!instId) return;
    const [a, h, ac, ev] = await Promise.all([
      ParentPortalAdminService.listAnnouncements(instId),
      ParentPortalAdminService.listHomework(instId),
      ParentPortalAdminService.listAchievements(instId),
      ParentPortalAdminService.listEvents(instId),
    ]);
    setLists({ ann: a.json.data ?? [], hw: h.json.data ?? [], ach: ac.json.data ?? [], ev: ev.json.data ?? [] });
  }, []);

  useEffect(() => {
    if (target.institutionId) reload(target.institutionId);
  }, [target.institutionId, reload]);

  const onSaved = () => reload(target.institutionId);

  // Block only when the user can neither author content nor manage user data.
  if (forbidden && !canUserData) {
    return (
      <ContentLayout title="Parent Portal Content">
        <div className="mx-auto mt-10 max-w-md px-4 text-center">
          <h1 className="text-lg font-semibold">Access restricted</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publishing parent-portal content is limited to Staff, Faculty, HOD and Super Admin roles.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Parent Portal Content" fullWidth>
      <div className="mt-4 w-full space-y-6 px-4 md:px-8">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0b6d41]/10 text-[#0b6d41]">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Parent Portal Content</h1>
            <p className="text-sm text-muted-foreground">
              Publish announcements, homework and achievements that parents see in the portal.
            </p>
          </div>
        </div>

        {forbidden ? (
          /* User-data-only access (e.g. principal): self-contained panel. */
          <ParentUsersPanel standalone />
        ) : (
        <>
        {/* Cascading multi-select targeting */}
        <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institution</Label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={target.institutionId}
                disabled={institutions.length <= 1}
                onChange={(e) => setTarget({ institutionId: e.target.value, programIds: [], sectionIds: [], learnerIds: [] })}
                className="w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-[#0b6d41] focus:outline-none focus:ring-1 focus:ring-[#0b6d41] disabled:opacity-60 dark:bg-neutral-900"
              >
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label('Programs')} <span className="font-normal normal-case">(optional)</span></Label>
            <MultiSelect
              options={programs.map((p) => ({ value: p.id, label: p.program_name }))}
              selected={target.programIds}
              onChange={(next) => setTarget((t) => ({ ...t, programIds: next }))}
              placeholder={`All ${label('Programs')}`}
              searchPlaceholder={`Search ${label('Programs').toLowerCase()}…`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label('Sections')} <span className="font-normal normal-case">(optional)</span></Label>
            <MultiSelect
              options={sections.map((s) => ({ value: s.id, label: s.section_name }))}
              selected={target.sectionIds}
              onChange={(next) => setTarget((t) => ({ ...t, sectionIds: next, learnerIds: [] }))}
              placeholder={`All ${label('Sections')}`}
              searchPlaceholder={`Search ${label('Sections').toLowerCase()}…`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Learners <span className="font-normal normal-case">(optional)</span></Label>
            <MultiSelect
              options={learners.map((l) => ({ value: l.id, label: l.name, sub: l.admission }))}
              selected={target.learnerIds}
              onChange={(next) => setTarget((t) => ({ ...t, learnerIds: next }))}
              placeholder={target.sectionIds.length ? 'All learners' : `Pick a ${label('Section')} first`}
              searchPlaceholder="Search learners…"
              disabled={!target.sectionIds.length}
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`flex w-full justify-start overflow-x-auto md:grid ${canUserData ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
            <TabsTrigger value="announcements" className="shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:text-[#0b6d41]"><Megaphone className="h-4 w-4" /> Announcements</TabsTrigger>
            <TabsTrigger value="homework" className="shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:text-[#0b6d41]"><BookOpenCheck className="h-4 w-4" /> Homework</TabsTrigger>
            <TabsTrigger value="achievements" className="shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:text-[#0b6d41]"><Trophy className="h-4 w-4" /> Achievements</TabsTrigger>
            <TabsTrigger value="events" className="shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:text-[#0b6d41]"><CalendarDays className="h-4 w-4" /> Events</TabsTrigger>
            {canUserData && (
              <TabsTrigger value="users" className="shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:text-[#0b6d41]"><Users className="h-4 w-4" /> Parent User Data</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="announcements" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-start">
            <AnnouncementForm target={target} label={label} onSaved={onSaved} />
            <RecentList items={lists.ann} render={(x) => `${x.title} · ${x.audience}`} />
          </TabsContent>
          <TabsContent value="homework" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-start">
            <HomeworkForm target={target} label={label} sections={sections} onSaved={onSaved} />
            <RecentList items={lists.hw} render={(x) => `${x.title}${x.subject ? ' · ' + x.subject : ''}`} />
          </TabsContent>
          <TabsContent value="achievements" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-start">
            <AchievementForm target={target} label={label} learners={learners} onSaved={onSaved} />
            <RecentList items={lists.ach} render={(x) => `${x.title}${x.category ? ' · ' + x.category : ''}`} />
          </TabsContent>
          <TabsContent value="events" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-start">
            <EventForm target={target} onSaved={onSaved} />
            <RecentList items={lists.ev} render={(x) => `${x.title}${x.venue ? ' · ' + x.venue : ''}`} />
          </TabsContent>
          {canUserData && (
            <TabsContent value="users" className="pt-4">
              <ParentUsersPanel target={target} institutionName={selected?.name ?? ''} />
            </TabsContent>
          )}
        </Tabs>
        </>
        )}
      </div>
    </ContentLayout>
  );
}

export default function ParentPortalAdminPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ParentPortalAdminPageInner />
    </Suspense>
  );
}
