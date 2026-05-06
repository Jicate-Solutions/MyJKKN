import { createServiceRoleClient } from "@/lib/supabase/server";

export async function checkAndReserve(
  eventId: string,
  eventType: string,
  clientId: string,
  payload: unknown
): Promise<{ isNew: boolean }> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("aicbl_inbox_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      client_id: clientId,
      payload: payload as Record<string, unknown>,
      status: "received",
    });

  if (error) {
    // Unique-violation on event_id PK → duplicate (idempotent replay)
    if (error.code === "23505") return { isNew: false };
    throw error;
  }

  return { isNew: true };
}

export async function markProcessed(
  eventId: string,
  links: {
    pde_portfolio_id?: string;
    pde_capability_progress_id?: string;
    evidence_mapping_id?: string;
  }
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("aicbl_inbox_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      pde_portfolio_id: links.pde_portfolio_id ?? null,
      pde_capability_progress_id: links.pde_capability_progress_id ?? null,
      evidence_mapping_id: links.evidence_mapping_id ?? null,
    })
    .eq("event_id", eventId);

  if (error) throw error;
}

export async function markFailed(
  eventId: string,
  errorMessage: string
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("aicbl_inbox_events")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("event_id", eventId);

  if (error) throw error;
}
