/**
 * Tests for the pure platform-FAB lane selector (lib/guide/pick-lane.ts).
 *
 * This logic runs in the root layout on EVERY signed-in page in production, so
 * its behaviour is proved here rather than only eyeballed. It exercises the real
 * route-map (which derives module routes from the live REGISTRY), so "/ai-pulse"
 * is a real guide-module route and "/dashboard" / "/billing" are guide-less.
 *
 * The contract under test (step 5 — wire PLATFORM_OVERVIEW for guide-less routes):
 *   - guide-less route            → the generic OVERVIEW lane (not a module lane)
 *   - module route, visible lane  → highest-priority visible persona (with content)
 *   - module route, empty lanes   → the OVERVIEW floor (never empty / never null)
 *   - facilitator outranks coordinator (the shipped #1404 priority flip)
 */
import { describe, it, expect } from "vitest";
import { pickGuideLane } from "@/lib/guide/pick-lane";
import type { CanonicalPersona, PersonaGuide } from "@/lib/guide/types";

/** Minimal PersonaGuide fixture; `sections=0` makes a deliberately empty lane. */
function lane(persona: CanonicalPersona, sections = 1): PersonaGuide {
  return {
    persona,
    title: `${persona} title`,
    tagline: "t",
    journey: [],
    sections: Array.from({ length: sections }, (_, i) => ({
      id: `s${i}`,
      title: `S${i}`,
      steps: [{ action: "do a thing" }],
    })),
  };
}

function mapOf(...lanes: PersonaGuide[]): ReadonlyMap<CanonicalPersona, PersonaGuide> {
  return new Map(lanes.map((l) => [l.persona, l]));
}

// A distinct OVERVIEW object so identity (toBe) proves it was the value returned.
const OVERVIEW = lane("learner", 2);

describe("pickGuideLane", () => {
  it("opens the OVERVIEW lane on a guide-less route, ignoring richer module lanes", () => {
    const lanes = mapOf(lane("facilitator"), lane("module-admin"), lane("learner"));
    for (const path of ["/dashboard", "/billing", "/hr", "/academic", "/"]) {
      expect(pickGuideLane({ pathname: path, lanes, own: "module-admin", overview: OVERVIEW })).toBe(
        OVERVIEW
      );
    }
  });

  it("opens the highest-priority visible persona that the matched module fills", () => {
    // /ai-pulse fills facilitator (among others). A viewer who sees learner +
    // facilitator gets the facilitator lane (facilitator > learner in priority).
    const facilitator = lane("facilitator");
    const lanes = mapOf(lane("learner"), facilitator);
    expect(
      pickGuideLane({ pathname: "/ai-pulse", lanes, own: "learner", overview: OVERVIEW })
    ).toBe(facilitator);
  });

  it("respects the shipped priority flip: facilitator beats coordinator on /ai-pulse", () => {
    const facilitator = lane("facilitator");
    const coordinator = lane("coordinator");
    const lanes = mapOf(coordinator, facilitator, lane("learner"));
    expect(
      pickGuideLane({ pathname: "/ai-pulse/attendance", lanes, own: "coordinator", overview: OVERVIEW })
    ).toBe(facilitator);
  });

  it("falls back to the viewer's own lane when the module fills no visible lane with content", () => {
    // /campus-living does not fill facilitator; the viewer's own learner lane wins.
    const learner = lane("learner");
    const lanes = mapOf(learner, lane("facilitator"));
    expect(
      pickGuideLane({ pathname: "/campus-living", lanes, own: "learner", overview: OVERVIEW })
    ).toBe(learner);
  });

  it("returns the OVERVIEW floor on a module route when no visible lane has content", () => {
    // facilitator is visible for /ai-pulse but EMPTY (0 sections) → overview floor.
    const lanes = mapOf(lane("facilitator", 0));
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
});
