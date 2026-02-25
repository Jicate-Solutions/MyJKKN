/**
 * Deep byte-level analysis of the SAML private key
 */
require('dotenv').config();
const { createPrivateKey, createSign } = require('crypto');

const rawKey = process.env.SAML_PRIVATE_KEY || '';
const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');
const lines = decoded.split('\n');

// Extract body lines (exclude PEM headers/footers and empty lines)
const bodyLines = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.length === 0) continue;
  if (trimmed.startsWith('-----')) continue;
  bodyLines.push(trimmed);
}

console.log('=== PEM Body Structure ===');
console.log('Body lines:', bodyLines.length);

// Check each line for non-base64 characters
const validBase64 = /^[A-Za-z0-9+/=]+$/;
bodyLines.forEach((line, i) => {
  if (!validBase64.test(line)) {
    console.log(`Line ${i}: INVALID base64 chars found (len=${line.length})`);
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const code = line.charCodeAt(j);
      if (!validBase64.test(ch)) {
        console.log(`  Position ${j}: char='${ch}' code=${code} (0x${code.toString(16)})`);
      }
    }
  }
});

// Join and decode
const base64Joined = bodyLines.join('');
console.log('\nJoined base64 length:', base64Joined.length);

// Count valid vs invalid chars
let validCount = 0;
let invalidCount = 0;
for (let i = 0; i < base64Joined.length; i++) {
  if (validBase64.test(base64Joined[i])) validCount++;
  else invalidCount++;
}
console.log('Valid base64 chars:', validCount);
console.log('Invalid chars:', invalidCount);

// Decode DER
const der = Buffer.from(base64Joined, 'base64');
console.log('DER length:', der.length);

// Parse ASN.1 header to find expected length
if (der[0] === 0x30) {
  let expectedLen;
  let headerLen;
  if (der[1] === 0x82) {
    expectedLen = (der[2] << 8) | der[3];
    headerLen = 4;
  } else if (der[1] === 0x81) {
    expectedLen = der[2];
    headerLen = 3;
  } else {
    expectedLen = der[1];
    headerLen = 2;
  }
  console.log('ASN.1 SEQUENCE content length:', expectedLen);
  console.log('ASN.1 header length:', headerLen);
  console.log('Total expected:', expectedLen + headerLen);
  console.log('Actual DER length:', der.length);
  console.log('Difference:', der.length - (expectedLen + headerLen), 'bytes');
}

// Now try: re-encode from the RAW env var differently
// Maybe the issue is in how we base64-decode the env var
console.log('\n=== Re-examining env var encoding ===');
console.log('Raw env var length:', rawKey.length);

// The env var is base64(PEM). But what if it's double-encoded?
// Or what if the env var itself has been truncated?

// Try: decode the env var as raw binary (not utf-8)
const decodedBinary = Buffer.from(rawKey, 'base64');
console.log('Binary decode length:', decodedBinary.length);

// Check if the PEM inside has proper structure
const pemStr = decodedBinary.toString('utf-8');
const pemLines = pemStr.split('\n').filter(l => l.trim().length > 0);
console.log('PEM lines (non-empty):', pemLines.length);
console.log('First line:', pemLines[0]);
console.log('Last line:', pemLines[pemLines.length - 1]);

// Try: what if we skip the PEM parse and extract DER directly from
// the base64 body without PEM headers?
const rawDerBase64 = pemLines
  .filter(l => !l.startsWith('-----'))
  .join('');
console.log('\nRaw base64 from PEM body:', rawDerBase64.length, 'chars');
const rawDer = Buffer.from(rawDerBase64, 'base64');
console.log('Direct DER decode:', rawDer.length, 'bytes');

// Calculate expected base64 length for the DER
const expectedB64Len = Math.ceil(rawDer.length / 3) * 4;
console.log('Expected base64 for', rawDer.length, 'bytes:', expectedB64Len);
console.log('Actual base64 length:', rawDerBase64.length);
console.log('Difference:', rawDerBase64.length - expectedB64Len, 'extra base64 chars');

// Check if maybe the key body actually contains the key + something extra
// (e.g., a certificate appended after the key)
console.log('\n=== Check for concatenated data ===');
if (rawDer[0] === 0x30 && rawDer[1] === 0x82) {
  const seqLen = (rawDer[2] << 8) | rawDer[3];
  const totalStructLen = seqLen + 4;
  console.log('First SEQUENCE total length:', totalStructLen);
  console.log('Remaining bytes after first SEQUENCE:', rawDer.length - totalStructLen);

  if (rawDer.length > totalStructLen) {
    console.log('EXTRA DATA AFTER KEY:');
    console.log('  Next byte (hex):', rawDer[totalStructLen].toString(16));
    console.log('  Next 20 bytes:', Buffer.from(rawDer.slice(totalStructLen, totalStructLen + 20)).toString('hex'));
  }
}

// Final attempt: try to parse with OpenSSL directly
console.log('\n=== OpenSSL-compatible parsing ===');

// Method 1: Just the DER with explicit format
try {
  const key = createPrivateKey({ key: rawDer, format: 'der', type: 'pkcs8' });
  console.log('DER PKCS#8 parse: SUCCESS');
  console.log('Type:', key.asymmetricKeyType);
} catch (e) {
  console.log('DER PKCS#8 parse: FAILED -', e.message.substring(0, 100));
}

// Method 2: Truncate DER to exact expected length
if (rawDer[0] === 0x30 && rawDer[1] === 0x82) {
  const seqLen = (rawDer[2] << 8) | rawDer[3];
  const exactDer = rawDer.slice(0, seqLen + 4);
  console.log('\nExact-length DER (' + exactDer.length + ' bytes):');
  try {
    const key = createPrivateKey({ key: exactDer, format: 'der', type: 'pkcs8' });
    console.log('Parse SUCCESS - type:', key.asymmetricKeyType);

    // Try signing
    const signer = createSign('RSA-SHA256');
    signer.update('test');
    const sig = signer.sign(key, 'base64');
    console.log('Signing: SUCCESS (length:', sig.length + ')');

    // Export as PKCS#1
    const pkcs1 = key.export({ type: 'pkcs1', format: 'pem' });
    console.log('PKCS#1 export: SUCCESS');
    console.log('First line:', pkcs1.toString().split('\n')[0]);

    console.log('\n=== SOLUTION FOUND ===');
    console.log('The DER has extra trailing byte(s). Truncating to exact ASN.1 length fixes it.');
    console.log('Fix: strip trailing bytes from DER before parsing.');
  } catch (e) {
    console.log('Parse FAILED -', e.message.substring(0, 100));
  }
}
