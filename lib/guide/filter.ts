/**
 * Smart Guide — SERVER-SIDE section filtering (PURE, no I/O, no React).
 *
 * A composed canonical lane (composeLane) may contain sections tagged with a
 * `requires` permission key — these come from modules that COLLAPSED several of
 * their original lanes into one canonical lane (e.g. Campus Living warden + mess
 * → unit-lead, AI Pulse champion → unit-lead). Each group keeps the permission
 * key that originally unlocked it. This function drops every section the viewer
 * cannot see, so the lane the viewer receives already matches their permissions.
 *
 * WHY SERVER-SIDE: `can` is the permission predicate from resolveGuideAccess().
 * It MUST NOT be serialized to the client (it closes over the granted-permission
 * set). So this runs in the root-layout server component to pre-filter the lanes,
 * and only the resulting plain PersonaGuide data crosses to the client FAB. The
 * client never sees `can` and never sees a section it isn't allowed to.
 *
 * Pure + framework-neutral on purpose (no "use server", no "server-only") so it
 * can be unit-tested and imported anywhere; the CALLER guarantees it runs on the
 * server by only ever invoking it from a server component with a server `can`.
 */
import type { PersonaGuide } from "./types";

/**
 * Return a copy of `lane` with any section whose `requires` is set and
 * `can(requires)` is false removed. Sections without `requires` are always kept
 * (instructional, ungated). Fail-closed: a section gated on an unknown key is
 * dropped because `can` returns false for keys the viewer wasn't granted.
 *
 * Content is otherwise verbatim — only the `sections` array is filtered, and the
 * `journey` strip is re-derived from the surviving section titles so it never
 * advertises a step the viewer can't reach.
 */
export function filterLaneSections(
  lane: PersonaGuide,
  can: (key: string) => boolean
): PersonaGuide {
  const sections = lane.sections.filter(
    (s) => s.requires === undefined || can(s.requires)
  );
  if (sections.length === lane.sections.length) {
    // Nothing dropped — return as-is (also keeps referential identity cheap).
    return lane;
  }
  return {
    ...lane,
    sections,
    journey: sections.map((s) => s.title),
  };
}
