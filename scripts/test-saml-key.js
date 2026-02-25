/**
 * Test script: Verify SAML private key conversion from PKCS#8 to PKCS#1
 * Usage: node scripts/test-saml-key.js
 */
require('dotenv').config();
const { createPrivateKey, createSign } = require('crypto');

const rawKey = process.env.SAML_PRIVATE_KEY || '';
console.log('=== Step 1: Raw env var ===');
console.log('Length:', rawKey.length);
console.log('First 30:', rawKey.substring(0, 30));
console.log('Starts with BEGIN:', rawKey.trimStart().startsWith('-----BEGIN'));

// Step 2: Decode if base64-encoded PEM
let pemKey = rawKey;
if (rawKey.trimStart().startsWith('-----BEGIN ')) {
  console.log('\n=== Step 2: Already PEM (no decoding needed) ===');
  console.log('First line:', pemKey.split('\n')[0]);
} else {
  try {
    const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');
    if (decoded.trimStart().startsWith('-----BEGIN ')) {
      pemKey = decoded;
      console.log('\n=== Step 2: Base64 decoded ===');
      console.log('Decoded first line:', pemKey.split('\n')[0]);
      console.log('Decoded last line:', pemKey.split('\n').filter(Boolean).at(-1));
      console.log('Decoded length:', pemKey.length);
    } else {
      console.log('\n=== Step 2: Base64 decoded but NOT PEM ===');
      console.log('First 50 chars:', decoded.substring(0, 50));
    }
  } catch (e) {
    console.log('\nBase64 decode failed:', e.message);
  }
}

// Step 3: Test PKCS#1 conversion
console.log('\n=== Step 3: PKCS#8 to PKCS#1 conversion ===');
try {
  const keyObj = createPrivateKey(pemKey);
  console.log('createPrivateKey: SUCCESS');
  console.log('  asymmetricKeyType:', keyObj.asymmetricKeyType);
  console.log('  type:', keyObj.type);

  const pkcs1Key = keyObj.export({ type: 'pkcs1', format: 'pem' });
  const pkcs1Str = pkcs1Key.toString();
  console.log('export PKCS#1: SUCCESS');
  console.log('  First line:', pkcs1Str.split('\n')[0]);
  console.log('  Last line:', pkcs1Str.split('\n').filter(Boolean).at(-1));
  console.log('  Output length:', pkcs1Str.length);

  // Step 4: Test signing with converted PKCS#1 key
  console.log('\n=== Step 4: Signing test ===');
  const signer1 = createSign('RSA-SHA256');
  signer1.update('test data for signing');
  const sig1 = signer1.sign(pkcs1Str, 'base64');
  console.log('Sign with PKCS#1 key: SUCCESS');
  console.log('Signature length:', sig1.length);

  // Also test signing with original PKCS#8 key
  const signer2 = createSign('RSA-SHA256');
  signer2.update('test data for signing');
  const sig2 = signer2.sign(pemKey, 'base64');
  console.log('Sign with original PKCS#8: SUCCESS');
  console.log('Signatures match:', sig1 === sig2);

  console.log('\n=== RESULT: ALL TESTS PASSED ===');
  console.log('The PKCS#8 key can be converted to PKCS#1 and used for signing.');
  console.log('The fix in formatPrivateKey() should work correctly on Vercel.');

} catch (err) {
  console.log('FAILED:', err.message);
  console.log('Error code:', err.code);
  console.log('\n=== RESULT: CONVERSION/SIGNING FAILED ===');
  console.log('This confirms the key has issues that need to be addressed.');
}
