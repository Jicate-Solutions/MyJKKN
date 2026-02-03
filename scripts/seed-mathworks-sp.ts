/**
 * Seed Script: MathWorks SAML Service Provider
 *
 * This script seeds the MathWorks SAML Service Provider configuration
 * into the database using their provided metadata file.
 *
 * Usage: npx tsx scripts/seed-mathworks-sp.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// MathWorks SP Configuration
const MATHWORKS_METADATA_PATH = path.join(
  process.cwd(),
  'docs/features/mathswork/PROD-authngateway_metadata-PROD.xml'
);

function extractCertificateFromMetadata(metadataXml: string): string {
  // Extract X.509 certificate from metadata
  // The certificate is in the <ds:X509Certificate> tag
  const certMatch = metadataXml.match(
    /<ds:X509Certificate>([\s\S]*?)<\/ds:X509Certificate>/
  );

  if (!certMatch || !certMatch[1]) {
    throw new Error('Could not extract X.509 certificate from metadata');
  }

  // Get the certificate content (remove whitespace/newlines)
  const certContent = certMatch[1].replace(/\s+/g, '');

  // Format as PEM certificate
  const pemCert = `-----BEGIN CERTIFICATE-----\n${certContent.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;

  return pemCert;
}

async function seedMathWorksSP() {
  try {
    console.log('🚀 Starting MathWorks SAML SP seeding...\n');

    // Read metadata file
    console.log('📄 Reading MathWorks metadata file...');
    const metadataXml = fs.readFileSync(MATHWORKS_METADATA_PATH, 'utf-8');
    console.log('✅ Metadata file loaded\n');

    // Extract certificate
    console.log('🔐 Extracting X.509 certificate from metadata...');
    const spCertificate = extractCertificateFromMetadata(metadataXml);
    console.log('✅ Certificate extracted\n');

    // MathWorks SP configuration (matching database schema)
    const mathworksSP = {
      entity_id: 'https://login.mathworks.com/authngateway/saml/metadata',
      name: 'MathWorks',
      description: 'MathWorks MATLAB SSO Integration',
      assertion_consumer_service_url: 'https://services.mathworks.com/authngateway/saml/SSO',
      single_logout_service_url: 'https://services.mathworks.com/authngateway/saml/SingleLogout',
      metadata_url: null,
      x509_certificate: spCertificate,
      want_assertions_signed: true,
      want_authn_requests_signed: false,
      is_active: true,
    };

    // Check if SP already exists
    console.log('🔍 Checking if MathWorks SP already exists...');
    const { data: existingSP, error: checkError } = await supabase
      .from('saml_service_providers')
      .select('id, entity_id')
      .eq('entity_id', mathworksSP.entity_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is fine
      throw checkError;
    }

    if (existingSP) {
      console.log(`⚠️  MathWorks SP already exists (ID: ${existingSP.id})`);
      console.log('🔄 Updating existing configuration...\n');

      const { error: updateError } = await supabase
        .from('saml_service_providers')
        .update({
          name: mathworksSP.name,
          description: mathworksSP.description,
          assertion_consumer_service_url: mathworksSP.assertion_consumer_service_url,
          single_logout_service_url: mathworksSP.single_logout_service_url,
          x509_certificate: mathworksSP.x509_certificate,
          want_assertions_signed: mathworksSP.want_assertions_signed,
          want_authn_requests_signed: mathworksSP.want_authn_requests_signed,
          is_active: mathworksSP.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSP.id);

      if (updateError) throw updateError;

      console.log('✅ MathWorks SP updated successfully!');
    } else {
      console.log('➕ Creating new MathWorks SP...\n');

      const { error: insertError } = await supabase
        .from('saml_service_providers')
        .insert([mathworksSP]);

      if (insertError) throw insertError;

      console.log('✅ MathWorks SP created successfully!');
    }

    console.log('\n✨ MathWorks SAML SP seeding completed!');
    console.log('\nConfiguration:');
    console.log(`  Entity ID: ${mathworksSP.entity_id}`);
    console.log(`  ACS URL: ${mathworksSP.assertion_consumer_service_url}`);
    console.log(`  SLO URL: ${mathworksSP.single_logout_service_url}`);
    console.log(`  Status: Active`);

  } catch (error) {
    console.error('\n❌ Error seeding MathWorks SP:', error);
    process.exit(1);
  }
}

// Run the seeding
seedMathWorksSP();
