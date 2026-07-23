/**
 * Tests for the MODULE-SCOPED guide helpers (lib/guide/registry.ts) that power
 * the Help FAB's "Open full guide" link — opening the full /guide page scoped to
 * ONLY the module whose page the viewer is on.
 *
 * The load-bearing invariant proved here: composeModuleLane namespaces sections
 * IDENTICALLY to composeLane (`<module>:<id>`), so completed-step progress
 * carries over verbatim between the contextual drawer and this scoped view — and
 * it returns ONLY that one module's sections (never another module's).
 */
import { describe, it, expect } from "vitest";
import {
  composeLane,
  composeModuleLane,
  isModule,
  moduleGlossary,
  moduleLabel,
  modulePersonas,
} from "@/lib/guide/registry";

describe("isModule (fail-closed)", () => {
  it("accepts only real registered modules", () => {
    expect(isModule("ai-pulse")).toBe(true);
    expect(isModule("campus-living")).toBe(true);
    expect(isModule("pde")).toBe(true);
  });
  it("rejects unknown / empty / nullish", () => {
    expect(isModule("nope")).toBe(false);
    expect(isModule("")).toBe(false);
    expect(isModule(null)).toBe(false);
    expect(isModule(undefined)).toBe(false);
  });
});

describe("moduleLabel", () => {
  it("returns the plain-English label for known modules", () => {
    expect(moduleLabel("ai-pulse")).toBe("AI Pulse");
    expect(moduleLabel("campus-living")).toBe("Campus Living");
    expect(moduleLabel("pde")).toBe("PDE");
  });
  it("falls back to the raw id for unknown modules", () => {
    expect(moduleLabel("mystery")).toBe("mystery");
  });
});

describe("modulePersonas", () => {
  it("lists exactly the canonical personas a module fills", () => {
    // PDE fills learner / facilitator / module-admin (see registry pdeGuide).
    expect(modulePersonas("pde").sort()).toEqual(
      ["facilitator", "learner", "module-admin"].sort()
    );
  });
  it("returns [] for an unknown module", () => {
    expect(modulePersonas("nope")).toEqual([]);
  });
});

describe("composeModuleLane", () => {
  it("returns ONLY the named module's sections for the persona", () => {
    const lane = composeModuleLane("ai-pulse", "coordinator");
    expect(lane).not.toBeNull();
    expect(lane!.sections.length).toBeGreaterThan(0);
    // Every section id is namespaced to ai-pulse — no other module leaks in.
    for (const s of lane!.sections) {
      expect(s.id.startsWith("ai-pulse:")).toBe(true);
    }
  });

  it("uses keys IDENTICAL to composeLane (progress carries over)", () => {
    // The scoped lane's sections must be a subset (by id) of the full composed
    // lane — same namespacing — so a step checked in the drawer stays checked.
    const full = composeLane("learner");
    const scoped = composeModuleLane("pde", "learner");
    expect(scoped).not.toBeNull();
    const fullIds = new Set(full.sections.map((s) => s.id));
    for (const s of scoped!.sections) {
      expect(s.id.startsWith("pde:")).toBe(true);
      expect(fullIds.has(s.id)).toBe(true);
    }
  });

  it("does not mix in sections from other modules", () => {
    // unit-lead is filled by BOTH ai-pulse and campus-living in the full lane;
    // scoping to campus-living must drop every ai-pulse unit-lead section.
    const scoped = composeModuleLane("campus-living", "unit-lead");
    expect(scoped).not.toBeNull();
    expect(scoped!.sections.some((s) => s.id.startsWith("ai-pulse:"))).toBe(false);
    expect(scoped!.sections.every((s) => s.id.startsWith("campus-living:"))).toBe(true);
  });

  it("returns null when the persona doesn't fill the module", () => {
    // ai-pulse has no `parent` lane.
    expect(composeModuleLane("ai-pulse", "parent")).toBeNull();
  });

  it("returns null for an unknown module", () => {
    expect(composeModuleLane("nope", "learner")).toBeNull();
  });
});

describe("moduleGlossary (module-only 'Words to know')", () => {
  it("returns a non-empty, module-specific term list for known modules", () => {
    expect(moduleGlossary("pde").length).toBeGreaterThan(0);
    // A PDE-scoped guide must not carry Campus Living's mess/room terms.
    const pdeTerms = moduleGlossary("pde").map((t) => t.term.toLowerCase());
    expect(pdeTerms).not.toContain("mess plan");
    expect(pdeTerms).not.toContain("premium stay");
  });
  it("returns [] for an unknown module", () => {
    expect(moduleGlossary("nope")).toEqual([]);
  });
});
