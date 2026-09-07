import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PURPOSE,
  distinctPurposes,
  purposeOfLayout,
  selectTemplateForPerson,
  slugifyPurposeKey
} from '@/lib/id-cards/template-purpose';
import { artworkPlacement } from '@/lib/id-cards/render-data';

describe('purposeOfLayout', () => {
  it('treats a template without a purpose block as the default learner template', () => {
    expect(purposeOfLayout({})).toEqual(DEFAULT_PURPOSE);
    expect(purposeOfLayout(null)).toEqual(DEFAULT_PURPOSE);
    expect(purposeOfLayout({ purpose: 'junk' })).toEqual(DEFAULT_PURPOSE);
  });

  it('parses label, audience and default; derives the key from the label when absent', () => {
    expect(
      purposeOfLayout({ purpose: { label: ' Senior Learners ', audience: 'team_member', is_default: true } })
    ).toEqual({ key: 'senior_learners', label: 'Senior Learners', audience: 'team_member', is_default: true });
    expect(purposeOfLayout({ purpose: { key: 'Admin Staff', audience: 'bogus' } }).audience).toBe('learner');
    expect(purposeOfLayout({ purpose: { key: 'Admin Staff' } }).key).toBe('admin_staff');
  });

  it('slugifies keys', () => {
    expect(slugifyPurposeKey('Senior Learners (faculty)')).toBe('senior_learners_faculty');
    expect(slugifyPurposeKey('!!!')).toBe('purpose');
  });
});

const eng = 'inst-eng';
const T = (
  id: string,
  institution_id: string | null,
  key: string,
  audience: 'learner' | 'team_member',
  is_default = false,
  active = true
) => ({ id, active, institution_id, purpose: { key, label: key, audience, is_default } });

const templates = [
  T('t-learner', eng, 'learner', 'learner', true),
  T('t-visitor', eng, 'visitor', 'learner'),
  T('t-senior', eng, 'senior_learner', 'team_member', true),
  T('t-admin', eng, 'administrator', 'team_member'),
  T('t-old', eng, 'learner', 'learner', true, false), // inactive default — ignored
  T('t-other', 'inst-other', 'learner', 'learner', true)
];

describe('selectTemplateForPerson — several ACTIVE templates per institution', () => {
  it('keeps every active template selectable: default when no purpose chosen', () => {
    expect(selectTemplateForPerson(templates, eng, 'learner')?.id).toBe('t-learner');
    expect(selectTemplateForPerson(templates, eng, 'team_member')?.id).toBe('t-senior');
  });

  it('honours the chosen purpose within the audience', () => {
    expect(selectTemplateForPerson(templates, eng, 'learner', 'visitor')?.id).toBe('t-visitor');
    expect(selectTemplateForPerson(templates, eng, 'team_member', 'administrator')?.id).toBe('t-admin');
  });

  it('falls back to the default when the chosen purpose does not exist for that audience', () => {
    expect(selectTemplateForPerson(templates, eng, 'learner', 'administrator')?.id).toBe('t-learner');
  });

  it('never crosses institutions, audiences or picks an inactive template', () => {
    expect(selectTemplateForPerson(templates, 'inst-other', 'team_member')).toBeNull();
    expect(selectTemplateForPerson(templates, 'inst-none', 'learner')).toBeNull();
    expect(selectTemplateForPerson(templates, null, 'learner')).toBeNull();
    expect(selectTemplateForPerson(templates, eng, 'learner')?.id).not.toBe('t-old');
  });

  it('lists distinct purposes per audience, optionally scoped to institutions', () => {
    expect(distinctPurposes(templates, 'learner').map((p) => p.key)).toEqual(['learner', 'visitor']);
    expect(distinctPurposes(templates, 'team_member', new Set([eng])).map((p) => p.key)).toEqual([
      'senior_learner',
      'administrator'
    ]);
    expect(distinctPurposes(templates, 'team_member', new Set(['inst-other']))).toEqual([]);
  });
});

describe('artworkPlacement — uploaded artwork is never cropped', () => {
  it('fills exactly when the artwork matches the canvas ratio (1014x638 or any multiple)', () => {
    expect(artworkPlacement(1014, 638, 1014, 638)).toEqual({ left: 0, top: 0, width: 1014, height: 638 });
    expect(artworkPlacement(1014, 638, 2028, 1276)).toEqual({ left: 0, top: 0, width: 1014, height: 638 });
    // 2% off — an export rounding difference, still filled edge to edge
    expect(artworkPlacement(1014, 638, 1000, 638)).toEqual({ left: 0, top: 0, width: 1014, height: 638 });
  });

  it('contains (letterboxes) instead of cropping when the ratio is materially different', () => {
    const p = artworkPlacement(638, 1014, 1080, 1920)!; // 9:16 export on a portrait card
    expect(p.width).toBeLessThanOrEqual(638);
    expect(p.height).toBe(1014);
    expect(p.left).toBeGreaterThan(0);
    // Whole image inside the box — nothing outside the viewport
    expect(p.left + p.width).toBeLessThanOrEqual(638);
  });
});
