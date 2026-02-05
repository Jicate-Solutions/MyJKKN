# MyJKKN SAML SSO Setup - Response to MathWorks

**Date:** 2026-02-03
**From:** JKKN Technical Team
**To:** Mohammed Jamal, MathWorks Enterprise Support
**Subject:** SAML SSO Configuration Details

---

## ✅ Step 1: MathWorks Metadata Configured

We have successfully configured MathWorks as a trusted Service Provider using the provided metadata file (`PROD-authngateway_metadata-PROD.xml`).

**Configuration Details:**
- Entity ID: `https://login.mathworks.com/authngateway/saml/metadata`
- ACS URL: `https://services.mathworks.com/authngateway/saml/SSO`
- SLO URL: `https://services.mathworks.com/authngateway/saml/SingleLogout`
- Certificate: Extracted and stored
- Status: **Active**

---

## ✅ Step 2: Endpoint Setup Confirmed

MyJKKN SAML Identity Provider is deployed and operational.

**Endpoint Status:**
- Metadata Endpoint: ✅ Operational
- SSO Login Endpoint: ✅ Operational
- Single Logout: ✅ Operational

---

## 📄 Step 3: MyJKKN IdP Metadata

### Option A: Metadata XML File (Preferred)

**Metadata URL:** `https://jkkn.ai/api/saml/metadata`

You can fetch our IdP metadata directly from the URL above, or use the attached XML file: `myjkkn-idp-metadata.xml`

### Option B: Individual Configuration Details

| Field | Value |
|-------|-------|
| **IdP Entity ID** | `https://jkkn.ai/api/saml/metadata` |
| **IdP Binding** | HTTP-POST |
| **IdP Login URL** | `https://jkkn.ai/api/saml/sso` |
| **IdP Public Certificate** | See attached `myjkkn-saml-public.pem` |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |

---

## 🏷️ Step 4: Attribute Mapping

MyJKKN will send the following SAML attributes in the authentication response:

| Attribute | Format | Example Value | Description |
|-----------|--------|---------------|-------------|
| **Identifier** | NameId | `student@jkkn.ac.in` | User's email address (unique identifier) |
| **Affiliation** | `eduPersonScopedAffiliation` | `Student`, `Faculty`, `Staff` | User role/affiliation |
| **Email** | `mail` | `student@jkkn.ac.in` | User's email address |
| **Given Name** | `givenName` | `Rajesh` | User's first name |
| **Surname** | `sn` | `Kumar` | User's last name |
| **Display Name** | `displayName` | `Rajesh Kumar` | Full name for display |

### Affiliation Mapping:

| MyJKKN Role | MathWorks Affiliation |
|-------------|----------------------|
| `student` | `Student` |
| `faculty` | `Faculty` |
| `hod` | `Faculty` |
| `principal` | `Faculty` |
| `staff` | `Staff` |
| `administrator` | `Staff` |

---

## 🧪 Testing Accounts

We will provide two test accounts for SSO verification:

### Test Account 1:
- **Email:** `boobalan.a@jkkn.ac.in`
- **Affiliation:** Super Admin
- **Name:** Boobalan

### Test Account 2:
- **Email:** `ranjith@jkkn.ac.in`
- **Affiliation:** Super Admin
- **Name:** Ranjith

*(Note: These accounts will be created and credentials will be shared securely via separate email)*

---

## 📋 Technical Details

### SAML Version
- SAML 2.0

### Security
- **Signature Algorithm:** RSA-SHA256
- **Digest Algorithm:** SHA256
- **Assertions Signed:** Yes
- **Responses Signed:** Yes

### Session
- **Session Duration:** 8 hours
- **Assertion Expiry:** 5 minutes

---

## 🔐 Firewall Configuration

If you need to whitelist our IP addresses for firewall configuration, please refer to:
https://www.mathworks.com/matlabcentral/answers/1840323

---

## 📞 Next Steps

1. **Configure MyJKKN IdP** in your MathWorks system using the metadata provided
2. **Enable SSO** for our institution (JKKN)
3. **Notify us** when ready for testing
4. We will test SSO flow with the provided test accounts
5. Upon successful testing, we will roll out to all users

---

## Contact Information

**Technical Contact:**
- Name: [Your Name]
- Email: [Your Email]
- Phone: [Your Phone]

**Institution:**
- Name: JKKN College of Engineering
- Domain: jkkn.ac.in
- Location: Tamil Nadu, India

---

## Attached Files

1. `myjkkn-idp-metadata.xml` - Complete SAML IdP metadata
2. `myjkkn-saml-public.pem` - Public certificate for signature verification

---

**Thank you for your assistance!**

We look forward to enabling seamless MATLAB access for our students and faculty through SAML SSO.

Best regards,
JKKN Technical Team
