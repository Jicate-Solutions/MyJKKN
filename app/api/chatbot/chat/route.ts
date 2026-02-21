// app/api/chatbot/chat/route.ts
// PUBLIC endpoint — no auth required for prospects
// Handles chatbot conversation messages

import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/services/ai/chatbot-service';

// Simple in-memory rate limiter by IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 messages per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }

  return false;
}

/**
 * POST /api/chatbot/chat
 *
 * Body: { session_id?: string, chatbot_id: string, message: string, visitor_id?: string }
 * Returns: { response: string, session_id: string, action?: object }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment before sending another message.' },
        { status: 429 }
      );
    }

    // Check if AI service is configured
    if (!ChatbotService.isConfigured()) {
      return NextResponse.json(
        { error: 'Chatbot service is not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { session_id, chatbot_id, message, visitor_id } = body;

    // Validate required fields
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'message is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!chatbot_id && !session_id) {
      return NextResponse.json(
        { error: 'Either chatbot_id or session_id is required' },
        { status: 400 }
      );
    }

    // Limit message length
    const trimmedMessage = message.trim().slice(0, 2000);

    // If no session_id, create a new session first
    let activeSessionId = session_id;
    if (!activeSessionId) {
      const session = await ChatbotService.createSession(chatbot_id, 'website', visitor_id);
      activeSessionId = session.id;
    }

    // Process the chat message
    const result = await ChatbotService.chat(activeSessionId, trimmedMessage);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/chatbot/chat] Error:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not found') || message.includes('disabled')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes('ended')) {
      return NextResponse.json({ error: message }, { status: 410 });
    }

    return NextResponse.json(
      { error: 'Failed to process message. Please try again.' },
      { status: 500 }
    );
  }
}
