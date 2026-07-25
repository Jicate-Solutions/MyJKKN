# PDE Image Bridge — Phase 2+3 Design (de-identification + delivery)

**Date:** 2026-07-21 · **Status:** Approved design, pending build
**Depends on:** Phase 1 investigation (`ops/PDE-IMAGE-INVESTIGATION.md` in the PMS repo, commit `5929c73`)
**Predecessor:** text bridge live on real data (see `specs/carre-audit-pde-module-2026-07-21.md` + memory `project_pms_casesheet_to_pde_case_bridge`)

## Phase 1 facts this design rests on

- Images are **filesystem files**, not DB BLOBs: `/home/product/ORION/upload/MediaLibrary/images/<patientimages.id>` (11,180 files, readable by the app account, named by record UUID, no extension). Store total 94 GB.
- Linkage: `patientimages.parent_id = casesheet_id` where `parent_type='Casesheets'` (10,921 rows; 5,348 of 217,485 casesheets ≈ 2.5% have ≥1 clinical photo).
- `labreportuploads` (27,680 rows — radiographs/lab reports, the biggest set) byte path **unresolved** → v1 ships on `patientimages` only; lab reports join later under the same contract (`kind` field reserves room).
- Formats: JPEG (+ some PDF elsewhere); clinical photos ~180 KB–4.4 MB. No DICOM anywhere.
- **Metadata risk:** EXIF on ~half of clinical photos — `GPSInfo.*` (full geolocation, esp. consent photos), `Make/Model/MakerNote`, `DateTimeOriginal/Digitized`, `Software`, `ImageDescription`, `UserComment`.
- **Burned-in risk: HIGH.** Sampled clinical "photos" are photographs of a computer monitor running imaging software — title bar / side panels (which conventionally display patient name + ID) are in the pixels. No metadata scrub touches this.
- PMS box has **no** ImageMagick/PIL/exiftool; `exiv2` **is** installed. The frontend is Next.js/Node → `sharp` is the natural scrub engine.
- The existing PMS serve route reads the frontend's local `uploads/` dir and 404s for ORION files — a new MediaLibrary-aware reader is required regardless.

## Phase 2 — De-identification design

### Layer 1: metadata (automated, PMS-side, fail-closed)

Scrub happens **on the PMS box, before any byte leaves it** — same boundary as the text scrubber.

- **Re-encode, never tag-strip in place:** `sharp(input).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 })`.
  - `.rotate()` first bakes EXIF orientation into pixels (stripping orientation later would silently rotate images).
  - **No `.withMetadata()`** — sharp's default output carries zero EXIF/IPTC/XMP/GPS. Decode→re-encode rebuilds the byte stream, so nothing survives by accident.
- **Fail-closed assertion on the OUTPUT buffer** before responding: parse JPEG segment markers; allow only `APP0` (JFIF) + core SOI/DQT/SOF/DHT/SOS/EOI. Any `APP1`–`APP15` or `COM` segment → **HTTP 500, no bytes served**, log the image id. (Optional belt-and-braces: shell out to `exiv2 pr` on a temp copy and assert "no Exif data".) The assertion is deterministic and dependency-free; it does not trust sharp, it verifies it.
- **No leaky sidecar fields:** payload never includes `file_name` (original upload filenames can embed patient names) and dates are truncated to month (`taken_at: "YYYY-MM"`).

### Layer 2: burned-in pixels (human, MyJKKN-side, default-deny)

Policy chosen: **faculty-gate with per-image explicit confirmation** (of the brief's reject / crop / faculty-redact options).

- Imported images arrive in the builder as **unattached candidates**. An image cannot be set as `scenario.image_url` or `question_media_url` until the faculty member ticks, per image: *"I checked — no patient name, ID, DOB, or other identifying detail is visible in this image."* Unconfirmed = never attached = never published. Default is deny.
- The import UI carries a standing warning: screen-photographed radiographs usually show the patient banner in the imaging software's panels — look at the edges.
- Rationale: Phase 1 shows the burned-in text is *conspicuous* (software chrome), exactly what an eyeball catches; the Director designated de-ID + faculty review as the operative safeguards (2026-07-20). Automated crop/redact tooling is deferred, not needed for v1 when reject-and-pick-another is cheap against a 10,921-photo pool.
- **Phase 6 (later, not v1):** AI vision screen using the proven bug-triage pattern (Mac-side ₹0 runner reads the file; the jobs lane itself is text-only — verified 2026-07-21). Flags person-identifying text vs benign clinical annotation before faculty even sees the image.

## Phase 3 — Delivery decision

**Copy-into-MyJKKN-Supabase-storage at import time.** Signed/walled URLs are eliminated by the consumers: `ImageTagQuestion` and the scenario renderer use bare `<img src>` from plain URL strings persisted in JSONB — a browser `<img>` cannot send CF-Access headers, and signed URLs would expire inside stored case rows (link rot).

- **New bucket `pde-clinical-images`** (none of the 35 existing buckets fits): public read, mime allowlist `image/jpeg`, 10 MB limit. Object path: `<casesheet_id>/<image_id>.jpg`. Public is acceptable because every object is, by construction, metadata-scrubbed AND faculty-confirmed de-identified teaching material at unguessable UUID paths — same class as existing public teaching assets. Writes go through the service-role client in the import route only.
- **Retention:** an image copy lives exactly as long as its teaching case; deleting/discarding a case must delete its objects (v1: documented owner action + janitor candidate; images of never-saved drafts are cleaned by prefix on discard).
- MyJKKN becomes a holder of de-identified clinical imagery — accepted, documented here, reviewable by the Director.

## API contract (PMS side builds this; MyJKKN side consumes it)

All under the existing double wall (CF Access service token at the edge + bearer at the app; the export path prefix covers the new subpaths).

### 1. Search — additive field
`GET /api/pde-export/search?q=…` hits gain `image_count` (count of `patientimages` rows for that casesheet with a web-image extension). Lets faculty find image-bearing casesheets.

### 2. Casesheet — additive key `images`
`GET /api/pde-export/casesheet/<id>` gains a **fifth top-level key** (existing four keys untouched — the live text path must not reshape):

```json
"images": [
  { "image_id": "<patientimages.id>", "kind": "clinical_photo", "taken_at": "YYYY-MM", "seq": 1 }
]
```

Rows filtered to extensions jpg/jpeg/png/webp; ordered oldest-first; `kind` is an enum with room for `lab_report` later; **no** `file_name`, no exact dates.

### 3. Bytes — new endpoint
`GET /api/pde-export/casesheet/<casesheet_id>/images/<image_id>` →
1. Validate both are UUIDs; validate the row: `patientimages.id = image_id AND parent_id = casesheet_id AND parent_type = 'Casesheets'` — else 404 (no IDOR).
2. Read `/home/product/ORION/upload/MediaLibrary/images/<image_id>` (read-only).
3. Scrub per Layer 1; run the fail-closed marker assertion.
4. Respond `image/jpeg`, `Cache-Control: no-store`. Unreadable / not decodable → 404; assertion failure → 500.

## Phase 4 — MyJKKN wiring (Mac side, worktree PR off jicate/main)

1. `PmsExport` (`lib/services/pde/case-author-draft.ts`) gains optional `images?: { image_id; kind; taken_at; seq }[]`.
2. Import route `app/api/pde/cases/import-from-pms/route.ts` POST: after the casesheet pull, fetch bytes for ≤6 images through the wall (server-side, has the headers), sniff-validate JPEG, upload to `pde-clinical-images/<casesheet_id>/<image_id>.jpg` via service-role, and return them as **candidates** in a new response field `images: [{url, kind, taken_at}]` beside `data`. Do **not** auto-set `scenario.image_url` (default-deny).
3. `ImportFromPmsTab` + `CaseFormBuilder`: render candidate thumbnails, per-image confirm checkbox (Layer 2), then "use as scenario image" / "use for an image-tag question" actions writing `scenario.image_url` / `question_media_url`.
4. `buildAuthorPrompt`: mention "N de-identified clinical images are available" so the AI may propose an `image_tag` question (empty `expected_regions` — faculty draws them in `ImageTagRegionAuthor`).
5. Bucket creation + storage policy migration.
6. **Fix while wiring:** `ImageTagRegionAuthor` stores region coords as 0–1 fractions; `ImageTagQuestion`'s local fallback scorer treats them as natural pixels — reconcile before any learner clicks (found 2026-07-21).

## Quality bar (unchanged from the brief)

A real de-identified clinical image from a live `jkkn326` casesheet visible inside a **published** PDE case on prod, rendered on the learner attempt page; `exiv2`/marker-scan on the delivered file shows zero identifying tags; a human eyeballed the pixels; faculty reviewed before publish. Bonus: one working `image_tag` question with a drawn region.

## Lab-report set — investigation RESOLVED (2026-07-22, Server session, read-only)

Phase 1's "byte-path unresolved" was wrong — it sampled the newest rows, which live in the one locked directory. Resolved facts:

- **Path formula:** `upload/Lab/<YYYY>/<MM>/<labreportuploads.id>` (id is globally unique → robust join `find Lab -name <id>`). 30/40 random-row direct hits; misses are month-boundary/absent files.
- **Permission reality:** `upload/Lab` is `drwxrwxrwx` and **files inside are `-rwxrwxrwx`** — the barrier is a single **directory bit** on `Lab/2026` (`drwxrws---`). `2016/2024/2025` are already world-readable → **~14,226 lab images (16 GB) are readable TODAY with no unlock.** Only current-year 2026 (and future months, created locked) needs a grant.
- **App runtime user:** `admin` (uid 1001, groups admin+wheel), not in `apache`. Passwordless sudo unavailable (correctly not worked around).
- **Format mix:** 26,746 web-image ext (JPEG ~93%, BMP ~6%, PNG rare) / **81 PDFs** of 27,746. `sharp` normalizes JPEG/PNG/BMP → only the 81 PDFs need conversion or exclusion.
- **Metadata:** device/timestamp tags on ~half, **no GPS** — the existing `sharp` re-encode strip handles it.
- **Burned-in risk — HIGHER than photos, and the real gate.** 2/6 samples were screen-photos with a top status/title bar (the patient-header location) + software UI; 2/6 clean OPGs (device watermark only, not PHI); 2/6 film-on-lightbox (no burned text). Metadata scrub is necessary but **not sufficient** — a pixel step is required. The existing faculty per-image default-deny confirm gate (Layer 2) already provides this; lab images will just have a higher reject rate. An automated pre-screen (OCR-gated exclusion / header-band crop) would reduce faculty load (Phase 6).
- **Recommended unlock for 2026 (Director/root runs — NOT applied):** least-privilege, durable ACL, read-only, Lab-scope only:
  ```
  setfacl -R -m u:admin:rX /home/product/ORION/upload/Lab
  setfacl -R -d -m u:admin:rX /home/product/ORION/upload/Lab   # default ACL for future months
  ```
  NOT option (a) `usermod -aG apache admin` — the apache group owns the entire ORION install incl. `config.php` (over-broad). `rX` (not `rwx`) keeps it read-only so admin can't alter the live clinical store; ACL is additive so ORION's own writes are unaffected. Findings committed to `ops/PDE-IMAGE-INVESTIGATION.md` (`8f2b7d8`).

## Explicitly deferred

- `kind: "lab_report"` ingestion build (PMS export additive field + MyJKKN import) — unblocked by the above; can index 2024/2025 without waiting for the 2026 ACL.
- AI vision pre-screen (Phase 6, bug-triage runner pattern) — now higher-value given the lab burned-in rate.
- Crop/redact tooling in the builder.
- PDF-typed attachments (81 lab PDFs).
