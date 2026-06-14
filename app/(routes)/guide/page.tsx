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

import { ContentLayout } from "@/components/layout/content-layout";
import { PageBreadcrumb } from "@/components/navigation";
import { composeGuideBook } from "@/lib/guide/registry";
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
  searchParams: Promise<{ persona?: string }>;
}) {
  const { persona: requestedRaw } = await searchParams;
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
  const guides: GuideBook = { ...base, lanes };

  const initialCompleted = await getCompletedSteps(persona);

  return (
    <ContentLayout title="Platform Guide">
      <style>{PRINT_CSS}</style>
      <PageBreadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Guide" }]}
        className="print:hidden"
      />
      <div id="platform-guide-print" className="mt-4 max-w-4xl">
        <GuideView
          // Remount per lane so progress state + the guide_open/lane_complete
          // refs re-seed (a ?persona= switch is a soft nav otherwise).
          key={persona}
          guides={guides}
          persona={persona}
          visiblePersonas={access.visible}
          scopeId={access.scopeId}
          basePath={BASE_PATH}
          trackProgress
          initialCompleted={initialCompleted}
          onToggleStep={toggleStep}
          onEvent={logGuideEvent}
        />
      </div>
    </ContentLayout>
  );
}
