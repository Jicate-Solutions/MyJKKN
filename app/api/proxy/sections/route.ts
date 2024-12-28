// app/api/proxy/sections/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.API_KEY; // Use server-side env var
    const apiBaseUrl = process.env.API_BASE_URL;

    // Log request details for debugging
    console.log(
      'Making request to:',
      `${apiBaseUrl}/api/api-management/organizations/sections`
    );

    const response = await fetch(
      `${apiBaseUrl}/api/api-management/organizations/sections`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        next: { revalidate: 0 } // Disable cache
      }
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sections data' },
      { status: 500 }
    );
  }
}
