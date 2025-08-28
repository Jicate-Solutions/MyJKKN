# Vercel MCP Server Token Setup

## ⚠️ IMPORTANT: Token Required
The Vercel MCP server has been added to `.mcp.json` but needs your Vercel Access Token.

## Step 1: Get Your Vercel Access Token

1. **Go to Vercel Dashboard**:
   - Visit: https://vercel.com/account/tokens

2. **Create a New Token**:
   - Click "Create Token"
   - Name: "MyJKKN MCP Server" (or any name you prefer)
   
3. **Select Permissions** (Recommended):
   - ✅ Full Account (for complete access)
   - OR select specific scopes:
     - Deployments (Read/Write)
     - Projects (Read/Write)
     - Teams (Read)
     - Domains (Read/Write)
     - Environment Variables (Read/Write)
     - Logs (Read)

4. **Copy the Token**:
   - ⚠️ **IMPORTANT**: Copy the token immediately! You won't see it again.
   - It will look like: `Bearer xxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Add Token to .mcp.json

### Option A: Direct Edit (Quick)
1. Open `.mcp.json`
2. Find the line: `"VERCEL_ACCESS_TOKEN": "YOUR_VERCEL_TOKEN_HERE"`
3. Replace `YOUR_VERCEL_TOKEN_HERE` with your actual token
4. Save the file

### Option B: Using Command (Secure)
```bash
# Set as environment variable instead (more secure)
setx VERCEL_ACCESS_TOKEN "your-actual-token-here"
```

Then update `.mcp.json`:
```json
"vercel": {
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@vercel/mcp@latest"],
  "env": {
    // Remove the hardcoded token, it will use system env variable
  }
}
```

## Step 3: Restart Claude Code

After adding the token:
```bash
# Restart Claude Code to load new configuration
claude restart
```

## Step 4: Verify Connection

Test if Vercel MCP is working:
```bash
# Check MCP servers status
claude mcp list

# Should show:
# vercel: ... - ✓ Connected
```

## 🔒 Security Best Practices

### DO NOT:
- ❌ Commit `.mcp.json` with real tokens to Git
- ❌ Share your token with anyone
- ❌ Use tokens in client-side code

### DO:
- ✅ Add `.mcp.json` to `.gitignore` if it contains tokens
- ✅ Use environment variables for tokens
- ✅ Rotate tokens regularly
- ✅ Use minimal required permissions

## 📝 Add to .gitignore

Make sure `.mcp.json` is in your `.gitignore`:
```bash
echo ".mcp.json" >> .gitignore
```

## 🎯 What You Can Do with Vercel MCP

Once connected, you can:

1. **Deployment Management**:
   - "Show my recent Vercel deployments"
   - "Get deployment status for my.jkkn.ac.in"
   - "Show deployment logs"

2. **Project Configuration**:
   - "List environment variables for MyJKKN"
   - "Update build settings"
   - "Configure domains"

3. **Domain Management**:
   - "Check SSL certificate for my.jkkn.ac.in"
   - "Verify domain configuration"
   - "Show DNS records"

4. **Performance Monitoring**:
   - "Show build times"
   - "Check function usage"
   - "Get analytics data"

## 🚨 Troubleshooting

### If Token Doesn't Work:
1. Verify token hasn't expired
2. Check token has correct permissions
3. Ensure no extra spaces/characters
4. Try regenerating token

### If MCP Server Fails:
```bash
# Remove and re-add
claude mcp remove vercel
claude mcp add vercel

# Or manually restart
claude restart
```

### Check Logs:
```bash
# View Claude Code logs for errors
claude logs
```

## 📚 Resources

- Vercel API Docs: https://vercel.com/docs/rest-api
- MCP Docs: https://modelcontextprotocol.io/
- Vercel MCP Package: https://www.npmjs.com/package/@vercel/mcp

---

**Next Step**: Get your token from https://vercel.com/account/tokens and update `.mcp.json`!