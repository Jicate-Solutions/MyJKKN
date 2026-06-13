// app/api/bos/courses-master/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';
import { importRowSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';
import type { BosBulkImportResponse } from '@/types/bos-courses';

const CHUNK_SIZE = 500;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await canAccessBos(user.id, 'academic.bos-courses', 'import'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { rows, context } = body as {
      rows: unknown[];
      context: {
        institution_id: string;
        institution_code: string;
        regulation_code: string;
        regulation_id?: string;
      };
    };

    if (!Array.isArray(rows) || !context?.institution_id) {
      return NextResponse.json({ error: 'rows[] and context required' }, { status: 400 });
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
      const parsed = importRowSchema.safeParse({ ...(raw as object), __row: idx + 2 });
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
        }),
      });
    });

    // ── Stage 2: chunk + POST sequentially ────────────────────────────────────
    const client = CoeRestClient.create();
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const slice = validRows.slice(i, i + CHUNK_SIZE);
      try {
        const resp = await client.post<{
          inserted?: number;
          updated?: number;
          errors?: Array<{ message?: string } | string>;
        }>('/api/v1/courses', { courses: slice.map((s) => s.payload) });
        inserted += resp.inserted ?? 0;
        updated += resp.updated ?? 0;
        (resp.errors ?? []).forEach((e, j) => {
          const message =
            typeof e === 'string' ? e : (e?.message ?? String(e));
          errors.push({
            row: slice[j].row,
            course_code: slice[j].payload.course_code,
            message,
          });
        });
      } catch (err) {
        if (err instanceof CoeApiError) {
          slice.forEach((s) => {
            errors.push({
              row: s.row,
              course_code: s.payload.course_code,
              message: err.message,
            });
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
