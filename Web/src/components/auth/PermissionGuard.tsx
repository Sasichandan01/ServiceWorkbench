import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';

interface PermissionGuardProps {
  children: React.ReactNode;
  permission?: string;
  resource?: string;
  action?: 'view' | 'manage' | 'delete' | 'fullaccess';
  endpoint?: string;
  method?: string;
  fallback?: React.ReactNode;
  requireAll?: boolean; // If multiple permissions are provided, require all instead of any
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  permission,
  resource,
  action,
  endpoint,
  method,
  fallback = null,
  requireAll = false,
}) => {
  const { 
    hasPermission, 
    canView, 
    canManage, 
    canDelete, 
    canFullAccess,
    canPerformApiOperation 
  } = usePermissions();

  let hasAccess = false;

  // Check specific permission
  if (permission) {
    hasAccess = hasPermission(permission);
  }
  // Check resource + action combination
  else if (resource && action) {
    switch (action) {
      case 'view':
        hasAccess = canView(resource);
        break;
      case 'manage':
        hasAccess = canManage(resource);
        break;
      case 'delete':
        hasAccess = canDelete(resource);
        break;
      case 'fullaccess':
        hasAccess = canFullAccess(resource);
        break;
    }
  }
  // Check API operation
  else if (endpoint && method) {
    hasAccess = canPerformApiOperation(endpoint, method);
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
};

// Higher-order component version
export const withPermission = <P extends object>(
  Component: React.ComponentType<P>,
  permissionProps: Omit<PermissionGuardProps, 'children' | 'fallback'>
) => {
  return (props: P) => (
    <PermissionGuard {...permissionProps}>
      <Component {...props} />
    </PermissionGuard>
  );
};