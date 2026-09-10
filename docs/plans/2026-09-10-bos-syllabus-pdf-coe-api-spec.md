# BoS Learning Pathway PDF for COE — Technical Specification

**Scope:** Expose the `/bos/syllabus` learning pathway PDF (one endpoint, all institutions, all academic models) so the COE application can fetch a course's document by **course code / COE course id** and show or download it.
**Deliverable type:** Specification + Phase 1 implementation (MyJKKN side).
**Date:** 2026-09-10
**Consumers:** JKKN_COE (`services/myjkkn-service.ts`), later any first-party app holding a MyJKKN API key.
**Status:** Phase 1 (option A) implemented on the MyJKKN side — see §8. COE side (§5) not yet built.

Terminology note: this document says "learning pathway" for the BoS course document stored in `bos_course_syllabi` and edited at `/bos/syllabus`. Route paths, identifiers and header names keep the existing spelling.

---

## 0. Recommendation — which one first

| Option | What it is | Verdict |
|---|---|---|
| **A. API-key endpoint (server-to-server)** | COE calls MyJKKN with the `MYJKKN_API_KEY` it already holds, MyJKKN streams back `application/pdf`. COE proxies it to its own browser users. | **Build this first.** Zero new secrets, zero new auth code (`authenticateApiKey` + `academic` module already exist), COE already uses this exact pattern for institutions/programs/learners. Key never reaches a browser. |
| **B. Signed PDF URL (browser-openable link)** | MyJKKN returns a time-limited HMAC-signed URL; anyone with the link opens the PDF directly, no header. | **Phase 2, only if needed.** Useful for learner-facing links, email, WhatsApp. Costs a shared HMAC secret on both sides, expiry handling and a public route. Can be layered on A later (the JSON endpoint in A already reserves a `pdf_url` field for it). |

Why not B first: the pre-existing export route returns **HTML, not PDF** and PDF rendering needs headless Chromium (already solved for BoS minutes). That rendering work is the real cost and is identical for A and B. A finishes with one route + one COE proxy; B additionally needs signing, secret rotation and a public unauthenticated surface.

---

## 1. Current state before this work

### 1.1 Pieces reused

| Piece | Location | Note |
|---|---|---|
| Learning pathway export (HTML) | `app/api/bos/syllabus/[id]/export-pdf/route.ts` | Session-auth only. Returns `text/html`, formats `official \| meeting_summary \| obe \| v35`. Dispatches pharmacy layout by `academic_model`. |
| Format generators | `generatePdfHtml()` (was file-local), `generateV35SyllabusHtml()` in `lib/utils/bos/course-syllabus-html.ts`, `generatePharmacyFormat()` in `lib/utils/bos/pharmacy-syllabus-html.ts` | All pure `row → html string`. |
| Live course code/name | `lib/utils/bos/coe-course-display.ts` `courseDisplayFor()` | Resolves current COE code/name by stable `course_id`, 10-min cache. |
| HTML → PDF (Chromium) | `lib/utils/bos/meeting-minutes-html-pdf.ts`, `lib/pdf/bos-meeting-notice.ts` | `puppeteer-core` + `@sparticuz/chromium` on Vercel, lazy `puppeteer` locally. **Never static-import full `puppeteer`**. |
| API-key auth | `lib/api-keys/authenticate.ts` `authenticateApiKey(request, { requiredModule })` | Bearer token, SHA-256 lookup in `api_keys`, module list check, service-role client. Keys are currently **super keys** (`institutionId: null`). |
| Rate limit / audit / CORS | `lib/api-keys/rate-limiter.ts`, `audit-logger.ts`, `cors.ts` | Used by the `api-management/*` routes. |
| Route pattern | `app/api/api-management/academic/regulations/route.ts` | `force-dynamic`, `await connection()`, OPTIONS handler, `corsHeaders`. |
| COE client | `JKKN_COE/services/myjkkn-service.ts` | `fetchFromMyJKKN(path)` → `${MYJKKN_API_URL}/api-management/...` with `Authorization: Bearer ${MYJKKN_API_KEY}`. |

### 1.2 Gaps that were closed

1. **No PDF bytes.** `export-pdf` emits HTML. → `lib/pdf/syllabus-pdf.ts` renders A4 PDF with the shared Chromium launcher contract.
2. **No API-key surface for BoS learning pathways.** → three routes under `app/api/api-management/academic/syllabus/`.
3. **Course code is not a unique key** (CAS Self vs Aided, R-2021 vs R-2026, versions). → `course_id` preferred; `course_code` requires `institution_id`; 409 with candidates when still ambiguous.
4. `generatePdfHtml` was file-local. → lifted verbatim to `lib/utils/bos/syllabus-pdf-html.ts`; the session route now imports it (output byte-identical).

---

## 2. Data model (no schema change)

`bos_course_syllabi` already carries everything needed:

| Column | Role in lookup |
|---|---|
| `course_id` (uuid, nullable) | **Preferred key.** Stable COE `courses.id`. Immutable, CAS-safe, rename-safe. |
| `course_code` (text) | Fallback key. Snapshot; COE may rename. Matched case-insensitively. |
| `institutions_id` (uuid) | MyJKKN institution. Required when looking up by code. |
| `regulation_id` (uuid, nullable) | Optional filter. |
| `academic_model` | Drives layout: `anna_univ \| mgr_ahs \| mgr_pharmd \| pci_pharm \| inc_nursing \| mgr_bds`. |
| `version_number`, `is_latest`, `is_archived` | Serve `is_latest = true AND is_archived = false` unless `version` / `include_archived` are given. |
| `last_modified_at` | ETag component. |

**Phase 2 only:** `bos_syllabus_pdf_cache(syllabus_id, version_number, format, storage_url, source_hash, rendered_at)` if on-demand render cost becomes a problem.

---

## 3. API contract (Phase 1 — implemented)

Module `academic` (existing COE keys already carry it — **verify in `/system/api-management` before go-live**; no `VALID_MODULES` change). Common: `Authorization: Bearer <key>`, CORS, per-key sliding-window rate limit (60/min, `429` + `Retry-After`), audit row in `api_key_usage_logs`, error body `{ error: { code, message, ...extra } }`.

Error codes: `UNAUTHORIZED`, `FORBIDDEN` (from auth), `VALIDATION` 400, `NOT_FOUND` 404, `AMBIGUOUS` 409, `UNSUPPORTED_FORMAT` 422, `RATE_LIMITED` 429, `RENDERER_UNAVAILABLE` 503, `INTERNAL` 500.

### 3.1 `GET /api/api-management/academic/syllabus` — resolve + metadata

| Param | Type | Notes |
|---|---|---|
| `course_id` | uuid | COE course id. **Preferred.** |
| `course_code` | string | Case-insensitive exact match. Requires `institution_id`. |
| `institution_id` | uuid | MyJKKN institution UUID. Required with `course_code`; optional filter with `course_id`. |
| `regulation_id` | uuid | Optional. |
| `version` | int ≥ 1 | Optional. Default: latest non-archived. |
| `include_archived` | `true` | Default false. |

Response `200`:

```json
{
  "data": [{
    "id": "…row uuid…", "course_id": "…coe course uuid…",
    "course_code": "24UCADSE12", "course_name": "Data Structures",
    "institution_id": "…", "board_id": "…", "regulation_id": "…",
    "academic_model": "anna_univ", "stream": "Engineering", "course_credits": 4,
    "version_number": 3, "is_latest": true, "is_archived": false,
    "last_modified_at": "2026-08-30T10:11:12Z",
    "formats": ["official", "meeting_summary", "obe", "v35"],
    "pdf_path": "/api/api-management/academic/syllabus/{id}/pdf?format=official",
    "pdf_url": null
  }],
  "count": 1
}
```

- `formats` is model-aware: pharmacy/AHS models expose only `["official"]`; `v35` is listed only when any of the five Fink's/Capstone JSONB columns is non-null.
- `pdf_url` stays `null` in Phase 1; Phase 2 fills it with a signed absolute URL.
- Rows sorted `is_latest desc, last_modified_at desc`.

### 3.2 `GET /api/api-management/academic/syllabus/{id}/pdf` — the bytes

| Param | Values | Default |
|---|---|---|
| `format` | `official \| v35 \| obe \| meeting_summary` | `official` |
| `include_mappings`, `include_references`, `include_pedagogy` | bool | `true` |
| `disposition` | `inline \| attachment` | `inline` |
| `include_archived` | `true` | false |

Response `200`: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<course_code>-syllabus-<format>-v<version>.pdf"`, `ETag: "<id>:<version>:<format>:<last_modified_at>"`, `Cache-Control: private, max-age=3600`, `X-Syllabus-Id`, `X-Syllabus-Version`, `X-Academic-Model`. `If-None-Match` match → `304` with no Chromium launch.

### 3.3 `GET /api/api-management/academic/syllabus/pdf` — one-shot convenience

3.1's lookup params **plus** 3.2's PDF flags. Exactly one match → PDF. More than one → `409 AMBIGUOUS` with `candidates: [{ id, regulation_id, institution_id, version_number, last_modified_at }]`. This is the call COE will use most:

```
GET /api/api-management/academic/syllabus/pdf?course_id=<coe-course-uuid>
GET /api/api-management/academic/syllabus/pdf?course_code=24UCADSE12&institution_id=<uuid>
```

### 3.4 Institution scoping

Keys are super keys today. If a per-institution key is ever issued, `keyMayRead()` filters rows to `institutions_id === key.institutionId`. CAS sibling expansion is **not** applied: the caller names the exact MyJKKN institution, and `course_id` is already institution-specific on the COE side.

---

## 4. Server design (MyJKKN) — as built

| File | Purpose |
|---|---|
| `lib/utils/bos/syllabus-pdf-html.ts` | `generatePdfHtml` lifted verbatim (identifier renamed `doc`, title prefix hoisted to a const — output unchanged). Adds `SyllabusPdfFormat`, `supportedFormats()`, `buildSyllabusHtml()` (`forPrint` injects `pdfFontFaceCss()`). |
| `lib/pdf/syllabus-pdf.ts` | `renderSyllabusPdf(html)` → A4 Buffer. Same launcher contract as the notice/minutes PDFs. Throws `SyllabusRendererUnavailableError` → 503. |
| `lib/services/bos/syllabus-lookup.ts` | `parseSyllabusLookupQuery`, `findSyllabi`, `findSyllabusById`, `keyMayRead`, `toSyllabusApiMeta`, `syllabusEtag`, `syllabusPdfFilename`. Pure helpers unit-tested. |
| `lib/services/bos/syllabus-api.ts` | `authorizeSyllabusApi` (key + rate limit), `auditSyllabusApi`, `parsePdfOptions`, `respondWithSyllabusPdf` (422 / 304 / live COE name / v35 institution name / 503). |
| `app/api/api-management/academic/syllabus/route.ts` | 3.1 |
| `app/api/api-management/academic/syllabus/pdf/route.ts` | 3.3 (`maxDuration = 60`) |
| `app/api/api-management/academic/syllabus/[id]/pdf/route.ts` | 3.2 (`maxDuration = 60`) |
| `app/api/bos/syllabus/[id]/export-pdf/route.ts` | unchanged contract; now imports the lifted builder |
| `__tests__/lib/bos/syllabus-lookup.test.ts` | 13 tests: query validation, format matrix, key scoping, ETag, filename |

Implementation notes:
- Terminology gate: API error copy uses the JKKN term ("learning pathway"); route paths, params, header names and JSON keys keep the existing spelling (path/identifier contexts are exempt).
- In this tsconfig `!result.ok` does not narrow a discriminated union; the routes use `'message' in parsed` / `'response' in auth`.

---

## 5. COE side (not yet built)

1. `services/myjkkn-service.ts` — add:
   ```ts
   export async function fetchCourseSyllabusMeta(courseId: string)          // GET …/academic/syllabus?course_id=
   export async function fetchCourseSyllabusPdf(courseId: string, format = 'official'): Promise<{ bytes: ArrayBuffer; filename: string; etag: string }>
   ```
   Reuse `fetchFromMyJKKN`'s base URL/key; for the PDF call use `fetch` directly (binary), forward `If-None-Match`.
2. Proxy route `app/api/courses/[id]/syllabus-pdf/route.ts` — COE session auth, then streams the MyJKKN response with `Content-Type`, `Content-Disposition`, `ETag`. The MyJKKN key never leaves the COE server.
3. UI: a **Learning Pathway** button on the COE course detail / question-paper / IA screens → `window.open('/api/courses/<id>/syllabus-pdf')`. Show "not published in MyJKKN" on `404`, "PDF service busy, retry" on `503`, and on `409` pick a candidate (or pass `regulation_id`).
4. Env: `MYJKKN_API_URL`, `MYJKKN_API_KEY` already exist. Confirm the key's `permissions.read` includes `academic`.

---

## 6. Phase 2 — signed URL (Option B), only if a browser-direct link is required

- `GET /api/public/academic/syllabus/{id}/pdf?format=&exp=<unix>&sig=<hmac-sha256(id|format|exp, SYLLABUS_PDF_SIGNING_SECRET)>`
- 3.1's `pdf_url` becomes `${NEXT_PUBLIC_APP_URL}/api/public/…` with `exp = now + 1h`.
- Same renderer, no key lookup, constant-time `sig` compare, `Cache-Control: public, s-maxage=3600`.
- New env on MyJKKN only (`SYLLABUS_PDF_SIGNING_SECRET`); COE never signs.

---

## 7. Non-functional

| Concern | Decision |
|---|---|
| Latency | Cold Chromium 3–5 s, warm ~1 s. Browser is launched per request (simple, no leaked handles); COE proxy timeout ≥ 30 s. |
| Caching | ETag on `id:version:format:last_modified_at`; 304 path avoids render. Persisted PDF cache deferred to Phase 2. |
| Rate limit | Existing per-key 60/min limiter, one unit per call (PDF weighting not implemented). |
| Security | Service-role read gated only by the API key (as every `api-management` route). No write paths. Every hit audited. |
| Failure modes | Renderer down → `503`, never HTML fallback to an API caller. Unknown `academic_model` → treated as `anna_univ`. |

---

## 8. Verification done (2026-09-10)

- Scoped `tsc --noEmit` (touched files + transitive imports) clean. Full-project tsc OOMs on the dev box; CI's PR-scoped typecheck is the authority.
- `vitest run __tests__/lib/bos/syllabus-lookup.test.ts` → 13 passed.
- Terminology delta gate re-run over the changed files → 0 hits.
- Not exercised: a live Chromium render through the new route (needs a running dev server + a real API key). Run `GET /api/api-management/academic/syllabus/pdf?course_id=…` once before handing to COE.

---

## 9. Open questions for the Director

1. Should the API serve only **approved** documents? No approval column exists on `bos_course_syllabi`; Phase 1 serves `is_latest && !is_archived`. "Approved only" needs a `published_at` (or `approved_meeting_id`) column.
2. Default `format` for COE: `official` (plain) or `v35` (branded) when available?
3. Is a browser-direct link (Phase 2) needed on day one for learner-facing COE pages?
