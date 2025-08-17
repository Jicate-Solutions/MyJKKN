# Applications Module - Parent Authentication Integration Guide

## Overview
The Applications module now includes integrated parent authentication support, allowing applications to use MyJKKN authentication instead of implementing separate login systems.

## What Changed?
- Applications can now optionally use MyJKKN authentication (parent app authentication)
- No need for separate child app registration module
- Authentication is an optional feature that can be enabled per application
- Existing applications continue to work without any changes

## How to Enable Parent Authentication for an Application

### 1. Navigate to Applications Module
- Go to `/applications` in your MyJKKN admin panel
- You'll see the list of all applications with a new "Auth" column showing authentication status

### 2. Create or Edit an Application
- Click "Add New Application" to create a new app with authentication
- Or click Edit on an existing application to add authentication

### 3. Enable Parent Authentication
- In the application form, scroll down to the **"Parent App Authentication"** section
- Toggle the "Enable" switch to activate parent authentication
- This reveals authentication configuration options

### 4. Configure Authentication Settings

#### Application ID
- Automatically generated from the application name
- This unique identifier is used by child apps for authentication

#### API Key
- Click "Generate API Key" to create a new secure key
- **IMPORTANT**: Save this key immediately - it won't be shown again
- For existing apps with authentication, you can regenerate the key if needed

#### Redirect URIs
- Add allowed callback URLs (one per line)
- Include both production and development URLs:
  ```
  https://yourapp.myjkkn.ac.in/auth/callback
  http://localhost:3000/auth/callback
  ```

#### Permission Scopes
- Select what data the child app can access:
  - **Read**: Access user profile data
  - **Write**: Modify user data
  - **Profile**: Access detailed profile information
  - **Admin**: Administrative access (use cautiously)

#### Access Control
- **Public Access**: Toggle ON to allow any authenticated user
- **Role-Based Access**: If public is OFF, select specific roles that can access the app:
  - Student
  - Staff
  - Admin
  - Super Admin

#### Rate Limiting
- **Requests**: Maximum API calls allowed (default: 1000)
- **Window**: Time period in minutes (default: 60)
- Prevents abuse and ensures fair usage

### 5. Save the Application
- Click "Create Application" or "Update Application"
- The API key hash is stored securely in the database
- Your application is now ready to use MyJKKN authentication

## Visual Indicators

### In Application List
- **Shield Icon** (🛡️) next to app name: Uses MyJKKN authentication
- **Auth Column**: Shows authentication method
  - "MyJKKN" badge with shield icon for parent auth
  - "SSO", "Separate", or "None" for traditional auth methods

### In Application Form
- Green shield icon in the authentication section header
- Info alerts explaining authentication features
- Links to integration documentation

## Managing Existing Applications with Authentication

### View Authentication Status
1. Go to Applications list
2. Check the "Auth" column for authentication method
3. Look for the shield icon next to app names

### Update Authentication Settings
1. Click Edit on the application
2. Scroll to "Parent App Authentication" section
3. Modify settings as needed
4. Save changes

### Regenerate API Key
1. Edit the application
2. In authentication section, click "Regenerate" button
3. Save the new key immediately
4. Update the child app with the new key

### Disable Authentication
1. Edit the application
2. Toggle OFF the "Enable" switch in authentication section
3. Save the application
4. Child app will need to implement its own authentication

## Database Changes

The following fields were added to the `applications` table:
- `uses_parent_auth` - Boolean flag for authentication status
- `app_id` - Unique application identifier
- `api_key_hash` - Secure hash of the API key
- `allowed_redirect_uris` - Array of allowed callback URLs
- `allowed_scopes` - Permission scopes
- `allowed_roles` - User roles that can access
- `is_public` - Public access flag
- `rate_limit_requests` - API rate limit
- `rate_limit_window_minutes` - Rate limit time window
- `last_auth_activity` - Last authentication timestamp
- `auth_enabled_at` - When authentication was enabled
- `auth_enabled_by` - User who enabled authentication

## Migration Steps

Run the migration to add authentication fields:
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20250117_add_auth_to_applications.sql
```

## Security Considerations

1. **API Keys**: 
   - Generated using cryptographically secure random bytes
   - Stored as SHA-256 hash in database
   - Never exposed after initial generation

2. **Redirect URIs**:
   - Only whitelisted URIs are allowed
   - Prevents redirect attacks
   - Include all environments (dev, staging, production)

3. **Rate Limiting**:
   - Prevents API abuse
   - Configurable per application
   - Default: 1000 requests per 60 minutes

4. **Role-Based Access**:
   - Granular control over who can access
   - Public flag for open applications
   - Specific role restrictions when needed

## Troubleshooting

### API Key Lost
- Edit the application
- Click "Regenerate" to create a new key
- Update child app immediately

### Authentication Not Working
- Verify redirect URIs match exactly
- Check API key is correct
- Ensure roles/permissions are configured
- Check rate limits haven't been exceeded

### Can't See Authentication Options
- Ensure you have admin/super_admin permissions
- Check that migration has been run
- Verify you're using the latest code

## Related Documentation
- [Child App Integration Guide](/application-hub/api-guidelines)
- [Parent Authentication Service](/lib/auth/child-app/parent-auth-service.ts)
- [API Documentation](/docs/api/authentication.md)

## Support
For issues or questions:
- Contact: support@myjkkn.ac.in
- Check API Guidelines: `/application-hub/api-guidelines`
- Review integration docs in the authentication section

---
*Last Updated: 2025-01-17*