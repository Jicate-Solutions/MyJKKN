# Reply Email to MathWorks - SSO Issue Resolution

---

**Subject:** Re: JKKN College of Engineering - SAML SSO Configuration Details for MathWorks Integration
**To:** Mohammed Jamal (MathWorks Enterprise Install and Licensing Support)
**From:** JKKN Technical Team
**Date:** 11 February 2026
**Priority:** High
**Category:** Issue Resolution / Integration Follow-up

---

Dear Mohammed,

Thank you for the detailed issue report and for testing the SSO integration with our IdP. Your observations were very helpful in identifying and resolving the issues. We appreciate MathWorks' continued support throughout this integration process.

We have investigated both issues you reported and have deployed fixes for each. Please find our updates below.

---

## Issue 1: IdP Login Error (Internal Server Error at SSO Endpoint)

We identified and resolved three issues in our SSO endpoint that were causing the internal server error when MathWorks redirected users to `https://jkkn.ai/api/saml/sso`:

1. **Request handling error** -- Our endpoint had a bug in how it processed incoming SAML requests, causing certain request parameters to fail extraction. This has been corrected and the endpoint now reliably processes both HTTP-Redirect and HTTP-POST binding requests.

2. **SAML request decoding** -- For requests arriving via HTTP-Redirect binding, our endpoint was not performing the required DEFLATE decompression step after base64 decoding. This caused the AuthnRequest XML to be unreadable. We have added proper decompression handling in accordance with the SAML 2.0 specification.

3. **Binding-specific processing** -- Our endpoint was not correctly distinguishing between HTTP-Redirect and HTTP-POST bindings when processing the incoming SAML request. This has been fixed so that each binding type is handled according to its respective specification.

**Status:** All three fixes have been deployed to production. The SSO endpoint at `https://jkkn.ai/api/saml/sso` is now fully operational and correctly processes AuthnRequests from MathWorks.

---

## Issue 2: Attribute Schema Alignment (Direct SSO)

Thank you for clarifying the distinction between federated SSO and direct SSO attribute schemas. We understand that:

- `eduPersonScopedAffiliation` is intended for federated SSO flows (e.g., via InFED/eduGAIN)
- `Affiliation` is the correct attribute name for direct SSO between JKKN and MathWorks

We have updated our SAML response accordingly. Our IdP now sends the following attribute for direct SSO:

| Attribute Name | Format | Example Values |
|----------------|--------|----------------|
| **Affiliation** | `Affiliation=affiliation` | `student`, `faculty`, `staff`, `employee` |

The affiliation values are mapped from the user's role in our MyJKKN system, consistent with the mapping shared in our initial configuration email.

**Status:** Attribute schema updated and deployed.

---

## Next Steps

Both fixes are live in production and ready for re-testing. We kindly request the following:

1. **Re-test the SSO flow** using the previously provided test accounts:
   - `boobalan.a@jkkn.ac.in`
   - `ranjith@jkkn.ac.in`

2. **Share the SAML response attributes** captured during testing so that we can verify on our end that all attributes (particularly `Affiliation`, `mail`, `givenName`, `sn`, and `displayName`) are being received correctly by MathWorks.

3. **Confirm successful authentication** or let us know if any further adjustments are needed.

We are available to coordinate a joint testing session if that would be helpful, and we are happy to address any additional issues promptly.

---

Thank you again for your patience and thorough feedback, Mohammed. We are committed to ensuring a smooth SSO experience for our students and faculty accessing MATLAB and MathWorks services.

Please do not hesitate to reach out if you have any questions or require further information.

Best regards,

**JKKN Technical Team**
JKKN College of Engineering
IT Department

Website: https://jkkn.ai
Domain: jkkn.ac.in
Business Hours: Monday -- Friday, 9:00 AM -- 5:00 PM IST (UTC +5:30)

---

## Pre-Send Checklist

- [ ] Verify SSO endpoint is responding correctly before sending
- [ ] Confirm attribute schema change is deployed
- [ ] Test both HTTP-Redirect and HTTP-POST bindings internally
- [ ] Fill in sender contact details (name, email, phone) before sending
- [ ] Add CC recipients (stakeholders, management) as appropriate
- [ ] Review for accuracy and send
