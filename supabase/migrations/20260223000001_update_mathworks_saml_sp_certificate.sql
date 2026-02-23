-- Fix: Store MathWorks SAML signing certificate in saml_service_providers
-- Root Cause: The MathWorks SP was registered with entity_id + acs_url + slo_url only.
-- x509_certificate and want_authn_requests_signed were never set, causing samlify
-- to attempt signature validation without a certificate and throw an unhandled error.
--
-- Source: PROD-authngateway_metadata-PROD.xml (AuthnRequestsSigned="true" KeyDescriptor use="signing")
-- Certificate validity: 2024-01-25 to 2026-10-21
-- Date: 2026-02-23

UPDATE saml_service_providers
SET
  -- Store MathWorks signing certificate so samlify has it if verification is ever needed.
  -- Certificate is from their production SP metadata (signing key descriptor).
  x509_certificate = '-----BEGIN CERTIFICATE-----
MIIDZTCCAk2gAwIBAgIEcjKzHTANBgkqhkiG9w0BAQsFADBjMQswCQYDVQQGEwJV
UzELMAkGA1UECBMCTUExDzANBgNVBAcTBk5hdGljazESMBAGA1UEChMJTWF0aHdv
cmtzMRAwDgYDVQQLEwdVbmtub3duMRAwDgYDVQQDEwdVbmtub3duMB4XDTI0MDEy
NTAzMjE0M1oXDTI2MTAyMTAzMjE0M1owYzELMAkGA1UEBhMCVVMxCzAJBgNVBAgT
Ak1BMQ8wDQYDVQQHEwZOYXRpY2sxEjAQBgNVBAoTCU1hdGh3b3JrczEQMA4GA1UE
CxMHVW5rbm93bjEQMA4GA1UEAxMHVW5rbm93bjCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBALlvl+qwMEY2T5Qk3/E8ZMNUGy8SV1IZZSWcECKGUezFKO5s
bSMcGyB1akkFUeMga6ToNuZn3p5B4P1g34bLVc7RaICgCBh9+w8TBcHtBVJxsAZy
n2Nc0CFWB6mt8yvxUS7XAgS8sALgFYZHD5tF/187KXIZPuQryQTCOV0+FAIEw3Iz
q8qum9L0P8jN3KcpUj1bcIbwAJLqS8bxn0I/7ogryUzTUOhRsWFU+oR6FHohfN59
lC/7W6YtVPE4BHUsIX7SsWktEb05CaMAJ08miNsa9kZWpLU+0Fo1eac0PbyIZPPE
NGXT2EhWkDaYpCiFplsm7dGNrZ+lvYdg+fgnHs8CAwEAAaMhMB8wHQYDVR0OBBYE
FFzUWbPMLKPg/Oip0UjMtOifeJs4MA0GCSqGSIb3DQEBCwUAA4IBAQCPTb785X8Z
pRODzByRidiaPyP+quS9Lb8tgkoyNAUtUBH9+6M/N9Bk0zghbCW2uFUVnrh/ZCdw
rNo9v3MOnFQd/GOz5eAZpCzHdYvRPlPyOFRe/hNWtzmat9E9FeA1zx5gE9bxK1Jo
rOc01A5txlf/LYUx68PWtyq7HH/6mCckJgwZjYaXxt8K1SobMjvizehUzqM7o9gQ
vxsgXV8P8IaV/cBj9R6Q8mSVgnvgP8Km3HMQf1xxi4iKFi3QaACFIuHGYJ6oN/cT
tlcnhqam0cL2STHjW7JMhbs5dzVs7pc+VECQFGn/EGKIaFBuCmRE1rKSuEIOhTGl
f3P3wp7Dsld5
-----END CERTIFICATE-----',
  -- Our IdP metadata has WantAuthnRequestsSigned="false".
  -- We do not validate incoming AuthnRequest signatures regardless of what
  -- MathWorks's metadata says (AuthnRequestsSigned="true"). Setting this to
  -- false prevents samlify from triggering validation with no cert loaded.
  want_authn_requests_signed = false,
  updated_at = now()
WHERE entity_id = 'https://login.mathworks.com/authngateway/saml/metadata';

-- Verify the update
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM saml_service_providers
    WHERE entity_id = 'https://login.mathworks.com/authngateway/saml/metadata'
      AND x509_certificate IS NOT NULL
      AND want_authn_requests_signed = false
  ) THEN
    RAISE EXCEPTION 'Migration failed: MathWorks SP record not found or not updated correctly';
  END IF;
END $$;
