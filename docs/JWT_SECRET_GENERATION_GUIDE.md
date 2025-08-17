# JWT Secret Generation Guide for Child App Authentication

## What is a JWT Secret?

A JWT (JSON Web Token) Secret is a cryptographic key used to sign and verify tokens. It ensures that:
- Tokens cannot be forged by malicious actors
- Only your server can create valid tokens
- Token integrity can be verified

## Security Requirements

Your JWT Secret should be:
- **At least 32 characters long** (256 bits recommended)
- **Completely random** - no dictionary words or patterns
- **Unique** - never reused across projects
- **Secret** - never committed to version control
- **Rotated periodically** - change every 3-6 months in production

## Methods to Generate a JWT Secret

### Method 1: Using OpenSSL (Recommended)

```bash
# Generate a 256-bit (32 byte) secret
openssl rand -base64 32

# Generate a 512-bit (64 byte) secret for extra security
openssl rand -base64 64

# Example output:
# vK3RdXJMYXb+KiWntl6vxqJYMzLqEWPm8RGcI9PjHb8=
```

### Method 2: Using Node.js

```bash
# Run this in your terminal
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Or for a hex string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Method 3: Using PowerShell (Windows)

```powershell
# Generate random bytes and convert to base64
[Convert]::ToBase64String((1..32 | ForEach {Get-Random -Maximum 256}))

# Or using .NET
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

### Method 4: Using Python

```bash
# Run this command
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Or for base64
python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

### Method 5: Online Generators (Less Secure - Dev Only)

For development only, you can use online generators, but **NEVER use these for production**:
- https://www.allkeysgenerator.com/Random/Security-Encryption-Key-Generator.aspx
- https://generate-random.org/api-key-generator

## Implementation Steps

### 1. Generate Your Secret

Choose one of the methods above. For example, using OpenSSL:

```bash
openssl rand -base64 32
```

Output example:
```
xWKzQ7JhRvP+mC9Ln8dXt2B4aFpNcO1Sw5iYgErUqHs=
```

### 2. Add to Environment File

Update your `.env` file:

```env
# JWT Secret for child app authentication (generate a secure random string in production)
JWT_SECRET=xWKzQ7JhRvP+mC9Ln8dXt2B4aFpNcO1Sw5iYgErUqHs=
```

### 3. Verify .env is in .gitignore

Check your `.gitignore` file includes:

```gitignore
# Environment files
.env
.env.local
.env.production
.env*.local
```

### 4. Create .env.example

Create an example file for other developers:

```env
# .env.example
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

## Best Practices

### 1. Different Secrets for Different Environments

```env
# Development (.env.local)
JWT_SECRET=dev-secret-only-for-local-development

# Staging (.env.staging)
JWT_SECRET=staging-secret-different-from-production

# Production (.env.production)
JWT_SECRET=ultra-secure-production-secret-never-share
```

### 2. Rotate Secrets Periodically

Create a rotation strategy:

```javascript
// Support multiple secrets during rotation
const JWT_SECRETS = {
  current: process.env.JWT_SECRET,
  previous: process.env.JWT_SECRET_PREVIOUS, // For grace period
};

// Verify with multiple secrets
function verifyToken(token) {
  try {
    // Try current secret first
    return jwt.verify(token, JWT_SECRETS.current);
  } catch (error) {
    // Fall back to previous secret during rotation period
    return jwt.verify(token, JWT_SECRETS.previous);
  }
}
```

### 3. Store Production Secrets Securely

For production, use:
- **Environment Variables** in your hosting platform (Vercel, Netlify, etc.)
- **Secret Management Services** (AWS Secrets Manager, Azure Key Vault)
- **CI/CD Secret Variables** (GitHub Secrets, GitLab CI Variables)

## Setting Production Secrets

### Vercel
```bash
vercel env add JWT_SECRET production
# Paste your secret when prompted
```

### Netlify
1. Go to Site Settings > Environment Variables
2. Add `JWT_SECRET` with your generated value

### Docker
```dockerfile
# Use build secrets (don't hardcode)
RUN --mount=type=secret,id=jwt_secret \
    JWT_SECRET=$(cat /run/secrets/jwt_secret)
```

### PM2
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'app',
    env: {
      JWT_SECRET: process.env.JWT_SECRET // Read from system env
    }
  }]
};
```

## Security Checklist

- [ ] Secret is at least 32 characters long
- [ ] Secret is randomly generated
- [ ] Secret is stored in environment variables
- [ ] `.env` file is in `.gitignore`
- [ ] Different secrets for dev/staging/prod
- [ ] Secret rotation plan in place
- [ ] No hardcoded secrets in code
- [ ] Production secret stored securely
- [ ] Access to production secret is limited
- [ ] Audit log for secret access (if applicable)

## Testing Your JWT Secret

After setting up your JWT secret, test it:

```javascript
// test-jwt.js
const { SignJWT, jwtVerify } = require('jose');

async function testJWT() {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  
  // Create a test token
  const token = await new SignJWT({ test: 'data' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
  
  console.log('Token created:', token);
  
  // Verify the token
  const { payload } = await jwtVerify(token, secret);
  console.log('Token verified:', payload);
}

testJWT().catch(console.error);
```

Run:
```bash
node test-jwt.js
```

## Troubleshooting

### Error: "JWT Secret too short"
- Ensure your secret is at least 32 characters
- Use base64 encoding for better entropy

### Error: "Invalid signature"
- Check that the same secret is used for signing and verifying
- Ensure no extra whitespace or newlines in the secret
- Verify environment variable is loaded correctly

### Error: "Secret not found"
- Check `.env` file exists and is in the project root
- Restart your development server after changing `.env`
- Verify the environment variable name matches exactly

## Quick Generate & Apply

For immediate setup, run these commands:

```bash
# Generate secret
JWT_SECRET=$(openssl rand -base64 32)

# Display it
echo "Your JWT Secret: $JWT_SECRET"

# Add to .env file
echo "JWT_SECRET=$JWT_SECRET" >> .env

# Verify it was added
tail -n 1 .env
```

## Important Notes

1. **NEVER** share your production JWT secret
2. **NEVER** commit secrets to version control
3. **ALWAYS** use HTTPS in production to protect tokens in transit
4. **ROTATE** secrets if you suspect they've been compromised
5. **MONITOR** for unusual token usage patterns

## Next Steps

1. Generate your JWT secret using one of the methods above
2. Add it to your `.env` file
3. Restart your development server
4. Test the child app authentication flow
5. Set up production secrets in your hosting platform

Remember: The security of your entire authentication system depends on keeping this secret truly secret!