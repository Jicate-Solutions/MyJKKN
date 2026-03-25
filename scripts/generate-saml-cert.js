/**
 * Generate SAML Certificate for IdP
 *
 * This script generates a proper self-signed X.509 certificate and RSA-2048 key pair
 * for signing SAML responses. The private key is used to sign SAML assertions,
 * and the public certificate is shared with Service Providers (SPs) for verification.
 *
 * Usage:
 *   node scripts/generate-saml-cert.js
 *
 * Output:
 *   - certs/saml/private-key.pem (DO NOT COMMIT)
 *   - certs/saml/certificate.pem (share with SPs)
 *   - Base64-encoded keys for .env.local (printed to console)
 *
 * Updated: 2026-02-05 - Fixed to generate proper X.509 certificates using selfsigned library
 */

const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

const CERTS_DIR = path.join(__dirname, '..', 'certs', 'saml');
const PRIVATE_KEY_PATH = path.join(CERTS_DIR, 'private-key.pem');
const CERTIFICATE_PATH = path.join(CERTS_DIR, 'certificate.pem');

// Certificate attributes (using shorthand names for selfsigned library)
const CERT_ATTRIBUTES = [
  { shortName: 'C', value: 'IN' },
  { shortName: 'ST', value: 'Tamil Nadu' },
  { shortName: 'L', value: 'Komarapalayam' },
  { shortName: 'O', value: 'JKKN College of Engineering' },
  { shortName: 'OU', value: 'IT Department' },
  { shortName: 'CN', value: 'jkkn.ai' },
];

// Certificate options
const CERT_OPTIONS = {
  algorithm: 'sha256',        // Signature algorithm
  keySize: 2048,              // RSA key size
  days: 3650,                 // Valid for 10 years
  extensions: [
    {
      name: 'basicConstraints',
      cA: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2, // DNS
          value: 'jkkn.ai',
        },
        {
          type: 2, // DNS
          value: 'www.jkkn.ai',
        },
      ],
    },
  ],
};

async function generateCertificate() {
  console.log('🔐 Generating SAML Certificate with proper X.509 format...\n');

  // Create certs directory if it doesn't exist
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
    console.log(`✅ Created directory: ${CERTS_DIR}`);
  }

  // Generate self-signed certificate with proper X.509 format
  console.log('⏳ Generating RSA-2048 key pair and X.509 certificate...');
  const pems = await selfsigned.generate(CERT_ATTRIBUTES, CERT_OPTIONS);

  // Extract private key and certificate
  const privateKey = pems.private;
  const certificate = pems.cert;

  // Save to files
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
  fs.writeFileSync(CERTIFICATE_PATH, certificate);

  console.log(`✅ Private key saved: ${PRIVATE_KEY_PATH}`);
  console.log(`✅ Certificate saved: ${CERTIFICATE_PATH}`);

  // Generate base64-encoded strings for environment variables
  const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
  const certificateBase64 = Buffer.from(certificate).toString('base64');

  console.log('\n📋 Add these to your .env.local and .env files:\n');
  console.log('SAML_PRIVATE_KEY=' + privateKeyBase64);
  console.log('\nSAML_PUBLIC_CERTIFICATE=' + certificateBase64);

  console.log('\n📄 Certificate Details:');
  console.log(`   - Algorithm: ${CERT_OPTIONS.algorithm.toUpperCase()}`);
  console.log(`   - Key Size: ${CERT_OPTIONS.keySize} bits`);
  console.log(`   - Valid For: ${CERT_OPTIONS.days} days (10 years)`);
  console.log(`   - Common Name: ${CERT_ATTRIBUTES.find(a => a.shortName === 'CN').value}`);

  console.log('\n⚠️  IMPORTANT:');
  console.log('   - DO NOT commit the private key to git');
  console.log('   - Add certs/saml/ to .gitignore');
  console.log('   - Share certificate.pem with Service Providers (MathWorks)');
  console.log('   - Keep private-key.pem secure and confidential');
  console.log('   - Update both .env and .env.local with the values above');

  console.log('\n✅ Certificate generation complete!');
}

// Run the generation
generateCertificate().catch((error) => {
  console.error('❌ Error generating certificate:', error);
  process.exit(1);
});
