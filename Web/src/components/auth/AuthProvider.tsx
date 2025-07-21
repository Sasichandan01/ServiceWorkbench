import React, { useEffect } from 'react';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { setAuth, setLoading } from '../../store/slices/authSlice';
import { setPermissions, clearPermissions } from '../../store/slices/permissionsSlice';
import { getUserInfo } from '../../lib/tokenUtils';
import { PermissionService } from '../../services/permissionService';
import { ApiClient } from '../../lib/apiClient';
import { refreshAccessToken } from '../../lib/auth';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  
  // Timer reference
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        dispatch(setLoading(true));
        
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