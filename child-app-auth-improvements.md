# Child App Authentication Improvements

## Solution for Child App Side

### 1. Store Auth Intent Before Redirect

```typescript
// In your child app's login handler
const handleLogin = () => {
  // Store the auth intent in sessionStorage
  const authIntent = {
    timestamp: Date.now(),
    app_id: 'your_app_id',
    redirect_uri: window.location.origin + '/auth/callback',
    scope: 'read,write,profile',
    state: generateRandomState()
  };
  
  sessionStorage.setItem('parent_auth_intent', JSON.stringify(authIntent));
  
  // Build the parent auth URL
  const params = new URLSearchParams({
    app_id: authIntent.app_id,
    redirect_uri: authIntent.redirect_uri,
    scope: authIntent.scope,
    state: authIntent.state
  });
  
  // Redirect to parent auth
  window.location.href = `https://my.jkkn.ac.in/auth/child-app/login?${params.toString()}`;
};
```

### 2. Check for Pending Auth on App Load

```typescript
// In your child app's main component or auth hook
useEffect(() => {
  // Check if we're returning from auth
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  
  // Check for stored auth intent
  const storedIntent = sessionStorage.getItem('parent_auth_intent');
  
  if (!code && !error && storedIntent) {
    // We have a pending auth, check if it's recent (within 5 minutes)
    const intent = JSON.parse(storedIntent);
    const isRecent = Date.now() - intent.timestamp < 5 * 60 * 1000;
    
    if (isRecent) {
      // Automatically retry the auth flow
      console.log('Retrying parent authentication...');
      const params = new URLSearchParams({
        app_id: intent.app_id,
        redirect_uri: intent.redirect_uri,
        scope: intent.scope,
        state: intent.state
      });
      
      // Small delay to prevent redirect loops
      setTimeout(() => {
        window.location.href = `https://my.jkkn.ac.in/auth/child-app/login?${params.toString()}`;
      }, 1000);
    } else {
      // Intent is too old, clear it
      sessionStorage.removeItem('parent_auth_intent');
    }
  }
  
  if (code || error) {
    // Clear the intent after auth completes
    sessionStorage.removeItem('parent_auth_intent');
  }
}, []);
```

### 3. Enhanced Auth Service with Retry Logic

```typescript
class ParentAuthService {
  private readonly PARENT_URL = 'https://my.jkkn.ac.in';
  private readonly APP_ID = 'your_app_id';
  private authAttempts = 0;
  private maxAttempts = 2;

  async initiateAuth(): Promise<void> {
    this.authAttempts++;
    
    // Store attempt information
    const authData = {
      attempt: this.authAttempts,
      timestamp: Date.now(),
      returnUrl: window.location.href
    };
    
    localStorage.setItem('parent_auth_data', JSON.stringify(authData));
    
    // Build auth URL with all parameters
    const params = new URLSearchParams({
      app_id: this.APP_ID,
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: 'read,write,profile',
      state: this.generateState(),
      // Include a hint that this is a retry if applicable
      retry: this.authAttempts > 1 ? 'true' : 'false'
    });
    
    window.location.href = `${this.PARENT_URL}/auth/child-app/login?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const storedData = localStorage.getItem('parent_auth_data');
    
    if (!storedData) {
      throw new Error('No auth data found');
    }
    
    const authData = JSON.parse(storedData);
    
    // Exchange code for token
    try {
      const response = await fetch('/api/auth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      });
      
      if (!response.ok) {
        throw new Error('Token exchange failed');
      }
      
      const { access_token, user_data } = await response.json();
      
      // Store the token and user data
      localStorage.setItem('parent_token', access_token);
      localStorage.setItem('parent_user', JSON.stringify(user_data));
      
      // Clear auth data
      localStorage.removeItem('parent_auth_data');
      this.authAttempts = 0;
      
      // Redirect to original location or dashboard
      window.location.href = authData.returnUrl || '/dashboard';
      
    } catch (error) {
      console.error('Auth callback error:', error);
      
      // If we haven't exceeded max attempts, retry
      if (this.authAttempts < this.maxAttempts) {
        console.log('Retrying authentication...');
        setTimeout(() => this.initiateAuth(), 2000);
      } else {
        // Max attempts reached, show error
        throw new Error('Authentication failed after multiple attempts');
      }
    }
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
```

### 4. React Hook for Parent Auth

```typescript
// useParentAuth.ts
import { useState, useEffect } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  token: string | null;
  error: string | null;
}

export function useParentAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null,
    error: null
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check for existing token
      const token = localStorage.getItem('parent_token');
      const user = localStorage.getItem('parent_user');
      
      if (token && user) {
        // Validate token with parent app
        const isValid = await validateToken(token);
        
        if (isValid) {
          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user: JSON.parse(user),
            token,
            error: null
          });
          return;
        }
      }
      
      // Check if we're returning from OAuth
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      
      if (code) {
        await handleOAuthCallback(code);
        return;
      }
      
      // Check for pending auth intent
      const pendingAuth = sessionStorage.getItem('parent_auth_intent');
      if (pendingAuth) {
        const intent = JSON.parse(pendingAuth);
        if (Date.now() - intent.timestamp < 300000) { // 5 minutes
          // Auto-retry authentication
          setTimeout(() => login(), 1000);
          return;
        }
      }
      
      // Not authenticated
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        token: null,
        error: null
      });
      
    } catch (error: any) {
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        token: null,
        error: error.message
      });
    }
  };

  const login = () => {
    // Store intent
    const intent = {
      timestamp: Date.now(),
      returnUrl: window.location.href
    };
    sessionStorage.setItem('parent_auth_intent', JSON.stringify(intent));
    
    // Redirect to parent auth
    const params = new URLSearchParams({
      app_id: process.env.NEXT_PUBLIC_APP_ID!,
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: 'read,write,profile',
      state: generateState()
    });
    
    window.location.href = `${process.env.NEXT_PUBLIC_PARENT_URL}/auth/child-app/login?${params.toString()}`;
  };

  const logout = async () => {
    localStorage.removeItem('parent_token');
    localStorage.removeItem('parent_user');
    sessionStorage.removeItem('parent_auth_intent');
    
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      token: null,
      error: null
    });
  };

  return {
    ...authState,
    login,
    logout,
    checkAuthStatus
  };
}
```

### 5. Protected Route Component

```typescript
// ProtectedRoute.tsx
import { useParentAuth } from './useParentAuth';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login, error } = useParentAuth();
  
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      // Auto-initiate login for protected routes
      const timer = setTimeout(() => {
        login();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, isAuthenticated, error]);
  
  if (isLoading) {
    return <div>Checking authentication...</div>;
  }
  
  if (error) {
    return (
      <div>
        <p>Authentication error: {error}</p>
        <button onClick={login}>Try Again</button>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <div>
        <p>Redirecting to parent app for authentication...</p>
      </div>
    );
  }
  
  return <>{children}</>;
}
```

## Implementation Steps

1. **Add session/local storage management** to persist auth intent
2. **Implement auto-retry logic** for failed auth attempts
3. **Use the useParentAuth hook** in your components
4. **Wrap protected routes** with ProtectedRoute component
5. **Handle edge cases** like expired tokens, network errors

## Benefits

- ✅ Survives page refreshes during auth flow
- ✅ Automatically retries failed authentications
- ✅ Better user experience with loading states
- ✅ Handles both first-time and returning users
- ✅ Prevents infinite redirect loops
- ✅ Clear error handling and recovery

## Environment Variables Needed

```env
NEXT_PUBLIC_PARENT_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=your_app_id_here
NEXT_PUBLIC_API_URL=https://your-app.com/api
```