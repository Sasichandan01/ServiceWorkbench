import React, { useEffect } from 'react';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { setAuth, setLoading } from '../../store/slices/authSlice';
import { setPermissions, clearPermissions } from '../../store/slices/permissionsSlice';
import { getUserInfo } from '../../lib/tokenUtils';
import { PermissionService } from '../../services/permissionService';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        dispatch(setLoading(true));
        
        const accessToken = localStorage.getItem('accessToken');
        const userInfo = getUserInfo();

        if (accessToken && userInfo) {
          // Get permissions for user's role first
          const userRole = userInfo.role || 'Default';
          const permissions = PermissionService.getPermissionsForRole(userRole);
          
          // Set permissions first, then auth state
          dispatch(setPermissions(permissions));
          
          // Set authenticated user
          dispatch(setAuth({
            user: userInfo,
            isAuthenticated: true,
          }));
        } else {
          // Not authenticated
          dispatch(clearPermissions());
          dispatch(setAuth({
            user: null,
            isAuthenticated: false,
          }));
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        dispatch(clearPermissions());
        dispatch(setAuth({
          user: null,
          isAuthenticated: false,
        }));
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
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [dispatch]);

  return <>{children}</>;
};