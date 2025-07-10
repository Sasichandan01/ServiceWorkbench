import { useAppSelector } from './useAppSelector';
import { PermissionService } from '../services/permissionService';

export const usePermissions = () => {
  const { userPermissions } = useAppSelector((state) => state.permissions);
  const { user } = useAppSelector((state) => state.auth);

  const hasPermission = (permission: string): boolean => {
    return PermissionService.hasPermission(userPermissions, permission);
  };

  const canPerformApiOperation = (endpoint: string, method: string): boolean => {
    return PermissionService.canPerformApiOperation(userPermissions, endpoint, method);
  };

  const canView = (resource: string): boolean => {
    return PermissionService.canView(userPermissions, resource);
  };

  const canManage = (resource: string): boolean => {
    return PermissionService.canManage(userPermissions, resource);
  };

  const canDelete = (resource: string): boolean => {
    return PermissionService.canDelete(userPermissions, resource);
  };

  const canFullAccess = (resource: string): boolean => {
    return PermissionService.hasPermission(userPermissions, `${resource}.fullaccess`);
  };

  const getResourcePermissions = (resource: string): string[] => {
    return PermissionService.getResourcePermissions(userPermissions, resource);
  };

  return {
    userPermissions,
    userRole: user?.role,
    hasPermission,
    canPerformApiOperation,
    canView,
    canManage,
    canDelete,
    canFullAccess,
    getResourcePermissions,
  };
};