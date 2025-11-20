// Temporary endpoint to check Vercel's outgoing IP
// DELETE THIS FILE AFTER GETTING THE IP!

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Call an IP checking service
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();

    return NextResponse.json({
      vercel_outgoing_ip: data.ip,
      timestamp: new Date().toISOString(),
      info: 'This is the IP address Vercel uses for outgoing requests'
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get IP',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
