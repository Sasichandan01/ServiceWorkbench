import React from 'react';
import { PermissionGuard } from '../auth/PermissionGuard';
import { Alert, AlertDescription } from './alert';
import { Shield } from 'lucide-react';

interface ProtectedContentProps {
  children: React.ReactNode;
  permission?: string;
  resource?: string;
  action?: 'view' | 'manage' | 'delete' | 'fullaccess';
  endpoint?: string;
  method?: string;
  fallbackMessage?: string;
  hideIfNoAccess?: boolean;
}

export const ProtectedContent: React.FC<ProtectedContentProps> = ({
  children,
  permission,
  resource,
  action,
  endpoint,
  method,
  fallbackMessage,
  hideIfNoAccess = false,
  ...props
}) => {
  const fallback = hideIfNoAccess ? null : (
    <Alert variant="destructive" className="my-4">
      <Shield className="h-4 w-4" />
      <AlertDescription>
        {fallbackMessage || 'You do not have permission to view this content.'}
      </AlertDescription>
    </Alert>
  );

  return (
    <PermissionGuard
      permission={permission}
      resource={resource}
      action={action}
      endpoint={endpoint}
      method={method}
      fallback={fallback}
    >
      {children}
    </PermissionGuard>
  );
};