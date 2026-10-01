// Pure aggregation over fn_leadership_overview() rows. No I/O so it can be
// checked without a database (__tests__/organizations/leadership-stats.test.ts).
//
// Posts are DATA now (leadership_posts + institution_leadership_posts): each
// institution carries only the posts that apply to it, so every ratio below is
// filled / APPLICABLE — a school without an IQAC is not "missing" one.

export interface LeaderPerson {
  user_id: string;
  full_name: string | null;
  email: string | null;
  // Only Principal / Vice Principal carry these. `basis_code: null` means nobody
  // has recorded why the post was given — never treat it as ex officio.
  basis_code?: string | null;
  basis_label?: string | null;
  basis_passes_to_successor?: boolean | null;
  basis_note?: string | null;
  assigned_at?: string | null;
  assigned_by_name?: string | null;
  // Person card (fn_leadership_person_card). photo_url: staff.profile_picture,
  // else profiles.avatar_url. phone is only sent to admins.
  photo_url?: string | null;
  designation?: string | null;
  phone?: string | null;
  staff_id?: string | null;
}

export type PostKind = 'principal_role' | 'committee' | 'generic';

export interface PostEntry {
  code: string;
  label: string;
  description?: string | null;
  kind: PostKind;
  is_builtin: boolean;
  /** Owned by this one institution (not a shared post). */
  owned?: boolean;
  holder: LeaderPerson | null;
}

export interface OverviewRow {
  institution_id: string;
  institution_name: string;
  /** institution | school (overview only). */
  entity_type?: string;
  /** Hidden from the page; only super admins ever receive these rows. */
  hidden?: boolean;
  posts: PostEntry[];
}

/** Posts a "why was this given" basis can be recorded for. */
export const BASIS_POSTS: ReadonlyArray<string> = ['principal', 'vice_principal'];

export interface PostCoverage {
  code: string;
  label: string;
  /** Institutions where this post applies. */
  applicable: number;
  filled: number;
  vacant: number;
  pct: number;
}

export interface BasisBreakdown {
  /** Filled Principal / Vice Principal posts, i.e. the ones a basis applies to. */
  total: number;
  personal: number;
  successor: number;
  notRecorded: number;
}

export interface MultiCollegeHolder {
  user_id: string;
  name: string;
  colleges: {
    institution_id: string;
    institution_name: string;
    post: string;
    post_label: string;
  }[];
}

export interface LeadershipStats {
  colleges: number;
  fullyStaffed: number;
  totalPosts: number;
  filledPosts: number;
  vacantPosts: number;
  coveragePct: number;
  perPost: PostCoverage[];
  basis: BasisBreakdown;
  multiCollege: MultiCollegeHolder[];
}

export function personName(p: LeaderPerson | null): string | null {
  if (!p) return null;
  return p.full_name?.trim() || p.email || 'Unnamed person';
}

export function findPost(row: OverviewRow, code: string): PostEntry | undefined {
  return row.posts.find((p) => p.code === code);
}

export function vacantCount(row: OverviewRow): number {
  return row.posts.filter((p) => p.holder === null).length;
}

/** Every post that applies to at least one row, in first-seen (catalog) order. */
export function postColumns(rows: OverviewRow[]): { code: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) for (const p of r.posts) if (!seen.has(p.code)) seen.set(p.code, p.label);
  return [...seen].map(([code, label]) => ({ code, label }));
}

/** Group posts filled, for one KPI card. Kept apart from institution coverage: a
 *  group post is one appointment for everyone, not a per-institution slot. */
export function groupCoverage(posts: { holder: LeaderPerson | null }[]): { filled: number; total: number } {
  return { filled: posts.filter((p) => p.holder !== null).length, total: posts.length };
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

export function computeLeadershipStats(rows: OverviewRow[]): LeadershipStats {
  const colleges = rows.length;

  const perPost: PostCoverage[] = postColumns(rows).map(({ code, label }) => {
    const entries = rows.map((r) => findPost(r, code)).filter((p): p is PostEntry => !!p);
    const filled = entries.filter((p) => p.holder !== null).length;
    return {
      code,
      label,
      applicable: entries.length,
      filled,
      vacant: entries.length - filled,
      pct: pct(filled, entries.length),
    };
  });

  const totalPosts = perPost.reduce((s, p) => s + p.applicable, 0);
  const filledPosts = perPost.reduce((s, p) => s + p.filled, 0);
  const fullyStaffed = rows.filter((r) => r.posts.length > 0 && vacantCount(r) === 0).length;

  const basis: BasisBreakdown = { total: 0, personal: 0, successor: 0, notRecorded: 0 };
  for (const r of rows) {
    for (const p of r.posts) {
      if (!BASIS_POSTS.includes(p.code) || !p.holder) continue;
      basis.total += 1;
      if (p.holder.basis_code == null) basis.notRecorded += 1;
      else if (p.holder.basis_passes_to_successor === false) basis.personal += 1;
      else basis.successor += 1;
    }
  }

  const byUser = new Map<string, MultiCollegeHolder>();
  for (const r of rows) {
    for (const p of r.posts) {
      if (!p.holder) continue;
      const entry =
        byUser.get(p.holder.user_id) ??
        { user_id: p.holder.user_id, name: personName(p.holder) ?? '', colleges: [] };
      entry.colleges.push({
        institution_id: r.institution_id,
        institution_name: r.institution_name,
        post: p.code,
        post_label: p.label,
      });
      byUser.set(p.holder.user_id, entry);
    }
  }
  // "More than one college", not "more than one post": a Principal who is also
  // IQAC Chair at the same college is normal (the IQAC rule).
  const multiCollege = [...byUser.values()]
    .filter((h) => new Set(h.colleges.map((c) => c.institution_id)).size > 1)
    .sort((a, b) => b.colleges.length - a.colleges.length || a.name.localeCompare(b.name));

  return {
    colleges,
    fullyStaffed,
    totalPosts,
    filledPosts,
    vacantPosts: totalPosts - filledPosts,
    coveragePct: pct(filledPosts, totalPosts),
    perPost,
    basis,
    multiCollege,
  };
}
