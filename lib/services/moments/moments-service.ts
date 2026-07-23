// lib/services/moments/moments-service.ts
// Family Moments — client-side service (browser client, RLS enforced).
//
// Access model recap:
//   * moments rows are PRE-SEEDED one-per-learner by the seed script, so the
//     teacher flow is "find the child's row → fill it in", never row creation.
//   * RLS: SELECT needs moments.campaigns.view OR moments.submissions.create
//     (institution-scoped); UPDATE needs moments.submissions.create.
//   * family_moments is not in types/supabase.ts yet — the client is cast
//     untyped per the established convention for new tables (avoids TS2589).
//
// Added: 2026-06-12 — Father's Day 2026 (NV CBSE + Matric HSS).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/utils/compress-image';

export interface MomentsCampaign {
  id: string;
  institution_id: string;
  slug: string;
  title: string;
  occasion: string;
  recipient_type: 'father' | 'mother' | 'both';
  status: 'draft' | 'collecting' | 'ready' | 'sent' | 'archived';
  send_at: string | null;
  created_at: string;
}

export interface FamilyMoment {
  id: string;
  campaign_id: string;
  learner_id: string;
  institution_id: string;
  token: string;
  content_type: 'auto' | 'text' | 'image';
  message_text: string | null;
  media_url: string | null;
  child_name: string;
  child_class: string | null;
  recipient_name: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  opened_at: string | null;
  open_count: number;
  install_clicked_at: string | null;
  push_subscribed_at: string | null;
  sent_at: string | null;
}

export interface CampaignStats {
  total: number;
  withContent: number;
  opened: number;
  installClicked: number;
  pushSubscribed: number;
}

const BUCKET = 'family-moments';

export class MomentsService {
  /** Campaigns visible to the caller (RLS scopes institutions). */
  static async getCampaigns(): Promise<MomentsCampaign[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('family_moments_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as MomentsCampaign[];
  }

  /** Campaigns teachers can currently submit content to. */
  static async getCollectingCampaigns(): Promise<MomentsCampaign[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('family_moments_campaigns')
      .select('*')
      .in('status', ['collecting', 'ready'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as MomentsCampaign[];
  }

  /** All moment rows for a campaign (456 max today — fine unpaginated). */
  static async getMoments(campaignId: string): Promise<FamilyMoment[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('family_moments')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('child_name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as FamilyMoment[];
  }

  /**
   * Teacher submission: optional image (compressed client-side) + message.
   * Storage path {campaignId}/{momentId}.jpg — UUID-based, unguessable,
   * stable (resubmission overwrites rather than orphaning files).
   */
  static async submitContent(
    moment: Pick<FamilyMoment, 'id' | 'campaign_id'>,
    input: { messageText: string; imageFile?: File | null; submittedBy: string },
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    let mediaUrl: string | null = null;
    if (input.imageFile) {
      const blob = await compressImage(input.imageFile);
      const path = `${moment.campaign_id}/${moment.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      // Cache-bust: upsert keeps the same path, CDN may hold the old image.
      mediaUrl = `${pub.publicUrl}?v=${Date.now()}`;
    }

    const update: Record<string, unknown> = {
      content_type: input.imageFile ? 'image' : 'text',
      message_text: input.messageText.trim() || null,
      submitted_by: input.submittedBy,
      submitted_at: new Date().toISOString(),
    };
    if (mediaUrl) update.media_url = mediaUrl;

    const { error } = await (supabase as any)
      .from('family_moments')
      .update(update)
      .eq('id', moment.id);
    if (error) throw error;
  }

  /** Launch-day stats, computed from one narrow fetch. */
  static async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('family_moments')
      .select(
        'content_type, opened_at, install_clicked_at, push_subscribed_at',
      )
      .eq('campaign_id', campaignId);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      content_type: string;
      opened_at: string | null;
      install_clicked_at: string | null;
      push_subscribed_at: string | null;
    }>;
    return {
      total: rows.length,
      withContent: rows.filter((r) => r.content_type !== 'auto').length,
      opened: rows.filter((r) => r.opened_at !== null).length,
      installClicked: rows.filter((r) => r.install_clicked_at !== null).length,
      pushSubscribed: rows.filter((r) => r.push_subscribed_at !== null).length,
    };
  }
}
