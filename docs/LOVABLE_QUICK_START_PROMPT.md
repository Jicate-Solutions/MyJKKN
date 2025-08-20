# MyJKKN Child App Test - Lovable AI Quick Start Prompt

## 🎯 Project Request

Build a **React TypeScript test application** using Vite that integrates with MyJKKN's OAuth2 child app authentication system. This will be a comprehensive testing platform for child app authentication flows.

## 📋 Core Requirements

### Technology Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite (latest)
- **Styling**: Tailwind CSS
- **State Management**: React Context API
- **Routing**: React Router DOM v6
- **HTTP**: Fetch API (native)
- **Cookies**: js-cookie library
- **Icons**: Lucide React
- **Responsive**: Mobile-first design

### Key Features Needed

1. **Complete OAuth2 Authentication Flow** with MyJKKN parent app
2. **Protected Routes** with automatic redirects
3. **User Dashboard** displaying authenticated user information
4. **Session Management** with automatic token refresh
5. **Error Handling** with user-friendly messages
6. **Debug Mode** for development testing
7. **Responsive Design** for all devices

## 🏗️ Required Pages & Components

### Pages

- **Home** (`/`) - Landing page with login button
- **Login** (`/login`) - Login interface
- **OAuth Callback** (`/auth/callback`) - Handles OAuth redirect
- **Dashboard** (`/dashboard`) - Protected user dashboard
- **Profile** (`/profile`) - User profile management
- **404 Page** - Error handling

### Components Needed

- **AuthProvider** - Context for authentication state
- **ProtectedRoute** - Route wrapper for authenticated pages
- **LoginButton** - Initiates OAuth flow
- **UserProfile** - Displays user information
- **LoadingSpinner** - Loading states
- **Alert/Card/Button** - UI components

## ⚙️ Environment Configuration

Create `.env.local` with these variables:

```bash
# MyJKKN Configuration (REQUIRED)
VITE_PARENT_APP_URL=https://my.jkkn.ac.in
VITE_APP_ID=your_app_id_here
VITE_REDIRECT_URI=http://localhost:5173/auth/callback

# App Configuration
VITE_APP_NAME=MyJKKN Test App
VITE_DEBUG_MODE=true
```

## 🔐 Authentication Flow Requirements

### OAuth2 Flow Implementation

1. **Login Button Click** → Redirect to `https://my.jkkn.ac.in/auth/authorize` with:

   - `response_type=code`
   - `client_id={VITE_APP_ID}`
   - `app_id={VITE_APP_ID}`
   - `redirect_uri={VITE_REDIRECT_URI}`
   - `scope=read write profile`
   - `state={random_csrf_token}`

2. **OAuth Callback** → Exchange code for tokens at:

   - `POST https://my.jkkn.ac.in/api/auth/child-app/token`
   - Store tokens in cookies (secure, httpOnly)
   - Redirect to dashboard

3. **Token Management**:
   - Auto-refresh tokens before expiry
   - Clear session on logout
   - Validate tokens on app load

### Security Requirements

- **CSRF Protection**: Validate state parameter
- **Secure Cookies**: Use secure/sameSite flags
- **Token Storage**: Secure cookie + localStorage
- **Session Validation**: Check token validity

## 🎨 UI/UX Requirements

### Design System

- **Colors**: Green primary (#22c55e), clean secondary colors
- **Typography**: Clean, readable fonts (Inter/system fonts)
- **Layout**: Centered content, card-based design
- **Responsive**: Mobile-first, tablet, desktop

### Key UI Elements

1. **Home Page**: Hero section with prominent "Login with MyJKKN" button
2. **Loading States**: Spinner with descriptive text
3. **Dashboard**: Cards showing user info, session details, permissions
4. **Error States**: Clear error messages with retry options
5. **Navigation**: Simple header with user menu

## 📱 Responsive Breakpoints

- **Mobile**: < 768px (single column)
- **Tablet**: 768px - 1024px (2 columns)
- **Desktop**: > 1024px (3+ columns)

## 🧪 Testing Features Required

### Debug Panel (Development Only)

- Show current authentication state
- Display token information (masked)
- Log OAuth flow steps
- Environment variables display
- Session validation tools

### Error Scenarios to Handle

- Invalid/expired authorization codes
- Network failures
- Missing environment variables
- CSRF token mismatch
- Session expiration

## 📦 Required Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "js-cookie": "^3.0.5",
    "lucide-react": "^0.294.0",
    "clsx": "^2.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@types/js-cookie": "^3.0.6",
    "@vitejs/plugin-react": "^4.1.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.0"
  }
}
```

## 🚀 Success Criteria

The application is successful when:

1. ✅ User can login through MyJKKN OAuth flow
2. ✅ Tokens are securely stored and managed
3. ✅ Protected routes work correctly
4. ✅ Dashboard displays user information
5. ✅ Responsive design works on all devices
6. ✅ Error handling is comprehensive
7. ✅ Debug tools help with development
8. ✅ Logout clears session completely

## 🔄 User Journey Flow

```
Home Page → Click Login → MyJKKN OAuth → Authorize → Callback → Dashboard
                                           ↓
                                    Show user info, permissions, session details
```

## 🎯 Key Implementation Notes

1. **Use React Context** for global authentication state
2. **Implement proper loading states** for all async operations
3. **Add comprehensive error boundaries** for error handling
4. **Use TypeScript interfaces** for type safety
5. **Include debug logging** for development
6. **Follow security best practices** for token handling
7. **Make it mobile-responsive** with Tailwind
8. **Add proper meta tags** for SEO

## 📋 Acceptance Criteria

- [ ] Clean, modern UI with Tailwind CSS
- [ ] Complete OAuth2 authentication flow
- [ ] Protected routes with proper redirects
- [ ] User dashboard with session information
- [ ] Mobile-responsive design
- [ ] Error handling with user feedback
- [ ] Debug mode for development
- [ ] Secure token management
- [ ] TypeScript implementation
- [ ] Production-ready code structure

---

**Note**: This application will be used to test and validate MyJKKN's child app authentication system. Focus on reliability, security, and user experience.
