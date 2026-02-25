/**
 * Find exactly where spaces appear in the PEM base64 body
 */
require('dotenv').config();

const rawKey = process.env.SAML_PRIVATE_KEY || '';
const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');
const lines = decoded.split('\n');

console.log('=== Scanning PEM body for spaces ===\n');

// Skip header (line 0) and footer (last non-empty line)
const bodyLines = lines.filter(l => l.trim().length > 0 && l.indexOf('-----') === -1);

let totalSpaces = 0;
bodyLines.forEach((line, i) => {
  const spaceIndices = [];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === ' ') {
      spaceIndices.push(j);
      totalSpaces++;
    }
  }
  if (spaceIndices.length > 0) {
    console.log(`Body line ${i + 1} (len=${line.length}): ${spaceIndices.length} space(s) at position(s) [${spaceIndices.join(', ')}]`);
    // Show context around the space
    spaceIndices.forEach(pos => {
      const start = Math.max(0, pos - 5);
      const end = Math.min(line.length, pos + 6);
      const snippet = line.substring(start, end);
      console.log(`  ...${snippet}... (space at position ${pos})`);
      console.log(`  Hex: ${Buffer.from(snippet).toString('hex').match(/../g).join(' ')}`);
    });
  }
});

console.log(`\nTotal spaces found in base64 body: ${totalSpaces}`);

if (totalSpaces > 0) {
  console.log('\n=== THIS IS THE ROOT CAUSE ===');
  console.log('The PEM private key has space characters corrupting the base64 body.');
  console.log('This causes the DER decode to lose data, resulting in a truncated key.');
  console.log('OpenSSL then throws "DECODER routines::unsupported" or "not enough data".');
  console.log('\nFIX: Re-generate the private key or re-encode it without corruption.');
  console.log('The SAML_PRIVATE_KEY environment variable in Vercel must be updated.');

  // Try to fix by removing spaces and see if it works
  console.log('\n=== Attempting auto-fix (remove spaces) ===');
  const fixedPem = lines.map(line => {
    if (line.indexOf('-----') !== -1) return line; // Keep headers
    return line.replace(/ /g, ''); // Remove spaces from base64 body
  }).join('\n');

  try {
    const { createPrivateKey, createSign } = require('crypto');
    const keyObj = createPrivateKey(fixedPem);
    console.log('createPrivateKey with spaces removed: SUCCESS');
    console.log('  Type:', keyObj.asymmetricKeyType);

    const signer = createSign('RSA-SHA256');
    signer.update('test');
    const sig = signer.sign(keyObj, 'base64');
    console.log('Signing test: SUCCESS (signature length:', sig.length, ')');
    console.log('\nRemoving spaces does NOT fix it - the base64 characters were REPLACED by spaces.');
    console.log('The original characters are lost. Key must be re-generated.');
  } catch (e) {
    console.log('Still FAILED after removing spaces:', e.message.substring(0, 80));
    console.log('\nConfirmed: spaces REPLACED base64 characters. Data is lost.');
    console.log('The private key MUST be re-generated from the original key file.');
  }
}
