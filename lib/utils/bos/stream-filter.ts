/**
 * BOS syllabus Stream — tolerant matching, grouping and save-time trimming.
 *
 * `bos_course_syllabi.stream` is typed into a free-text box on the syllabus
 * form, so production holds one stream under many spellings: "Arts", "ARTS",
 * "arts", "Arts " (24 Sep 2026: 132 / 224 / 26 / 1 rows). The list filter used
 * an exact `.eq('stream', …)`, so choosing Arts showed 132 of ~383 Arts
 * syllabi (BUG-005789, 005787, 005779, 005774, 005798, 005542).
 *
 * Matching rule: same letters ignoring case, and ignoring leading/trailing
 * spaces. "Arts and Science" is a DIFFERENT stream and must not match "Arts".
 * NULL streams never match a chosen stream (Director decision). Typos
 * ("Scince") are not corrected here.
 */

/**
 * Keep only characters a stream name can reasonably contain. Everything else —
 * in particular `*`, `%`, `_` (PostgREST/SQL wildcards, and a backslash does
 * not escape `*` in PostgREST) and every regex metacharacter — is dropped, so
 * the pattern built below never carries user-controlled wildcard or regex
 * syntax.
 */
function safeStreamText(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s&-]/gu, '').trim();
}

/**
 * PostgREST `imatch` (Postgres `~*`, case-insensitive regex) pattern that
 * matches the chosen stream exactly, ignoring case and surrounding spaces.
 * Internal runs of spaces match any run of spaces.
 *
 * Returns null when nothing usable is left after cleaning — the caller must
 * then fall back to an exact match (never to "no filter").
 */
export function streamMatchPattern(stream: string): string | null {
  const cleaned = safeStreamText(stream);
  if (!cleaned) return null;
  const body = cleaned.split(/\s+/).join('[[:space:]]+');
  return `^[[:space:]]*${body}[[:space:]]*$`;
}

/**
 * Minimal structural type for the one builder method this helper needs, so it
 * works with any PostgREST filter builder without importing its generics.
 */
interface StreamFilterable<T> {
  filter(column: string, operator: string, value: unknown): T;
  eq(column: string, value: unknown): T;
}

/**
 * Apply the Stream filter to a bos_course_syllabi query. Server-side (not a
 * post-fetch filter) so DB pagination and `count: 'exact'` stay correct.
 */
export function applyStreamFilter<T extends StreamFilterable<T>>(q: T, stream: string): T {
  const pattern = streamMatchPattern(stream);
  return pattern ? q.filter('stream', 'imatch', pattern) : q.eq('stream', stream);
}

/** The key two stream spellings share when they are the same stream. */
export function streamKey(stream: string): string {
  return stream.trim().toLowerCase().split(/\s+/).join(' ');
}

/**
 * Count rows per stream with case/space variants folded into ONE entry, so a
 * facet shows one "Arts" rather than "Arts", "ARTS", "arts" and "Arts ".
 * The label shown is the most-used spelling in the group (first seen wins a
 * tie), trimmed. null/undefined keep their historical keys ("null" /
 * "undefined") so the "no stream" bucket is unchanged.
 */
export function groupStreamCounts(
  streams: ReadonlyArray<string | null | undefined>,
): Record<string, number> {
  const groups = new Map<string, { total: number; spellings: Map<string, number> }>();
  for (const raw of streams) {
    const isText = typeof raw === 'string';
    const key = isText ? streamKey(raw) : `\u0000${String(raw)}`;
    const spelling = isText ? raw.trim() : String(raw);
    let g = groups.get(key);
    if (!g) {
      g = { total: 0, spellings: new Map() };
      groups.set(key, g);
    }
    g.total += 1;
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
  }

  const out: Record<string, number> = {};
  for (const g of groups.values()) {
    let label = '';
    let best = -1;
    for (const [spelling, n] of g.spellings) {
      if (n > best) {
        best = n;
        label = spelling;
      }
    }
    out[label] = (out[label] ?? 0) + g.total;
  }
  return out;
}

/**
 * Save-time normalisation for a stream value coming from a form/body.
 * - undefined stays undefined (field not sent → column left as-is on update)
 * - null stays null
 * - text is trimmed; text that is only spaces becomes null
 * Nothing else about what users type is changed (a fixed pick-list is a
 * Director decision).
 */
export function normalizeStreamInput(
  value: string | null | undefined,
): string | null | undefined {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
