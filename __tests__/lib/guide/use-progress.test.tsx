// @vitest-environment jsdom
/**
 * Regression test for the platform Help FAB progress-staleness bug.
 *
 * The FAB is mounted ONCE in the root layout and survives App-Router client
 * navigations, flipping its contextual persona per route (pickGuideLane) WITHOUT
 * remounting useGuideProgress. Before the fix the hook seeded `completed` only
 * via a lazy useState initializer with no re-seed effect, so the badge + drawer
 * checkboxes froze to the first route's persona. The fix re-seeds on a persona
 * CHANGE only — never clobbering in-session optimistic toggles within one persona.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGuideProgress } from "@/lib/guide/use-progress";
import type { CanonicalPersona } from "@/lib/guide/types";

type Props = { persona: CanonicalPersona; initialCompleted: string[] };
const render = (initialProps: Props) =>
  renderHook(
    (p: Props) =>
      useGuideProgress({ persona: p.persona, surface: "launcher", initialCompleted: p.initialCompleted }),
    { initialProps }
  );

describe("useGuideProgress — FAB cross-navigation re-seed", () => {
  it("re-seeds `completed` when the active persona changes", () => {
    const { result, rerender } = render({ persona: "module-admin", initialCompleted: ["pde:a", "pde:b"] });
    expect([...result.current.completed].sort()).toEqual(["pde:a", "pde:b"]);

    // FAB navigates to a route whose contextual lane is the overview ("learner").
    rerender({ persona: "learner", initialCompleted: ["what-is-this:0"] });
    expect([...result.current.completed]).toEqual(["what-is-this:0"]); // NOT the stale module-admin set
  });

  it("does NOT clobber in-session optimistic toggles within the same persona", () => {
    const { result, rerender } = render({ persona: "module-admin", initialCompleted: [] });
    act(() => result.current.toggle("pde:x"));
    expect(result.current.completed.has("pde:x")).toBe(true);

    // Same persona, fresh initialCompleted array identity (a normal re-render) →
    // must keep the optimistic toggle, not re-seed it away.
    rerender({ persona: "module-admin", initialCompleted: [] });
    expect(result.current.completed.has("pde:x")).toBe(true);
  });

  it("re-seeds cleanly across a round-trip (A → B → A)", () => {
    const { result, rerender } = render({ persona: "facilitator", initialCompleted: ["pde:f1"] });
    rerender({ persona: "module-admin", initialCompleted: ["pde:a1", "pde:a2"] });
    expect([...result.current.completed].sort()).toEqual(["pde:a1", "pde:a2"]);
    rerender({ persona: "facilitator", initialCompleted: ["pde:f1"] });
    expect([...result.current.completed]).toEqual(["pde:f1"]);
  });
});
