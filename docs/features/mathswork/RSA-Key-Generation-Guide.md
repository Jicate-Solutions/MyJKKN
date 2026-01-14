# RSA Key Generation Guide for LTI 1.3 Integration

**Purpose:** Generate RSA key pair for signing LTI 1.3 JWT tokens
**Created:** 2026-01-12
**Security Level:** CRITICAL - Handle with care

---

## Overview

LTI 1.3 requires asymmetric RSA keys for JWT signing:
- **Private Key:** MyJKKN uses this to sign JWT tokens when launching MATLAB
- **Public Key:** MATLAB uses this to verify the JWT signature
- **Algorithm:** RS256 (RSA Signature with SHA-256)
- **Key Size:** 2048 bits (minimum for security)

---

## Step 1: Generate RSA Key Pair

### Using OpenSSL (Recommended)

```bash
# Generate 2048-bit private key
openssl genrsa -out lti_private_key.pem 2048

# Extract public key from private key
openssl rsa -in lti_private_key.pem -pubout -out lti_public_key.pem

# Verify key generation
openssl rsa -in lti_private_key.pem -check -noout
# Should output: RSA key ok
```

### Using Node.js (Alternative)

```javascript
// generate-keys.js
const crypto = require('crypto');
const fs = require('fs');

// Generate RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Save keys to files
fs.writeFileSync('lti_private_key.pem', privateKey);
fs.writeFileSync('lti_public_key.pem', publicKey);

console.log('✅ RSA keys generated successfully!');
console.log('Private key: lti_private_key.pem');
console.log('Public key: lti_public_key.pem');
```

Run with: `node generate-keys.js`

---

## Step 2: Convert Keys for Vercel Environment Variables

Vercel environment variables need single-line format with escaped newlines:

### Convert Private Key

```bash
# Linux/Mac
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' lti_private_key.pem

# Windows (PowerShell)
(Get-Content lti_private_key.pem -Raw) -replace "`r", "" -replace "`n", "\n"

# Output format:
# -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQ...\n-----END RSA PRIVATE KEY-----
```

### Convert Public Key

```bash
# Linux/Mac
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' lti_public_key.pem

# Windows (PowerShell)
(Get-Content lti_public_key.pem -Raw) -replace "`r", "" -replace "`n", "\n"

# Output format:
# -----BEGIN PUBLIC KEY-----\nMIIBIjANBgkq...\n-----END PUBLIC KEY-----
```

---

## Step 3: Store in Vercel Environment Variables

### Via Vercel Dashboard

1. Go to: https://vercel.com/your-team/myjkkn/settings/environment-variables
2. Add the following variables:

| Variable Name | Value | Environment |
|--------------|-------|-------------|
| `LTI_PRIVATE_KEY` | `-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----` | Production, Preview, Development |
| `LTI_PUBLIC_KEY` | `-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----` | Production, Preview, Development |
| `LTI_KEY_ID` | `myjkkn-2026-key-001` | Production, Preview, Development |
| `LTI_ISSUER` | `https://jkkn.ai` | Production |
| `LTI_ISSUER` | `https://myjkkn-preview.vercel.app` | Preview |
| `LTI_ISSUER` | `http://localhost:3000` | Development |

### Via Vercel CLI

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Set environment variables
vercel env add LTI_PRIVATE_KEY production
# Paste the single-line private key when prompted

vercel env add LTI_PUBLIC_KEY production
# Paste the single-line public key when prompted

vercel env add LTI_KEY_ID production
# Enter: myjkkn-2026-key-001

vercel env add LTI_ISSUER production
# Enter: https://jkkn.ai
```

---

## Step 4: Convert Public Key to JWK Format

MATLAB requires the public key in JWK (JSON Web Key) format for the JWKS endpoint.

### Using Node.js

```javascript
// convert-to-jwk.js
const crypto = require('crypto');
const fs = require('fs');

// Read public key
const publicKeyPem = fs.readFileSync('lti_public_key.pem', 'utf8');

// Create key object
const keyObject = crypto.createPublicKey(publicKeyPem);

// Export as JWK
const jwk = keyObject.export({ format: 'jwk' });

// Add required LTI fields
const ltiJwk = {
  kty: jwk.kty,
  use: 'sig',
  alg: 'RS256',
  kid: 'myjkkn-2026-key-001',
  n: jwk.n,
  e: jwk.e
};

console.log('JWK for JWKS endpoint:');
console.log(JSON.stringify(ltiJwk, null, 2));

// Save to file
fs.writeFileSync('lti_public_key.jwk.json', JSON.stringify(ltiJwk, null, 2));
console.log('\n✅ JWK saved to lti_public_key.jwk.json');
```

Run with: `node convert-to-jwk.js`

**Expected Output:**
```json
{
  "kty": "RSA",
  "use": "sig",
  "alg": "RS256",
  "kid": "myjkkn-2026-key-001",
  "n": "xGOr_HK...(base64url)",
  "e": "AQAB"
}
```

---

## Step 5: Test Key Pair

### Test Signing and Verification

```javascript
// test-keys.js
const crypto = require('crypto');
const fs = require('fs');

const privateKey = fs.readFileSync('lti_private_key.pem', 'utf8');
const publicKey = fs.readFileSync('lti_public_key.pem', 'utf8');

// Test data
const testData = 'Hello, LTI 1.3!';

// Sign with private key
const sign = crypto.createSign('RSA-SHA256');
sign.update(testData);
const signature = sign.sign(privateKey, 'base64');

console.log('Signature:', signature);

// Verify with public key
const verify = crypto.createVerify('RSA-SHA256');
verify.update(testData);
const isValid = verify.verify(publicKey, signature, 'base64');

if (isValid) {
  console.log('✅ Key pair verification successful!');
  console.log('✅ Private key can sign');
  console.log('✅ Public key can verify');
} else {
  console.error('❌ Key pair verification FAILED!');
  process.exit(1);
}
```

Run with: `node test-keys.js`

---

## Step 6: Secure Storage Best Practices

### ✅ DO:
- Store private key in Vercel environment variables (encrypted at rest)
- Use different keys for production, staging, development
- Rotate keys quarterly (every 3 months)
- Keep backup of keys in secure password manager (1Password, LastPass)
- Document key rotation date in team wiki

### ❌ DON'T:
- Commit keys to Git repository
- Share keys via email or Slack
- Store keys in plaintext files on local machine
- Use same keys across multiple environments
- Forget to rotate keys regularly

---

## Step 7: Key Rotation Procedure

When rotating keys (quarterly or after security incident):

1. **Generate new key pair** (follow Step 1)
2. **Update `LTI_KEY_ID`** to new identifier (e.g., `myjkkn-2026-key-002`)
3. **Add new public key to JWKS endpoint** (support both old and new)
4. **Update Vercel environment variables** with new keys
5. **Deploy to production**
6. **Notify MathWorks** of new public key (if required)
7. **Wait 7 days** for transition period
8. **Remove old key from JWKS endpoint**
9. **Archive old keys securely**

---

## Security Checklist

Before going to production:

- [ ] Private key never committed to Git
- [ ] Private key stored in Vercel environment variables
- [ ] Public key available at `/api/lti/jwks` endpoint
- [ ] Test JWT signing/verification works
- [ ] Different keys for production vs development
- [ ] Key rotation procedure documented
- [ ] Backup keys stored in secure password manager
- [ ] Team members know NOT to share keys

---

## Troubleshooting

### Error: "Invalid key format"
- Ensure newlines are escaped as `\n` for Vercel env vars
- Check no extra spaces or line breaks in the key string

### Error: "Verification failed"
- Ensure private and public keys are from the same pair
- Check algorithm is RS256 (not HS256 or other)
- Verify key hasn't been corrupted during copy/paste

### Error: "Key too short"
- Minimum key size is 2048 bits
- Regenerate with correct modulus length

---

## Quick Reference

```bash
# Generate keys
openssl genrsa -out lti_private_key.pem 2048
openssl rsa -in lti_private_key.pem -pubout -out lti_public_key.pem

# Convert to single-line
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' lti_private_key.pem

# Test
openssl rsa -in lti_private_key.pem -check -noout
```

---

**Next Steps:**
1. Generate keys using instructions above
2. Store in Vercel environment variables
3. Verify keys are accessible in Next.js API routes
4. Proceed to Phase 2: JWT generation service implementation
