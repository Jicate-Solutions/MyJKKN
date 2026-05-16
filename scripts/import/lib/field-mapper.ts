export interface WebsiteFacultyRow {
  full_name?: string | null;
  slug?: string | null;
  designation?: string | null;
  department?: string | null;
  qualification?: string | null;
  email?: string | null;
  photo_url?: string | null;
  experience_years?: number | null;
  research_papers?: number | null;
  phd_scholars?: number | null;
  awards_won?: number | null;
  display_order?: number | null;
  status?: 'draft' | 'published' | null;
  badges?: any[] | null;
  professional_summary?: string | null;
  qualifications?: any[] | null;
  specialisations?: any[] | null;
  experience_entries?: any[] | null;
  research_focus_areas?: any[] | null;
  publications?: any[] | null;
  funded_projects?: any[] | null;
  google_scholar_url?: string | null;
  researchgate_url?: string | null;
  orcid_url?: string | null;
  certifications?: any[] | null;
  awards?: any[] | null;
  memberships?: any[] | null;
  mentoring_description?: string | null;
  phd_scholars_list?: any[] | null;
  pg_dissertations_guided?: number | null;
  ug_projects_guided?: number | null;
  faqs?: any[] | null;
}

export function splitFullName(full: string): { first_name: string; last_name: string } {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return { first_name: '', last_name: '' };
  const ws = trimmed.indexOf(' ');
  if (ws === -1) return { first_name: trimmed, last_name: '' };
  return { first_name: trimmed.slice(0, ws), last_name: trimmed.slice(ws + 1).trim() };
}

/** Returns the partial UPDATE payload to apply to a matched MyJKKN staff row. */
export function mapFacultyToStaffUpdate(f: WebsiteFacultyRow) {
  return {
    has_extended_profile: true,
    slug: f.slug ?? null,
    status: f.status ?? 'draft',
    display_order: f.display_order ?? 0,
    experience_years: f.experience_years ?? 0,
    research_papers: f.research_papers ?? 0,
    phd_scholars: f.phd_scholars ?? 0,
    awards_won: f.awards_won ?? 0,
    pg_dissertations_guided: f.pg_dissertations_guided ?? 0,
    ug_projects_guided: f.ug_projects_guided ?? 0,
    qualification_summary: f.qualification ?? null,
    professional_summary: f.professional_summary ?? null,
    mentoring_description: f.mentoring_description ?? null,
    google_scholar_url: f.google_scholar_url ?? null,
    researchgate_url: f.researchgate_url ?? null,
    orcid_url: f.orcid_url ?? null,
    badges: f.badges ?? [],
    qualifications: f.qualifications ?? [],
    specialisations: f.specialisations ?? [],
    experience_entries: f.experience_entries ?? [],
    research_focus_areas: f.research_focus_areas ?? [],
    publications: f.publications ?? [],
    funded_projects: f.funded_projects ?? [],
    certifications: f.certifications ?? [],
    awards: f.awards ?? [],
    memberships: f.memberships ?? [],
    phd_scholars_list: f.phd_scholars_list ?? [],
    faqs: f.faqs ?? [],
  };
}
