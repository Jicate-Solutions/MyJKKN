# Reply Email to MathWorks — Round 5 Certificate Update + Retest

**Subject:** Re: SSO Configuration Update — New IdP Signing Certificate (Action Required)
**To:** Mohammed Jamal (support@mathworks.com)
**CC:** ceo@jkkn.ac.in, director@jkkn.ac.in, ranjith@jkkn.ac.in
**From:** JKKN Technical Team
**Date:** 25 February 2026
**Priority:** High

---

Dear Mohammed,

Thank you for your continued patience and support throughout this integration. We have identified and resolved the root cause of the signing error (`Failed to generate SAML response`) and are writing to request a configuration update on the MathWorks side.

---

## Root Cause

The error was caused by a **corrupted byte in our IdP signing private key**. Specifically, one byte of the key data was lost during encoding when the key was originally stored in our environment, causing OpenSSL to reject the key during SAML assertion signing.

This was entirely an issue on our end and has been resolved by generating a fresh RSA-2048 key pair.

---

## Action Required from MathWorks

Since we have generated a **new signing key pair**, our IdP signing certificate has changed. You will need to update the JKKN IdP configuration in your system with the new certificate.

### Option A: Update via Metadata URL (Recommended)

Please re-fetch our IdP metadata from:

**`https://www.jkkn.ai/api/saml/metadata`**

This URL will serve the updated metadata with the new signing certificate once we deploy the update (within 24 hours of this email).

### Option B: Manual Certificate Update

If you prefer to update the certificate manually, the new IdP signing certificate is attached to this email as `myjkkn-saml-public.pem`.

**New Certificate Details:**

| Field | Value |
|-------|-------|
| **Subject** | CN=jkkn.ai, O=JKKN College of Engineering, OU=IT Department, L=Komarapalayam, ST=Tamil Nadu, C=IN |
| **Valid From** | February 25, 2026 |
| **Valid Until** | February 25, 2027 |
| **Key Type** | RSA 2048-bit |
| **Signature Algorithm** | SHA-256 with RSA |
| **SAN** | DNS:jkkn.ai, DNS:www.jkkn.ai |

**All other configuration remains unchanged:**

| Configuration Item | Value | Changed? |
|-------------------|-------|----------|
| IdP Entity ID | `https://jkkn.ai/api/saml/metadata` | No change |
| SSO Login URL | `https://jkkn.ai/api/saml/sso` | No change |
| SSO Bindings | HTTP-POST, HTTP-Redirect | No change |
| SLO URL | `https://jkkn.ai/api/saml/slo` | No change |
| NameID Format | emailAddress | No change |
| Attribute: Affiliation | `Affiliation` | No change |
| **Signing Certificate** | **See attached / metadata URL** | **UPDATED** |

---

## Testing After Update

Once you have updated the IdP certificate on your side, we kindly request a re-test with the following accounts:

- **boobalan.a@jkkn.ac.in**
- **ranjith@jkkn.ac.in**

**Testing steps:**
1. Go to [https://www.mathworks.com](https://www.mathworks.com) or MATLAB Online
2. Click **Sign In** → **Sign in through your organization's account**
3. Enter one of the test emails above
4. You should be redirected to `https://jkkn.ai/api/saml/sso`
5. Log in with MyJKKN credentials
6. You should be automatically returned to MathWorks and granted access

If possible, please use the **SAML Tracer** browser extension to capture the SAML response attributes during testing.

---

## Summary of All Fixes to Date

| Round | Date | Issue | Status |
|-------|------|-------|--------|
| 1 | Feb 11 | Internal server error — request parsing bugs | Fixed |
| 1 | Feb 11 | Attribute name mismatch (`eduPersonScopedAffiliation` → `Affiliation`) | Fixed |
| 3 | Feb 19 | `unknown_service_provider` — database access control issue | Fixed |
| 4 | Feb 23 | `Failed to parse SAML request` — configuration and URL mismatch bugs | Fixed |
| 5 | Feb 25 | `Failed to generate SAML response` — corrupted signing private key | **Fixed** |

---

We believe this resolves the final issue preventing successful SSO authentication. All previous bugs in request parsing, service provider lookup, attribute mapping, and URL validation have been fixed and tested. The signing key pair has been regenerated and verified.

Please let us know once you have updated the certificate on your side, and we will coordinate testing.

Best regards,

**JKKN Technical Team**
JKKN College of Engineering
IT Department
Website: https://jkkn.ai | Domain: jkkn.ac.in
Business Hours: Mon–Fri, 9:00 AM – 5:00 PM IST (UTC +5:30)

---

## Attachments

1. `myjkkn-saml-public.pem` — New IdP signing certificate

---

## Pre-Send Checklist

- [ ] Update Vercel env var `SAML_PRIVATE_KEY` with new base64 value from `SAML_PRIVATE_KEY_B64.txt`
- [ ] Update Vercel env var `SAML_PUBLIC_CERTIFICATE` with new base64 value from `SAML_PUBLIC_CERTIFICATE_B64.txt`
- [ ] Verify deployment: visit `https://www.jkkn.ai/api/saml/metadata` and confirm new certificate fingerprint
- [ ] Attach `myjkkn-saml-public.pem` (the NEW certificate) to the email
- [ ] Fill in sender name and direct contact details
- [ ] Review CC list
- [ ] Send email
- [ ] After MathWorks confirms certificate update: coordinate testing session
