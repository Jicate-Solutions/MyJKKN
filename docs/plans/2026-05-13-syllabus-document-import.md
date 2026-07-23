# Syllabus Document Import (Auto-fill from PDF / DOCX / XLSX)

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Let BOS users upload a syllabus document (PDF, Word, Excel) on the
Basic Info tab of `/bos/syllabus/new` and auto-populate the remaining 6 tabs
(Objectives, COs, Content, Resources, Pedagogy, PO Mappings).

**Architecture:** A new server-side Next.js API route accepts a multipart file
upload, extracts plain text using `pdf-parse` (v2, class API) / `mammoth` /
`xlsx`, then runs a pure-text regex parser tuned to the Anna University
table-format syllabus. The parser returns a structured JSON payload that maps
1:1 onto the `formData` slices the syllabus form already uses, so merging is a
single `setFormData(prev => ...)` call. Merge is non-destructive — only empty
sections are filled.

**Tech Stack:**
- Next.js 16 App Router API route (Node runtime, 60s max duration)
- `pdf-parse@^2.4.5` — class-based ESM API, exposes `getText`, `getTable`, …
- `mammoth` — DOCX → plain text
- `xlsx` (SheetJS, already installed) — XLSX → text
- React Hook Form-free section of `components/bos/syllabus-form.tsx` (uses
  raw `useState` for `formData`)

---

## Background

### Existing form
`components/bos/syllabus-form.tsx` renders 7 tabs that map to JSON columns on
`bos_course_syllabus`:

| Tab | `formData` key | Schema |
|---|---|---|
| Basic Info | (top-level fields) | course_code, course_name, institution, regulation, board, composition, meeting, hours, credits |
| Objectives | `course_objectives` | `{ objectives: [{ number, description }] }` |
| Course Outcomes | `course_learning_outcomes` | `{ clos: [{ clo_number, description, k_values: string[] }] }` |
| Content | `course_content` | `{ units: [{ unit_id, unit_title, chapters: [{ chapter_number, title, sections }], remarks }] }` |
| Resources | `textbooks`, `web_resources` | `{ primary: [...], references: [...] }`, `{ resources: [{ title, url }] }` |
| Pedagogy | `pedagogy` | `{ methods: string[] }` |
| PO Mappings | `po_mappings` | `{ mappings: [{ co_id, pos: {POn:H/M/L}, psos: {PSOn:H/M/L} }] }` |

### Sample document format (Anna University table style)
- Two-column table: left cell = section label, right cell = content
- Section labels: `Course Objectives`, `CLO 1`–`CLO N`, `Unit-I`–`Unit-V`,
  `Text Books`, `Reference Books`, `Web Resources`, `Pedagogy`
- PO Mapping is a separate matrix: rows = CO1..CON, columns = PSOs then POs,
  cells = H / M / L / -

### Constraints (gathered in brainstorming)
- Source docs: digital PDF, .docx, .xlsx (OCR not required)
- Inconsistent headings across departments → fuzzy regex, not strict matchers
- No external AI — rule-based extraction only
- Upload triggers instant fill (no preview/confirm step)
- Migration scale: <50 syllabi → no batch queue needed

---

## Files

### Created
- `lib/utils/bos/syllabus-parser.ts` — pure regex parser (unit-testable)
- `app/api/bos/syllabus/extract/route.ts` — auth-gated extraction endpoint

### Modified
- `components/bos/syllabus-form.tsx` — Import card, upload handler, merge logic
- `package.json` — `pdf-parse`, `mammoth`, `@types/pdf-parse`

---

## Task 1: Install dependencies

```bash
npm install pdf-parse mammoth
npm install --save-dev @types/pdf-parse
```

`xlsx` is already in `package.json` via SheetJS CDN tarball — no install needed.

**Verify:** `node -e "console.log(require('./package.json').dependencies['pdf-parse'])"` → `^2.x.x`

---

## Task 2: Build the regex parser

**File:** `lib/utils/bos/syllabus-parser.ts` (new)

**Public API:**
```ts
export function parseSyllabusText(text: string): ParsedSyllabus;
export function summarise(parsed: ParsedSyllabus): ParseSummary;
```

**Section parsers (one helper per syllabus tab):**

1. **`parseObjectives(lines)`** — finds `^course objectives` heading, then
   collects lines matching `/^(\d+)[.\)]?\s+(.+)/`. Continuations of wrapped
   text append to the previous objective. Stops at the next major heading.

2. **`parseClos(lines)`** — matches both single-line
   `/^CLO\s*(\d+)\s+(.+?)\s+(K\s*\d(?:\s*[,&]\s*K\s*\d)*)\s*$/i` and
   multi-line variants where K-values land on the next line. Look-ahead up
   to 3 lines for the K-value row.

3. **`parseUnits(lines)`** — finds `Unit-I` … `Unit-X` (Roman 1–10), pulls
   `(Book X - Chapter Y: Sections Z)` patterns into `remarks` via
   `/\(Book[^()]*\)/gi`, treats remaining text as the chapter title.

4. **`parseTextbooks(lines)`** — splits between `Text Books` and
   `Reference Books` buckets, strips bullet markers (`•`, `-`, `*`),
   splits `Author - Title, Publisher, Year` on the first ` - ` to fill
   `{ author, title }`.

5. **`parseWebResources(lines)`** — extracts URLs via
   `/https?:\/\/[^\s,;]+/g`, derives `title` from `URL.hostname`
   (stripped `www.`).

6. **`parsePedagogy(lines)`** — splits raw text on `,`, `;`, ` and `,
   ` & `; fuzzy-matches each token against `KNOWN_PEDAGOGY` (38 entries
   matching the form's chip lists). Unknown tokens pass through as custom
   methods.

7. **`parsePoMappings(lines)`** — finds `MAPPING WITH PROGRAMME OUTCOMES`
   heading, auto-detects PSO/PO column counts by finding where the second
   `1` appears in the header numeric row, then matches CO rows
   `/^CO\s*(\d+)\s+((?:[HML\-]\s+)*[HML\-])\s*$/i`. Splits values into
   PSO-then-PO halves and emits `{ PSOn: H|M|L }` and `{ POn: H|M|L }`
   maps (omits `-` cells).

**`KNOWN_PEDAGOGY` constant** — copy of `PEDAGOGY_COMMON ∪ PEDAGOGY_ADDITIONAL`
from `syllabus-form.tsx` (38 entries). Fuzzy match logic: token matches if
known method's first word starts the token, OR the token contains the known
method, OR the known method contains the token (case-insensitive).

**Why pure-text regex (no DOM/PDF.js objects):** keeps the parser usable across
all three file types — pdf-parse's `getText()`, mammoth's `extractRawText()`,
and SheetJS's `sheet_to_txt()` all yield plain strings the same parser can
consume.

---

## Task 3: Build the extraction API route

**File:** `app/api/bos/syllabus/extract/route.ts` (new)

```ts
export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_BYTES = 10 * 1024 * 1024;
```

**Steps:**
1. Authenticate via `createClient()` from `@/lib/supabase/server`. Reject 401
   if no session.
2. Read multipart form: `const file = formData.get('file')`. Reject 400 if
   missing, 413 if `> MAX_BYTES`.
3. Branch on file extension:
   - `.pdf` → `new PDFParse({ data: Uint8Array }).getText()`. Wrap in
     try/finally and call `parser.destroy()` to release the pdfjs worker.
     Convert Buffer → Uint8Array view (no copy):
     `new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)`.
   - `.docx` → `(await import('mammoth')).extractRawText({ buffer })`.
   - `.xlsx` / `.xls` → `XLSX.read(buffer, { type: 'buffer' })`, concatenate
     `XLSX.utils.sheet_to_txt()` for each sheet.
   - else → 415 Unsupported Media Type.
4. Reject 422 if extracted text is empty.
5. Call `parseSyllabusText(text)` and `summarise(parsed)`, return
   `{ data, summary }` JSON.

**Response shape:**
```jsonc
{
  "data": {
    "course_objectives": { "objectives": [...] },
    "course_learning_outcomes": { "clos": [...] },
    "course_content": { "units": [...] },
    "textbooks": { "primary": [...], "references": [...] },
    "web_resources": { "resources": [...] },
    "pedagogy": { "methods": [...] },
    "po_mappings": { "mappings": [...] }
  },
  "summary": {
    "objectives": 2, "clos": 5, "units": 5,
    "textbooks": 3, "references": 6, "web_resources": 1,
    "pedagogy": 7, "po_mapping_rows": 5
  }
}
```

---

## Task 4: Add Import card + merge logic to the form

**File:** `components/bos/syllabus-form.tsx` (modify)

**Changes:**

1. **Imports:**
   - Add `type ChangeEvent` to `react` import.
   - Add `Upload`, `Loader2`, `FileText` to `lucide-react` import.

2. **State (inside `SyllabusForm` component):**
   ```tsx
   const [isImporting, setIsImporting] = useState(false);
   const [importError, setImportError] = useState<string | null>(null);
   const [importSummary, setImportSummary] = useState<string | null>(null);
   const importInputRef = useRef<HTMLInputElement>(null);
   ```

3. **`handleImportFile` function** — placed before `handleSaveAndNext`:
   - POST file to `/api/bos/syllabus/extract` as `multipart/form-data`
   - On error → `setImportError(err.message)`
   - On success:
     - Call `setFormData(prev => ...)` with **non-destructive merge**: each
       section is overwritten only if `prev[section][listKey]` is empty.
       Helper: `isEmpty(val, listKey) = !val || !Array.isArray(val[listKey]) || val[listKey].length === 0`.
     - Build a summary string from `summary` counts:
       `"Imported: 2 objectives, 5 COs, 5 units, 3 textbooks, 6 references, 1 web resource, 7 pedagogy methods, PO mapping (5 rows)"`
     - `setImportSummary(...)`.
   - `finally` → reset input via `importInputRef.current.value = ''` so the
     same file can be re-uploaded.

4. **UI card** — placed at the top of `<TabsContent value="basic">`, above
   the existing `Course Information` card:
   - Dashed primary-tinted Card titled "Import from Document"
   - Description explains: fills 6 tabs, leaves Basic Info manual,
     non-destructive
   - Hidden `<input type="file" accept=".pdf,.docx,.xlsx,.xls">` triggered
     by a `<Button>` showing `<FileText>` (idle) or `<Loader2 className="animate-spin">` (importing)
   - Green Alert with `importSummary` (dismissible)
   - Destructive Alert with `importError` (dismissible)

**Why non-destructive merge:** users may import a partial document, manually
fix one tab, then re-import a corrected version. Without the guard, their
fixes would be wiped on the second upload.

**Why Basic Info stays manual:** institution, composition, meeting, course
code, regulation, board, hours, credits all flow from existing
composition+course-master lookups. Parsing them from a document is unreliable
and would require ID-resolution against the database.

---

## Task 5: Verify

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: exit 0, no errors in any of the 3 new/modified files.

**Manual smoke test:**
1. `npm run dev`
2. Sign in, navigate to `/bos/syllabus/new`
3. Upload the sample `aa.pdf` (Anna University ALGEBRA & TRIGONOMETRY)
4. Expect green banner: `"Imported: 2 objectives, 5 COs, 5 units, 3 textbooks, 6 references, 1 web resource, 7 pedagogy methods, PO mapping (5 rows)"`
5. Click each tab, verify content matches the document
6. Manually edit one objective, re-upload → verify the manual edit is preserved

---

## Known issues / future improvements

| Issue | Severity | Mitigation |
|---|---|---|
| pdf-parse v2 has different API from v1 (class vs function) | resolved | Documented in route comments |
| `Buffer` → `Uint8Array` conversion required for pdf-parse | resolved | View over same memory, no copy |
| Some PDF tables don't preserve row alignment in `getText()` | known | Future: switch to `parser.getTable()` for native table extraction |
| Pedagogy fuzzy matching may produce false positives | low | Custom-method passthrough lets users see/edit unmatched tokens |
| PO mapping requires `MAPPING WITH PROGRAMME OUTCOMES` heading | known | If the heading text differs, the section is skipped (graceful) |
| 10 MB upload limit | low | Configurable via `MAX_BYTES` constant |

## Phase 2: Template / Import / Export (added 2026-05-13)

After the import was working, a separate feature was added so users can also
**download an empty template** to fill in offline, and **export an existing
syllabus** back to XLSX for editing in Excel and re-importing.

### Additional files

| Path | Purpose |
|---|---|
| `lib/utils/bos/syllabus-xlsx.ts` | Shared workbook builder — exports `buildSyllabusTemplate()` and `buildSyllabusWorkbook(syllabus)` |
| `app/api/bos/syllabus/template/route.ts` | `GET` — auth-gated empty template download |
| `app/api/bos/syllabus/[id]/export-xlsx/route.ts` | `GET` — auth+scope-gated filled XLSX export |
| `app/(routes)/bos/syllabus/_components/syllabus-actions.tsx` | Client component — header buttons + per-row export helper |

### Modified files (Phase 2)

| Path | Change |
|---|---|
| `app/(routes)/bos/syllabus/page.tsx` | Header with title + `<SyllabusActions />` bar |
| `app/(routes)/bos/syllabus/_components/row-actions.tsx` | New "Export to Excel" `DropdownMenuItem` |
| `components/bos/syllabus-form.tsx` | `useEffect` reads `sessionStorage['bos.syllabus.import.handoff']` on mount to receive parsed data from the list-page Import button |
| `lib/utils/bos/syllabus-parser.ts` | Adds `parseSyllabusSheets()` — multi-sheet XLSX dispatch |
| `app/api/bos/syllabus/extract/route.ts` | XLSX branch now converts sheets to 2D matrices and calls `parseSyllabusSheets()` |

### Sheet contract (must stay in sync)

| Sheet name | Headers | Notes |
|---|---|---|
| `Course_Info` | Field, Value | Two-column key/value for course metadata |
| `Objectives` | Number, Description | One row per objective |
| `CLOs` | CLO, Description, K-Values | K-Values is comma-separated: `K2, K3` |
| `Units` | Unit, Title, Chapter, Sections, Remarks | **Multiple rows per unit** — one per topic; rows with same Unit ID group together |
| `Textbooks` | Title, Author | |
| `References` | Title, Author | |
| `WebResources` | Title, URL | |
| `Pedagogy` | Method | One method per row |
| `PO_Mapping` | CO, PSO1..N, PO1..N | Cell values: H / M / L / blank |

### List-page Import flow

```
User on /bos/syllabus
  └─ Click [Import] button
      └─ File picker opens (.pdf, .docx, .xlsx)
          └─ POST /api/bos/syllabus/extract
              └─ Parsed JSON returned
                  └─ sessionStorage.setItem('bos.syllabus.import.handoff', json)
                      └─ router.push('/bos/syllabus/new')
                          └─ SyllabusForm useEffect reads + removes the handoff
                              └─ setFormData(...) prefills 6 tabs
                                  └─ User fills Basic Info + Save
```

Why sessionStorage instead of query params: the parsed payload regularly
exceeds 50 KB (units + PO mapping + textbooks), which busts URL length
limits in some browsers/proxies.

Why `removeItem` after read: prevents the data replaying if the user
refreshes the new-syllabus page after starting to edit.

### Export flow

- **List page:** row dropdown → "Export to Excel" → calls
  `exportSyllabusToXlsx(id, courseCode)` which fetches the route and
  triggers a browser download via a temporary `<a download>` link.
- **Filename:** `{courseCode}-{first 40 chars of name}.xlsx`, sanitised to
  `[a-zA-Z0-9_-]` only. Falls back to `syllabus.xlsx` if both are empty.

### Round-trip guarantee

The XLSX produced by `buildSyllabusWorkbook()` has identical sheet names,
headers, and value formats to what `parseSyllabusSheets()` reads — so
**export → edit in Excel → re-import** produces the same data minus the
Basic Info linking fields (institution, composition, meeting). This is
intentional: those are reference IDs that depend on the target environment.

## Out of scope (deliberately deferred)

- Bulk migration UI (admin batch import, one file = many syllabi) — small
  migration scale (<50) doesn't justify the complexity; per-form upload is
  sufficient
- AI/LLM extraction backend — user explicitly chose rule-based only
- OCR for scanned PDFs — user confirmed only digital PDFs are in scope
- Preview/diff before fill — user chose instant fill flow for speed

---

## Rollback

If the import feature causes issues, the rollback is purely additive removal:

1. Delete `app/api/bos/syllabus/extract/route.ts`
2. Delete `lib/utils/bos/syllabus-parser.ts`
3. In `components/bos/syllabus-form.tsx`, revert:
   - the `lucide-react` import additions (`Upload`, `Loader2`, `FileText`)
   - the `ChangeEvent` type import
   - the 4 import-state lines
   - the `handleImportFile` function
   - the entire "Import from Document" Card block in `<TabsContent value="basic">`
4. `npm uninstall pdf-parse mammoth @types/pdf-parse`

No database schema changes, no Supabase RLS impact, no permission changes.
