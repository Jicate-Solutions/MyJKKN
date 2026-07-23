import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';

// ── Validation ────────────────────────────────────────────────────────────────
// Per the existing public.smtp_configuration schema (varchar institution_code,
// not institutions_id uuid). We translate BoS's uuid → counselling_code at the
// API boundary to keep BoS callers UUID-native while not breaking the
// practical-allotment module that already reads/writes this table by code.

const PASSWORD_MASK = '••••••••';

const upsertSchema = z.object({
  institutionsId: z.string().uuid(),
  smtp_host: z.string().min(1).max(255),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_secure: z.boolean(),
  smtp_user: z.string().min(1).max(255),
  // Password may be the mask — meaning "keep existing". Validated as
  // non-empty string; the route will skip the column update when it's the mask.
  smtp_password: z.string().min(1),
  sender_email: z.string().email().max(255),
  sender_name: z.string().min(1).max(255),
  // Academic Council From override. Optional — empty string / omitted means
  // AC notices fall back to the shared sender_email / sender_name.
  ac_sender_email: z.string().email().max(255).optional().or(z.literal('')),
  ac_sender_name: z.string().max(255).optional(),
  default_cc_emails: z.array(z.string().email()).max(10).optional(),
  is_active: z.boolean().default(true),
});

async function canManageSmtp(userId: string): Promise<boolean> {
  const scope = await resolveBosBoardScope(userId);
  // Same gate as the template editor — chairman/principal/super-admin.
  return scope.isSuperAdmin || scope.isPrincipal || scope.isChairmanIn.size > 0;
}

/** Translate BoS institutions_id (uuid) → counselling_code (varchar) used by smtp_configuration. */
async function resolveInstitutionCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  institutionsId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('institutions')
    .select('counselling_code')
    .eq('id', institutionsId)
    .maybeSingle();
  return (data as { counselling_code?: string | null } | null)?.counselling_code ?? null;
}

// ── Phase-aware write-error response ─────────────────────────────────────────
// Captures EVERY shape we've seen for Supabase/Postgrest errors and surfaces
// the most useful pieces in the response body so the client toast is actionable.
function handleWriteError(
  raw: unknown,
  phase: 'insert' | 'update',
  payload: Record<string, unknown>,
  institutionCode: string,
): NextResponse {
  const e = raw as {
    code?: string;
    message?: string;
    hint?: string;
    details?: string;
    name?: string;
  };

  console.error(`[bos/smtp-config] ${phase} error — deep diagnostic:`, {
    phase,
    institutionCode,
    typeofErr: typeof raw,
    isError: raw instanceof Error,
    constructorName: (raw as object | null)?.constructor?.name,
    ownKeys:
      raw && typeof raw === 'object' ? Object.keys(raw as object) : null,
    asJson: (() => {
      try {
        return JSON.stringify(raw, Object.getOwnPropertyNames((raw as object) ?? {}));
      } catch {
        return String(raw);
      }
    })(),
    name: e.name,
    code: e.code,
    message: e.message,
    hint: e.hint,
    details: e.details,
    payloadKeys: Object.keys(payload),
  });

  // 42501 — row-level security denial.
  if (e.code === '42501' || e.message?.toLowerCase().includes('row-level security')) {
    return NextResponse.json(
      {
        error:
          'Permission denied by row-level security on `smtp_configuration`. ' +
          'Ensure migration 20260516b_smtp_configuration_bos_rls.sql has been applied ' +
          'AND your `profiles.role` is `super_admin`, `principal`, or `hod`.',
        phase,
        code: e.code,
      },
      { status: 403 }
    );
  }

  // 23502 — NOT NULL violation.
  if (e.code === '23502') {
    return NextResponse.json(
      {
        error: `Missing required column: ${e.message ?? e.details ?? '(see server logs)'}`,
        phase,
        code: e.code,
      },
      { status: 400 }
    );
  }

  // 42703 — undefined column. Means migration is out of sync with route payload.
  if (e.code === '42703') {
    return NextResponse.json(
      {
        error:
          `Schema mismatch — column referenced by the API doesn't exist in smtp_configuration. ` +
          `Details: ${e.message ?? e.details ?? 'n/a'}. ` +
          `Re-apply migration 20260516b_smtp_configuration_bos_rls.sql.`,
        phase,
        code: e.code,
      },
      { status: 500 }
    );
  }

  // 42P01 — relation doesn't exist.
  if (e.code === '42P01') {
    return NextResponse.json(
      {
        error:
          'Table `smtp_configuration` does not exist. Apply migration ' +
          '`20260516b_smtp_configuration_bos_rls.sql` via `supabase db push`.',
        phase,
        code: e.code,
      },
      { status: 500 }
    );
  }

  // Truly unknown shape — the diagnostic we logged above is the only signal.
  // Surface the raw JSON so the user can paste it back and we can fingerprint
  // whatever weird shape Supabase is throwing this time.
  const rawJson = (() => {
    try {
      return JSON.stringify(raw, Object.getOwnPropertyNames((raw as object) ?? {}));
    } catch {
      return String(raw);
    }
  })();

  return NextResponse.json(
    {
      error:
        e.message ??
        e.details ??
        `Save failed during ${phase} phase. Raw error: ${rawJson}`,
      phase,
      code: e.code,
      raw: rawJson,
    },
    { status: 500 }
  );
}

// ── GET /api/bos/smtp-config?institutionsId=… ─────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId');
    if (!institutionsId) {
      return NextResponse.json({ error: 'institutionsId is required' }, { status: 400 });
    }

    const institutionCode = await resolveInstitutionCode(supabase, institutionsId);
    if (!institutionCode) {
      // Institution has no counselling_code — nothing to look up. Return null
      // so the UI can render the form in "create" state.
      return NextResponse.json({ data: null });
    }

    const { data, error } = await supabase
      .from('smtp_configuration')
      .select('*')
      .eq('institution_code', institutionCode)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ data: null });

    // SECURITY: never echo the raw password back to the client. The UI shows
    // the mask in the password field if a value already exists.
    const masked = {
      ...data,
      smtp_password_encrypted: data.smtp_password_encrypted ? PASSWORD_MASK : '',
    };
    return NextResponse.json({ data: masked });
  } catch (error) {
    console.error('[bos/smtp-config] GET error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to fetch SMTP config' },
      { status: 500 }
    );
  }
}

// ── POST /api/bos/smtp-config ─────────────────────────────────────────────────
// Upsert by institution_code. If the password field is the mask, the existing
// stored password is preserved (so admins can edit other fields without
// re-entering credentials).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await canManageSmtp(user.id))) {
      return NextResponse.json(
        { error: 'Forbidden: only chairman/principal/super-admin can manage SMTP config' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      // Format each Zod issue as `field.path: message` for a self-describing
      // error message the toast can show directly.
      const fieldErrors = parsed.error.issues.map((iss) => {
        const path = iss.path.length > 0 ? iss.path.join('.') : '(root)';
        return `${path}: ${iss.message}`;
      });
      console.error('[bos/smtp-config] zod validation failed', {
        issues: parsed.error.issues,
        receivedKeys: Object.keys(body ?? {}),
        // Log the received body with the password masked so admins can
        // see *what* was sent without leaking secrets.
        receivedBody: {
          ...body,
          smtp_password: body?.smtp_password ? '••••••••' : '(missing)',
        },
      });
      return NextResponse.json(
        {
          error: `Invalid payload — ${fieldErrors.join('; ')}`,
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }
    const p = parsed.data;

    const institutionCode = await resolveInstitutionCode(supabase, p.institutionsId);
    if (!institutionCode) {
      return NextResponse.json(
        { error: 'Selected institution has no counselling_code — cannot save SMTP config' },
        { status: 400 }
      );
    }

    // Find existing row (if any). Surface the lookup error explicitly —
    // otherwise a permission-denied SELECT silently returns null and we'd
    // mistakenly enter the INSERT branch.
    const lookup = await supabase
      .from('smtp_configuration')
      .select('id, smtp_password_encrypted')
      .eq('institution_code', institutionCode)
      .maybeSingle();
    if (lookup.error) {
      const e = lookup.error as { code?: string; message?: string; hint?: string };
      console.error('[bos/smtp-config] lookup error:', e);
      return NextResponse.json(
        {
          error:
            `Existing-row lookup failed: ${e.message ?? 'unknown'} (code ${e.code ?? 'n/a'})`,
          phase: 'lookup',
        },
        { status: 500 }
      );
    }
    const existing = lookup.data;

    // Resolve the password to write. Mask = keep existing.
    let passwordToWrite: string;
    if (p.smtp_password === PASSWORD_MASK) {
      if (!existing?.smtp_password_encrypted) {
        return NextResponse.json(
          { error: 'Password is required on first save' },
          { status: 400 }
        );
      }
      passwordToWrite = existing.smtp_password_encrypted;
    } else {
      // Note: column is named *_encrypted historically but no env-based crypto
      // is configured (per project decision). We persist as-is. Future slice
      // can add encryption without changing the API surface — just rotate
      // values in place + decrypt on read.
      passwordToWrite = p.smtp_password;
    }

    const payload = {
      institution_code: institutionCode,
      smtp_host: p.smtp_host,
      smtp_port: p.smtp_port,
      smtp_secure: p.smtp_secure,
      smtp_user: p.smtp_user,
      smtp_password_encrypted: passwordToWrite,
      sender_email: p.sender_email,
      sender_name: p.sender_name,
      // Normalise empty strings to NULL so the sender falls back cleanly.
      ac_sender_email: p.ac_sender_email?.trim() ? p.ac_sender_email.trim() : null,
      ac_sender_name: p.ac_sender_name?.trim() ? p.ac_sender_name.trim() : null,
      default_cc_emails: p.default_cc_emails ?? null,
      is_active: p.is_active,
      updated_at: new Date().toISOString(),
    };

    // Log the payload (with password masked) so we can audit what got sent
    // to Postgres if it errors.
    console.log('[bos/smtp-config] writing payload:', {
      ...payload,
      smtp_password_encrypted: PASSWORD_MASK,
      phase: existing?.id ? 'update' : 'insert',
      institution_code: institutionCode,
      existing_id: existing?.id,
    });

    if (existing?.id) {
      const upd = await supabase
        .from('smtp_configuration')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (upd.error) {
        return handleWriteError(upd.error, 'update', payload, institutionCode);
      }
      return NextResponse.json({
        data: { ...upd.data, smtp_password_encrypted: PASSWORD_MASK },
      });
    }

    const ins = await supabase
      .from('smtp_configuration')
      .insert(payload)
      .select('*')
      .single();
    if (ins.error) {
      return handleWriteError(ins.error, 'insert', payload, institutionCode);
    }
    return NextResponse.json(
      { data: { ...ins.data, smtp_password_encrypted: PASSWORD_MASK } },
      { status: 201 }
    );
  } catch (error) {
    // Surface the underlying Postgres error so RLS denials, NOT NULL
    // violations, etc. show up in the toast instead of the generic fallback.
    const pgErr = error as {
      code?: string;
      message?: string;
      hint?: string;
      details?: string;
      name?: string;
      stack?: string;
    };

    // DEEP diagnostic: dump everything we can about the thrown value so we
    // can identify shapes that aren't PostgrestError. Logged once per failure.
    console.error('[bos/smtp-config] POST error — diagnostic dump:', {
      typeof: typeof error,
      isError: error instanceof Error,
      constructorName: error?.constructor?.name,
      ownKeys: error && typeof error === 'object' ? Object.keys(error as object) : null,
      asJson: (() => {
        try {
          return JSON.stringify(
            error,
            Object.getOwnPropertyNames(error as object),
          );
        } catch {
          return String(error);
        }
      })(),
      name: pgErr.name,
      code: pgErr.code,
      message: pgErr.message,
      hint: pgErr.hint,
      details: pgErr.details,
      stack: pgErr.stack?.split('\n').slice(0, 5).join('\n'),
    });

    // 42501 / "row-level security" — the smtp_configuration table predates
    // BoS and likely has no policy granting INSERT/UPDATE to chairman/HOD.
    // Tell the admin specifically what's needed.
    if (pgErr.code === '42501' || pgErr.message?.toLowerCase().includes('row-level security')) {
      return NextResponse.json(
        {
          error:
            'Permission denied by row-level security on `smtp_configuration`. ' +
            'This table is shared with the practical-allotment module and its ' +
            'INSERT/UPDATE policy doesn\'t grant access to BoS roles. ' +
            'Run a migration that creates a policy for super_admin / principal / chairman, ' +
            'or temporarily ALTER TABLE smtp_configuration DISABLE ROW LEVEL SECURITY.',
        },
        { status: 403 }
      );
    }

    // 23502 = NOT NULL violation. Surface which column.
    if (pgErr.code === '23502') {
      return NextResponse.json(
        { error: `Missing required field: ${pgErr.message ?? pgErr.details}` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          pgErr.message ??
          pgErr.details ??
          'Failed to save SMTP config — check server logs for the underlying error.',
        code: pgErr.code,
      },
      { status: 500 }
    );
  }
}
