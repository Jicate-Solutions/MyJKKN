# Email to MathWorks - SAML SSO Configuration

---

**Subject:** JKKN College of Engineering - SAML SSO Configuration Details for MathWorks Integration

---

Dear Mohammed Jamal and MathWorks Enterprise Support Team,

I hope this email finds you well. We are writing to provide the complete SAML SSO configuration details for integrating JKKN College of Engineering with MathWorks services.

We have successfully configured our Identity Provider (IdP) and are ready to enable seamless single sign-on access to MATLAB and other MathWorks products for our students and faculty.

---

## ✅ Step 1: MathWorks Metadata Configuration - Complete

We have successfully imported and configured MathWorks as a trusted Service Provider using the metadata file (`PROD-authngateway_metadata-PROD.xml`) provided earlier.

**Configuration Status:**
- **Entity ID:** `https://login.mathworks.com/authngateway/saml/metadata`
- **Assertion Consumer Service (ACS) URL:** `https://services.mathworks.com/authngateway/saml/SSO`
- **Single Logout (SLO) URL:** `https://services.mathworks.com/authngateway/saml/SingleLogout`
- **SP Certificate:** Successfully extracted and stored
- **Status:** Active and operational

---

## ✅ Step 2: JKKN IdP Endpoints - Operational

Our SAML Identity Provider is deployed and all endpoints are fully operational:

| Endpoint | URL | Status |
|----------|-----|--------|
| **IdP Metadata** | `https://jkkn.ai/api/saml/metadata` | ✅ Operational |
| **SSO Login Endpoint** | `https://jkkn.ai/api/saml/sso` | ✅ Operational |
| **Single Logout** | `https://jkkn.ai/api/saml/slo` | ✅ Operational |

---

## 📄 Step 3: JKKN IdP Metadata

Please configure the JKKN College of Engineering Identity Provider in your MathWorks system using the following details:

### Option A: Metadata XML File (Recommended)

**Metadata URL:** `https://jkkn.ai/api/saml/metadata`

You can fetch our IdP metadata directly from this URL, or we have attached the XML file (`myjkkn-idp-metadata.xml`) to this email for your convenience.

### Option B: Manual Configuration

If you prefer to configure manually, please use these details:

| Field | Value |
|-------|-------|
| **IdP Entity ID** | `https://jkkn.ai/api/saml/metadata` |
| **IdP Binding** | HTTP-POST |
| **IdP Login URL** | `https://jkkn.ai/api/saml/sso` |
| **IdP Public Certificate** | See attached file: `myjkkn-saml-public.pem` |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |

---

## 🏷️ Step 4: SAML Attribute Mapping

Our IdP will send the following SAML attributes in each authentication response:

| Attribute Name | SAML Format | Example Value | Description |
|----------------|-------------|---------------|-------------|
| **User Identifier** | NameId | `student@jkkn.ac.in` | User's email address (unique identifier) |
| **Affiliation** | `eduPersonScopedAffiliation` | `Student`, `Faculty`, `Staff` | User's role/affiliation |
| **Email Address** | `mail` | `student@jkkn.ac.in` | User's primary email |
| **Given Name** | `givenName` | `Rajesh` | User's first name |
| **Surname** | `sn` | `Kumar` | User's last name |
| **Display Name** | `displayName` | `Rajesh Kumar` | Full name for display purposes |

### JKKN to MathWorks Affiliation Mapping:

| JKKN User Role | MathWorks Affiliation |
|----------------|-----------------------|
| Student | `Student` |
| Faculty | `Faculty` |
| Head of Department (HOD) | `Faculty` |
| Principal | `Faculty` |
| Staff | `Staff` |
| Administrator | `Staff` |

---

## 🧪 Step 5: Test User Accounts

We will provide the following test accounts for SSO verification and integration testing:

### Test Account 1 (Super Admin):
- **Email:** `boobalan.a@jkkn.ac.in`
- **Name:** Boobalan
- **Affiliation:** Administrator (mapped to `Staff` in MathWorks)
- **Status:** Active and ready for testing

### Test Account 2 (Super Admin):
- **Email:** `ranjith@jkkn.ac.in`
- **Name:** Ranjith
- **Affiliation:** Administrator (mapped to `Staff` in MathWorks)
- **Status:** Active and ready for testing

*Note: We will share the login credentials for these accounts securely via a separate communication channel upon your request.*

---

## 📋 Step 6: Technical Specifications

### SAML Version & Security:

| Parameter | Value |
|-----------|-------|
| **SAML Version** | SAML 2.0 |
| **Signature Algorithm** | RSA-SHA256 |
| **Digest Algorithm** | SHA256 |
| **Assertions Signed** | Yes |
| **Responses Signed** | Yes |
| **Session Duration** | 8 hours |
| **Assertion Validity** | 5 minutes |

### Certificate Details:

- **Algorithm:** SHA256 with RSA Encryption
- **Key Size:** 2048 bits
- **Validity Period:** 10 years (until February 2027)
- **Certificate File:** Attached as `myjkkn-saml-public.pem`

---

## 🔐 Step 7: Network Configuration

If firewall whitelisting is required on your end, please refer to:
https://www.mathworks.com/matlabcentral/answers/1840323

Our institution operates from the following domain:
- **Primary Domain:** `jkkn.ac.in`
- **SSO Domain:** `jkkn.ai`

---

## 📞 Next Steps & Timeline

To complete the integration, we request the following:

1. **MathWorks Configuration** (Your Action)
   - Import JKKN IdP metadata or configure manually using details above
   - Enable SSO for our institution domain (`jkkn.ac.in`)
   - Configure attribute mapping as specified

2. **Integration Testing** (Joint Effort)
   - We will test SSO flow using the provided test accounts
   - Verify user attributes are correctly mapped
   - Confirm session management and logout functionality

3. **Production Rollout** (Post-Testing)
   - Upon successful testing, enable SSO for all JKKN users
   - Notify us when the integration is live
   - We will communicate the new access method to our students and faculty

**Proposed Timeline:**
- Configuration: 2-3 business days
- Testing: 2-3 business days
- Production rollout: 1 business day
- **Total estimated time:** 1 week

Please let us know if this timeline works for your team or if any adjustments are needed.

---

## 📎 Attachments

This email includes the following attachments:

1. **myjkkn-idp-metadata.xml** - Complete SAML IdP metadata XML file
2. **myjkkn-saml-public.pem** - X.509 public certificate for signature verification
3. **PROD-authngateway_metadata-PROD.xml** - Your original metadata file (for reference)

---

## 👥 Contact Information

For any technical questions or clarifications during the integration process, please contact:

**Primary Technical Contact:**
- **Name:** [Your Name]
- **Title:** [Your Title]
- **Email:** [Your Email]
- **Phone:** [Your Phone Number]

**Secondary Contact:**
- **Name:** [Secondary Contact Name]
- **Email:** [Secondary Contact Email]

**Institution Details:**
- **Institution Name:** JKKN College of Engineering
- **Location:** Komarapalayam, Tamil Nadu, India
- **Website:** https://jkkn.ai
- **Domain:** jkkn.ac.in

**Business Hours:** Monday - Friday, 9:00 AM - 5:00 PM IST (UTC +5:30)

---

## 🙏 Closing

Thank you for your assistance in enabling SAML SSO integration for JKKN College of Engineering. We are excited to provide our students and faculty with seamless access to MATLAB and MathWorks products.

This integration will significantly enhance the learning experience for our engineering students and support our faculty in delivering high-quality education using industry-standard tools.

We look forward to your confirmation and are available for any clarifications or additional information you may need to complete the configuration.

Please feel free to reach out if you have any questions or require additional details.

---

**Best regards,**

[Your Name]
[Your Title]
JKKN College of Engineering
IT Department

Email: [Your Email]
Phone: [Your Phone]
Website: https://jkkn.ai

---

**CC:**
- [Dean/Principal Name] - [Email]
- [HOD IT/CS Department] - [Email]
- [Other relevant stakeholders]

---

## 📝 Email Metadata

**Subject:** JKKN College of Engineering - SAML SSO Configuration Details for MathWorks Integration
**To:** Mohammed Jamal (mohammed.jamal@mathworks.com)
**CC:** [Your supervisors/stakeholders]
**Priority:** High
**Category:** Integration Request
**Expected Response Time:** 2-3 business days

---

## ✅ Pre-Send Checklist

Before sending this email, please ensure:

- [ ] All attachments are included (metadata XML, public certificate)
- [ ] Contact information is filled in with actual names and details
- [ ] CC list includes all relevant stakeholders
- [ ] Test account credentials are prepared (send separately if requested)
- [ ] Timeline is reviewed and approved by management
- [ ] Email is proofread for clarity and professionalism
- [ ] Signature block is complete with your details

---

*This email template is ready to be customized with your actual contact details and sent to MathWorks support.*
