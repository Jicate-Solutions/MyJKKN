/**
 * Campus Walk — offline capture queue.
 *
 * Spec: specs/campus-walk-2026-08-17.md — D11 ("capture offline, sync on
 * reconnect — the unreachable blocks are the neglected ones").
 *
 * ACCEPTANCE TEST THIS FILE EXISTS TO PASS:
 *   Airplane mode -> capture 3 photos -> force-close the browser -> reopen ->
 *   restore signal -> all 3 upload.
 *
 * A force-close is a process kill, not a navigation. Nothing held only in
 * React state (or even sessionStorage, which some engines also clear on a
 * kill) survives that. So EVERY queued observation — its photo bytes
 * included — is written to IndexedDB the moment it is queued, and nothing
 * about resuming after reopen depends on any in-memory history: the pump
 * below rebuilds its worklist by reading the database fresh on every start.
 *
 * Schema (`myjkkn-campus-walk`, store `observations`, keyPath `id`):
 *   Each record is a full QueueItem — form fields, geo, and up to 3 photos
 *   held as { name, type, data: ArrayBuffer }. Photo bytes are stored as
 *   ArrayBuffer rather than as a raw Blob: older WebKit had (has had) bugs
 *   persisting Blobs in IndexedDB, while ArrayBuffer via structured clone is
 *   universally supported. They are converted back to Blob only at the
 *   moment of upload (`new Blob([data], { type })` inside a FormData).
 *
 * Retry doctrine — lifted from card-scan-client.tsx (~163-330), the working
 * precedent: a single-flight pump processes the oldest due item, classifies
 * failures as terminal (auth, bad payload, unsupported file — stop retrying,
 * but NEVER delete the record so nothing is silently lost) or transient
 * (network blip, 5xx, 429 — exponential backoff, capped, retried forever).
 * A genuine offline attempt (airplane mode) always throws inside fetch()
 * and is always transient — that is the exact path the acceptance test
 * exercises.
 *
 * ── RULING 2 (Director): the client side of flag-likely-duplicates ───────
 * reviveInterruptedUploads() below documents a trade-off that stays exactly
 * as-is: an item still 'uploading' when the app was force-closed goes back
 * to 'pending' and retries, because the client cannot know whether the
 * server already received the first attempt. That retry is correct —
 * losing an observation is worse than an extra ticket — but the server
 * should be told it may be looking at a resend, not a fresh report:
 *
 *   - A revived item is marked `retryAfterCrash: true` on the QueueItem
 *     itself and sent as a `retryAfterCrash` form field on every upload
 *     attempt for that item from then on (lib/campus-walk/duplicates.ts's
 *     header, section 5, documents this exact contract from the server
 *     side). It is informational only for logs/analytics — the pure
 *     hash+recency matcher in duplicates.ts never reads it and never will,
 *     so a wrong or missing flag can never suppress the real check.
 *   - The intake route (app/api/campus-walk/observations/route.ts, owned by
 *     another agent — shipped in commit c6a4586a78, "flag likely duplicate
 *     observations instead of filing them twice") answers a successful
 *     upload with `possibleDuplicateOf: string | null`, the matched task's
 *     id or null. NOTE for whoever reads lib/campus-walk/duplicates.ts's own
 *     header next: that file's section 4 sketches a richer
 *     `duplicate: { isLikely, matchedTaskId, matchedAt }` shape, but the
 *     route that actually shipped uses the flatter `possibleDuplicateOf`
 *     field instead — this file follows the REAL response, confirmed by
 *     reading app/api/campus-walk/observations/route.ts directly, not the
 *     doc comment. uploadItem() parses `possibleDuplicateOf` and pumpOnce()
 *     carries it onto the finished QueueItem as `duplicate`, so the queue
 *     view can show "this looks like the one you just sent". Flagging is
 *     never deleting: the task the server created stays created either way;
 *     dismissDuplicateFlag() below only clears the on-screen notice.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type WalkKind = 'symptom' | 'system_gap';

export interface QueuedGeo {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface QueuedPhoto {
  name: string;
  type: string;
  data: ArrayBuffer;
}

export type QueueItemStatus = 'pending' | 'uploading' | 'done' | 'error';

/** What the server told us about a finished upload possibly re-sending an
 *  existing task. Set on the QueueItem only when the server flagged one —
 *  see uploadItem()'s parsing of the `possibleDuplicateOf` response field. */
export interface DuplicateFlag {
  matchedTaskId: string;
}

/**
 * D6 — what the server said about the immediate phone alert for an observation
 * marked UNSAFE. Set on the QueueItem ONLY when nothing reached a phone; a
 * delivered alert needs no notice, and a successful one shown as a banner
 * would train him to scroll past the failed ones.
 *
 * The capture screen tells him, before the unsafe toggle turns on, that
 * marking a condition unsafe sends "an immediate phone alert". This is the
 * field that keeps that sentence honest when it did not happen — he is
 * standing at the hazard and is the only person in a position to go and tell
 * somebody by other means.
 */
export interface UrgentAlertFailure {
  /** Short, plain reason the server reported. Safe to show as-is. */
  reason: string;
}

export interface QueueItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  description: string;
  kind: WalkKind;
  isUnsafe: boolean;
  category: string;
  blocker: string;
  geo: QueuedGeo | null;
  photoCount: number;
  photos: QueuedPhoto[];
  status: QueueItemStatus;
  attempts: number;
  lastError: string | null;
  /** Set once a failure is classified non-retryable. The record stays in the
   *  queue either way — only an explicit user "Discard" removes it. */
  terminal: boolean;
  nextAttemptAt: number;
  /** Ruling 2 — set true the moment reviveInterruptedUploads() puts a
   *  force-closed 'uploading' item back to 'pending'. Sent to the server as
   *  the `retryAfterCrash` form field on every subsequent attempt; never
   *  cleared once true, since the historical fact that this item survived a
   *  crash stays true regardless of how the retry eventually resolves. */
  retryAfterCrash: boolean;
  /** Ruling 2 — set from the server's response once this item finishes
   *  uploading and the server flags it as a likely resend. Null when there
   *  is nothing to show. Cleared only by dismissDuplicateFlag() below. */
  duplicate: DuplicateFlag | null;
  /** D6 — set from the server's response when this item was marked unsafe and
   *  the immediate phone alert reached NOBODY. Null in every other case,
   *  including a delivered alert and any observation that was not unsafe.
   *  Optional on the type because records written before this field existed
   *  are still in IndexedDB and read back without it. */
  urgentAlertFailure?: UrgentAlertFailure | null;
}

export interface NewObservationInput {
  title: string;
  description: string;
  kind: WalkKind;
  isUnsafe: boolean;
  category: string;
  blocker: string;
  geo: QueuedGeo | null;
  photos: File[];
}

// ── IndexedDB plumbing ──────────────────────────────────────────────────

const DB_NAME = 'myjkkn-campus-walk';
const DB_VERSION = 1;
const STORE = 'observations';
const ENDPOINT = '/api/campus-walk/observations';
const MAX_BACKOFF_MS = 30_000;
const DONE_RETENTION_MS = 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Could not open the offline queue database.'));
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  const store = db.transaction(STORE, mode).objectStore(STORE);
  return reqToPromise(fn(store));
}

async function putItem(item: QueueItem): Promise<void> {
  await withStore('readwrite', (store) => store.put(item));
}

async function deleteItem(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

async function getItem(id: string): Promise<QueueItem | undefined> {
  return withStore('readonly', (store) => store.get(id));
}

async function getAllItems(): Promise<QueueItem[]> {
  const items = await withStore<QueueItem[]>('readonly', (store) => store.getAll());
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Public read/write API ──────────────────────────────────────────────

/**
 * Persists a new observation to IndexedDB immediately, photo bytes included.
 * By the time this resolves the observation can survive a force-close —
 * uploading is entirely the background pump's job from here.
 */
export async function enqueueObservation(input: NewObservationInput): Promise<QueueItem> {
  const photos: QueuedPhoto[] = [];
  for (const file of input.photos.slice(0, 3)) {
    const data = await file.arrayBuffer();
    photos.push({ name: file.name || 'observation.jpg', type: file.type || 'image/jpeg', data });
  }
  const now = Date.now();
  const item: QueueItem = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    title: input.title,
    description: input.description,
    kind: input.kind,
    isUnsafe: input.isUnsafe,
    category: input.category,
    blocker: input.blocker,
    geo: input.geo,
    photoCount: photos.length,
    photos,
    status: 'pending',
    attempts: 0,
    lastError: null,
    terminal: false,
    nextAttemptAt: now,
    retryAfterCrash: false,
    duplicate: null,
    urgentAlertFailure: null
  };
  await putItem(item);
  notify();
  kick();
  return item;
}

export async function listQueue(): Promise<QueueItem[]> {
  return getAllItems();
}

/** Manually re-arms a failed (including terminal) item for another attempt. */
export async function retryItem(id: string): Promise<void> {
  const item = await getItem(id);
  if (!item) return;
  item.status = 'pending';
  item.terminal = false;
  item.lastError = null;
  item.nextAttemptAt = Date.now();
  item.updatedAt = Date.now();
  await putItem(item);
  notify();
  kick();
}

/** The only way a queued observation is ever removed before a successful upload. */
export async function discardItem(id: string): Promise<void> {
  await deleteItem(id);
  notify();
}

/**
 * Ruling 2 — the "one-tap discard" on a duplicate notice. This clears the
 * notice only; the observation was already sent and the task the server
 * created stays exactly as it is. Flagging is not deleting, and the
 * Director — not this tap — decides what happens to the ticket itself. A
 * missing item is a harmless no-op (already gone, e.g. pruned after a day).
 */
export async function dismissDuplicateFlag(id: string): Promise<void> {
  const item = await getItem(id);
  if (!item || !item.duplicate) return;
  item.duplicate = null;
  item.updatedAt = Date.now();
  await putItem(item);
  notify();
}

/** Drops queue entries that finished successfully more than a day ago, so the
 *  database does not grow forever with sent-history. Run opportunistically. */
async function pruneOldDone(): Promise<void> {
  const items = await getAllItems();
  const cutoff = Date.now() - DONE_RETENTION_MS;
  for (const item of items) {
    if (item.status === 'done' && item.updatedAt < cutoff) {
      await deleteItem(item.id);
    }
  }
}

/**
 * A force-close can land mid-upload — the record was already flipped to
 * 'uploading' and persisted before the kill, but the fetch never resolved
 * either way. Left alone that record would sit forever, excluded from the
 * pump's "next" pick. On every pump start, any item still marked
 * 'uploading' from a previous run is put back to 'pending' so it is tried
 * again. Trade-off, stated plainly: if the server actually received that
 * earlier attempt, retrying can create a duplicate task. That is judged
 * better than the alternative (silently losing the observation), and is
 * the same trade-off the acceptance test's "force-close mid-flight" case
 * forces on any offline queue with no server-side idempotency key.
 *
 * Ruling 2: this is also the one and only place `retryAfterCrash` is ever
 * set. It tells the server "this exact item survived a force-close", so the
 * likely-duplicate check has real context instead of guessing from the
 * retry alone — the retry itself is unaffected by this flag either way.
 */
async function reviveInterruptedUploads(): Promise<void> {
  const items = await getAllItems();
  const now = Date.now();
  for (const item of items) {
    if (item.status === 'uploading') {
      item.status = 'pending';
      item.nextAttemptAt = now;
      item.updatedAt = now;
      item.retryAfterCrash = true;
      await putItem(item);
    }
  }
}

// ── Subscriptions (so the UI re-renders without polling IndexedDB) ────────

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  for (const l of listeners) l();
}

/** Subscribe to any queue mutation (enqueue, status change, retry, discard). */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Upload + terminal-vs-transient classification ─────────────────────────

interface UploadOutcome {
  ok: boolean;
  terminal: boolean;
  message: string | null;
  /** Ruling 2 — only ever populated on an `ok` outcome; null otherwise. */
  duplicate: DuplicateFlag | null;
  /**
   * D6 — only ever populated on an `ok` outcome, and only when the server
   * reported that an unsafe observation's phone alert reached nobody.
   * Optional so the many failure returns below, where it is meaningless, stay
   * untouched.
   */
  urgentAlertFailure?: UrgentAlertFailure | null;
}

/**
 * Ruling 2 — parses the intake route's actual `possibleDuplicateOf` response
 * field (app/api/campus-walk/observations/route.ts, confirmed by reading
 * that route directly — see this file's header for why that is NOT the
 * shape lib/campus-walk/duplicates.ts's own comments sketch). Deliberately
 * strict: anything that isn't a non-empty string is treated as "no flag"
 * rather than guessed at, since a wrongly-surfaced duplicate notice would
 * train him to distrust it.
 */
function parseDuplicateFlag(json: any): DuplicateFlag | null {
  const matchedTaskId = json?.possibleDuplicateOf;
  if (typeof matchedTaskId !== 'string' || matchedTaskId.length === 0) return null;
  return { matchedTaskId };
}

/**
 * D6 — reads the intake route's `urgentAlert` response field
 * ({ delivered, usedFallback, failureReason }), which is present only for an
 * observation marked unsafe and null otherwise.
 *
 * Returns a flag ONLY when nothing was delivered. Note the asymmetry with
 * parseDuplicateFlag above: that one is strict because a wrongly-shown
 * duplicate notice erodes trust, whereas here a MISSED notice is the dangerous
 * direction. So a malformed or absent `failureReason` on a `delivered: 0`
 * response still raises the flag, with a generic reason, rather than being
 * discarded — the one thing this must never do is stay quiet when no phone
 * rang. An `urgentAlert` that is absent entirely (an observation that was not
 * unsafe, or an older server) yields null, which is correct: there was no
 * alert to miss.
 */
function parseUrgentAlertFailure(json: any): UrgentAlertFailure | null {
  const alert = json?.urgentAlert;
  if (!alert || typeof alert !== 'object') return null;
  if (Number(alert.delivered) > 0) return null;
  const reason =
    typeof alert.failureReason === 'string' && alert.failureReason.trim().length > 0
      ? alert.failureReason.trim()
      : 'the phone alert could not be delivered';
  return { reason };
}

async function uploadItem(item: QueueItem): Promise<UploadOutcome> {
  const form = new FormData();
  form.append('title', item.title);
  form.append('description', item.description);
  form.append('kind', item.kind);
  form.append('isUnsafe', String(item.isUnsafe));
  form.append('category', item.category);
  form.append('blocker', item.blocker);
  // Ruling 2 — informational context for the server's duplicate check; see
  // this file's header for why it is sent unconditionally (always a
  // well-formed 'true'/'false' string) rather than only when true.
  form.append('retryAfterCrash', String(item.retryAfterCrash));
  if (item.geo) form.append('geo', JSON.stringify(item.geo));
  item.photos.forEach((p, i) => {
    form.append('photos', new Blob([p.data], { type: p.type }), p.name || `photo-${i + 1}.jpg`);
  });

  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: 'POST', body: form });
  } catch {
    // The exact path airplane mode produces. Always transient — this is the
    // failure the whole module exists to survive.
    return { ok: false, terminal: false, message: 'No connection — will retry automatically.', duplicate: null };
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  // Defect-1 fix — checked BEFORE the generic success/status classification
  // below, because this is a distinct outcome, not a variant of either
  // "delivered" or "rejected". The intake route answers this way when the
  // photo(s) are already durably saved in storage but the routing step
  // (createWalkTask) could not create a task — e.g. app/api/campus-walk/
  // observations/route.ts's `outcome: 'stored_unrouted'` response, status
  // 207. Read the discriminator off the BODY, not `res.status`: the status
  // code is informative only here, and pinning this check to one specific
  // number would silently stop working if the route's status ever changes
  // while the body contract does not.
  //
  // This must never be classified `ok` — that was the actual bug (see this
  // file's header): a routing failure buried inside an otherwise-normal
  // `{ success: true }` body was read as "delivered" and the record,
  // including its photo bytes, was deleted. It is also deliberately NOT
  // treated as a transient blip to silently hammer forever: `terminal: true`
  // stops the automatic pump (pumpOnce() below sets status 'error') but —
  // exactly like every other terminal classification in this file — the
  // record itself is never deleted, only an explicit "Discard" tap removes
  // it. He can see it in the queue with an honest message and tap Retry once
  // it is expected to route (matches the queue's existing terminal-failure
  // UI: AlertTriangle + Retry/Discard, rendered by the campus-walk screen
  // off `item.lastError`/`item.status` — this file adds no new UI, only an
  // honest message for the UI that already exists).
  if (json?.outcome === 'stored_unrouted') {
    return {
      ok: false,
      terminal: true,
      message:
        json?.error ??
        'Photo saved. Ticket NOT created — tap Retry once routing is expected to work.',
      duplicate: null,
    };
  }

  // Contract: { success: true, ... } | { success: false, error }. Tolerant of
  // extra/renamed fields either side adds later — only `success`/`error` are load-bearing.
  if (res.ok && json && json.success !== false) {
    return {
      ok: true,
      terminal: false,
      message: null,
      duplicate: parseDuplicateFlag(json),
      urgentAlertFailure: parseUrgentAlertFailure(json),
    };
  }

  const serverMessage: string | undefined = json?.error;

  // Same doctrine as card-scan-client.tsx: a closed door must not retry
  // forever; a blip on the network or the server always must.
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      terminal: true,
      message: serverMessage ?? 'Not signed in — sign in again, then retry this one.',
      duplicate: null
    };
  }
  if (res.status === 413) {
    return {
      ok: false,
      terminal: true,
      message: serverMessage ?? 'Too large for the server to accept.',
      duplicate: null
    };
  }
  if (res.status === 415) {
    return { ok: false, terminal: true, message: serverMessage ?? 'Photo format not accepted.', duplicate: null };
  }
  if (res.status === 400 || res.status === 422) {
    // 422 also covers the Defect-2 case: every photo in the batch was a
    // genuine content rejection (not a JPEG, too small/large, or could not
    // be cleaned of metadata) — see the 503 branch below for why that is
    // deliberately kept separate from a storage/infrastructure failure.
    return {
      ok: false,
      terminal: true,
      message: serverMessage ?? 'The server rejected this observation.',
      duplicate: null
    };
  }
  if (res.status === 429) {
    return { ok: false, terminal: false, message: serverMessage ?? 'Busy — will retry shortly.', duplicate: null };
  }
  // Defect-2 fix: 422 (handled by the 400/422 branch above) and 503 (below)
  // replace what a single 502 used to mean for this route. 502 used to be
  // overloaded with two different meanings from app/api/campus-walk/
  // observations/route.ts: "every photo in the batch failed its own
  // validation" (not a JPEG, too small/large — retrying is pointless) AND
  // "the storage upload itself failed" (e.g. the private `campus-walk`
  // bucket does not exist yet on a fresh deploy — retrying is exactly the
  // right thing to do, since the identical bytes can succeed once storage
  // recovers). Treating 502 as terminal made both cases stop retrying, so a
  // missing bucket on a fresh deploy permanently discarded every queued
  // observation instead of recovering once the bucket was created.
  //
  // The route now answers a genuine "every photo rejected" batch with 422
  // (a real client error — retrying the same bytes can never help, so it
  // stays terminal via the branch above) and a genuine storage/
  // infrastructure failure with 503 below (retryable). A bare 502 reaching
  // here now — e.g. a real upstream Bad Gateway from infra in front of this
  // route, not from the route's own logic — is intentionally left
  // unhandled by name and falls through to the generic 5xx case at the
  // bottom of this function, which treats an unrecognised 5xx as transient.
  // That is the correct default: assuming permanent failure on an
  // unfamiliar status code risks silently discarding an observation, and a
  // genuinely permanent one will keep coming back and stay visible in the
  // queue either way.
  if (res.status === 503) {
    return {
      ok: false,
      terminal: false,
      message: serverMessage ?? 'Storage is temporarily unavailable — will retry automatically.',
      duplicate: null
    };
  }
  // Every other 5xx and anything unrecognised: assume transient. Losing a photo silently
  // because of an unfamiliar status code is worse than retrying one that
  // turns out to be permanent — a permanent one will keep coming back and be
  // visible to him in the queue either way.
  return {
    ok: false,
    terminal: false,
    message: serverMessage ?? `Upload failed (HTTP ${res.status}) — will retry.`,
    duplicate: null
  };
}

// ── The pump ────────────────────────────────────────────────────────────

let pumpTimer: ReturnType<typeof setTimeout> | null = null;
let pumpRunning = false;
// True single-flight guard. `kick()` (fired from enqueue/retry/'online') can
// otherwise schedule a second loop() while the first is still awaiting a
// fetch — without this, two overlapping pumpOnce() calls could both read the
// same 'pending' item before either has written 'uploading' back, and send
// it twice. This makes "processes the oldest due item, one at a time" true
// regardless of how many times the pump gets kicked while busy.
let pumpBusy = false;

function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.min(attempts, 5), MAX_BACKOFF_MS);
}

/** Returns true if an item was actually processed, so the caller can drain a
 *  multi-item queue back-to-back instead of waiting out the full idle poll
 *  interval between every single item. */
async function pumpOnce(): Promise<boolean> {
  if (pumpBusy) return false;
  pumpBusy = true;
  try {
    const items = await getAllItems();
    const now = Date.now();
    const next = items.find(
      (i) => i.status !== 'done' && !i.terminal && i.status !== 'uploading' && i.nextAttemptAt <= now
    );
    if (!next) return false;

    next.status = 'uploading';
    next.updatedAt = Date.now();
    await putItem(next);
    notify();

    const outcome = await uploadItem(next);

    if (outcome.ok) {
      next.status = 'done';
      next.lastError = null;
      next.updatedAt = Date.now();
      // The server has the bytes now — free them. The record stays (briefly,
      // pruned after a day) purely so the UI can keep showing "Sent".
      next.photos = [];
      // Ruling 2 — surfaced in the queue view as a dismissible notice; see
      // dismissDuplicateFlag(). Null clears any stale flag from an earlier
      // attempt of this same item that the server did NOT flag this time.
      next.duplicate = outcome.duplicate;
      // D6 — kept on the record rather than shown once and lost, because it is
      // an instruction to go and do something, not a transient toast. Same
      // clear-on-reattempt rule as `duplicate` above: a later successful
      // attempt of this same item overwrites a stale failure with null.
      next.urgentAlertFailure = outcome.urgentAlertFailure ?? null;
      await putItem(next);
    } else {
      next.attempts += 1;
      next.lastError = outcome.message;
      next.terminal = outcome.terminal;
      next.status = outcome.terminal ? 'error' : 'pending';
      next.nextAttemptAt = Date.now() + backoffMs(next.attempts);
      next.updatedAt = Date.now();
      await putItem(next);
    }
    notify();
    return true;
  } finally {
    pumpBusy = false;
  }
}

function scheduleNext(delay: number) {
  if (pumpTimer) clearTimeout(pumpTimer);
  pumpTimer = setTimeout(() => void loop(), delay);
}

async function loop(): Promise<void> {
  if (!pumpRunning) return;
  let processed = false;
  try {
    processed = await pumpOnce();
  } catch {
    // A pump-internal failure (e.g. IndexedDB transiently unavailable) must
    // never kill the loop — the entire point of this module is that it keeps
    // trying rather than giving up silently.
  }
  if (!pumpRunning) return;
  // Just sent (or failed) one item and there may be more waiting — e.g. all
  // 3 photos from the acceptance test queued while offline, now that signal
  // is back. Drain them back-to-back rather than idling out the full poll
  // interval between every single one.
  scheduleNext(processed ? 150 : 1500);
}

/** Wakes the pump immediately rather than waiting out the poll tick or a
 *  backoff window — used right after enqueue/retry and when 'online' fires. */
function kick() {
  if (!pumpRunning) return;
  scheduleNext(50);
}

/**
 * Starts the background upload pump. Safe to call on every mount of the
 * Campus Walk screen (and it is idempotent to call more than once): it reads
 * whatever is in IndexedDB rather than any in-memory history, so a queue
 * built before a force-close — including an item caught mid-upload — resumes
 * exactly where it left off. Returns a stop function for unmount.
 */
export function startPump(): () => void {
  pumpRunning = true;
  void reviveInterruptedUploads().then(() => {
    void pruneOldDone();
    notify();
  });
  scheduleNext(0);

  const onOnline = () => kick();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
  }

  return () => {
    pumpRunning = false;
    if (pumpTimer) {
      clearTimeout(pumpTimer);
      pumpTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
    }
  };
}
