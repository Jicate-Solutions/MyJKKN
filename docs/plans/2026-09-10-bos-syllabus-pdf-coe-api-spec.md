# BoS Learning Pathway PDF for COE — Complete Specification

**Purpose:** One documented path by which the COE application obtains a course's BoS learning pathway document (the course document stored in `bos_course_syllabi` and edited at `/bos/syllabus`) as a PDF, course-code-wise, for every JKKN institution and academic model.
**Deliverable:** This specification + the MyJKKN implementation (§6) + the COE consumer (§7).
**Date:** 2026-09-10, revised 2026-09-12.
**Status:** Both sides implemented. MyJKKN changes since commit `90eb7e96a` (print layout, engineering layout, footer) are **uncommitted and undeployed** — see §11.

Terminology note: this document says "learning pathway" for the course document. Route paths, table names, identifiers and HTTP header names keep their existing spelling.

---

## 1. Systems and repositories

| System | Repository | Production origin | Role |
|---|---|---|---|
| MyJKKN | https://github.com/Jicate-Solutions/MyJKKN | `https://www.jkkn.ai` | Owns the BoS learning pathway data and renders the PDF. Exposes it to first-party apps behind an API key. |
| JKKN COE | https://github.com/Jicate-Solutions/JKKN_COE | COE app origin | Consumes the PDF for exam staff and question-paper examiners. Holds the MyJKKN API key server-side. |

Repo file links below are of the form `https://github.com/Jicate-Solutions/<repo>/blob/main/<path>`.

---

## 2. Route inventory (every route involved)

### 2.1 MyJKKN — API-key routes (new, for COE)

| # | Method + URL | File | Purpose |
|---|---|---|---|
| M1 | `GET https://www.jkkn.ai/api/api-management/academic/syllabus` | [app/api/api-management/academic/syllabus/route.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/app/api/api-management/academic/syllabus/route.ts) | Resolve course → learning pathway rows + available formats (JSON). |
| M2 | `GET https://www.jkkn.ai/api/api-management/academic/syllabus/pdf` | [app/api/api-management/academic/syllabus/pdf/route.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/app/api/api-management/academic/syllabus/pdf/route.ts) | One-shot: resolve by course and stream the PDF. **The call COE uses.** |
| M3 | `GET https://www.jkkn.ai/api/api-management/academic/syllabus/{id}/pdf` | [app/api/api-management/academic/syllabus/[id]/pdf/route.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/app/api/api-management/academic/syllabus/%5Bid%5D/pdf/route.ts) | Stream the PDF for one known row id. |
| — | `OPTIONS` on M1–M3 | same files | CORS preflight (`corsHeaders`). |

### 2.2 MyJKKN — session routes already in place (BoS screens)

| Method + URL | File | Purpose |
|---|---|---|
| `GET /bos/syllabus` | `app/(routes)/bos/syllabus/page.tsx` | List + download buttons (jsPDF PDF, v3.5 HTML, DOCX). |
| `GET /bos/syllabus/new`, `/bos/syllabus/{id}/edit`, `/bos/syllabus/{id}/history` | `app/(routes)/bos/syllabus/…/page.tsx` | Authoring and version history. |
| `GET /api/bos/syllabus`, `POST` | `app/api/bos/syllabus/route.ts` | List / create. |
| `GET/PUT/DELETE /api/bos/syllabus/{id}` | `app/api/bos/syllabus/[id]/route.ts` | Row CRUD. |
| `GET /api/bos/syllabus/{id}/export-pdf?format=official\|meeting_summary\|obe\|v35` | [app/api/bos/syllabus/[id]/export-pdf/route.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/app/api/bos/syllabus/%5Bid%5D/export-pdf/route.ts) | Session-auth **HTML** export (not PDF). Now imports the shared builder; output unchanged. |
| `GET /api/bos/syllabus/{id}/export-xlsx` | `app/api/bos/syllabus/[id]/export-xlsx/route.ts` | Excel export. |
| `POST /api/bos/syllabus/{id}/clone`, `/revise` | `app/api/bos/syllabus/[id]/{clone,revise}/route.ts` | Versioning. |
| `/api/bos/syllabus/{compare,duplicate-regulation,extract,health,metrics,template,backfill-course-id}` | `app/api/bos/syllabus/*/route.ts` | Tooling; unrelated to the PDF contract. |

### 2.3 MyJKKN — key management and API docs (admin)

| URL | File | Purpose |
|---|---|---|
| `/system/api-management` | `app/(routes)/system/api-management/page.tsx` | Create / revoke API keys, set module permissions, test an endpoint. |
| `/application-hub/api-guidelines`, `…/endpoints`, `…/b2a`, `…/mcp` | `app/(routes)/application-hub/api-guidelines/**/page.tsx` | Developer documentation pages. The new syllabus endpoints are **not yet** listed in `lib/data/api-endpoints/` (follow-up, §12). |

### 2.4 COE — consumer routes (built)

| # | Method + URL | File | Purpose |
|---|---|---|---|
| C1 | `GET {coe}/api/courses/{courseId}/syllabus-pdf?format=official&disposition=inline` | [app/api/courses/[id]/syllabus-pdf/route.ts](https://github.com/Jicate-Solutions/JKKN_COE/blob/main/app/api/courses/%5Bid%5D/syllabus-pdf/route.ts) | Staff-side proxy. Session-gated by `proxy.ts`. |
| C2 | `GET {coe}/api/examiner-portal/assignments/{assignmentId}/syllabus?format=official` | [app/api/examiner-portal/assignments/[id]/syllabus/route.ts](https://github.com/Jicate-Solutions/JKKN_COE/blob/main/app/api/examiner-portal/assignments/%5Bid%5D/syllabus/route.ts) | Examiner-portal proxy. Gated by the portal session + assignment guard; every view is audit-logged. |
| — | shared resolver | [lib/myjkkn/learning-pathway.ts](https://github.com/Jicate-Solutions/JKKN_COE/blob/main/lib/myjkkn/learning-pathway.ts) | MyJKKN first, then `courses.syllabus_pdf_url`; 304 passthrough; readable miss page. |
| — | MyJKKN client | [services/myjkkn-service.ts](https://github.com/Jicate-Solutions/JKKN_COE/blob/main/services/myjkkn-service.ts) `fetchMyJKKNSyllabusPdf`, `fetchMyJKKNSyllabusPdfById` | Bearer call to M2 / M3; rejects an HTML 200 as "routes not deployed". |
| UI | Course master → row action | `app/(coe)/master/courses/page.tsx` | `window.open('/api/courses/<id>/syllabus-pdf')`. |
| UI | QP examiner assignment → detail | `app/(coe)/pre-exam/qp-examiner-assignment/assignments-tab.tsx` | same. |
| UI | Examiner portal | `components/examiner-portal/portal.tsx` | opens C2. |

---

## 3. Authentication and authorisation ("login"), end to end

### 3.1 MyJKKN API-key layer (routes M1–M3)

1. Caller sends `Authorization: Bearer <raw key>`. No cookie, no user session.
2. `authenticateApiKey(request, { requiredModule: 'academic' })` in [lib/api-keys/authenticate.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/lib/api-keys/authenticate.ts):
   - SHA-256 of the raw key is looked up in `api_keys.key_value` with `is_active = true`.
   - `expires_at` in the past → `401 UNAUTHORIZED`.
   - `permissions.read` must be `true` (legacy all-access) or an array containing `'academic'` → else `403 FORBIDDEN`.
   - `last_used_at` is updated fire-and-forget.
   - Returns a **service-role** Supabase client (bypasses RLS) plus `institutionId` (null for today's super keys).
3. `checkRateLimit(keyId)` — in-memory sliding window, 60 requests / 60 s per key → `429 RATE_LIMITED` + `Retry-After`.
4. Every response is audited by `logApiUsage` into `api_key_usage_logs` (key id, endpoint path, module, status, ms, ip, user agent).
5. Institution scoping: `keyMayRead(key.institutionId, row)` drops rows whose `institutions_id` differs from a key bound to one institution. Super keys read everything. No CAS sibling expansion — the caller names the exact MyJKKN institution.

Key facts verified on live data (2026-09-11): the `JKKNCOE` key is active until 2026-12-30 with `read: true` and was used on 2026-09-10; the older `COE` key expired 2025-12-31 and must not be used.

### 3.2 MyJKKN session layer (BoS screens and `export-pdf`)

- Supabase Auth cookie session, enforced by `proxy.ts`; the route reads `supabase.auth.getUser()`.
- `resolveBosBoardScope(userId)` + `hasBosPermission(userId, 'academic.bos-syllabus.view')` + `readableInstitutionIds()` decide which rows the user can read ([lib/utils/bos/bos-access.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/lib/utils/bos/bos-access.ts)). Observers with the view grant and no board seat read all institutions via service role.
- Not involved in the COE path at all.

### 3.3 COE staff layer (route C1)

- `proxy.ts` in JKKN_COE requires the `access_token` (parent-app OAuth) and `coe_access` cookies for every `/api` route; a miss is logged as `coe_access_denied`.
- The route reads the course from COE `courses`, then calls the shared resolver. The MyJKKN key stays in `process.env.MYJKKN_API_KEY` on the COE server.

### 3.4 COE examiner layer (route C2)

- `requireAssignment(req, id, { action: 'view syllabus' })` from `lib/qp-portal/guard.ts`: valid signed portal-session cookie, assignment belongs to the examiner, assignment active. Not window-gated (the examiner must see the prescribed content at any time).
- Each view writes an access log row (`action: 'syllabus_view'`, examiner id/email, assignment, paper, institution, `source` = `myjkkn` | `course_master` | `none`, format, attempts, renderer_down).

### 3.5 Environment

| Side | Variable | Value |
|---|---|---|
| COE | `MYJKKN_API_URL` | `https://www.jkkn.ai/api` (default when unset) |
| COE | `MYJKKN_API_KEY` | raw `JKKNCOE` key |
| MyJKKN | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | used by the service-role client |
| MyJKKN | `COE_API_*` (existing `CoeRestClient` config) | live course code/name + L-T-P-C via `GET /api/v1/courses/{id}` |

---

## 4. Data model (no schema change)

`bos_course_syllabi` (one row per course × regulation × version):

| Column | Role |
|---|---|
| `course_id` (uuid, nullable) | **Preferred lookup key.** Stable COE `courses.id`; CAS-safe, rename-safe. |
| `course_code` (text) | Fallback key, case-insensitive; a snapshot COE may rename. Same code exists in CAS Self and Aided and across regulations, so it needs `institutions_id`. |
| `institutions_id` (uuid) | MyJKKN institution (plural name by BoS convention). |
| `regulation_id` (uuid) | `regulations.regulation_code` gives "R-2021". |
| `board_id` | Board-scoped taxonomy lookup for the engineering layout. |
| `academic_model` | `anna_univ \| mgr_ahs \| mgr_pharmd \| pci_pharm \| inc_nursing \| mgr_bds` — layout dispatch. |
| `version_number`, `is_latest`, `is_archived` | Default serve: `is_latest = true AND is_archived = false`. |
| `last_modified_at` | ETag component. |
| JSONB: `course_objectives`, `course_learning_outcomes`, `course_content`, `textbooks`, `web_resources`, `pedagogy`, `po_mappings`, `assessment_structure`, `concept_applications`, `assessment_pattern`, `capstone_project`, `capstone_rubric`, `llc_conference` | Document body. |
| scalars: `course_credits`, `total_hours`, `contact_hours`, `stream`, `semester`, `academic_year`, `scope`, `notes` | Header row; `notes` may carry "LTPC: 3 0 0 3" from the docx importer. |

Supporting reads: `institutions` (name, display_name, city, state, institution_type, accredited_by), `regulations` (regulation_code), `bos_regulation_taxonomies` (K-values, PO/PSO keys; engineering layout only), COE `courses` via REST (live code/name, course_type, course_category, theory/tutorial/practical hours, credit).

---

## 5. API contract (MyJKKN, routes M1–M3)

Common to all: Bearer key (§3.1), CORS headers, rate limit, audit, `Cache-Control: private, max-age=3600`. Error envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "No learning pathway matches the given course" } }
```

| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | missing / invalid / expired key |
| `FORBIDDEN` | 403 | key lacks `academic` read |
| `VALIDATION` | 400 | bad params (see below) |
| `NOT_FOUND` | 404 | no row (or archived without `include_archived=true`) |
| `AMBIGUOUS` | 409 | M2 only — more than one row; body carries `candidates[]` |
| `UNSUPPORTED_FORMAT` | 422 | e.g. `v35` on a row without Fink's data, or any non-`official` on pharmacy; body carries `supported_formats[]` |
| `RATE_LIMITED` | 429 | + `Retry-After` seconds |
| `RENDERER_UNAVAILABLE` | 503 | Chromium could not launch — retry later |
| `INTERNAL` | 500 | anything else (logged) |

### 5.1 M1 — `GET /api/api-management/academic/syllabus`

| Param | Type | Rule |
|---|---|---|
| `course_id` | uuid | preferred; alone is enough |
| `course_code` | string | case-insensitive exact; **requires** `institution_id` |
| `institution_id` | uuid | MyJKKN institution; optional filter with `course_id` |
| `regulation_id` | uuid | optional |
| `version` | int ≥ 1 | optional; default latest |
| `include_archived` | `true` | default false |

`200`:

```json
{
  "data": [{
    "id": "1b17e22c-…", "course_id": "59c02450-…",
    "course_code": "CEC352", "course_name": "SATELLITE COMMUNICATION",
    "institution_id": "5de4fba1-…", "board_id": "7437c682-…", "regulation_id": "a4ddb3b0-…",
    "academic_model": "anna_univ", "stream": null, "course_credits": 3,
    "version_number": 1, "is_latest": true, "is_archived": false,
    "last_modified_at": "2026-07-15T09:11:58.992527+00:00",
    "formats": ["official", "meeting_summary", "obe"],
    "pdf_path": "/api/api-management/academic/syllabus/1b17e22c-…/pdf?format=official",
    "pdf_url": null
  }],
  "count": 1
}
```

- `formats`: pharmacy models → `["official"]`; `v35` appears only when at least one Fink's/Capstone JSONB column is non-null.
- `pdf_url` is reserved for the signed-URL phase (§10) and is always `null` today.
- Sort: `is_latest desc, last_modified_at desc`.

### 5.2 M3 — `GET /api/api-management/academic/syllabus/{id}/pdf`

| Param | Values | Default |
|---|---|---|
| `format` | `official \| v35 \| obe \| meeting_summary` | `official` |
| `include_mappings` / `include_references` / `include_pedagogy` | `true\|false` | `true` |
| `disposition` | `inline \| attachment` | `inline` |
| `include_archived` | `true` | false |

`200` headers:

```
Content-Type: application/pdf
Content-Length: <bytes>
Content-Disposition: inline; filename="CEC352-syllabus-official-v1.pdf"
ETag: "<id>:<version>:<format>:<last_modified_at>"            (HTML layouts)
ETag: "<id>:<version>:<format>:<last_modified_at>:engineering" (engineering layout)
Cache-Control: private, max-age=3600
X-Syllabus-Id, X-Syllabus-Version, X-Academic-Model, X-Syllabus-Layout: engineering (when applicable)
```

`If-None-Match` equal to the ETag → `304` with no render.

### 5.3 M2 — `GET /api/api-management/academic/syllabus/pdf` (one-shot)

All M1 lookup params **plus** all M3 PDF params. Exactly one row → the PDF as in M3. More than one → `409`:

```json
{ "error": { "code": "AMBIGUOUS", "message": "More than one learning pathway matches; narrow with regulation_id or version, or use /syllabus/{id}/pdf",
  "candidates": [{ "id": "…", "regulation_id": "…", "institution_id": "…", "version_number": 1, "last_modified_at": "…" }] } }
```

Examples:

```
GET /api/api-management/academic/syllabus/pdf?course_id=59c02450-9b9c-49d6-ace9-6479c1585f29
GET /api/api-management/academic/syllabus/pdf?course_code=CEC352&institution_id=5de4fba1-4564-41ed-8c73-5d948b74b843
GET /api/api-management/academic/syllabus/pdf?course_id=…&format=official&disposition=attachment&include_mappings=false
```

---

## 6. MyJKKN implementation — files and flow

| File | Responsibility |
|---|---|
| [lib/services/bos/syllabus-lookup.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/lib/services/bos/syllabus-lookup.ts) | `parseSyllabusLookupQuery` (validation rules of §5.1), `findSyllabi`, `findSyllabusById`, `keyMayRead`, `toSyllabusApiMeta`, `syllabusEtag`, `syllabusPdfFilename`. Pure, unit-tested. |
| [lib/services/bos/syllabus-api.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/lib/services/bos/syllabus-api.ts) | `authorizeSyllabusApi` (§3.1 steps 2–3), `auditSyllabusApi`, `parsePdfOptions`, `respondWithSyllabusPdf` — format check → ETag/304 → live COE code/name (`courseDisplayFor`) → institution + regulation lookups → **layout dispatch (§8)** → bytes. |
| `lib/services/bos/syllabus-engineering-pdf.ts` | Engineering (CET) document via jsPDF — the same generator the BoS screen downloads (`renderCourseSyllabusPDF`, variant `engineering`), fed server-side: taxonomy from `bos_regulation_taxonomies`, course master from COE REST, CET letterhead from `getInstitutionHeader('Engineering','CET')`, logo from `/public`. |
| `lib/utils/bos/syllabus-print-html.ts` | A4 HTML print layout for every non-engineering, non-pharmacy row (§8.2). |
| [lib/utils/bos/syllabus-pdf-html.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/lib/utils/bos/syllabus-pdf-html.ts) | Format registry (`SYLLABUS_PDF_FORMATS`, `supportedFormats`), `buildSyllabusHtml` dispatcher, and the legacy `generatePdfHtml` lifted verbatim from the session export route (on-screen HTML export unchanged). |
| [lib/pdf/syllabus-pdf.ts](https://github.com/Jicate-Solutions/MyJKKN/blob/main/lib/pdf/syllabus-pdf.ts) | `renderSyllabusPdf(html, { footerText })` — Chromium (puppeteer-core + @sparticuz/chromium on Vercel, lazy `puppeteer` locally, never static-imported), A4, running footer "text · Page x of y", throws `SyllabusRendererUnavailableError`. |
| `lib/utils/bos/pdf-fonts.ts` (existing) | Embedded Tinos + Noto Sans Tamil faces so Vercel (which has no Times) renders identically. |
| `lib/utils/bos/coe-course-display.ts` (existing) | Live course code/name by `course_id`, 10-min cache, snapshot fallback. |
| `__tests__/lib/bos/syllabus-lookup.test.ts` | 16 tests: query validation, format matrix, key scoping, meta shape, ETag, filename, print layout content rules. |

Request flow for M2:

```
Bearer key ─► authenticateApiKey ─► checkRateLimit ─► parseSyllabusLookupQuery + parsePdfOptions
  ─► findSyllabi (service role) ─► keyMayRead filter ─► 0 rows: 404 │ >1 rows: 409 │ 1 row ↓
  ─► supportedFormats check (422) ─► ETag / If-None-Match (304)
  ─► courseDisplayFor (COE live code/name) ─► institutions + regulations lookups
  ─► format=official & engineering row? ─► jsPDF engineering document (≈0.1 s)
       else ─► buildSyllabusHtml(forPrint) ─► Chromium ─► PDF (≈2 s warm, 3–6 s cold)
  ─► 200 application/pdf (+ audit row)
```

---

## 7. COE implementation — files and flow

| File | Responsibility |
|---|---|
| `services/myjkkn-service.ts` → `fetchMyJKKNSyllabusPdf({ courseId \| courseCode+institutionId, format, ifNoneMatch })`, `fetchMyJKKNSyllabusPdfById(id, …)` | Bearer call to M2 / M3 with `MYJKKN_API_KEY`; forwards `If-None-Match`; maps `{ error }` bodies to `MyJKKNApiError`; an HTML `200` is reported as "routes not deployed" (502) instead of being shown as a PDF. |
| `lib/myjkkn/learning-pathway.ts` → `resolveLearningPathwayPdf(q)` | Attempt order: (1) `course_id`; (2) `course_code` × each MyJKKN institution id mapped to the COE institution; (3) `courses.syllabus_pdf_url` on the COE course master. Returns `{ kind: 'pdf' \| 'not_modified' \| 'miss' }` with `source`, `syllabusId`, `version`, `filename`, `attempts`, `rendererDown`. |
| `learningPathwayHeaders / MissPage / MessagePage` | Re-emit `Content-Type`, `Content-Disposition`, `ETag`, `X-Syllabus-*`; a miss renders a short readable HTML page ("not available yet") because the buttons open a new tab. |
| C1 `app/api/courses/[id]/syllabus-pdf/route.ts` | Staff proxy (§3.3). |
| C2 `app/api/examiner-portal/assignments/[id]/syllabus/route.ts` | Examiner proxy with audit log (§3.4). |
| UI | Course master row action, QP examiner assignment detail, examiner portal — all `window.open(…, '_blank', 'noopener')`. |

Observed behaviour today (COE side, 2026-09-10): unauthenticated → 401; MyJKKN returns an HTML page (routes not deployed) → the resolver falls to the course master; CEC352 has no `syllabus_pdf_url` → examiner sees "Syllabus not available yet". No COE change is needed once MyJKKN deploys.

---

## 8. PDF document formats — exact content

### 8.1 Layout dispatch (`format=official`)

| Row | Layout | Engine | Why |
|---|---|---|---|
| Engineering (CET): hosted by an institution whose name matches `cet\|engineering\|technology`, or `stream = Engineering`, or an Anna University code `^[A-Z]{2,3}\d{4}$` (e.g. `EC3354`) | **Engineering** | jsPDF, `renderCourseSyllabusPDF` variant `engineering` | Identical to what the BoS screen's PDF button downloads; the CET office recognises this document. |
| Pharmacy models `pci_pharm`, `mgr_pharmd`, `mgr_ahs` | Pharmacy | legacy HTML generator (`generatePharmacyFormat`) + Chromium | Their own regulator layout (scope, exam scheme, internship). |
| Everything else (CAS, nursing, dental, non-CET engineering rows) | **Print** | `syllabus-print-html.ts` + Chromium | A4 letterhead document (§8.2). |

Other formats: `meeting_summary`, `obe` → legacy HTML generator with embedded fonts + Chromium; `v35` → branded green v3.5 template (`generateV35SyllabusHtml`) + Chromium. The engineering path falls back to the Print layout if jsPDF throws (never a blank answer).

### 8.2 Print layout (A4, Tinos/Times embedded, 14 mm margins, footer "code · title · institution — Page x of y")

| Order | Block | Content | Source | Shown when |
|---|---|---|---|---|
| 1 | Letterhead | Institution name (upper-case), "An Autonomous Institution", "Accredited by NAAC", city, state; "Regulation R-2024" | `institutions`, `regulations` | institution row found |
| 2 | Title | "SYLLABUS" | static | always |
| 3 | Course header box | Course Code · Course Title · Credits · Total Periods (+ "N contact hrs/week") · Course Type (Theory / Practical / Project) · Version + last-modified date · Placement (Semester n / Year n) · Stream · Board | row scalars, `course_content.total_hours` | always; optional cells only when present |
| 4 | Course Objectives | numbered list | `course_objectives.objectives[].description` | ≥1 non-empty |
| 5 | Course Learning Outcomes (COs) | "On successful completion of the course, learners will be able to:" + table CO / Outcome / Bloom's Level | `course_learning_outcomes.clos[]` | ≥1; Bloom's column only if any `k_values` |
| 6 | Course Content — theory | per unit: "UNIT I – TITLE …… 9 periods"; chapter label bold; topics joined with " – "; CAS prose (long text in `title`/`sections`, no subtopics) bolds only the leading "Label:"; nursing LO / activities / assessment lines; unit remarks italic; closing "Total: N periods" only when units carry periods or `course_content.total_hours` is set | `course_content.units[]` | ≥1 unit |
| 6′ | Course Content — practical | table S.No / Experiment, sub-experiments nested; numbering honours `number_practical_topics` | `course_content.topics[]` when `is_practical` | ≥1 topic |
| 6″ | Course Content — project | unit blocks of rule title + text | `course_content.project_units[]` when `is_project` | ≥1 |
| 6‴ | Instruction | "Instruction: …" | `course_content.instruction` | non-empty |
| 7 | Text Books / Reference Books / Web Resources | "Title, Author, Publisher, Year"; publisher or year suppressed when the title already contains it; web: title – url | `textbooks.primary/references`, `web_resources.resources` | each list non-empty and `include_references` |
| 8 | Pedagogy | one line, methods joined with ";" | `pedagogy.methods` | non-empty and `include_pedagogy` |
| 9 | Assessment | S.No / Component / Marks + Total | `assessment_structure.components` | non-empty |
| 10 | CO – PO / PSO Mapping | matrix CO × PO1..POn, PSO1..PSOn (numeric-sorted); legend "3 – High \| 2 – Medium \| 1 – Low" when values are 1/2/3, else "H \| M \| L"; blank cell "–" | `po_mappings.mappings[]` | non-empty and `include_mappings` |
| 11 | Notes | free text | `notes` unless it starts with "Imported from" | non-empty |
| 12 | Signatures | Course Designer · Chairman, Board of Studies · Principal | static | always |
| 13 | Document line | code · title · version · "generated from MyJKKN on dd Mon yyyy" | row | always |

Never printed: the string "undefined", empty "Chapter 1:" headings, empty sections.

### 8.3 Engineering layout (CET, jsPDF) — as the BoS screen prints

CET letterhead (verbatim stationery: name, address, accreditation banner lines, website, logo left/right) → course code + title with course part label → L-T-P-C row (COE course master `theory/tutorial/practical/credit`, else "LTPC: …" parsed from `notes`) → COURSE OBJECTIVES → UNIT I–V with per-unit periods and "TOTAL: N+M PERIODS" → practical list when applicable → COURSE OUTCOMES with K-levels from the regulation taxonomy → TEXT BOOKS / REFERENCES / WEB RESOURCES → CO–PO/PSO matrix with PO/PSO keys from `bos_regulation_taxonomies` → v3.5 blocks when present → Course Designer / BoS Chairman sign-off. Content sections follow the COE `course_category` (Theory / Practical / Project) with the same fallback rules as the screen (`resolveContentModes`).

### 8.4 File naming and headers

`<course_code sanitised>-syllabus-<format>-v<version>.pdf` (e.g. `CEC352-syllabus-official-v1.pdf`). `disposition=inline` opens in the tab; `attachment` downloads.

---

## 9. Non-functional

| Concern | Decision |
|---|---|
| Latency | Engineering (jsPDF) ≈ 0.1 s. Chromium layouts: warm ≈ 2 s, cold 3–6 s; `maxDuration = 60` on M2/M3; COE proxies set `maxDuration = 60`. |
| Caching | ETag per id/version/format/last_modified (+ `:engineering`); COE forwards `If-None-Match` and passes 304 through. No persisted PDF store (Phase 2 candidate `bos_syllabus_pdf_cache`). |
| Rate limit | 60 req/min per key, one unit per call. |
| Size | 50–120 KB per document. |
| Fonts | Embedded via data: URIs; identical on Vercel and locally. |
| Security | Read-only. Service-role read is gated only by the API key, as for every `api-management` route. Key never reaches a browser (COE proxies). Every hit audited on both sides. |
| Failure modes | Chromium down → 503 `RENDERER_UNAVAILABLE` (COE shows "PDF service busy, retry"); jsPDF failure → falls back to the Print layout; missing institution/regulation rows → those lines are omitted, never a failed document; unknown `academic_model` → treated as `anna_univ`. |
| Terminology gate | API/user copy says "learning pathway"; paths, params, headers, table names keep `syllabus`. |

---

## 10. Phase 2 — signed URL (only if a browser-direct link is required)

- `GET /api/public/academic/syllabus/{id}/pdf?format=&exp=<unix>&sig=<hmac-sha256(id|format|exp, SYLLABUS_PDF_SIGNING_SECRET)>`
- M1's `pdf_url` becomes `${NEXT_PUBLIC_APP_URL}/api/public/…` with `exp = now + 1 h`.
- Same renderers, no key lookup, constant-time signature compare, `Cache-Control: public, s-maxage=3600`.
- New env on MyJKKN only; COE never signs.

---

## 11. Verification record

| Date | Check | Result |
|---|---|---|
| 2026-09-10 | Scoped `tsc --noEmit` over all touched MyJKKN files | clean |
| 2026-09-10 | Terminology delta gate over touched files | 0 hits |
| 2026-09-11 | `api_keys` live: `JKKNCOE` active to 2026-12-30, `read: true`; `COE` expired | pass |
| 2026-09-11 | CEC352 live row: 1 latest, `anna_univ`, `course_id` linked, R-2021, CET | pass |
| 2026-09-11 | Print layout rendered end-to-end (lookup → HTML → Chromium) for CEC352, EC3301 (numeric matrix), 26PZOE04 (CAS prose, H/M/L + PSO, web, pedagogy), 24PCSCP02 (practical), CS25C15 (assessment) | 80–120 KB PDFs, pages screenshotted and reviewed |
| 2026-09-12 | Engineering jsPDF path for CEC352 (`isEngineeringSyllabus` = true) | 53 KB PDF in 0.1 s; 26PZOE04 correctly routed to the Print layout |
| 2026-09-12 | `vitest run __tests__/lib/bos/syllabus-lookup.test.ts` | 16 passed |
| 2026-09-12 | Terminology gate over the current working tree (incl. engineering module) | 0 hits |
| 2026-09-10 | COE side (reported by the COE session): unauthenticated → 401; MyJKKN answers HTML (not deployed) → course-master fallback; CEC352 has no `syllabus_pdf_url` → "not available yet" page | matches design |
| not done | HTTP call through the **deployed** M2 route with the `JKKNCOE` key | blocked until deploy |

Deployment state: MyJKKN commit `90eb7e96a` (routes, lookup, first renderer) is merged to `main`; the print layout, engineering layout and footer are uncommitted in the working tree. Production deploys are CLI-only, so nothing is live yet.

---

## 12. Go-live checklist and follow-ups

1. Commit + PR the uncommitted MyJKKN files (`syllabus-print-html.ts`, `syllabus-engineering-pdf.ts`, `syllabus-pdf.ts`, `syllabus-api.ts`, `syllabus-pdf-html.ts`, the test, this spec).
2. Deploy MyJKKN via the CLI recipe.
3. Smoke test from the COE server: `curl -H "Authorization: Bearer $MYJKKN_API_KEY" "https://www.jkkn.ai/api/api-management/academic/syllabus/pdf?course_id=59c02450-9b9c-49d6-ace9-6479c1585f29" -o CEC352.pdf` → `%PDF`, `X-Syllabus-Layout: engineering`.
4. Open the examiner portal → Syllabus for a CEC352 assignment → PDF opens; access log row with `source = myjkkn`.
5. Follow-up (not blocking): register M1–M3 in `lib/data/api-endpoints/` so `/application-hub/api-guidelines/endpoints` documents them; decide on "approved-only" serving (needs a `published_at` column — none exists today); decide whether the CAS office also wants a jsPDF variant instead of the Print layout.
