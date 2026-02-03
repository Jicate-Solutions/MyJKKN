/**
 * Export Script: SAML IdP Metadata and Certificate
 *
 * This script fetches the MyJKKN SAML IdP metadata from the API endpoint
 * and copies the public certificate to the docs folder for sharing with
 * MathWorks and other SAML Service Providers.
 *
 * Prerequisites:
 * - Development server must be running (npm run dev)
 * - SAML certificates must exist in certs/saml/
 *
 * Usage: npx tsx scripts/export-saml-metadata.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const METADATA_ENDPOINT = `${API_BASE_URL}/api/saml/metadata`;
const OUTPUT_DIR = path.join(process.cwd(), 'docs/features/mathswork');
const CERT_SOURCE = path.join(process.cwd(), 'certs/saml/certificate.pem');
const METADATA_OUTPUT = path.join(OUTPUT_DIR, 'myjkkn-idp-metadata.xml');
const CERT_OUTPUT = path.join(OUTPUT_DIR, 'myjkkn-saml-public.pem');

/**
 * Fetches the SAML IdP metadata from the API endpoint
 */
async function fetchMetadata(): Promise<string> {
  console.log(`📡 Fetching metadata from: ${METADATA_ENDPOINT}`);

  try {
    const response = await fetch(METADATA_ENDPOINT, {
      method: 'GET',
      headers: {
        'Accept': 'application/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const metadata = await response.text();

    if (!metadata.includes('<?xml') || !metadata.includes('EntityDescriptor')) {
      throw new Error('Invalid SAML metadata format');
    }

    console.log('✅ Metadata fetched successfully');
    return metadata;

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error(
          'Could not connect to the API server. Make sure the development server is running (npm run dev)'
        );
      }
      throw error;
    }
    throw new Error('Unknown error fetching metadata');
  }
}

/**
 * Ensures the output directory exists
 */
function ensureOutputDirectory(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log(`📁 Creating output directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Saves the metadata XML to a file
 */
function saveMetadata(metadata: string): void {
  console.log(`💾 Saving metadata to: ${METADATA_OUTPUT}`);
  fs.writeFileSync(METADATA_OUTPUT, metadata, 'utf-8');
  console.log('✅ Metadata saved successfully');
}

/**
 * Copies the public certificate to the docs folder
 */
function copyCertificate(): void {
  console.log(`🔐 Copying certificate from: ${CERT_SOURCE}`);

  if (!fs.existsSync(CERT_SOURCE)) {
    throw new Error(
      `Certificate not found at ${CERT_SOURCE}. Run the certificate generation script first.`
    );
  }

  fs.copyFileSync(CERT_SOURCE, CERT_OUTPUT);
  console.log('✅ Certificate copied successfully');
}

/**
 * Main export function
 */
async function exportSAMLMetadata() {
  console.log('🚀 Starting SAML metadata export...\n');

  try {
    // Step 1: Ensure output directory exists
    ensureOutputDirectory();

    // Step 2: Fetch metadata from API
    const metadata = await fetchMetadata();

    // Step 3: Save metadata XML
    saveMetadata(metadata);

    // Step 4: Copy public certificate
    copyCertificate();

    // Success summary
    console.log('\n✨ Export completed successfully!\n');
    console.log('📄 Files ready for MathWorks:');
    console.log(`   1. Metadata: ${METADATA_OUTPUT}`);
    console.log(`   2. Certificate: ${CERT_OUTPUT}`);
    console.log('\n📧 Share these files with MathWorks Enterprise Support');
    console.log('   or upload them to the MathWorks SAML configuration portal.\n');

  } catch (error) {
    console.error('\n❌ Export failed:', error instanceof Error ? error.message : error);
    console.error('\nTroubleshooting:');
    console.error('  1. Ensure the development server is running (npm run dev)');
    console.error('  2. Check that SAML certificates exist in certs/saml/');
    console.error('  3. Verify API endpoint is accessible\n');
    process.exit(1);
  }
}

// Run the export
exportSAMLMetadata();
