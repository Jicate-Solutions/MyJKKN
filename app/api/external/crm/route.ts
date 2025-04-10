import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get the API key from environment variables
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

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity parameter is required' },
        { status: 400 }
      );
    }

    // Build the query string
    let queryString = `?entity=${entity}&page=${page}&perPage=${perPage}`;
    if (formId) queryString += `&form_id=${formId}`;
    if (search) queryString += `&search=${search}`;

    // Define the external API URL (adjust as needed)
    const externalApiUrl = `${
      process.env.EXTERNAL_CRM_API_URL || 'https://api.your-crm-provider.com'
    }${queryString}`;

    // Forward the request to the external API
    const response = await fetch(externalApiUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    // Handle errors from the external API
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `External API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    // Return the successful response
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
