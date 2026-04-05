import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ExoVoiceAnalyzeWebhookPayload } from '@/lib/services/telephony/exotel-client';
import { CallEnrichmentService } from '@/lib/services/telephony/call-enrichment-service';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // Auth: token param or header (same pattern as main webhook)
  const token = request.nextUrl.searchParams.get('token')
    || request.headers.get('x-exotel-token')
    || request.headers.get('x-api-token');

  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);
    if (tokenBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const payload: ExoVoiceAnalyzeWebhookPayload = await request.json();

    // Find intelligence record by call_sid
    const { data: intel, error: findError } = await supabase
      .from('admission_call_intelligence')
      .select('id, call_log_id, institution_id')
      .eq('call_sid', payload.call_sid)
      .single();

    if (findError || !intel) {
      console.error('[Intelligence Webhook] No record for call_sid:', payload.call_sid);
      return NextResponse.json({ received: true, processed: false, error: 'No matching record' });
    }

    if (payload.status === 'failed') {
      await supabase
        .from('admission_call_intelligence')
        .update({
          analyze_status: 'failed',
          analyze_completed_at: new Date().toISOString(),
        })
        .eq('id', intel.id);

      return NextResponse.json({ received: true, processed: true, status: 'failed' });
    }

    // Extract insights
    const insights = payload.insights;
    const transcription = insights.transcript?.text ?? null;
    const transcriptionLanguage = insights.transcript?.language ?? null;
    const sentiment = insights.sentiment?.label ?? null;
    const sentimentScore = insights.sentiment?.score ?? null;
    const summary = insights.summarization?.summary ?? null;
    const categories = insights.categorise?.categories ?? null;

    // Run enrichment extraction on transcription
    let extractedName: string | null = null;
    let extractedLocation: string | null = null;
    let extractedCourse: string | null = null;

    if (transcription) {
      const enrichment = CallEnrichmentService.extractFromTranscription(transcription);
      extractedName = enrichment.name ?? null;
      extractedLocation = enrichment.location ?? null;
      extractedCourse = enrichment.course ?? null;
    }

    // Update intelligence record
    await supabase
      .from('admission_call_intelligence')
      .update({
        analyze_status: 'completed',
        analyze_completed_at: new Date().toISOString(),
        transcription,
        transcription_language: transcriptionLanguage,
        sentiment,
        sentiment_score: sentimentScore,
        summary,
        categories,
        extracted_name: extractedName,
        extracted_location: extractedLocation,
        extracted_course: extractedCourse,
      })
      .eq('id', intel.id);

    // Auto-apply enrichment to lead if enabled
    const { data: callLog } = await supabase
      .from('admission_call_logs')
      .select('lead_id')
      .eq('id', intel.call_log_id)
      .single();

    if (callLog?.lead_id && transcription) {
      const { data: settings } = await supabase
        .from('institution_call_settings')
        .select('auto_enrich_leads')
        .eq('institution_id', intel.institution_id)
        .single();

      if (settings?.auto_enrich_leads !== false) {
        const enrichment = CallEnrichmentService.extractFromTranscription(transcription);
        await CallEnrichmentService.applyToLead(
          callLog.lead_id,
          enrichment,
          intel.id,
          supabase
        );
      }
    }

    // Update call log to complete stage
    await supabase
      .from('admission_call_logs')
      .update({ pipeline_stage: 'complete' })
      .eq('id', intel.call_log_id);

    return NextResponse.json({
      received: true,
      processed: true,
      status: 'completed',
      intelligenceId: intel.id,
    });
  } catch (error) {
    console.error('[Intelligence Webhook] Error:', error);
    return NextResponse.json({ received: true, processed: false, error: String(error) });
  }
}
