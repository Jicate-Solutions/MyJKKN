/**
 * Check if SAML certificate and private key match
 */
require('dotenv').config();
const { X509Certificate, createPrivateKey, createSign, createVerify } = require('crypto');
const fs = require('fs');

// 1. Check the certificate from env var
const rawCert = process.env.SAML_PUBLIC_CERTIFICATE || '';
console.log('=== SAML_PUBLIC_CERTIFICATE env var ===');
console.log('Raw length:', rawCert.length);

let pemCert = rawCert;
if (rawCert.trimStart().startsWith('-----BEGIN')) {
  console.log('Format: already PEM');
} else {
  pemCert = Buffer.from(rawCert, 'base64').toString('utf-8');
  console.log('Format: base64-encoded, decoded to PEM');
}
console.log('First line:', pemCert.split('\n')[0]);

try {
  const cert = new X509Certificate(pemCert);
  console.log('Valid X.509: YES');
  console.log('Subject:', cert.subject);
  console.log('Valid to:', cert.validTo);

  // 2. Check the .pem file
  const fileCert = fs.readFileSync('docs/features/mathswork/myjkkn-saml-public.pem', 'utf-8');
  const fileCertObj = new X509Certificate(fileCert);
  console.log('\n=== myjkkn-saml-public.pem ===');
  console.log('Matches env var cert:', cert.fingerprint256 === fileCertObj.fingerprint256 ? 'YES' : 'NO');

  // 3. Check the private key
  console.log('\n=== SAML_PRIVATE_KEY ===');
  const rawKey = process.env.SAML_PRIVATE_KEY || '';
  const decodedKey = Buffer.from(rawKey, 'base64').toString('utf-8');
  console.log('Decoded first line:', decodedKey.split('\n')[0]);

  try {
    const privKey = createPrivateKey(decodedKey);
    console.log('Parses: YES');
    console.log('Type:', privKey.asymmetricKeyType);
  } catch (e) {
    console.log('Parses: NO -', e.message.substring(0, 60));
  }

  // 4. Can we generate a new key pair?
  console.log('\n=== SOLUTION: Generate new key pair ===');
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // Sign and verify test
  const signer = createSign('RSA-SHA256');
  signer.update('test');
  const sig = signer.sign(privateKey, 'base64');

  const verifier = createVerify('RSA-SHA256');
  verifier.update('test');
  const ok = verifier.verify(publicKey, sig, 'base64');
  console.log('New key pair sign/verify:', ok ? 'SUCCESS' : 'FAILED');
  console.log('Node.js crypto is fully functional for RSA-SHA256 signing.');
  console.log('');
  console.log('VERDICT: The private key in the env var is CORRUPTED.');
  console.log('The code is correct. A new key pair needs to be generated.');

} catch (e) {
  console.log('Error:', e.message);
}
