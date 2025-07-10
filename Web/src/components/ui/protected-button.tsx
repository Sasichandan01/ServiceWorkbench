import React from 'react';
import { Button, ButtonProps } from './button';
import { PermissionGuard } from '../auth/PermissionGuard';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

interface ProtectedButtonProps extends ButtonProps {
  permission?: string;
  resource?: string;
  action?: 'view' | 'manage' | 'delete' | 'fullaccess';
  endpoint?: string;
  method?: string;
  fallbackTooltip?: string;
  hideIfNoAccess?: boolean;
}

export const ProtectedButton: React.FC<ProtectedButtonProps> = ({
  permission,
  resource,
  action,
  endpoint,
  method,
  fallbackTooltip,
  hideIfNoAccess = false,
  children,
  ...buttonProps
}) => {
  const protectedButton = (
    <PermissionGuard
      permission={permission}
      resource={resource}
      action={action}
      endpoint={endpoint}
      method={method}
      fallback={
        hideIfNoAccess ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button {...buttonProps} disabled>
                {children}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {fallbackTooltip || 'You do not have permission to perform this action'}
            </TooltipContent>
          </Tooltip>
        )
      }
    >
      <Button {...buttonProps}>
        {children}
      </Button>
    </PermissionGuard>
  );

  return protectedButton;
};