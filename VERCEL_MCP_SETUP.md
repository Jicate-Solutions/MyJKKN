# Vercel MCP Server Setup for Claude Code

## ✅ Status
The Vercel MCP server has been successfully added to your Claude Code configuration.

```
Server: vercel
URL: https://mcp.vercel.com
Transport: HTTP
Status: ⚠ Needs authentication
```

## 🔑 Authentication Required

### Step 1: Get Your Vercel API Token
1. Go to: https://vercel.com/account/tokens
2. Click "Create Token"
3. Give it a name (e.g., "Claude MCP")
4. Select scopes:
   - Read/Write for deployments
   - Read for projects
   - Read for teams
5. Copy the token (you won't see it again!)

### Step 2: Configure Authentication

Run this command to set your Vercel token:
```bash
claude mcp config vercel
```

Or manually add it to your environment:
```bash
# Windows (Command Prompt)
setx VERCEL_AUTH_TOKEN "your-token-here"

# Windows (PowerShell)
[System.Environment]::SetEnvironmentVariable("VERCEL_AUTH_TOKEN", "your-token-here", "User")

# Or add to your .env file in the project
echo VERCEL_AUTH_TOKEN=your-token-here >> .env
```

### Step 3: Restart Claude Code
After setting the token, restart Claude Code:
```bash
claude restart
```

## 📚 Available Vercel MCP Commands

Once authenticated, you'll have access to:

### Deployment Management
- List deployments
- Get deployment details
- Promote deployments
- Delete deployments
- Get deployment logs

### Project Management
- List projects
- Get project details
- Update project settings
- Manage environment variables
- Configure domains

### Domain Management
- List domains
- Add custom domains
- Update DNS records
- Manage SSL certificates

## 🚀 Usage Examples

### Check Deployments
```
"Show me the latest deployments for my.jkkn.ac.in"
"What's the status of the production deployment?"
"Show deployment logs for the last build"
```

### Manage Environment Variables
```
"List all environment variables for MyJKKN project"
"Add NEXT_PUBLIC_API_URL to production"
"Update the database connection string"
```

### Domain Configuration
```
"Check DNS settings for my.jkkn.ac.in"
"Verify SSL certificate status"
"Show all configured domains"
```

## 🔧 Troubleshooting

### If Authentication Fails:
1. Verify token is valid at https://vercel.com/account/tokens
2. Check token has correct permissions
3. Ensure no extra spaces in token
4. Try regenerating the token

### If Server Doesn't Connect:
```bash
# Check server status
claude mcp list

# Restart MCP servers
claude restart

# Remove and re-add if needed
claude mcp remove vercel
claude mcp add --transport http vercel https://mcp.vercel.com
```

## 📝 Project-Specific Configuration

For your MyJKKN project on Vercel:
- Project Name: Check in Vercel dashboard
- Domain: my.jkkn.ac.in
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`

## 🔗 Useful Links
- Vercel Dashboard: https://vercel.com/dashboard
- API Tokens: https://vercel.com/account/tokens
- Vercel Documentation: https://vercel.com/docs
- MCP Documentation: https://modelcontextprotocol.io/

## ⚡ Quick Commands Reference

```bash
# Check MCP server status
claude mcp list

# Configure Vercel token
claude mcp config vercel

# Test Vercel connection
claude "List my Vercel projects"

# Check deployment status
claude "Show me the latest deployment for my.jkkn.ac.in"
```

---

**Note**: After authentication, you'll be able to manage your Vercel deployments directly through Claude Code!