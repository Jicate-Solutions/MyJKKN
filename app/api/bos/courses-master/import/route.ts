// app/api/bos/courses-master/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveBosBoardScope,
  resolveCoeInstitutionId,
  guardCourseInstitutionWrite,
} from '@/lib/utils/bos/bos-access';
import { makeImportRowSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';
import type { BosBulkImportResponse } from '@/types/bos-courses';
import type { AcademicModel } from '@/types/bos';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Authorization is composition membership — NOT the role-permission grant.
    // Mirrors POST /api/bos/courses-master: custom_roles.permissions drifts out
    // of sync with bos_members (see [feedback_bos_membership_is_authorization]),
    // so a valid active board member could be blocked by a perm-key check.
    const boardScope = await resolveBosBoardScope(user.id);
    if (!boardScope.isSuperAdmin && boardScope.memberOf.size === 0) {
      return NextResponse.json(
        { error: 'Forbidden: you must be an active BoS member to import courses' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { rows, context } = body as {
      rows: unknown[];
      context: {
        institution_id: string;
        institution_code: string;
        regulation_code: string;
        regulation_id?: string;
        board_id?: string;
        board_code?: string;
        academic_model?: AcademicModel;
      };
    };
    // Year-based pharmacy/AHS imports (mgr_pharmd, mgr_ahs) relax the strict
    // Anna row schema (no credits/hours/category). Defaults to 'anna_univ'.
    const academic_model: AcademicModel = context?.academic_model ?? 'anna_univ';
    const rowSchema = makeImportRowSchema(academic_model);

    if (!Array.isArray(rows) || !context?.institution_id) {
      return NextResponse.json({ error: 'rows[] and context required' }, { status: 400 });
    }
    // Without a board the created courses carry no board_code, so the
    // board-scope filter on /bos/courses would hide them from every
    // non-super-admin (see toCoeCreatePayload's board_code docs).
    if (!context.board_code) {
      return NextResponse.json(
        { error: 'context.board_code is required — pick a board in the import dialog' },
        { status: 400 },
      );
    }

    const writeError = guardCourseInstitutionWrite(boardScope, context.institution_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }
    // Belt-and-suspenders: the picked board must be one the user serves on.
    if (
      !boardScope.isSuperAdmin &&
      context.board_id &&
      !boardScope.boardsOf.has(context.board_id)
    ) {
      return NextResponse.json(
        { error: 'Forbidden: you can only import courses under boards you serve on' },
        { status: 403 },
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(context.institution_id);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    // ── Stage 1: validate every row, collect errors ───────────────────────────
    const validRows: Array<{
      row: number;
      payload: ReturnType<typeof toCoeCreatePayload>;
    }> = [];
    const errors: BosBulkImportResponse['errors'] = [];

    rows.forEach((raw, idx) => {
      // Prefer the client-sent sheet row number (the dialog skips blank and
      // invalid rows before upload, so positional idx+2 would drift).
      const clientRow = (raw as { __row?: number })?.__row;
      const parsed = rowSchema.safeParse({
        ...(raw as object),
        __row: typeof clientRow === 'number' ? clientRow : idx + 2,
      });
      if (!parsed.success) {
        errors.push({
          row: idx + 2,
          course_code: (raw as { course_code?: string })?.course_code,
          message: parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        });
        return;
      }
      const { __row, ...form } = parsed.data;
      validRows.push({
        row: __row,
        payload: toCoeCreatePayload(form, {
          institutions_id: coeInstitutionId,
          institution_code: context.institution_code,
          regulation_code: context.regulation_code,
          regulation_id: context.regulation_id,
          board_id: context.board_id,
          board_code: context.board_code,
          academic_model,
        }),
      });
    });

    const client = CoeRestClient.create();

    // ── Stage 2: duplicate checks ─────────────────────────────────────────────
    // In-file duplicates (defence in depth — the dialog also checks client-side).
    const seenCodes = new Map<string, number>();
    const deduped: typeof validRows = [];
    for (const v of validRows) {
      const first = seenCodes.get(v.payload.course_code);
      if (first !== undefined) {
        errors.push({
          row: v.row,
          course_code: v.payload.course_code,
          message: `Duplicate course code in this file (also at row ${first})`,
        });
        continue;
      }
      seenCodes.set(v.payload.course_code, v.row);
      deduped.push(v);
    }

    // Existing-code pre-flight — mirrors the single-create POST's 409: reject
    // with a row error rather than letting COE's bulk endpoint silently
    // upsert. COE has no bulk code-lookup, so paginate the institution's full
    // course set once and check locally.
    const existingCodes = new Set<string>();
    if (deduped.length > 0) {
      const PAGE = 200;
      const MAX_PAGES = 12; // safety cap — 2400 courses (matches list GET)
      for (let p = 0; p < MAX_PAGES; p++) {
        const raw = await client.get<unknown>('/api/v1/courses', {
          institutions_id: coeInstitutionId,
          limit: String(PAGE),
          offset: String(p * PAGE),
        }).catch((err) => {
          console.error('[bos/courses-master/import] existing-codes page fetch failed', p, err);
          return null;
        });
        if (!raw) break;
        const page = Array.isArray(raw)
          ? (raw as { course_code?: string; institutions_id?: string | null }[])
          : ((raw as { data?: { course_code?: string; institutions_id?: string | null }[] })?.data ?? []);
        for (const c of page) {
          // COE may leak other institutions' rows — same guard as the list GET.
          if (c.course_code && (!c.institutions_id || c.institutions_id === coeInstitutionId)) {
            existingCodes.add(c.course_code.toUpperCase());
          }
        }
        if (page.length < PAGE) break;
      }
    }
    const toCreate = deduped.filter((v) => {
      if (existingCodes.has(v.payload.course_code)) {
        errors.push({
          row: v.row,
          course_code: v.payload.course_code,
          message: 'Course code already exists for this institution — open the existing course to edit it',
        });
        return false;
      }
      return true;
    });

    // ── Stage 3: create each course individually ──────────────────────────────
    // COE's POST /api/v1/courses creates ONE course from a FLAT body — the same
    // shape the single-create route (/api/bos/courses-master POST) sends and
    // which is known to work. It is NOT a bulk endpoint: posting
    // `{ courses: [...] }` makes COE look for the required fields at the root of
    // the body, find none (they're nested inside each courses[] item), and
    // reject the whole batch with "Missing required fields: institution_code,
    // regulation_code, course_code, course_title". So POST one flat payload per
    // course. Sequential to avoid hammering COE; row counts here are small
    // (one regulation's course set).
    let inserted = 0;
    const updated = 0; // COE single-create only inserts; existing codes were pre-filtered above.

    for (const item of toCreate) {
      try {
        await client.post<unknown>('/api/v1/courses', item.payload);
        inserted += 1;
      } catch (err) {
        if (err instanceof CoeApiError) {
          errors.push({
            row: item.row,
            course_code: item.payload.course_code,
            message: err.message,
          });
        } else {
          throw err;
        }
      }
    }

    const response: BosBulkImportResponse = {
      inserted,
      updated,
      total: rows.length,
      errors,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[bos/courses-master/import] error:', error);
    return NextResponse.json({ error: 'Bulk import failed' }, { status: 500 });
  }
}
