# Child App Logout Implementation Guide

## 🚪 Logout Endpoints

MyJKKN provides two ways for child apps to handle logout:

### Option 1: Simple Redirect Logout
```
GET https://my.jkkn.ac.in/logout?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app
```

### Option 2: API Logout (Recommended)
```
POST https://my.jkkn.ac.in/api/auth/child-app/logout
```

## 📋 Implementation in Child App

### 1. Create Logout Service Method

```typescript
// services/parentAuth.ts
class ParentAuthService {
  private readonly parentAppUrl = 'https://my.jkkn.ac.in';
  private readonly appId = 'testing_meglmppk';
  
  // Option 1: Simple logout redirect
  logout(redirectUri?: string) {
    const params = new URLSearchParams({
      app_id: this.appId
    });
    
    if (redirectUri) {
      params.append('redirect_uri', redirectUri);
    }
    
    // Clear local tokens
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.clear();
    
    // Redirect to parent app logout
    window.location.href = `${this.parentAppUrl}/logout?${params}`;
  }
  
  // Option 2: API logout (better for SPAs)
  async logoutAPI(redirectUri?: string) {
    const accessToken = localStorage.getItem('access_token');
    const sessionId = sessionStorage.getItem('session_id');
    
    try {
      // Call logout API
      const response = await fetch(`${this.parentAppUrl}/api/auth/child-app/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          app_id: this.appId,
          session_id: sessionId,
          redirect_uri: redirectUri,
          access_token: accessToken
        })
      });
      
      const data = await response.json();
      
      // Clear local storage
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      sessionStorage.clear();
      
      // Redirect if URI provided
      if (data.redirect_uri) {
        window.location.href = data.redirect_uri;
      } else {
        // Redirect to your app's login page
        window.location.href = '/login';
      }
      
      return data;
    } catch (error) {
      console.error('Logout failed:', error);
      // Fallback: clear tokens and redirect anyway
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = redirectUri || '/login';
    }
  }
}

export default new ParentAuthService();
```

### 2. Create Logout Component

```tsx
// components/LogoutButton.tsx
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import parentAuth from '@/services/parentAuth';

export function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  
  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    try {
      // Use API logout for better control
      await parentAuth.logoutAPI('/login');
    } catch (error) {
      // Fallback to redirect logout
      parentAuth.logout('/login');
    }
  };
  
  return (
    <Button
      onClick={handleLogout}
      disabled={isLoggingOut}
      variant="outline"
      size="sm"
    >
      <LogOut className="w-4 h-4 mr-2" />
      {isLoggingOut ? 'Logging out...' : 'Logout'}
    </Button>
  );
}
```

### 3. Implement in User Menu

```tsx
// components/UserMenu.tsx
import { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, LogOut, Settings } from 'lucide-react';
import parentAuth from '@/services/parentAuth';

export function UserMenu({ user }) {
  const handleLogout = async () => {
    // Show confirmation if needed
    if (confirm('Are you sure you want to logout?')) {
      await parentAuth.logoutAPI('/');
    }
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer">
          <AvatarImage src={user?.avatar} />
          <AvatarFallback>
            {user?.full_name?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="mr-2 h-4 w-4" />
          <span>{user?.email}</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## 🔄 Complete Logout Flow

### Simple Redirect Flow:
```
1. User clicks logout in child app
   ↓
2. Child app clears local tokens
   ↓
3. Redirects to: my.jkkn.ac.in/logout?app_id=xxx&redirect_uri=xxx
   ↓
4. MyJKKN signs out user from Supabase
   ↓
5. Invalidates child app sessions in database
   ↓
6. Redirects back to child app's redirect_uri
```

### API Logout Flow (Recommended):
```
1. User clicks logout in child app
   ↓
2. Child app calls POST /api/auth/child-app/logout
   ↓
3. MyJKKN invalidates sessions
   ↓
4. Returns success response
   ↓
5. Child app clears local storage
   ↓
6. Child app redirects to login page
```

## 🔐 Security Considerations

### 1. Always Clear Local Storage
```javascript
// Clear all auth data
localStorage.removeItem('access_token');
localStorage.removeItem('refresh_token');
localStorage.removeItem('user_data');
sessionStorage.clear();

// Or clear everything
localStorage.clear();
```

### 2. Invalidate Sessions Server-Side
The logout endpoint will:
- Mark sessions as inactive in `child_app_sessions` table
- Log the logout event in `child_app_access_logs`
- Prevent token reuse

### 3. Handle Errors Gracefully
```javascript
try {
  await logout();
} catch (error) {
  // Always clear local tokens even if API fails
  localStorage.clear();
  // Redirect to login
  window.location.href = '/login';
}
```

## 📊 Monitoring Logout Events

Check logout activity in the database:

```sql
-- View recent logouts
SELECT * FROM child_app_access_logs 
WHERE child_app_id = 'testing_meglmppk' 
AND action = 'logout'
ORDER BY created_at DESC 
LIMIT 10;

-- Check invalidated sessions
SELECT * FROM child_app_sessions 
WHERE child_app_id = 'testing_meglmppk' 
AND is_active = false
AND revoke_reason = 'user_logout'
ORDER BY revoked_at DESC;
```

## 🎯 Best Practices

1. **Use API Logout for SPAs**: Better control and error handling
2. **Use Redirect Logout for SSR**: Simpler implementation
3. **Always clear local storage**: Prevent token reuse
4. **Show loading state**: Logout can take a moment
5. **Handle errors**: Network issues shouldn't prevent logout
6. **Log events**: Track logout patterns for security

## 🧪 Testing

### Test URLs:

1. **Simple Redirect Logout:**
```
http://localhost:3001/logout?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app
```

2. **API Logout (using cURL):**
```bash
curl -X POST http://localhost:3001/api/auth/child-app/logout \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "testing_meglmppk",
    "redirect_uri": "https://jkkn-auth-flow.lovable.app"
  }'
```

## 🐛 Troubleshooting

### "404 Not Found" on /logout
**Solution**: The logout endpoint has been created. Deploy the latest changes.

### Session not invalidated
**Solution**: Ensure you're passing the correct `session_id` if stored.

### CORS error on logout API
**Solution**: CORS headers are configured. Check if origin is allowed.

### User stays logged in after logout
**Solution**: Ensure local storage is cleared and tokens are removed.