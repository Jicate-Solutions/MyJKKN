// lib/services/telephony/exotel-client-mock.ts
// Mock ExotelClient for local development and testing.
// Set EXOTEL_MOCK=true in env to use this instead of real Exotel.

import { logger } from '@/lib/utils/enhanced-logger';
import type { MakeCallParams, ExotelCallResponse } from './exotel-client';

export class MockExotelClient {
  async makeCall(params: MakeCallParams): Promise<ExotelCallResponse> {
    const fakeSid = `mock-${crypto.randomUUID().slice(0, 8)}`;

    logger.info('admission/telephony', '[MOCK] Simulating Exotel call', {
      from: params.from,
      to: params.to,
      customField: params.customField,
      fakeSid,
    });

    // Simulate network latency
    await new Promise(r => setTimeout(r, 500));

    // Simulate failures for testing (numbers ending in 0000)
    if (params.to.endsWith('0000')) {
      throw new Error('Mock: Invalid phone number');
    }

    // Fire simulated webhook callbacks asynchronously
    this.simulateWebhookCallbacks(params, fakeSid);

    return {
      callSid: fakeSid,
      status: 'queued',
    };
  }

  private simulateWebhookCallbacks(params: MakeCallParams, callSid: string) {
    const baseUrl = params.statusCallbackUrl;
    const token = process.env.EXOTEL_API_TOKEN || 'mock-token';

    const webhooks = [
      { delay: 2000, status: 'ringing' },
      { delay: 5000, status: 'in-progress' },
      { delay: 15000, status: 'completed', duration: '10', price: '0.50' },
    ];

    for (const wh of webhooks) {
      setTimeout(async () => {
        try {
          const body = new URLSearchParams({
            CallSid: callSid,
            Status: wh.status,
            CustomField: params.customField,
            From: params.from,
            To: params.to,
            ...(wh.duration ? { Duration: wh.duration } : {}),
            ...(wh.price ? { Price: wh.price } : {}),
          });

          await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'x-exotel-token': token,
            },
            body: body.toString(),
          });
        } catch (err) {
          logger.warn('admission/telephony', '[MOCK] Webhook simulation failed', err);
        }
      }, wh.delay);
    }
  }

  async getCallDetails(callSid: string): Promise<Record<string, any>> {
    return {
      Call: {
        Sid: callSid,
        Status: 'completed',
        Duration: '10',
        Price: '0.50',
      },
    };
  }
}
