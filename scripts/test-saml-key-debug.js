/**
 * Deep diagnostic: Inspect the actual PEM content byte-by-byte
 */
require('dotenv').config();
const { createPrivateKey } = require('crypto');

const rawKey = process.env.SAML_PRIVATE_KEY || '';

// Decode base64
const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');

console.log('=== PEM Content Analysis ===');
console.log('Total length:', decoded.length);
console.log('');

// Check line structure
const lines = decoded.split('\n');
console.log('Number of lines:', lines.length);
console.log('');

lines.forEach((line, i) => {
  const hasCarriageReturn = line.includes('\r');
  const trimmedLen = line.replace(/\r/g, '').length;
  if (i === 0 || i === lines.length - 1 || i === lines.length - 2 || i === 1) {
    console.log(`Line ${i}: [${trimmedLen} chars] ${hasCarriageReturn ? '(has \\r) ' : ''}${JSON.stringify(line.substring(0, 80))}`);
  }
});
console.log('...');

// Check for common PEM issues
console.log('\n=== Common PEM Issues Check ===');
console.log('Has \\r\\n (Windows newlines):', decoded.includes('\r\n'));
console.log('Has \\r (bare carriage returns):', decoded.includes('\r'));
console.log('Has spaces in base64 body:', lines.slice(1, -1).some(l => l.includes(' ')));
console.log('Has tabs in base64 body:', lines.slice(1, -1).some(l => l.includes('\t')));
console.log('Empty lines in body:', lines.slice(1, -1).filter(l => l.trim() === '').length);

// Check base64 line lengths (should be 64 chars per line)
const bodyLines = lines.slice(1, -1).filter(l => l.trim().length > 0);
console.log('\nBase64 body lines:', bodyLines.length);
bodyLines.forEach((line, i) => {
  const clean = line.replace(/\r/g, '');
  if (clean.length !== 64 && i < bodyLines.length - 1) {
    console.log(`  Line ${i+1}: UNEXPECTED length ${clean.length} (expected 64)`);
  }
});
const lastBody = bodyLines[bodyLines.length - 1];
if (lastBody) {
  console.log(`  Last body line length: ${lastBody.replace(/\r/g, '').length} (OK, last line can vary)`);
}

// Try to extract and validate the DER body
console.log('\n=== DER Body Validation ===');
const base64Body = bodyLines.map(l => l.replace(/\r/g, '').trim()).join('');
console.log('Base64 body length:', base64Body.length);
console.log('Base64 body first 40:', base64Body.substring(0, 40));

try {
  const derBuffer = Buffer.from(base64Body, 'base64');
  console.log('DER buffer length:', derBuffer.length);
  // First byte should be 0x30 (SEQUENCE) for both PKCS#1 and PKCS#8
  console.log('First byte (hex):', derBuffer[0].toString(16));
  console.log('Expected 0x30 (SEQUENCE):', derBuffer[0] === 0x30 ? 'YES' : 'NO');

  // For PKCS#8, bytes should be: 30 82 XX XX 02 01 00 30 0d 06 09 ...
  // For PKCS#1, bytes should be: 30 82 XX XX 02 01 00 02 81 ...
  const hexStart = Array.from(derBuffer.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('First 20 bytes (hex):', hexStart);

  // Check if it's PKCS#8 structure: SEQUENCE { version, AlgorithmIdentifier, OCTET STRING }
  // OID for RSA: 2a 86 48 86 f7 0d 01 01 01 (1.2.840.113549.1.1.1)
  const hexStr = derBuffer.toString('hex');
  const rsaOid = '2a864886f70d010101';
  console.log('Contains RSA OID (1.2.840.113549.1.1.1):', hexStr.includes(rsaOid) ? 'YES (PKCS#8)' : 'NO');

  // Try raw DER with explicit type
  console.log('\n=== Alternative Parsing Attempts ===');

  // Attempt 1: Parse as DER directly
  try {
    const key1 = createPrivateKey({ key: derBuffer, format: 'der', type: 'pkcs8' });
    console.log('Parse as DER PKCS#8: SUCCESS - type:', key1.asymmetricKeyType);
  } catch (e1) {
    console.log('Parse as DER PKCS#8: FAILED -', e1.message.substring(0, 80));
  }

  // Attempt 2: Parse as PKCS#1 DER
  try {
    const key2 = createPrivateKey({ key: derBuffer, format: 'der', type: 'pkcs1' });
    console.log('Parse as DER PKCS#1: SUCCESS - type:', key2.asymmetricKeyType);
  } catch (e2) {
    console.log('Parse as DER PKCS#1: FAILED -', e2.message.substring(0, 80));
  }

  // Attempt 3: Reconstruct PEM with exact 64-char lines
  const cleanPem = '-----BEGIN PRIVATE KEY-----\n' +
    base64Body.match(/.{1,64}/g).join('\n') + '\n' +
    '-----END PRIVATE KEY-----';
  try {
    const key3 = createPrivateKey(cleanPem);
    console.log('Parse reconstructed PEM: SUCCESS - type:', key3.asymmetricKeyType);
  } catch (e3) {
    console.log('Parse reconstructed PEM: FAILED -', e3.message.substring(0, 80));
  }

  // Attempt 4: Try as PKCS#1 PEM (maybe headers are wrong)
  const pkcs1Pem = '-----BEGIN RSA PRIVATE KEY-----\n' +
    base64Body.match(/.{1,64}/g).join('\n') + '\n' +
    '-----END RSA PRIVATE KEY-----';
  try {
    const key4 = createPrivateKey(pkcs1Pem);
    console.log('Parse as PKCS#1 PEM: SUCCESS - type:', key4.asymmetricKeyType);
  } catch (e4) {
    console.log('Parse as PKCS#1 PEM: FAILED -', e4.message.substring(0, 80));
  }

} catch (e) {
  console.log('DER extraction failed:', e.message);
}
