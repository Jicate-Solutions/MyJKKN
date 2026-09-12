import { describe, expect, it } from 'vitest';
import { parseFrontLayout, parseTemplateInstitution } from '@/lib/id-cards/render-card';
import { pickTemplateForInstitution } from '@/lib/services/id-cards/institution-template';

describe('parseTemplateInstitution', () => {
  it('keeps trimmed text fields and https image URLs only', () => {
    const out = parseTemplateInstitution({
      header_text: '  JKKN COLLEGE OF ENGINEERING ',
      email: 'engg@jkkn.ac.in',
      logo_image: 'https://x.supabase.co/storage/v1/object/public/id-card-assets/logos/a.png',
      principal_signature_image: 'javascript:alert(1)',
      junk: 'ignored',
      phone: ''
    });
    expect(out).toEqual({
      header_text: 'JKKN COLLEGE OF ENGINEERING',
      email: 'engg@jkkn.ac.in',
      logo_image: 'https://x.supabase.co/storage/v1/object/public/id-card-assets/logos/a.png'
    });
  });

  it('returns null when nothing usable is present', () => {
    expect(parseTemplateInstitution({ phone: '   ', logo_image: 'http://insecure' })).toBeNull();
  });

  it('a layout with only an institution block still counts as content', () => {
    const layout = parseFrontLayout({ institution: { principal_name: 'Dr. K' } });
    expect(layout?.institution?.principal_name).toBe('Dr. K');
  });
});

describe('pickTemplateForInstitution', () => {
  const P = (key: string, audience: 'learner' | 'team_member', is_default = false) => ({
    key,
    label: key,
    audience,
    is_default
  });
  const templates = [
    { id: 't-eng', name: 'Engineering', active: true, institution_id: 'inst-eng', purpose: P('learner', 'learner', true) },
    { id: 't-eng-senior', name: 'Engineering Senior', active: true, institution_id: 'inst-eng', purpose: P('senior_learner', 'team_member', true) },
    { id: 't-eng-admin', name: 'Engineering Admin', active: true, institution_id: 'inst-eng', purpose: P('administrator', 'team_member') },
    { id: 't-nv', name: 'Nattraja', active: false, institution_id: 'inst-nv', purpose: P('learner', 'learner', true) },
    { id: 't-shared', name: 'Shared', active: true, institution_id: null, purpose: P('learner', 'learner') }
  ];

  it('keeps SEVERAL active templates per institution and picks by audience + purpose', () => {
    expect(pickTemplateForInstitution(templates, 'inst-eng', 't-shared')?.template.id).toBe('t-eng');
    expect(
      pickTemplateForInstitution(templates, 'inst-eng', 't-shared', { audience: 'team_member' })?.template.id
    ).toBe('t-eng-senior');
    expect(
      pickTemplateForInstitution(templates, 'inst-eng', 't-shared', {
        audience: 'team_member',
        purposeKey: 'administrator'
      })?.template.id
    ).toBe('t-eng-admin');
  });

  it("uses the learner's institution template over the picker fallback", () => {
    const c = pickTemplateForInstitution(templates, 'inst-eng', 't-shared');
    expect(c?.template.id).toBe('t-eng');
    expect(c?.usedFallback).toBe(false);
  });

  it('falls back (and says so) when the institution has no ACTIVE template', () => {
    const c = pickTemplateForInstitution(templates, 'inst-nv', 't-shared');
    expect(c?.template.id).toBe('t-shared');
    expect(c?.usedFallback).toBe(true);
  });

  it('returns null with neither an institution template nor a fallback', () => {
    expect(pickTemplateForInstitution(templates, 'inst-nv', null)).toBeNull();
    expect(pickTemplateForInstitution(templates, null, 'missing')).toBeNull();
  });
});
