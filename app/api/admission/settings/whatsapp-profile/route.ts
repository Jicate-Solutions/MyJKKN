export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

function getAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN || '';
}

function getPhoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || '';
}

// GET — Fetch current WhatsApp Business Profile from Meta
/**
 * Guarded 2026-09-01. This route had NO authentication of any kind: it reads
 * WhatsApp Business account settings and returned them to any anonymous
 * caller. That was masked only because WHATSAPP_ACCESS_TOKEN is unset in
 * production, so it failed with a config error before reaching the data. Set
 * the token and it would have leaked. The gap, not the missing config, is the
 * bug.
 */
export const GET = withAuth(async () => {
  try {
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'Missing WhatsApp configuration (WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN)' },
        { status: 500 }
      );
    }

    const fields = 'about,address,description,email,profile_picture_url,websites,vertical';
    const response = await fetch(
      `${GRAPH_API}/${phoneNumberId}/whatsapp_business_profile?fields=${fields}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Failed to fetch WhatsApp Business Profile', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching WhatsApp Business Profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}, { requiredPermission: 'read' });

// PUT — Update WhatsApp Business Profile on Meta
// Same gap as the GET above, and worse: this WRITES the business profile.
export const PUT = withAuth(async (request: NextRequest) => {
  try {
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'Missing WhatsApp configuration (WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN)' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { about, address, description, email, websites, vertical, profile_picture_url } = body;

    const updatePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
    };

    if (about !== undefined) updatePayload.about = about;
    if (address !== undefined) updatePayload.address = address;
    if (description !== undefined) updatePayload.description = description;
    if (email !== undefined) updatePayload.email = email;
    if (websites !== undefined) updatePayload.websites = websites;
    if (vertical !== undefined) updatePayload.vertical = vertical;
    if (profile_picture_url !== undefined) updatePayload.profile_picture_url = profile_picture_url;

    const response = await fetch(
      `${GRAPH_API}/${phoneNumberId}/whatsapp_business_profile`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Failed to update WhatsApp Business Profile', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating WhatsApp Business Profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}, { requiredPermission: 'write' });
