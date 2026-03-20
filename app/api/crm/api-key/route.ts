import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get API key from environment variable
    const apiKey = process.env.CRM_API_KEY;

    if (!apiKey) {
      return new NextResponse(
        JSON.stringify({ error: 'API key not configured on server' }),
        { status: 500 }
      );
    }

    // Return the API key
    return NextResponse.json({ apiKey });
  } catch (error) {
    console.error('Error in API key route:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to retrieve API key' }),
      { status: 500 }
    );
  }
}
