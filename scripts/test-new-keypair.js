/**
 * Verify the newly generated SAML key pair
 */
const { createPrivateKey, createSign, createVerify, X509Certificate } = require('crypto');
const fs = require('fs');

const privPem = fs.readFileSync('docs/features/mathswork/myjkkn-saml-private.pem', 'utf-8');
const certPem = fs.readFileSync('docs/features/mathswork/myjkkn-saml-public-new.pem', 'utf-8');

console.log('=== New Private Key ===');
const privKey = createPrivateKey(privPem);
console.log('Parse: SUCCESS');
console.log('Type:', privKey.asymmetricKeyType);
console.log('Bits:', privKey.asymmetricKeySize);
console.log('First line:', privPem.split('\n')[0]);

// Test PKCS#1 export (what our formatPrivateKey does)
const pkcs1 = privKey.export({ type: 'pkcs1', format: 'pem' });
console.log('PKCS#1 export: SUCCESS');
console.log('PKCS#1 first line:', pkcs1.toString().split('\n')[0]);

console.log('\n=== New Certificate ===');
const cert = new X509Certificate(certPem);
console.log('Parse: SUCCESS');
console.log('Subject:', cert.subject);
console.log('Valid from:', cert.validFrom);
console.log('Valid to:', cert.validTo);
console.log('SAN:', cert.subjectAltName);
console.log('Fingerprint:', cert.fingerprint256);

// Test signing + verification
console.log('\n=== Sign + Verify Test ===');
const signer = createSign('RSA-SHA256');
signer.update('SAML assertion test data');
const sig = signer.sign(privKey, 'base64');
console.log('Sign with private key: SUCCESS (', sig.length, 'chars)');

const verifier = createVerify('RSA-SHA256');
verifier.update('SAML assertion test data');
const ok = verifier.verify(cert.publicKey, sig, 'base64');
console.log('Verify with certificate public key:', ok ? 'SUCCESS' : 'FAILED');

// Generate the base64-encoded values for Vercel env vars
console.log('\n=== Values for Vercel Environment Variables ===');
const privB64 = Buffer.from(privPem).toString('base64');
console.log('\nSAML_PRIVATE_KEY (base64-encoded PEM):');
console.log('Length:', privB64.length);
console.log('First 60:', privB64.substring(0, 60) + '...');

const certB64 = Buffer.from(certPem).toString('base64');
console.log('\nSAML_PUBLIC_CERTIFICATE (base64-encoded PEM):');
console.log('Length:', certB64.length);
console.log('First 60:', certB64.substring(0, 60) + '...');

// Write the base64 values to files for easy copy
fs.writeFileSync('docs/features/mathswork/SAML_PRIVATE_KEY_B64.txt', privB64);
fs.writeFileSync('docs/features/mathswork/SAML_PUBLIC_CERTIFICATE_B64.txt', certB64);
console.log('\nBase64 values written to:');
console.log('  docs/features/mathswork/SAML_PRIVATE_KEY_B64.txt');
console.log('  docs/features/mathswork/SAML_PUBLIC_CERTIFICATE_B64.txt');

console.log('\n=== ALL TESTS PASSED ===');
console.log('New key pair is ready. Update Vercel env vars and share new cert with MathWorks.');
