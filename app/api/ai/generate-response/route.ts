// app/api/ai/generate-response/route.ts
// API route for AI response generation

import { NextRequest, NextResponse } from 'next/server';
import {
  AIResponseService,
  type GenerateResponseInput,
  type CommunicationChannel,
  type ResponseIntent
} from '@/lib/services/admission/ai-response-service';

/**
 * POST /api/ai/generate-response
 *
 * Generate AI-powered response suggestions for counselors
 */
export async function POST(request: NextRequest) {
  try {
    // Check if service is configured
    const configStatus = AIResponseService.getConfigStatus();
    if (!configStatus.configured) {
      return NextResponse.json(
        {
          error: 'AI Service Not Configured',
          message: configStatus.message
        },
        { status: 503 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.leadContext || !body.leadContext.lead) {
      return NextResponse.json(
        {
          error: 'Invalid Request',
          message: 'leadContext with lead data is required'
        },
        { status: 400 }
      );
    }

    if (!body.channel) {
      return NextResponse.json(
        {
          error: 'Invalid Request',
          message: 'communication channel is required'
        },
        { status: 400 }
      );
    }

    // Validate channel
    const validChannels: CommunicationChannel[] = ['email', 'whatsapp', 'sms'];
    if (!validChannels.includes(body.channel)) {
      return NextResponse.json(
        {
          error: 'Invalid Request',
          message: `Invalid channel. Must be one of: ${validChannels.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Validate intent if provided
    const validIntents: ResponseIntent[] = [
      'greeting',
      'follow_up',
      'inquiry_response',
      'document_reminder',
      'interview_schedule',
      'offer_details',
      'payment_reminder',
      'general'
    ];
    if (body.intent && !validIntents.includes(body.intent)) {
      return NextResponse.json(
        {
          error: 'Invalid Request',
          message: `Invalid intent. Must be one of: ${validIntents.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Build input
    const input: GenerateResponseInput = {
      leadContext: {
        lead: body.leadContext.lead,
        recentInteractions: body.leadContext.recentInteractions,
        counselorName: body.leadContext.counselorName,
        institutionName: body.leadContext.institutionName
      },
      channel: body.channel as CommunicationChannel,
      intent: (body.intent as ResponseIntent) || 'general',
      customPrompt: body.customPrompt
    };

    // Generate response
    const result = await AIResponseService.generateResponse(input);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/ai/generate-response] Error:', error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          {
            error: 'Configuration Error',
            message: 'AI service is not properly configured'
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to generate response suggestions'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/generate-response
 *
 * Check AI response service status
 */
export async function GET() {
  const configStatus = AIResponseService.getConfigStatus();

  return NextResponse.json({
    status: configStatus.configured ? 'available' : 'unavailable',
    message: configStatus.message
  });
}
