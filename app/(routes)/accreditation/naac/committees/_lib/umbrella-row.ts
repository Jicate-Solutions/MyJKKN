/**
 * The umbrella institution a Cluster Academic Council is filed under.
 *
 * A cluster council spans every college and school, but its row still needs an
 * institution_id: every committee's RLS scopes by that column, and NULL would
 * hide the council from every user including the Director. So it is filed at
 * the umbrella row — "where it is filed, not who owns it".
 *
 * This lookup used to be `i.name === 'JKKN Main Office'`, an exact string match.
 * That is the failure shape this codebase keeps hitting: a fact frozen into code
 * at one moment and quietly outlived by reality. Rename the row, or let a
 * trailing space into it, and the match returns undefined, the field silently
 * stays empty, and nothing tells anyone why.
 *
 * So: compare on a normalised name, then fall back to any row that reads as a
 * main office, preferring one with no iqac_code — an umbrella row is by
 * definition not one of the accredited colleges. Returns undefined rather than
 * guessing, which leaves the picker on its placeholder with every institution
 * listed, so a human still chooses. Visible, not silent.
 *
 * Lives in its own module so it can be unit-tested: importing the page pulls in
 * the Supabase client at module scope, which cannot load under vitest.
 */
export type UmbrellaCandidate = {
  id: string;
  name: string;
  iqac_code: string | null;
};

export function findUmbrellaRow<T extends UmbrellaCandidate>(
  institutions: T[],
): T | undefined {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

  const exact = institutions.find((i) => norm(i.name) === 'jkkn main office');
  if (exact) return exact;

  const candidates = institutions.filter((i) => norm(i.name).includes('main office'));
  return candidates.find((i) => !i.iqac_code) ?? candidates[0];
}
