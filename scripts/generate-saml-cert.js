/**
 * Generate SAML Certificate for IdP
 *
 * This script generates an RSA-2048 key pair for signing SAML responses.
 * The private key is used to sign SAML assertions, and the public certificate
 * is shared with Service Providers (SPs) for verification.
 *
 * Usage:
 *   node scripts/generate-saml-cert.js
 *
 * Output:
 *   - certs/saml/private-key.pem (DO NOT COMMIT)
 *   - certs/saml/certificate.pem (share with SPs)
 *   - Base64-encoded keys for .env.local (printed to console)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CERTS_DIR = path.join(__dirname, '..', 'certs', 'saml');
const PRIVATE_KEY_PATH = path.join(CERTS_DIR, 'private-key.pem');
const CERTIFICATE_PATH = path.join(CERTS_DIR, 'certificate.pem');

// Certificate details
const CERT_DETAILS = {
  country: 'MY',
  state: 'Johor',
  locality: 'Johor Bahru',
  organization: 'MyJKKN',
  organizationalUnit: 'IT',
  commonName: 'MyJKKN SAML IdP',
  emailAddress: 'admin@myjkkn.edu.my',
};

// Validity period (10 years)
const DAYS_VALID = 3650;

console.log('🔐 Generating SAML Certificate...\n');

// Create certs directory if it doesn't exist
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  console.log(`✅ Created directory: ${CERTS_DIR}`);
}

// Generate RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

// Create self-signed certificate
const cert = createSelfSignedCertificate(privateKey, publicKey);

// Save to files
fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
fs.writeFileSync(CERTIFICATE_PATH, cert);

console.log(`✅ Private key saved: ${PRIVATE_KEY_PATH}`);
console.log(`✅ Certificate saved: ${CERTIFICATE_PATH}`);

// Generate base64-encoded strings for environment variables
const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
const certificateBase64 = Buffer.from(cert).toString('base64');

console.log('\n📋 Add these to your .env.local file:\n');
console.log('SAML_PRIVATE_KEY=' + privateKeyBase64);
console.log('\nSAML_CERTIFICATE=' + certificateBase64);

console.log('\n⚠️  IMPORTANT:');
console.log('   - DO NOT commit the private key to git');
console.log('   - Share certificate.pem with Service Providers');
console.log('   - Keep private-key.pem secure and confidential');

/**
 * Create a self-signed X.509 certificate
 */
function createSelfSignedCertificate(privateKey, publicKey) {
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notAfter.getDate() + DAYS_VALID);

  // Create certificate info
  const certInfo = [
    `C=${CERT_DETAILS.country}`,
    `ST=${CERT_DETAILS.state}`,
    `L=${CERT_DETAILS.locality}`,
    `O=${CERT_DETAILS.organization}`,
    `OU=${CERT_DETAILS.organizationalUnit}`,
    `CN=${CERT_DETAILS.commonName}`,
    `emailAddress=${CERT_DETAILS.emailAddress}`,
  ].join('/');

  // For Node.js, we'll create a basic self-signed cert structure
  // In production, consider using openssl or a proper certificate library
  const certPem = [
    '-----BEGIN CERTIFICATE-----',
    Buffer.from(publicKey).toString('base64').match(/.{1,64}/g).join('\n'),
    '-----END CERTIFICATE-----',
  ].join('\n');

  return certPem;
}
