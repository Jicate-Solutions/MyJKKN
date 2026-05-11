export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySignature } from "@/lib/pde/external-providers/aicbl/signature";
import {
  checkAndReserve,
  markFailed,
  markProcessed,
} from "@/lib/pde/external-providers/aicbl/idempotency";
import {
  handleAtRiskFlagged,
  handleCaseCompleted,
  handleOsceScored,
} from "@/lib/pde/external-providers/aicbl/handler";
import type {
  AicblEnvelope,
  AtRiskPayload,
  CaseCompletedPayload,
  OsceScoredPayload,
} from "@/lib/pde/external-providers/aicbl/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.AICBL_BRIDGE_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "AICBL_BRIDGE_SECRET not configured" },
      { status: 500 }
    );
  }

  let body: AicblEnvelope;
  try {
    body = (await req.json()) as AicblEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.event_id ||
    !body.event_type ||
    !body.client_id ||
    body.payload === undefined
  ) {
    return NextResponse.json(
      { error: "Invalid envelope: missing event_id, event_type, client_id, or payload" },
      { status: 400 }
    );
  }

  const sigHeader = req.headers.get("x-aicbl-signature");

  if (!verifySignature(body.payload, sigHeader, secret)) {
    return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
  }

  const { isNew } = await checkAndReserve(
    body.event_id,
    body.event_type,
    body.client_id,
    body.payload
  );

  if (!isNew) {
    return NextResponse.json({
      status: "duplicate",
      event_id: body.event_id,
    });
  }

  try {
    let links: {
      pde_portfolio_id?: string;
      pde_capability_progress_id?: string;
      evidence_mapping_id?: string;
    } = {};

    switch (body.event_type) {
      case "case.completed": {
        const result = await handleCaseCompleted(
          body.event_id,
          body.payload as CaseCompletedPayload
        );
        links = { pde_portfolio_id: result.pde_portfolio_id };
        break;
      }
      case "osce.scored": {
        const result = await handleOsceScored(
          body.event_id,
          body.payload as OsceScoredPayload
        );
        links = {
          pde_capability_progress_id: result.pde_capability_progress_id,
          evidence_mapping_id: result.evidence_mapping_id,
        };
        break;
      }
      case "student.at_risk_flagged": {
        await handleAtRiskFlagged(
          body.event_id,
          body.payload as AtRiskPayload
        );
        break;
      }
      case "case.published":
      case "weekly_report.generated": {
        // Phase 2 — deferred. Accept and skip so AICBL doesn't retry.
        await supabase_mark_skipped(body.event_id);
        return NextResponse.json({
          status: "skipped",
          event_type: body.event_type,
          event_id: body.event_id,
        });
      }
      default: {
        await markFailed(body.event_id, `Unknown event_type: ${body.event_type}`);
        return NextResponse.json(
          { error: `Unknown event_type: ${body.event_type}` },
          { status: 400 }
        );
      }
    }

    await markProcessed(body.event_id, links);

    return NextResponse.json({
      status: "processed",
      event_id: body.event_id,
      ...links,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await markFailed(body.event_id, message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Marks the inbox row as skipped for phase-2 deferred event types.
async function supabase_mark_skipped(eventId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  await supabase
    .from("aicbl_inbox_events")
    .update({
      status: "skipped",
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
}
