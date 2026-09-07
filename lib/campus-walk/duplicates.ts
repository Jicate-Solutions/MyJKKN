/**
 * Campus Walk — likely-duplicate detection (Director ruling, 2026-08-2x:
 * "flag likely duplicates instead of silently creating them").
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * lib/campus-walk/offline-queue.ts's reviveInterruptedUploads() documents the
 * trade-off this file exists to soften, not remove: on restart, any item the
 * pump left marked 'uploading' when the app was force-closed is put back to
 * 'pending' and retried, because the client has no way to know whether the
 * server actually received the first attempt. That retry is correct —
 * losing an observation is worse than a duplicate — but a second identical
 * task should never be created without a trace tying it back to the first.
 * This module is the "is this the same bytes, arriving moments apart?"
 * check the intake route (app/api/campus-walk/observations/route.ts, owned
 * by another agent right now) calls right before it creates a task, reusing
 * the exact sha256 that route already computes for the photo's
 * content-addressed storage path.
 *
 * ── WHY A CONTENT HASH, NOT FUZZY/TEXT MATCHING ─────────────────────────
 * lib/campus-walk/repeats.ts's own header locks Campus Walk's doctrine for
 * "is this the same PROBLEM as before": no fuzzy text similarity, no
 * photo-hash comparison, no auto-matching — only the Director, standing
 * there, taps "same as before". That ruling (D7) is about a human judgement
 * call: are these two tickets, filed possibly weeks apart, about the same
 * recurring issue? This module answers a narrower, purely mechanical
 * question instead: did these exact bytes arrive twice in the last few
 * minutes? The intake route strips EXIF and hashes every photo
 * (createHash('sha256').update(cleaned).digest('hex')) before it ever
 * touches storage, and identical cleaned bytes always produce an identical
 * hash and therefore an identical storage path. Two different photographs
 * of the same broken tap — even taken seconds apart by the same person —
 * compress to different bytes and never collide here. A hash match is not a
 * guess about "is this the same problem"; it is the same observation's
 * bytes literally arriving twice. That is why this module is allowed to
 * exist alongside D7's ban on heuristic matching: it detects
 * retransmission, never recurrence, and it never decides anything on its
 * own — see findLikelyDuplicate()'s contract below.
 *
 * ── PURE BY DESIGN ───────────────────────────────────────────────────────
 * No Supabase import, no `fetch`, no Next.js types. Everything the caller
 * might need — which tasks count as "recent", what their photo hashes are —
 * is passed in as plain data, so this is trivially unit-testable and so
 * neither off-limits owner (the intake route, campus-walk-service.ts) has
 * to be duplicated or forked to use it.
 *
 * ── HOW THE INTAKE ROUTE SHOULD CALL THIS ───────────────────────────────
 * app/api/campus-walk/observations/route.ts already computes, per uploaded
 * photo, `const sha256 = createHash('sha256').update(cleaned).digest('hex')`
 * and builds `storagePath = `${user.id}/${month}/${sha256}.jpg`` from it —
 * so the route does not need to thread a new field through `UploadedPhoto`
 * at all. For every successfully uploaded photo, recover that same hash
 * with `extractSha256FromStoragePath(photo.storagePath)`.
 *
 *   1. After the upload loop, once `uploaded` is non-empty and BEFORE
 *      calling `createWalkTask`:
 *
 *        const candidatePhotoHashes = uploaded
 *          .map((p) => extractSha256FromStoragePath(p.storagePath))
 *          .filter((h): h is string => h !== null);
 *
 *   2. Query the campus-walk lane for tasks created inside the recency
 *      window (a `project_tasks` select, `metadata->>source = 'campus-walk'`
 *      AND `created_at > new Date(Date.now() - DUPLICATE_RECENCY_WINDOW_MS)
 *      .toISOString()`), and for each candidate task pull its photo hashes
 *      — cheapest correct source is `project_task_attachments.storage_path`
 *      for that task_id (fall back to `metadata.photo_storage_path` alone if
 *      you want to skip the join and only catch a match on the PRIMARY
 *      photo, which is the common case since a resend reuses the same photo
 *      set in the same order). Build:
 *
 *        const recentLaneTasks: RecentLaneTaskPhoto[] = rows.map((t) => ({
 *          taskId: t.id,
 *          createdAt: t.created_at,
 *          photoHashes: t.attachments
 *            .map((a) => extractSha256FromStoragePath(a.storage_path))
 *            .filter((h): h is string => h !== null)
 *        }));
 *
 *   3. const result = findLikelyDuplicate({ candidatePhotoHashes, recentLaneTasks });
 *
 *   4. Per the ruling, NEVER skip `createWalkTask` because of this result —
 *      flagging is not deleting, and the task still needs to exist for the
 *      Director to see and dismiss. Instead, thread `result` into the
 *      response so the client can show it, e.g.:
 *
 *        duplicate: result.isLikelyDuplicate
 *          ? { isLikely: true, matchedTaskId: result.matchedTaskId, matchedAt: result.matchedAt }
 *          : null
 *
 *      `lib/campus-walk/offline-queue.ts` already parses exactly that
 *      `duplicate` shape off a successful response (see its `uploadItem()`)
 *      — that field name and shape are the contract; do not rename it
 *      without updating that file too. Optionally also stash
 *      `result.matchedTaskId` onto the NEW task's own metadata (e.g.
 *      `metadata.likely_duplicate_of_task_id`) so a reviewer opening the
 *      ticket later — not just the phone that filed it — can see the flag;
 *      that write lives in campus-walk-service.ts, which this agent does
 *      not own.
 *
 *   5. Client context: the offline queue marks a revived, force-closed
 *      upload with `retryAfterCrash: true` and sends it as a `retryAfterCrash`
 *      form field on the resend. That is informational only — it is NOT
 *      required or consulted by findLikelyDuplicate() below (a client can
 *      mis-report it, or the flag can legitimately fire for a citizen retry
 *      that was never a crash). Treat it as a hint for logs/analytics, not
 *      as a precondition for running the hash check — the hash+recency
 *      check is intentionally self-sufficient so it still catches a
 *      duplicate even if the client-side flag is ever wrong or missing.
 */

/** One photo already stored against a recent campus-walk lane task. */
export interface RecentLaneTaskPhoto {
  taskId: string;
  /**
   * The moment this task counts as "arrived", ISO-8601 — ordinarily
   * project_tasks.created_at. Recency is measured from this field.
   */
  createdAt: string;
  /**
   * sha256 hex digest of every photo attached to the task (primary first).
   * Derive with extractSha256FromStoragePath() below — this module never
   * touches storage paths itself, so a caller may source these hashes from
   * project_task_attachments, from metadata.photo_storage_path alone, or
   * from anywhere else that has them.
   */
  photoHashes: string[];
}

export interface DuplicateCheckInput {
  /**
   * sha256 hex digest(s) of the NEW observation's photo bytes, computed the
   * same way the intake route already computes them (post-EXIF-strip,
   * before the storage path is built). Pass every photo in the batch, not
   * just the primary — a retried multi-photo observation should still match
   * even if photo order shifted between attempts.
   */
  candidatePhotoHashes: string[];
  /**
   * Campus-walk lane tasks created within the recency window. The caller
   * decides how "the lane" and "recent" are queried (e.g.
   * `metadata->>source = 'campus-walk' AND created_at > now() - interval`);
   * this function only judges the rows it is handed and re-checks the
   * window itself against `now` so a caller's slightly-too-generous query
   * cannot widen the effective window.
   */
  recentLaneTasks: RecentLaneTaskPhoto[];
  /** Clock to measure recency against. Defaults to Date.now() — pass explicitly in tests. */
  now?: number;
}

export interface DuplicateCheckResult {
  /** True when a photo-identical task was found inside the recency window. */
  isLikelyDuplicate: boolean;
  /** The task this observation appears to re-send. Null when isLikelyDuplicate is false. */
  matchedTaskId: string | null;
  /** That matched task's createdAt, so a caller/UI can show "sent Xs ago" without a second lookup. */
  matchedAt: string | null;
  /** How long ago the matched task was created, in ms. Null when there is no match. */
  ageMs: number | null;
}

/**
 * How "moments ago" is interpreted, and why 15 minutes:
 *
 * The one real scenario this exists to catch is offline-queue.ts's
 * reviveInterruptedUploads() re-arming an item the pump had marked
 * 'uploading' right before a force-close. The pump also kicks itself
 * immediately on every mount (`scheduleNext(0)` in startPump()), so the
 * resend fires within seconds of the app being reopened — not minutes into
 * whatever he does next. 15 minutes comfortably covers "phone died or the
 * browser was killed, he noticed and reopened Campus Walk" while staying far
 * too short to catch two genuinely separate visits to the same spot: the
 * Director re-photographing the SAME unfixed tap on a later lap of the walk,
 * or a week later to escalate it, is a legitimate re-report and must never
 * be suppressed or even flagged as one. If real-world crash-to-reopen gaps
 * turn out to run longer than this, widen the window — but widening it is a
 * judgement call for whoever owns that data, not a default to guess at here.
 */
export const DUPLICATE_RECENCY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Pulls the sha256 hex digest back out of this bucket's content-addressed
 * path shape, `${profileId}/${yyyy-mm}/${sha256}.jpg` (see
 * app/api/campus-walk/observations/route.ts's `storagePath` construction).
 * Returns null for anything that doesn't end in a bare 64-hex-char filename
 * — a legacy, malformed, or hand-edited path fails to match rather than
 * throwing.
 */
const SHA256_FILENAME_RE = /([0-9a-f]{64})\.jpg$/i;

export function extractSha256FromStoragePath(storagePath: string): string | null {
  const match = SHA256_FILENAME_RE.exec(storagePath.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * The one function callers need. Given the new observation's photo hashes
 * and the campus-walk lane's recent tasks, decides whether this looks like a
 * re-send of one of them. Pure and side-effect free: it never mutates or
 * deletes anything and has no opinion beyond "flag it" — what happens next
 * (still create the task, attach the flag, let the Director dismiss it) is
 * entirely the caller's decision, per the ruling that flagging is not
 * deleting.
 */
export function findLikelyDuplicate(input: DuplicateCheckInput): DuplicateCheckResult {
  const now = input.now ?? Date.now();
  const NO_MATCH: DuplicateCheckResult = {
    isLikelyDuplicate: false,
    matchedTaskId: null,
    matchedAt: null,
    ageMs: null
  };

  const candidateHashes = new Set(
    input.candidatePhotoHashes.map((h) => h.trim().toLowerCase()).filter((h) => h.length > 0)
  );
  if (candidateHashes.size === 0) return NO_MATCH;

  let best: { taskId: string; createdAtMs: number; createdAt: string; ageMs: number } | null = null;

  for (const task of input.recentLaneTasks) {
    const createdAtMs = Date.parse(task.createdAt);
    if (!Number.isFinite(createdAtMs)) continue;

    const ageMs = now - createdAtMs;
    // Negative ageMs (a "created" timestamp in the future, e.g. clock skew
    // between caller and DB) is treated as out-of-window rather than
    // matched — this module only ever flags something that already exists.
    if (ageMs < 0 || ageMs > DUPLICATE_RECENCY_WINDOW_MS) continue;

    const hasMatch = task.photoHashes.some((h) => candidateHashes.has(h.trim().toLowerCase()));
    if (!hasMatch) continue;

    // If more than one recent task somehow shares a hash (e.g. two rapid
    // retries both slipped through), prefer the most recently created one —
    // that is the one "the one I just sent" most plausibly refers to.
    if (!best || createdAtMs > best.createdAtMs) {
      best = { taskId: task.taskId, createdAtMs, createdAt: task.createdAt, ageMs };
    }
  }

  if (!best) return NO_MATCH;

  return {
    isLikelyDuplicate: true,
    matchedTaskId: best.taskId,
    matchedAt: best.createdAt,
    ageMs: best.ageMs
  };
}
