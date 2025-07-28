import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { setAuth, setLoading } from '../../store/slices/authSlice';
import { setPermissions, clearPermissions } from '../../store/slices/permissionsSlice';
import { getUserInfo } from '../../lib/tokenUtils';
import { PermissionService } from '../../services/permissionService';
import { ApiClient } from '../../lib/apiClient';
import { refreshAccessToken, checkAuthState } from '../../lib/auth';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  // Timer reference
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        dispatch(setLoading(true));
        
        // Check if this is an OAuth callback by looking for auth code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (authCode && state) {
          console.log('OAuth callback detected - auth code and state present');
          // Clear the URL parameters to prevent issues
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
          
          // Add a small delay to allow Amplify to process the OAuth callback
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Try to check Amplify auth state first
        try {
          const amplifyUser = await getCurrentUser();
          const session = await fetchAuthSession();
          
          console.log('Amplify auth check - User:', amplifyUser ? 'Found' : 'Not found');
          console.log('Amplify auth check - Session tokens:', session.tokens ? 'Present' : 'Not present');
          
          if (amplifyUser && session.tokens) {
            // User is authenticated via Amplify (Google/social)
            const userInfo = {
              name: amplifyUser.username || 'User',
              email: amplifyUser.signInDetails?.loginId || '',
              sub: amplifyUser.userId,
              username: amplifyUser.username,
              role: 'Default' // You might want to get this from user attributes
            };

            // Try to get role from ID token if available
            if (session.tokens.idToken) {
              try {
                const payload = session.tokens.idToken.toString().split('.')[1];
                const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
                const parsedPayload = JSON.parse(decodedPayload);
                userInfo.role = parsedPayload['custom:Role'] || parsedPayload['custom:role'] || 'Default';
              } catch (e) {
                console.log('Could not decode ID token for role:', e);
              }
            }

            const userRole = userInfo.role || 'Default';
            console.log('OAuth Authentication successful - User Role:', userRole);
            console.log('Current path:', window.location.pathname);
            
            // Store tokens in localStorage for API client compatibility
            if (session.tokens?.accessToken) {
              localStorage.setItem('accessToken', session.tokens.accessToken.toString());
            }
            if (session.tokens?.idToken) {
              localStorage.setItem('idToken', session.tokens.idToken.toString());
            }
            
            const permissions = PermissionService.getPermissionsForRole(userRole);
            dispatch(setPermissions(permissions));
            
            dispatch(setAuth({
              user: userInfo,
              isAuthenticated: true,
            }));

            // Redirect based on role after successful OAuth authentication
            const currentPath = window.location.pathname;
            if (currentPath === '/' || currentPath === '/login' || currentPath === '/signup') {
              console.log('Redirecting user to appropriate page based on role:', userRole);
              // Use a longer delay to ensure authentication state is fully established
              setTimeout(() => {
                if (userRole === 'ITAdmin') {
                  console.log('Redirecting to /admin');
                  navigate('/admin', { replace: true });
                } else {
                  console.log('Redirecting to /workspaces');
                  navigate('/workspaces', { replace: true });
                }
              }, 500);
            }
            
            return; // Exit early if Amplify auth successful
          }
        } catch (amplifyError) {
          // Amplify auth failed, continue to check local storage
          console.log('No Amplify auth session found, checking local storage...');
          console.log('Amplify error:', amplifyError);
        }
        
        // Fallback to original logic for username/password auth
        const accessToken = localStorage.getItem('accessToken');
        const userInfo = getUserInfo();

        if (accessToken && userInfo) {
          // Get permissions for user's role from local mapping
          const userRole = userInfo.role || 'Default';
          const permissions = PermissionService.getPermissionsForRole(userRole);
          dispatch(setPermissions(permissions));
          
          // Set authenticated user
          dispatch(setAuth({
            user: userInfo,
            isAuthenticated: true,
          }));

          // --- Proactive token refresh logic ---
          // Decode JWT to get expiry
          const token = accessToken;
          const payload = token.split('.')[1];
          let exp = null;
          try {
            const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
            exp = decoded.exp;
          } catch (e) {
            exp = null;
          }
          if (exp) {
            const now = Math.floor(Date.now() / 1000);
            const secondsUntilExpiry = exp - now;
            // Refresh 60 seconds before expiry, but not less than 5 seconds from now
            const refreshIn = Math.max((secondsUntilExpiry - 60) * 1000, 5000);
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(async () => {
              try {
                await refreshAccessToken();
                // Re-initialize auth state after refresh
                initializeAuth();
              } catch (err) {
                // If refresh fails, clear auth and force login
                dispatch(clearPermissions());
                dispatch(setAuth({ user: null, isAuthenticated: false }));
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('idToken');
                window.location.replace('/login');
              }
            }, refreshIn);
          }
          // --- End proactive refresh logic ---
        } else {
          // Not authenticated
          dispatch(clearPermissions());
          dispatch(setAuth({
            user: null,
            isAuthenticated: false,
          }));
          if (refreshTimer) clearTimeout(refreshTimer);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        dispatch(clearPermissions());
        dispatch(setAuth({
          user: null,
          isAuthenticated: false,
        }));
        if (refreshTimer) clearTimeout(refreshTimer);
      } finally {
        dispatch(setLoading(false));
      }
    };

    initializeAuth();

    // Listen for storage changes (login/logout in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'accessToken' || e.key === 'idToken') {
        initializeAuth();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [dispatch]);

  return <>{children}</>;
};