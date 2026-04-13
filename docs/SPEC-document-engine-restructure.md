# SPEC: Document Engine Restructure

## Context

We built a 29-file, 4,649-line Document Generation Engine with a centralized `/documents` hub page and 15 generators. Self-critique revealed:

- **30% redundant**: Duplicates existing PDE certificate, attendance PDF, event exports
- **20% premature**: Report cards, hall tickets, progress reports need data tables that don't exist yet
- **Architecturally wrong**: Centralized hub violates SRP. Each module already owns its data and should own its documents.

The existing codebase already has **6 standalone PDF generators** (1,259 lines total) that work correctly. Two of them (VAC certificate, facilitator report) use inline jsPDF and should be refactored to shared utilities.

## True Goal

Transform the centralized Document Generation Engine into:
1. **Shared PDF utilities** — reusable by ANY module (branding, audit trail, QR verification, base class)
2. **Module-integrated generators** — each module generates its own documents using the shared utilities
3. **Learner profile document hub** — the ONE place where cross-module documents (bonafide, TC, general letter) live

This is NOT a rewrite. It's a restructure: move files, delete waste, wire shared utilities into existing module pages.

## What Changes

### KEEP (Crown Jewels → shared utilities)

| File | Current Location | New Location | Lines | Why keep |
|------|-----------------|-------------|-------|----------|
| Base generator class | `lib/utils/document-generators/base-document-generator.ts` | `lib/utils/pdf/base-document-generator.ts` | 453 | 20+ reusable drawing methods, any module extends this |
| Brand utilities | `lib/utils/document-generators/brand-utils.ts` | `lib/utils/pdf/brand-utils.ts` | 144 | Hex→RGB, QR generation, verification codes, date formatting |
| Generator types | `lib/utils/document-generators/types.ts` (extract from documents.ts) | `lib/utils/pdf/types.ts` | ~80 | DocumentBranding, DocumentMetadata, RGBColor |
| Audit service | NEW (extract from document-generation-service.ts) | `lib/services/document-audit-service.ts` | ~120 | Insert audit record, verify by code, revoke — standalone |
| autoTable type augmentation | In base-document-generator.ts | stays | 6 | `declare module 'jspdf'` |

### KEEP (Database tables — already created, genuinely valuable)

| Table | Purpose | Keep as-is |
|-------|---------|-----------|
| `document_institution_settings` | Per-institution branding (colors, logos, signatures) | Yes |
| `generated_documents` | Audit trail with verification codes | Yes |
| `document_number_sequences` | Atomic sequential numbering | Yes |
| `document_templates` | Template configs | Simplify — remove unused columns, keep for letter body templates only |
| `next_document_number()` | SQL function for atomic increment | Yes |

### KEEP (Generators that are genuinely new — not duplicated anywhere)

| Generator | New Location | Used by |
|-----------|-------------|---------|
| `bonafide-letter.ts` | `lib/utils/pdf/generators/bonafide-letter.ts` | Learner profile → Documents tab |
| `transfer-certificate.ts` | `lib/utils/pdf/generators/transfer-certificate.ts` | Learner profile → Documents tab |
| `general-letter.ts` | `lib/utils/pdf/generators/general-letter.ts` | Learner profile → Documents tab |
| `fee-notice-letter.ts` | `lib/utils/pdf/generators/fee-notice-letter.ts` | Billing module → "Send Fee Notice" button |
| `class-roster.ts` | `lib/utils/pdf/generators/class-roster.ts` | Academic module → Section page |

### DELETE (Redundant or premature)

| File | Why delete |
|------|-----------|
| `completion-certificate.ts` | Duplicates `certificate-pdf.ts` (PDE already does this better with Fink's radar chart) |
| `scholarship-certificate.ts` | No scholarship module exists. Premature. |
| `attendance-certificate.ts` | Attendance module already exports PDFs. Award certificates can use the existing `certificate-pdf.ts`. |
| `achievement-certificate.ts` | No events/achievements module. Premature. |
| `training-certificate.ts` | Duplicates PDE certificate concept. |
| `admission-letter.ts` | Admission module has `communication-templates-service.ts`. Letters should be part of that workflow, not a separate generator. |
| `recommendation-letter.ts` | Rarely used. Can be added to general-letter.ts as a template preset. |
| `report-card.ts` | No grades table exists. **Cannot work.** Build when grades module ships. |
| `hall-ticket.ts` | No exam schedule table exists. **Cannot work.** Build when examination module ships. |
| `progress-report.ts` | Overlaps with existing attendance export. No grades to show. Premature. |

### DELETE (Centralized orchestration — wrong pattern)

| File | Why delete |
|------|-----------|
| `lib/services/documents/document-generation-service.ts` | Centralized orchestrator. Modules should call shared utilities directly. |
| `lib/services/documents/document-data-service.ts` | Each module already has its own data queries. Don't duplicate. |
| `lib/utils/document-generators/generator-registry.ts` | No central registry needed when modules import generators directly. |
| `app/(routes)/documents/page.tsx` | Hub page. Documents belong in their module's UI, not a separate section. |
| `app/(routes)/documents/_components/generate-document-dialog.tsx` | Goes with hub page. |
| `app/(routes)/documents/history/page.tsx` | Audit trail should be viewed in Admin/System, not a separate module. |
| `hooks/documents/use-documents.ts` | Centralized hooks. Each module uses its own hook pattern. |

### KEEP + IMPROVE (Existing generators)

| Existing File | Improvement |
|--------------|------------|
| `lib/utils/certificate-pdf.ts` | Refactor to extend `BaseDocumentGenerator`. Add audit trail via `document-audit-service.ts`. |
| `lib/utils/pdf-export/consolidation-report-pdf.ts` | Refactor to extend `BaseDocumentGenerator` for shared branding. Already works well. |
| VAC certificate (inline in page) | Extract to `lib/utils/pdf/generators/vac-certificate.ts` extending base class. |
| Facilitator report (inline) | Extract to `lib/utils/pdf/generators/facilitator-report.ts` extending base class. |

### KEEP (UI integrations that are correct)

| Component | Why keep |
|-----------|---------|
| `learner-documents-tab.tsx` | Correct placement — cross-module docs (bonafide, TC) belong on learner profile |
| Sidebar "Documents" group | **DELETE** — no hub page means no sidebar entry needed |
| Documents tab in learner-detail.tsx | Keep the tab, simplify to use shared utilities directly |
| `app/documents/verify/[code]/page.tsx` | Public verification page — correct, keep |
| `app/api/documents/verify/route.ts` | Public API — correct, keep |

## New File Structure After Restructure

```
lib/utils/pdf/                              # SHARED PDF UTILITIES (the crown jewels)
  base-document-generator.ts                 # Abstract base class (move from document-generators/)
  brand-utils.ts                             # Colors, QR, verification codes (move)
  types.ts                                   # DocumentBranding, DocumentMetadata (extract)
  generators/                                # Genuinely new generators only
    bonafide-letter.ts                       # Learner profile
    transfer-certificate.ts                  # Learner profile  
    general-letter.ts                        # Learner profile (with {{placeholder}} templates)
    fee-notice-letter.ts                     # Billing module
    class-roster.ts                          # Academic module

lib/utils/certificate-pdf.ts                # EXISTING — refactor to extend base class
lib/utils/pdf-export/                        # EXISTING — keep as-is for now
  consolidation-report-pdf.ts
  registrations-pdf.ts
  sarvam-galatta-pdf.ts

lib/services/document-audit-service.ts      # NEW — extracted audit trail service
                                             # insertAuditRecord(), verifyByCode(), revoke()
                                             # Uses generated_documents + document_number_sequences tables

app/documents/verify/[code]/page.tsx        # PUBLIC verification (keep)
app/api/documents/verify/route.ts           # PUBLIC API (keep)

# DELETED:
# lib/utils/document-generators/            # Entire old directory
# lib/services/documents/                   # Centralized services  
# hooks/documents/                          # Centralized hooks
# app/(routes)/documents/                   # Hub page + dialog + history
```

## Module Integration Points

### 1. Learner Profile → Documents Tab (KEEP + SIMPLIFY)

**File:** `app/(routes)/learners/profiles/_components/learner-documents-tab.tsx`

**What it offers:**
- Bonafide Certificate (one-click from profile)
- Transfer Certificate (one-click from profile)
- General Letter (template-based, customizable body)

**How it works:**
1. Component imports generators directly: `import { BonafideLetterGenerator } from '@/lib/utils/pdf/generators/bonafide-letter'`
2. Gets learner data from the already-loaded profile (no extra queries)
3. Gets branding from `document_institution_settings` via a simple hook
4. Generates PDF client-side, triggers download via file-saver
5. Calls `DocumentAuditService.insertAuditRecord()` for the audit trail

### 2. Billing → Fee Notice Button (NEW integration)

**File:** `app/(routes)/billing/student-bills/_components/` (add button to existing page)

**What it offers:**
- "Send Fee Notice" button on outstanding bills view
- Generates PDF with bill details table, due dates, payment instructions

**How it works:**
1. Button on student bills page calls `FeeNoticeLetterGenerator`
2. Bills data is already loaded on the page (no extra query)
3. Uses shared branding + audit trail

### 3. Academic → Class Roster Button (NEW integration)

**File:** `app/(routes)/organizations/sections/` or `app/(routes)/academic/` (add button to section view)

**What it offers:**
- "Export Class Roster" button on section detail page
- Generates landscape PDF with all students in section

### 4. PDE Certificate (EXISTING — enhance)

**File:** `app/(routes)/learn/certificate/[id]/page.tsx` (already works)

**Enhancement:** Add `DocumentAuditService.insertAuditRecord()` after PDF generation to get audit trail + verification tracking.

## Success Criteria

| Criteria | Test |
|----------|------|
| Shared base class works | Any module can `extends BaseDocumentGenerator` and generate branded PDFs |
| Audit trail works | Generated documents appear in `generated_documents` table with verification codes |
| Public verification works | `GET /documents/verify/TESTCODE` returns 200 with document details (or 404) |
| Bonafide from profile | Click "Bonafide Certificate" on learner profile → PDF downloads with learner data |
| TC from profile | Click "Transfer Certificate" on learner profile → PDF downloads |
| Fee notice from billing | Click "Send Fee Notice" on student bills → PDF downloads with bill table |
| No centralized hub | `/documents` route returns 404 (deleted) |
| No regression | PDE certificate still works, attendance exports still work, billing receipts still work |
| File count reduced | From 29 files → ~12 files (shared utils + 5 generators + verification + audit service) |
| Line count reduced | From 4,649 lines → ~2,000 lines |

## Out of Scope

- Report cards (no grades table)
- Hall tickets (no exam schedule table)
- Scholarship certificates (no scholarship module)
- Achievement certificates (no events/achievements tracking)
- Admission letters (belongs in admission communication templates workflow)
- Migrating existing consolidation-report-pdf.ts / registrations-pdf.ts to extend base class (nice-to-have, not blocking)

## Risk

| Risk | Mitigation |
|------|-----------|
| Breaking existing PDE certificate page | Don't modify certificate-pdf.ts until after restructure is verified. Enhancement (audit trail) is additive. |
| Breaking attendance exports | Don't touch consolidation-report-pdf.ts at all. It stays as-is. |
| Losing the database tables | Tables persist regardless of code changes. No migration needed. |
| Learner profile tab breaks | Keep learner-documents-tab.tsx, simplify its imports to point to new locations. |

---

*Spec Version: 1.0*
*Created: 2026-04-13*
*Approach: Restructure (delete waste, keep gems, integrate into modules)*
