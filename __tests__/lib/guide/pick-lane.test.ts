/**
 * Tests for the pure platform-FAB lane selector (lib/guide/pick-lane.ts).
 *
 * This logic runs in the root layout on EVERY signed-in page in production, so
 * its behaviour is proved here rather than only eyeballed. It exercises the real
 * route-map (which derives module routes from the live REGISTRY), so "/ai-pulse",
 * "/campus-living", "/pde" are real guide-module routes and "/dashboard" /
 * "/billing" are guide-less.
 *
 * The contract under test:
 *   - guide-less route            → the generic OVERVIEW lane (not a module lane)
 *   - module route                → highest-priority visible persona the module
 *                                   fills, SCOPED to that module's sections only
 *                                   (composeLane stamps `<module>:<id>` keys)
 *   - module route, no module content for any visible persona → OVERVIEW floor
 *   - facilitator outranks coordinator (the shipped #1404 priority flip)
 */
import { describe, it, expect } from "vitest";
import { pickGuideLane } from "@/lib/guide/pick-lane";
import type { CanonicalPersona, PersonaGuide } from "@/lib/guide/types";

/** A lane whose sections all belong to ONE module (namespaced `<module>:s<i>`). */
function lane(persona: CanonicalPersona, module = "ai-pulse", count = 1): PersonaGuide {
  return {
    persona,
    title: `${persona} title`,
    tagline: "t",
    journey: [],
    sections: Array.from({ length: count }, (_, i) => ({
      id: `${module}:s${i}`,
      title: `${module} S${i}`,
      steps: [{ action: "do a thing" }],
    })),
  };
}

/** A lane composed across SEVERAL modules — one section per module (the real
 *  composeLane shape: a persona lane carries every module's sections for it). */
function mixedLane(persona: CanonicalPersona, modules: string[]): PersonaGuide {
  return {
    persona,
    title: `${persona} title`,
    tagline: "t",
    journey: [],
    sections: modules.map((m, i) => ({
      id: `${m}:s${i}`,
      title: `${m} S${i}`,
      steps: [{ action: "do a thing" }],
    })),
  };
}

function mapOf(...lanes: PersonaGuide[]): ReadonlyMap<CanonicalPersona, PersonaGuide> {
  return new Map(lanes.map((l) => [l.persona, l]));
}

// A distinct OVERVIEW object so identity (toBe) proves it was the value returned.
const OVERVIEW = lane("learner", "overview", 2);

describe("pickGuideLane", () => {
  it("opens the OVERVIEW lane on a guide-less route, ignoring richer module lanes", () => {
    const lanes = mapOf(lane("facilitator"), lane("module-admin"), lane("learner"));
    for (const path of ["/dashboard", "/billing", "/hr", "/academic", "/"]) {
      expect(pickGuideLane({ pathname: path, lanes, own: "module-admin", overview: OVERVIEW })).toBe(
        OVERVIEW
      );
    }
  });

  it("opens the highest-priority visible persona the matched module fills", () => {
    // /ai-pulse fills facilitator (among others). A viewer who sees learner +
    // facilitator gets the facilitator lane (facilitator > learner in priority).
    const lanes = mapOf(lane("learner"), lane("facilitator"));
    const got = pickGuideLane({ pathname: "/ai-pulse", lanes, own: "learner", overview: OVERVIEW });
    expect(got.persona).toBe("facilitator");
  });

  it("respects the shipped priority flip: facilitator beats coordinator on /ai-pulse", () => {
    const lanes = mapOf(lane("coordinator"), lane("facilitator"), lane("learner"));
    const got = pickGuideLane({
      pathname: "/ai-pulse/attendance",
      lanes,
      own: "coordinator",
      overview: OVERVIEW,
    });
    expect(got.persona).toBe("facilitator");
  });

  it("SCOPES the lane to the route's module — drops other modules' sections", () => {
    // The screenshot bug: a module-admin on /pde was shown AI Pulse + Campus
    // Living admin steps. The module-admin lane carries all three; on /pde it
    // must collapse to PDE's section only.
    const admin = mixedLane("module-admin", ["ai-pulse", "campus-living", "pde"]);
    const got = pickGuideLane({
      pathname: "/pde/learn/demonstrations",
      lanes: mapOf(admin),
      own: "module-admin",
      overview: OVERVIEW,
    });
    expect(got.persona).toBe("module-admin");
    expect(got.sections.map((s) => s.id)).toEqual(["pde:s2"]);
    expect(got.sections.some((s) => s.id.startsWith("ai-pulse:"))).toBe(false);
    expect(got.sections.some((s) => s.id.startsWith("campus-living:"))).toBe(false);
  });

  it("scopes the SAME lane differently per route", () => {
    const facilitator = mixedLane("facilitator", ["ai-pulse", "pde"]);
    const lanes = mapOf(facilitator);
    const onAip = pickGuideLane({ pathname: "/ai-pulse", lanes, own: "facilitator", overview: OVERVIEW });
    expect(onAip.sections.every((s) => s.id.startsWith("ai-pulse:"))).toBe(true);
    const onPde = pickGuideLane({ pathname: "/pde", lanes, own: "facilitator", overview: OVERVIEW });
    expect(onPde.sections.every((s) => s.id.startsWith("pde:"))).toBe(true);
  });

  it("returns the OVERVIEW floor when the module fills NO visible persona", () => {
    // /campus-living fills learner/unit-lead/module-admin — NOT facilitator.
    const lanes = mapOf(mixedLane("facilitator", ["ai-pulse"]));
    expect(
      pickGuideLane({ pathname: "/campus-living", lanes, own: "facilitator", overview: OVERVIEW })
    ).toBe(OVERVIEW);
  });

  it("returns the OVERVIEW floor when the visible persona has no content from THIS module", () => {
    // learner IS filled by campus-living, but this viewer's learner lane only
    // carries ai-pulse sections (campus-living ones were can-filtered away) →
    // nothing to show for /campus-living → overview, not an empty drawer.
    const lanes = mapOf(mixedLane("learner", ["ai-pulse"]));
    expect(
      pickGuideLane({ pathname: "/campus-living", lanes, own: "learner", overview: OVERVIEW })
    ).toBe(OVERVIEW);
  });

  it("returns the OVERVIEW floor on a module route when the lane is empty", () => {
    const lanes = mapOf(lane("facilitator", "ai-pulse", 0));
    expect(
      pickGuideLane({ pathname: "/ai-pulse", lanes, own: "facilitator", overview: OVERVIEW })
    ).toBe(OVERVIEW);
  });

  it("never returns null — overview is the floor even with an empty lane set", () => {
    const lanes = mapOf();
    expect(
      pickGuideLane({ pathname: "/ai-pulse", lanes, own: "learner", overview: OVERVIEW })
    ).toBe(OVERVIEW);
    expect(
      pickGuideLane({ pathname: "/whatever-no-module", lanes, own: "learner", overview: OVERVIEW })
    ).toBe(OVERVIEW);
  });

  it("preserves the namespaced step keys so progress carries over", () => {
    const facilitator = mixedLane("facilitator", ["ai-pulse", "pde"]);
    const got = pickGuideLane({ pathname: "/pde", lanes: mapOf(facilitator), own: "facilitator", overview: OVERVIEW });
    // The kept section's id is unchanged (still `pde:s1`), not re-derived.
    expect(got.sections[0].id).toBe("pde:s1");
  });
});
