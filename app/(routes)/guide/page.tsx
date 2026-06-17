// app/(routes)/guide/page.tsx
// ============================================================================
// PLATFORM SMART GUIDE — unified full-page route (server component).
//
// The one full-page renderer for the canonical, COMPOSED platform guide — the
// page the platform Help FAB's "Open full guide" link and the GuideView persona
// switcher (?persona=) point at (BASE_PATH "/guide"). Until now only the FAB
// drawer existed; this surfaces the pieces the drawer omits: the persona
// switcher, why-it-matters + start-here, the journey strip, the shared glossary
// ("Words to know"), the planned-translation footer, and Download/Print → PDF.
//
//   1. resolveGuideAccess() (server, fail-closed) → the viewer's own lane,
//      the lanes they may switch to (`visible`), and the `can` predicate.
//   2. composeGuideBook() builds all 9 canonical lanes + the merged glossary;
//      each lane's sections are then SERVER-FILTERED by `can` so a viewer never
//      receives a section they can't see (`can` never crosses to the client).
//   3. ?persona= switches to any lane the viewer is permitted to see (fail-closed
//      to their own lane), and `key={persona}` remounts GuideView per lane so
//      progress state + the guide_open/lane_complete refs re-seed.
//   4. Adoption layer ON (same guide_progress / guide_events tables the FAB uses)
//      so the page is a checkable activation checklist, consistent with the FAB.
//
// Wrapped in the app's ContentLayout + a scoped @media print block so the
// Download/Print button yields a clean PDF (no app shell).
// ============================================================================

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContentLayout } from "@/components/layout/content-layout";
import { PageBreadcrumb } from "@/components/navigation";
import {
  composeGuideBook,
  composeModuleLane,
  FILLED_PERSONAS,
  isModule,
  moduleGlossary,
  moduleLabel,
  modulePersonas,
} from "@/lib/guide/registry";
import { filterLaneSections } from "@/lib/guide/filter";
import {
  isCanonicalPersona,
  CANONICAL_PERSONAS,
  type GuideBook,
  type CanonicalPersona,
  type PersonaGuide,
} from "@/lib/guide/types";
import { GuideView } from "@/components/guide/GuideView";
import { resolveGuideAccess } from "@/lib/guide/resolve-persona";
import { getCompletedSteps, logGuideEvent, toggleStep } from "@/lib/guide/actions";

export const dynamic = "force-dynamic";

const BASE_PATH = "/guide";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #platform-guide-print, #platform-guide-print * { visibility: visible; }
  #platform-guide-print {
    position: absolute; left: 0; top: 0; width: 100%;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
`;

export default async function PlatformGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; module?: string }>;
}) {
  const { persona: requestedRaw, module: moduleRaw } = await searchParams;
  const access = await resolveGuideAccess();

  // Switch only to a lane the viewer is permitted to see; else their own lane.
  const requested = isCanonicalPersona(requestedRaw) ? requestedRaw : null;
  const persona: CanonicalPersona =
    requested && access.visible.includes(requested) ? requested : access.own;

  // Compose all 9 lanes + glossary, then drop every section the viewer can't see
  // (server-side; `can` never reaches the client). The switcher only offers
  // `access.visible`, so unseen lanes aren't selectable either.
  const base = composeGuideBook();
  const lanes = Object.fromEntries(
    CANONICAL_PERSONAS.map((p) => [p, filterLaneSections(base.lanes[p], access.can)])
  ) as Record<CanonicalPersona, PersonaGuide>;

  // ── MODULE SCOPE ──────────────────────────────────────────────────────────
  // When the Help FAB opens this page from a module's own page it passes
  // `?module=<id>`, so "Open full guide" shows ONLY that module's guide (its
  // sections for this persona): the drawer is contextual, so its expand button
  // stays contextual. The always-visible nav "Guide" item carries the full
  // cross-module guide. Fail-soft: an unknown module — or one this persona
  // doesn't fill / can't see — falls back to the full role lane (never empty).
  const scopedModule = isModule(moduleRaw) ? moduleRaw! : null;
  let moduleScope: string | null = null;
  if (scopedModule) {
    const activeMl = composeModuleLane(scopedModule, persona);
    const activeScoped = activeMl ? filterLaneSections(activeMl, access.can) : null;
    // Enter module scope only when the viewer's OWN lane is fillable here
    // (else fall back to the full cross-module lane — never an empty view).
    if (activeScoped && activeScoped.sections.length > 0) {
      lanes[persona] = activeScoped;
      moduleScope = scopedModule;
      // Re-skin the OTHER lanes this module fills too, so the switcher chips
      // carry the module's own labels (e.g. AI Pulse "Champion" / "Class
      // Incharge"), not just the active header. Module titles ride
      // composeModuleLane; modules without overrides keep canonical labels.
      for (const p of modulePersonas(scopedModule)) {
        if (p === persona) continue;
        const ml = composeModuleLane(scopedModule, p);
        const scoped = ml ? filterLaneSections(ml, access.can) : null;
        if (scoped && scoped.sections.length > 0) lanes[p] = scoped;
      }
    }
  }

  const guides: GuideBook = {
    ...base,
    lanes,
    // In module scope, show only THAT module's glossary (not the merged
    // cross-module one) so "module only" holds for "Words to know" too.
    glossary: moduleScope ? moduleGlossary(moduleScope) : base.glossary,
  };

  // Switcher: in module scope → the roles THIS module fills (switching role then
  // stays inside the module); otherwise → any lane a module actually fills, so a
  // viewer never sees several identical overview-only tabs. Always within what
  // the viewer may see, plus their current lane.
  const moduleFills = moduleScope ? modulePersonas(moduleScope) : null;
  const switcherPersonas = access.visible.filter(
    (p) => (moduleFills ? moduleFills.includes(p) : FILLED_PERSONAS.has(p)) || p === persona
  );

  const initialCompleted = await getCompletedSteps(persona);
  const pageTitle = moduleScope ? `${moduleLabel(moduleScope)} guide` : "Platform Guide";

  return (
    <ContentLayout title={pageTitle}>
      <style>{PRINT_CSS}</style>
      <PageBreadcrumb
        items={
          moduleScope
            ? [
                { label: "Home", href: "/" },
                { label: "Guide", href: BASE_PATH },
                { label: moduleLabel(moduleScope) },
              ]
            : [{ label: "Home", href: "/" }, { label: "Guide" }]
        }
        className="print:hidden"
      />
      {moduleScope && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm print:hidden">
          <span>
            Showing the <strong>{moduleLabel(moduleScope)}</strong> guide for this page.
          </span>
          <Link
            href={BASE_PATH}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            View the full platform guide
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
      <div id="platform-guide-print" className="mt-4 max-w-4xl">
        <GuideView
          // Remount per lane AND per module scope so progress state + the
          // guide_open/lane_complete refs re-seed (a ?persona= / ?module= switch
          // is a soft nav otherwise).
          key={`${moduleScope ?? "all"}:${persona}`}
          guides={guides}
          persona={persona}
          visiblePersonas={switcherPersonas}
          scopeId={access.scopeId}
          basePath={BASE_PATH}
          // Preserve module scope when switching roles, so the switcher stays in
          // the module instead of jumping to the full cross-module guide.
          personaParam={moduleScope ? `module=${moduleScope}` : undefined}
          trackProgress
          initialCompleted={initialCompleted}
          onToggleStep={toggleStep}
          onEvent={logGuideEvent}
        />
      </div>
    </ContentLayout>
  );
}
