# Document Engine Restructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Restructure the 29-file centralized Document Generation Engine into shared PDF utilities + module-integrated generation. Delete waste, keep gems, wire into existing modules.

**Architecture:** Move crown jewels (base class, brand utils, types) to `lib/utils/pdf/`. Extract a standalone audit service. Keep 5 genuinely new generators. Delete 10 redundant/premature generators + centralized hub + orchestrator. Simplify learner profile tab to use new paths.

**Tech Stack:** jsPDF, jspdf-autotable, qrcode, file-saver, Supabase (existing tables), Next.js App Router

**Spec:** `docs/SPEC-document-engine-restructure.md`

---

## Phase 1: Create Shared PDF Utilities (Foundation)

> These files are the crown jewels. Everything else depends on them.

### Task 1: Create `lib/utils/pdf/types.ts` — Extract generator types

**Files:**
- Create: `lib/utils/pdf/types.ts`
- Reference: `types/documents.ts` (source of truth for types)

**Step 1: Create the types file**

Extract ONLY the generator-internal types from `types/documents.ts`. The module-facing types (DocumentTemplate, GeneratedDocument, etc.) stay in `types/documents.ts`.

```typescript
// lib/utils/pdf/types.ts
// Re-export generator types from the central types file
// This keeps a single source of truth while giving generators a clean import path

export type {
  DocumentBranding,
  DocumentMetadata,
  DocumentType,
  DocumentCategory,
  PageOrientation,
  PageSize,
  SignatureConfig,
} from '@/types/documents';

export type { RGBColor } from './brand-utils';
```

**Step 2: Verify import resolves**

Run: `npx tsc --noEmit 2>&1 | grep "pdf/types" | head -5`
Expected: No errors (file just re-exports)

**Step 3: Commit**

```bash
git add lib/utils/pdf/types.ts
git commit -m "refactor(docs): create shared PDF types re-export"
```

---

### Task 2: Move `brand-utils.ts` to `lib/utils/pdf/`

**Files:**
- Move: `lib/utils/document-generators/brand-utils.ts` → `lib/utils/pdf/brand-utils.ts`

**Step 1: Copy file to new location**

```bash
mkdir -p lib/utils/pdf
cp lib/utils/document-generators/brand-utils.ts lib/utils/pdf/brand-utils.ts
```

No content changes needed — file has no internal imports that reference its own directory.

**Step 2: Verify file works at new path**

Run: `npx tsc --noEmit 2>&1 | grep "pdf/brand-utils" | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/utils/pdf/brand-utils.ts
git commit -m "refactor(docs): move brand-utils to shared pdf directory"
```

---

### Task 3: Move `base-document-generator.ts` to `lib/utils/pdf/`

**Files:**
- Move: `lib/utils/document-generators/base-document-generator.ts` → `lib/utils/pdf/base-document-generator.ts`

**Step 1: Copy file to new location**

```bash
cp lib/utils/document-generators/base-document-generator.ts lib/utils/pdf/base-document-generator.ts
```

**Step 2: Update the import path inside the file**

Change the brand-utils import from:
```typescript
import { DEFAULT_COLORS, type RGBColor, generateQRDataUrl, formatDateIndian } from './brand-utils';
```
This stays the same (relative path still works since both files move together).

Update the types import from:
```typescript
import type { DocumentBranding, DocumentMetadata, PageOrientation, PageSize } from '@/types/documents';
```
This also stays the same (absolute path).

No changes needed — both imports are correct at the new location.

**Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "pdf/base-document" | head -5`
Expected: No errors

**Step 4: Commit**

```bash
git add lib/utils/pdf/base-document-generator.ts
git commit -m "refactor(docs): move base-document-generator to shared pdf directory"
```

---

### Task 4: Move 5 kept generators to `lib/utils/pdf/generators/`

**Files:**
- Move: `lib/utils/document-generators/letters/bonafide-letter.ts` → `lib/utils/pdf/generators/bonafide-letter.ts`
- Move: `lib/utils/document-generators/administrative/transfer-certificate.ts` → `lib/utils/pdf/generators/transfer-certificate.ts`
- Move: `lib/utils/document-generators/letters/general-letter.ts` → `lib/utils/pdf/generators/general-letter.ts`
- Move: `lib/utils/document-generators/letters/fee-notice-letter.ts` → `lib/utils/pdf/generators/fee-notice-letter.ts`
- Move: `lib/utils/document-generators/administrative/class-roster.ts` → `lib/utils/pdf/generators/class-roster.ts`

**Step 1: Copy files**

```bash
mkdir -p lib/utils/pdf/generators
cp lib/utils/document-generators/letters/bonafide-letter.ts lib/utils/pdf/generators/bonafide-letter.ts
cp lib/utils/document-generators/administrative/transfer-certificate.ts lib/utils/pdf/generators/transfer-certificate.ts
cp lib/utils/document-generators/letters/general-letter.ts lib/utils/pdf/generators/general-letter.ts
cp lib/utils/document-generators/letters/fee-notice-letter.ts lib/utils/pdf/generators/fee-notice-letter.ts
cp lib/utils/document-generators/administrative/class-roster.ts lib/utils/pdf/generators/class-roster.ts
```

**Step 2: Update imports in each file**

Each generator imports from `'../base-document-generator'` and `'../brand-utils'`. At the new location these become `'../base-document-generator'` and `'../brand-utils'` — same relative paths since generators/ is one level below pdf/. **No changes needed.**

**Step 3: Verify all 5 resolve**

```bash
npx tsc --noEmit 2>&1 | grep "pdf/generators" | head -10
```
Expected: No errors

**Step 4: Commit**

```bash
git add lib/utils/pdf/generators/
git commit -m "refactor(docs): move 5 kept generators to shared pdf/generators"
```

---

## Phase 2: Create Audit Service (Extracted from centralized service)

### Task 5: Create `lib/services/document-audit-service.ts`

**Files:**
- Create: `lib/services/document-audit-service.ts`
- Reference: `lib/services/documents/document-generation-service.ts` (extract audit methods)

**Step 1: Create the standalone audit service**

```typescript
/**
 * Document Audit Service
 * Standalone service for document audit trail, verification, and numbering.
 * Used by any module that generates documents — not tied to a specific module.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { DocumentType, GeneratedDocument, DocumentStatus } from '@/types/documents';
import { generateVerificationCode, buildVerificationUrl } from '@/lib/utils/pdf/brand-utils';

export class DocumentAuditService {
  private static supabase = createClientSupabaseClient();

  /** Generate an atomic sequential document number */
  static async generateDocumentNumber(
    institutionId: string,
    documentType: DocumentType,
    prefix?: string
  ): Promise<string> {
    try {
      const year = new Date().getFullYear();
      const { data, error } = await (this.supabase as any).rpc('next_document_number', {
        p_institution_id: institutionId,
        p_document_type: documentType,
        p_year: year,
      });
      if (error) throw error;
      const seq = String(data).padStart(5, '0');
      return prefix ? `${prefix}${seq}` : `JKKN/${documentType.toUpperCase().slice(0, 4)}/${year}/${seq}`;
    } catch {
      return `DOC-${Date.now()}`;
    }
  }

  /** Generate a verification code and URL */
  static generateVerification(): { code: string; url: string } {
    const code = generateVerificationCode();
    return { code, url: buildVerificationUrl(code) };
  }

  /** Insert an audit record after PDF generation (non-blocking) */
  static async insertAuditRecord(record: {
    institution_id: string;
    document_type: DocumentType;
    category: string;
    learner_id?: string;
    section_id?: string;
    document_number: string;
    title: string;
    data_snapshot?: Record<string, unknown>;
    generated_by: string;
    verification_code?: string;
    verification_url?: string;
    file_size_bytes?: number;
  }): Promise<GeneratedDocument | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('generated_documents')
        .insert({
          ...record,
          status: 'generated',
          generated_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (error) {
        console.error('[document-audit] Insert failed (non-blocking):', error.message);
        return null;
      }
      return data as GeneratedDocument;
    } catch (e) {
      console.error('[document-audit] Insert error (non-blocking):', e);
      return null;
    }
  }

  /** Look up a document by verification code (public, no auth) */
  static async verifyByCode(code: string): Promise<GeneratedDocument | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('generated_documents')
        .select('*, learner:learner_id(id, first_name, last_name, roll_number), institution:institution_id(id, name)')
        .eq('verification_code', code)
        .single();
      if (error) return null;
      return data as GeneratedDocument;
    } catch {
      return null;
    }
  }

  /** Revoke a document */
  static async revoke(documentId: string, reason: string, userId: string): Promise<boolean> {
    try {
      const { error } = await (this.supabase as any)
        .from('generated_documents')
        .update({
          status: 'revoked' as DocumentStatus,
          revoked_at: new Date().toISOString(),
          revoked_by: userId,
          revoke_reason: reason,
        })
        .eq('id', documentId);
      return !error;
    } catch {
      return false;
    }
  }

  /** Get institution branding settings */
  static async getInstitutionBranding(institutionId: string) {
    try {
      const { data } = await (this.supabase as any)
        .from('document_institution_settings')
        .select('*')
        .eq('institution_id', institutionId)
        .single();
      return data || null;
    } catch {
      return null;
    }
  }
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep "document-audit-service" | head -5
```

**Step 3: Commit**

```bash
git add lib/services/document-audit-service.ts
git commit -m "refactor(docs): extract standalone document audit service"
```

---

## Phase 3: Rewire Learner Profile Documents Tab

### Task 6: Simplify `learner-documents-tab.tsx` to use new paths

**Files:**
- Modify: `app/(routes)/learners/profiles/_components/learner-documents-tab.tsx`

**Step 1: Rewrite the component to import from new locations and use generators directly**

The current component imports from `@/hooks/documents/use-documents` (centralized hooks — will be deleted). Rewrite to:
1. Import generators directly from `@/lib/utils/pdf/generators/`
2. Import audit service from `@/lib/services/document-audit-service`
3. Import branding assembly from `@/lib/utils/pdf/brand-utils`
4. Keep the same UI (dropdown with 3 document types: Bonafide, TC, General Letter)
5. Generate PDF client-side, download via file-saver, audit trail via service

The component should:
- Remove dependency on `useLearnerDocuments` and `useGenerateDocument` hooks
- Directly instantiate generators and call `generateAndDownload()`
- Call `DocumentAuditService.insertAuditRecord()` after generation
- Only offer 3 document types: Bonafide Certificate, Transfer Certificate, General Letter
- Accept `learner` prop (full LearnerProfile object) instead of just learnerId — the parent already has it loaded

**Step 2: Verify it compiles and the learner detail page still renders**

```bash
npx tsc --noEmit 2>&1 | grep "learner-documents" | head -5
```

**Step 3: Commit**

```bash
git add "app/(routes)/learners/profiles/_components/learner-documents-tab.tsx"
git commit -m "refactor(docs): simplify learner documents tab to use shared PDF utilities"
```

---

### Task 7: Update `learner-detail.tsx` to pass full learner data to documents tab

**Files:**
- Modify: `app/(routes)/learners/profiles/_components/learner-detail.tsx`

**Step 1: Update the import and props**

The current code passes `learnerId` and `institutionId`. If the simplified tab needs the full learner object, update:

```typescript
<LearnerDocumentsTab learner={learner} />
```

instead of:

```typescript
<LearnerDocumentsTab learnerId={learner.id} institutionId={learner.institution_id} />
```

**Step 2: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "learner-detail" | head -5
```

**Step 3: Commit**

```bash
git add "app/(routes)/learners/profiles/_components/learner-detail.tsx"
git commit -m "refactor(docs): pass full learner to documents tab"
```

---

## Phase 4: Update Verification API to use Audit Service

### Task 8: Update `app/api/documents/verify/route.ts`

**Files:**
- Modify: `app/api/documents/verify/route.ts`

**Step 1: Replace direct Supabase query with audit service**

```typescript
import { DocumentAuditService } from '@/lib/services/document-audit-service';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const doc = await DocumentAuditService.verifyByCode(code);
  if (!doc) return NextResponse.json({ found: false }, { status: 404 });

  return NextResponse.json({ found: true, document: doc });
}
```

**Step 2: Verify**

```bash
curl -s http://localhost:3000/api/documents/verify?code=TESTCODE | head -20
```

**Step 3: Commit**

```bash
git add app/api/documents/verify/route.ts
git commit -m "refactor(docs): verify API uses audit service"
```

---

## Phase 5: Delete Centralized Code

> Only after Phases 1-4 are verified working.

### Task 9: Remove sidebar Documents group

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Remove the Documents group block (lines ~1333-1350) and permission entries (lines ~132-135)**

Remove from MENU_PERMISSIONS:
```
'/documents': 'documents.view',
'/documents/history': 'documents.history.view',
'/documents/settings': 'documents.settings.view',
'/documents/templates': 'documents.templates.view',
```

Remove from GetPages():
```
{
  groupLabel: 'Documents',
  menus: [...]
}
```

**Step 2: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "refactor(docs): remove Documents sidebar group"
```

---

### Task 10: Delete centralized hub pages

**Files:**
- Delete: `app/(routes)/documents/page.tsx`
- Delete: `app/(routes)/documents/_components/generate-document-dialog.tsx`
- Delete: `app/(routes)/documents/history/page.tsx`
- Delete: `app/(routes)/documents/_components/` (entire directory)

**Step 1: Delete**

```bash
git rm -r "app/(routes)/documents/"
```

**Step 2: Commit**

```bash
git commit -m "refactor(docs): delete centralized documents hub page"
```

---

### Task 11: Delete centralized services and hooks

**Files:**
- Delete: `lib/services/documents/document-generation-service.ts`
- Delete: `lib/services/documents/document-data-service.ts`
- Delete: `lib/services/documents/` (entire directory)
- Delete: `hooks/documents/use-documents.ts`
- Delete: `hooks/documents/` (entire directory)

**Step 1: Delete**

```bash
git rm -r lib/services/documents/
git rm -r hooks/documents/
```

**Step 2: Commit**

```bash
git commit -m "refactor(docs): delete centralized document services and hooks"
```

---

### Task 12: Delete 10 redundant/premature generators + registry

**Files:**
- Delete: `lib/utils/document-generators/certificates/` (all 5 files)
- Delete: `lib/utils/document-generators/letters/admission-letter.ts`
- Delete: `lib/utils/document-generators/letters/recommendation-letter.ts`
- Delete: `lib/utils/document-generators/administrative/report-card.ts`
- Delete: `lib/utils/document-generators/administrative/hall-ticket.ts`
- Delete: `lib/utils/document-generators/administrative/progress-report.ts`
- Delete: `lib/utils/document-generators/generator-registry.ts`
- Delete: `lib/utils/document-generators/` (entire old directory, since everything useful was copied to `lib/utils/pdf/`)

**Step 1: Delete entire old directory**

```bash
git rm -r lib/utils/document-generators/
```

**Step 2: Verify no other file imports from old location**

```bash
grep -r "document-generators" --include="*.ts" --include="*.tsx" lib/ app/ hooks/ types/ | grep -v node_modules | grep -v worktree
```
Expected: No matches (all imports now point to `lib/utils/pdf/`)

**Step 3: Commit**

```bash
git commit -m "refactor(docs): delete old document-generators directory (replaced by lib/utils/pdf)"
```

---

## Phase 6: Verify Everything

### Task 13: Full verification

**Step 1: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v node_modules | head -20
```
Expected: Zero new errors from document engine files

**Step 2: File count check**

```bash
echo "=== Shared PDF utilities ===" && ls lib/utils/pdf/ lib/utils/pdf/generators/
echo "=== Audit service ===" && ls lib/services/document-audit-service.ts
echo "=== Verification ===" && ls "app/documents/verify/[code]/page.tsx" app/api/documents/verify/route.ts
echo "=== Learner integration ===" && ls "app/(routes)/learners/profiles/_components/learner-documents-tab.tsx"
echo "=== Deleted (should not exist) ===" && ls lib/utils/document-generators/ 2>&1 && ls lib/services/documents/ 2>&1 && ls hooks/documents/ 2>&1 && ls "app/(routes)/documents/" 2>&1
```

Expected:
- Shared PDF: 3 files (base, brand-utils, types) + 5 generators
- Audit service: 1 file
- Verification: 2 files (page + API route)
- Learner integration: 1 file
- Deleted: all "No such file" errors
- **Total: ~12 files** (down from 29)

**Step 3: Dev server smoke test**

```bash
npm run dev &
sleep 8
# Public verify page works
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/documents/verify/TESTCODE
# Hub page is gone
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/documents
# Learner profiles still load
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/learners/profiles
```

Expected: 200, 404, 307

**Step 4: Commit final state**

```bash
git add -A && git commit -m "refactor(docs): document engine restructure complete — 29 files → 12 files"
```

---

## Task Dependency Graph

```
Phase 1 (Foundation):     [Task 1] → [Task 2] → [Task 3] → [Task 4]
                                                      ↓
Phase 2 (Audit Service):                         [Task 5]
                                                      ↓
Phase 3 (Learner Tab):                    [Task 6] → [Task 7]
                                                      ↓
Phase 4 (Verify API):                            [Task 8]
                                                      ↓
Phase 5 (Delete):           [Task 9] → [Task 10] → [Task 11] → [Task 12]
                                                      ↓
Phase 6 (Verify):                               [Task 13]
```

Phases 1-4 are sequential (each builds on previous).
Phase 5 tasks are sequential (delete in safe order).
Phase 6 depends on everything.

**Total: 13 tasks, ~45 min estimated execution time**

---

## Gotchas

1. **Don't delete old files until new paths are verified** — Phase 5 only runs after Phases 1-4 pass
2. **`types/documents.ts` stays** — it has module-facing types (DocumentTemplate, GeneratedDocument) used by the audit service and verification page. Don't delete it.
3. **`app/documents/` (public, no parentheses) stays** — this is the public verification page, NOT part of the centralized hub
4. **Auto-save hooks may commit intermediate states** — that's fine, final commit message clarifies intent
5. **Worktree agents left stale files** — check `.claude/worktrees/` doesn't interfere with Turbopack
