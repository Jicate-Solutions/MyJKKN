# SAML SSO Integration Fixes – Round 5

**Date:** 2026-02-24
**Status:** In Progress
**Triggered By:** Persistent `error:1E08010C:DECODER routines::unsupported` after Round 4 fixes

---

## Error Details

```json
{
  "error": "Failed to generate SAML response: error:1E08010C:DECODER routines::unsupported",
  "statusCode": "urn:oasis:names:tc:SAML:2.0:status:Responder",
  "statusDetail": "response_generation_failed"
}
```

HTTP 500 at `GET https://www.jkkn.ai/api/saml/sso?SAMLRequest=...`

---

## Root Cause Analysis

### The Error Chain

1. SAML AuthnRequest is received and parsed successfully
2. User is authenticated, profile fetched, session created
3. `SamlIdpService.generateSamlResponse()` is called
4. `idp.createLoginResponse()` (samlify) attempts to sign the SAML assertion XML
5. samlify delegates to xml-crypto v6.1.2 for XML signing
6. xml-crypto calls `crypto.createSign("RSA-SHA256").sign(privateKey)`
7. Node.js passes the key to OpenSSL 3.x
8. **OpenSSL rejects the key** with `error:1E08010C:DECODER routines::unsupported`

### Why OpenSSL Rejects the Key

The private key stored in Vercel environment variable `SAML_PRIVATE_KEY` is:
- Base64-encoded PEM
- PKCS#8 format (`-----BEGIN PRIVATE KEY-----`)
- 2048-bit RSA key

OpenSSL 3.x (used by Node.js 20+) is stricter about key format validation than
previous versions. The error indicates a **format mismatch** between PEM headers
and the DER-encoded key body.

### Library Analysis (samlify v2.10.2 + xml-crypto v6.1.2)

| Component | What It Does with the Key |
|-----------|--------------------------|
| Our `formatPrivateKey()` | Passes through PEM key as-is (was not converting) |
| samlify `readPrivateKey()` | Returns key unchanged when no passphrase is set |
| xml-crypto `SignedXml` | Stores key directly in `this.privateKey` |
| xml-crypto signature algo | Passes key directly to `crypto.createSign().sign(key)` |
| Node.js crypto | Passes to OpenSSL 3.x for signing |
| **OpenSSL 3.x** | **Rejects** — format mismatch |

**Key finding:** Neither samlify nor xml-crypto strip or transform PEM headers.
The key is passed verbatim to Node.js crypto. The issue is between the PKCS#8 format
and OpenSSL 3.x on the Vercel runtime.

---

## Fix Applied

### Convert PKCS#8 → PKCS#1 before passing to samlify

**File:** `lib/services/saml/saml-idp-service.ts` — `formatPrivateKey()`

**Approach:** Use Node.js native `crypto.createPrivateKey()` to parse the PKCS#8 key
properly, then re-export as PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`) which is the
traditional RSA key format that OpenSSL handles without ambiguity.

```typescript
import { createPrivateKey } from 'crypto';

private static formatPrivateKey(key: string): string {
  const pemKey = (key.includes('-----BEGIN ') && key.includes('-----END '))
    ? key
    : `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;

  try {
    const keyObj = createPrivateKey(pemKey);
    return keyObj.export({ type: 'pkcs1', format: 'pem' }) as string;
  } catch (err) {
    console.error('[saml-idp] PKCS#1 conversion failed, using key as-is:', err);
    return pemKey;
  }
}
```

Also:
- Bumped `IDP_CACHE_VERSION` to `'v4-pkcs1-convert'` to force cache invalidation
- Added diagnostic logging to confirm conversion success/failure in Vercel runtime logs

---

## Commits

| Commit | Description |
|--------|-------------|
| `0941d3f3` | Surface raw samlify error in generateSamlResponse catch block |
| `1996eb7b` | Detect PKCS#1 key format in formatPrivateKey |
| `86e04a31` | Universal PEM header detection in formatPrivateKey |
| `4b6b771a` | Add key format diagnostic logging (no key material logged) |
| `b0d21163` | Convert PKCS#8 key to PKCS#1 before passing to samlify |
| `a1da6d5b` | Add explicit logging to formatPrivateKey conversion |

---

## Verification Steps

After deployment, check Vercel Runtime Logs for:

1. `[saml-idp] formatPrivateKey PKCS#1 conversion SUCCESS` → fix is working
   - `outputFirstLine` should be `-----BEGIN RSA PRIVATE KEY-----`
   - `asymmetricKeyType` should be `rsa`

2. `[saml-idp] PKCS#1 conversion FAILED` → key is malformed, needs re-generation

3. No log lines at all → deployment hasn't propagated yet

---

## Metadata Cross-Validation (Confirmed OK)

Both IdP and SP metadata have been cross-checked and are correctly aligned:

- Entity IDs match on both sides
- ACS URL matches our DB record
- NameID format matches (emailAddress)
- Both certificates are valid
- SSO endpoints cover both www and non-www variants

The issue is purely runtime key signing, not metadata configuration.

---

## Responsibility Analysis

| Side | Responsible? | Why |
|------|-------------|-----|
| **JKKN (our codebase)** | **YES** | Private key format handling in signing flow |
| Vercel infrastructure | No | Standard Node.js 20 + OpenSSL 3.x runtime |
| MathWorks | No | Only receives signed assertions; not involved in signing |

---

Completed By: Claude Opus 4.6
Date: 2026-02-24
