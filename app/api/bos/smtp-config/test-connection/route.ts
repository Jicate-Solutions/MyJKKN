import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createConnection } from 'net';
import { createClient } from '@/lib/supabase/server';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';

// ── POST /api/bos/smtp-config/test-connection ────────────────────────────────
// Lightweight reachability check — opens a TCP socket to (host, port) and
// closes it. Confirms the SMTP server is reachable but does NOT authenticate
// (that would require nodemailer, which is not installed in this project).
// Catches: typo hostnames, wrong ports, firewall blocks, unreachable DNS.

const testSchema = z.object({
  smtp_host: z.string().min(1).max(255),
  smtp_port: z.number().int().min(1).max(65535),
  timeoutMs: z.number().int().min(500).max(15000).optional(),
});

async function probeTcp(host: string, port: number, timeoutMs: number): Promise<{
  ok: boolean;
  message: string;
  elapsedMs: number;
}> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const settle = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, message, elapsedMs: Date.now() - t0 });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true, 'Connection established'));
    socket.once('timeout', () => settle(false, `Timed out after ${timeoutMs}ms`));
    socket.once('error', (err) => settle(false, err.message));
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const allowed = scope.isSuperAdmin || scope.isPrincipal || scope.isChairmanIn.size > 0;
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden: only chairman/principal/super-admin can test SMTP' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { smtp_host, smtp_port, timeoutMs = 5000 } = parsed.data;
    const result = await probeTcp(smtp_host, smtp_port, timeoutMs);

    return NextResponse.json({
      success: result.ok,
      message: result.message,
      elapsedMs: result.elapsedMs,
      // Explicitly tell the caller this is a TCP-only check, not AUTH.
      checkType: 'tcp-reachability',
      hint: result.ok
        ? 'Host and port are reachable. To verify credentials, send a test email (Template tab → Send Test).'
        : 'Could not reach the SMTP host. Verify host name, port, and that your network allows outbound connections to this port.',
    });
  } catch (error) {
    console.error('[bos/smtp-config/test-connection] error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Test failed' },
      { status: 500 }
    );
  }
}
