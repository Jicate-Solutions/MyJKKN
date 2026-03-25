/**
 * SAML IdP Metadata Endpoint
 *
 * GET /api/saml/metadata
 *
 * Returns SAML IdP metadata XML for Service Providers to consume
 */

import { NextResponse } from 'next/server';
import { SamlIdpService } from '@/lib/services/saml/saml-idp-service';
import { SamlError } from '@/types/saml';

export async function GET() {
  try {
    const metadataXml = SamlIdpService.generateMetadata();

    return new NextResponse(metadataXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/samlmetadata+xml',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('[saml/metadata] Error generating metadata:', error);

    if (error instanceof SamlError) {
      return NextResponse.json(
        {
          error: error.message,
          statusCode: error.statusCode,
          statusDetail: error.statusDetail,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
