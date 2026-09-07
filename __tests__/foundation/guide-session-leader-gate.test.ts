/**
 * Foundation guide — the session-leader steps must stay on their OWN gate.
 *
 * The whole Foundation facilitator lane is gated on `foundation.students.view`.
 * The one role that actually runs practice sessions — school_faculty — does NOT
 * hold that key; it holds `foundation.practice.take`, which is what opens
 * /foundation/practice/facilitate. So the steps for running a session are
 * composed into that lane under their own key.
 *
 * This is fragile in a specific, silent way. `withRequires()` stamps ONE key
 * across every section handed to it, so anyone who later "tidies" the registry
 * back into a single call will re-gate these steps on `foundation.students.view`
 * — and the guide will vanish for precisely the person it was written for, with
 * no error anywhere. The lane still renders; the section is just gone.
 *
 * These assertions run against the COMPOSED registry, not the authored content,
 * because composition is where the gate is actually decided.
 */
import { describe, it, expect } from 'vitest';
import { foundationGuide } from '@/lib/guide/registry';
import { REQUIRES } from '@/lib/foundation/guide/content';

const lane = (foundationGuide.lanes as any).facilitator;
const sections = lane.sections as Array<any>;
const sessionSection = sections.find((s) => s.id === 'run-a-session');

describe('Foundation Senior Learner lane composition', () => {
  it('contributes the run-a-session steps into the Senior Learner lane', () => {
    expect(sessionSection).toBeDefined();
    expect(sessionSection.steps.length).toBeGreaterThan(0);
  });

  it('gates them on the key that actually opens the screen, not the lane key', () => {
    expect(sessionSection.requires).toBe('foundation.practice.take');
    expect(sessionSection.requires).toBe(REQUIRES.session_leader);
    // The failure this guards: re-stamped with the lane's own key.
    expect(sessionSection.requires).not.toBe(REQUIRES.facilitator);
  });

  it('leaves the pre-existing review sections on their original gate', () => {
    // The OneMark sections are the other separately-gated groups in this lane
    // (see the describe below); everything else must stay on the review gate.
    const ownGate = new Set(['run-a-session', 'onemark-paper', 'onemark-review']);
    const others = sections.filter((s) => !ownGate.has(s.id));
    expect(others.length).toBeGreaterThan(0);
    for (const s of others) {
      expect(s.requires).toBe(REQUIRES.facilitator);
    }
  });

  it('points at the session screen, not the operator console', () => {
    const hrefs = sessionSection.steps
      .map((s: any) => s.link?.href)
      .filter(Boolean);
    expect(hrefs).toContain('/foundation/practice/facilitate');
    expect(hrefs).not.toContain('/foundation/console');
  });

  it('keeps session_leader and the review gate as genuinely different keys', () => {
    // Same VALUE as `learner` today (one permission opens the screen), but it
    // must never silently become the review gate.
    expect(REQUIRES.session_leader).not.toBe(REQUIRES.facilitator);
  });

  it('warns the reader when no group is assigned — the likeliest real state', () => {
    const text = JSON.stringify(sessionSection).toLowerCase();
    expect(text).toContain('not running any groups');
  });

  it('tells the reader to check whose name the answers are filed under', () => {
    const text = JSON.stringify(sessionSection).toLowerCase();
    expect(text).toContain('name on screen');
  });
});

/**
 * OneMark — the same fragility, twice more. Building a paper and approving
 * drafts are gated on foundation.assessments.manage / foundation.items.manage,
 * which school_faculty holds; re-stamping either with the lane key or with
 * each other would hide the steps from the Senior Learner they are written for.
 */
describe('Foundation Senior Learner lane — OneMark composition', () => {
  const paper = sections.find((s) => s.id === 'onemark-paper');
  const review = sections.find((s) => s.id === 'onemark-review');

  it('contributes both OneMark sections into the Senior Learner lane', () => {
    expect(paper).toBeDefined();
    expect(review).toBeDefined();
    expect(paper.steps.length).toBeGreaterThan(0);
    expect(review.steps.length).toBeGreaterThan(0);
  });

  it('gates each on the key that opens its own screen', () => {
    expect(paper.requires).toBe('foundation.assessments.manage');
    expect(paper.requires).toBe(REQUIRES.paper_builder);
    expect(review.requires).toBe('foundation.items.manage');
    expect(review.requires).toBe(REQUIRES.item_approver);
    expect(paper.requires).not.toBe(REQUIRES.facilitator);
    expect(review.requires).not.toBe(REQUIRES.facilitator);
    expect(paper.requires).not.toBe(review.requires);
  });

  it('deep-links each to its own screen and nowhere else in the module', () => {
    const hrefsOf = (s: any) => s.steps.map((x: any) => x.link?.href).filter(Boolean);
    expect(new Set(hrefsOf(paper))).toEqual(new Set(['/foundation/onemark/paper']));
    expect(new Set(hrefsOf(review))).toEqual(new Set(['/foundation/onemark/review']));
  });

  it('names the two rulings a Senior Learner would otherwise trip on', () => {
    // Decision 6: JABT level mix, never Easy / Medium / Hard.
    const paperText = JSON.stringify(paper);
    expect(paperText).toContain('JABT');
    expect(paperText.toLowerCase()).toContain('no easy / medium / hard');
    // Decision 7: one Senior Learner's tick is the whole sign-off.
    expect(JSON.stringify(review).toLowerCase()).toContain('no second reviewer');
    // Decision 17 is about the ABSENT learner (missed the hall sitting), and
    // decision 19 forbids a second sitting of the same paper — round-1 copy
    // said the opposite ("a learner who sat it on paper can take it ... later").
    expect(paperText.toLowerCase()).toContain('missed the hall sitting');
    expect(paperText.toLowerCase()).not.toContain('who sat it on paper');
    // The published paper lands under Lane V's real heading, not a made-up one.
    expect(paperText).toContain('Assigned papers');
    expect(paperText).not.toContain('Live tests');
    // The review screen's only count is the UNAPPROVED drafts count.
    expect(JSON.stringify(review)).toContain('Drafts waiting for a tick');
  });

  it('exposes the learner lane, gated on practice.take, with the OneMark sitting steps', () => {
    const learner = (foundationGuide.lanes as any).learner;
    // Lane V's primary control and MODE_LABEL read "Practice" (page.tsx, onemark-runner.tsx);
    // "Practise" on that branch is only prose for the older /foundation/practice module.
    const learnerText = JSON.stringify(learner);
    expect(learnerText).toContain('**Practice**');
    expect(learnerText).not.toContain('Practise');
    expect(learner).toBeDefined();
    const onemark = (learner.sections as Array<any>).find((s) => s.id === 'onemark-practice');
    expect(onemark).toBeDefined();
    expect(onemark.requires).toBe(REQUIRES.learner);
    // Decision 18: skipped is not wrong and never enters the vault.
    expect(JSON.stringify(onemark).toLowerCase()).toContain('skipping is never a mistake');
  });
});
