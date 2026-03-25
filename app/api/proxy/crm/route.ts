import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get API key from environment variable
    const apiKey = process.env.CRM_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured on server' },
        { status: 500 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const entity = searchParams.get('entity');
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('perPage') || '10';
    const formId = searchParams.get('form_id');
    const search = searchParams.get('search');

    // Build the query string
    let queryString = `?entity=${entity}&page=${page}&perPage=${perPage}`;
    if (formId) queryString += `&form_id=${formId}`;
    if (search) queryString += `&search=${search}`;

    // External API URL
    const externalUrl = `https://admission.jkkn.ac.in/api/external/crm${queryString}`;

    // Forward the request to the external API
    const response = await fetch(externalUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `External API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying to external API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data from external API' },
      { status: 500 }
    );
  }
}
