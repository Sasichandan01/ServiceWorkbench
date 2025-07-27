import apiPermissionMapping from '../data/api_permission_mapping.json';
import rolePermissionMapping from '../data/role_permission_mapping.json';

// Permission hierarchy levels
const PERMISSION_LEVELS = {
  view: 1,
  manage: 2,
  fullaccess: 3,
} as const;

type PermissionLevel = keyof typeof PERMISSION_LEVELS;

export class PermissionService {
  private static extractPermissionLevel(permission: string): PermissionLevel {
    const parts = permission.split('.');
    return parts[1] as PermissionLevel;
  }

  private static extractResource(permission: string): string {
    const parts = permission.split('.');
    return parts[0];
  }

  /**
   * Check if user has required permission considering hierarchy
   * @param userPermissions - Array of user's permissions
   * @param requiredPermission - Required permission to check
   * @returns boolean
   */
  static hasPermission(userPermissions: string[], requiredPermission: string): boolean {
    const requiredResource = this.extractResource(requiredPermission);
    const requiredLevel = this.extractPermissionLevel(requiredPermission);
    const requiredLevelValue = PERMISSION_LEVELS[requiredLevel];

    // Find user's highest permission level for this resource
    const userResourcePermissions = userPermissions.filter(permission => 
      this.extractResource(permission) === requiredResource
    );

    if (userResourcePermissions.length === 0) {
      return false;
    }

    // Get the highest permission level user has for this resource
    const userHighestLevel = Math.max(
      ...userResourcePermissions.map(permission => 
        PERMISSION_LEVELS[this.extractPermissionLevel(permission)]
      )
    );

    return userHighestLevel >= requiredLevelValue;
  }

  /**
   * Check if user can perform an API operation
   * @param userPermissions - Array of user's permissions
   * @param endpoint - API endpoint (e.g., "/users", "/users/{user_id}")
   * @param method - HTTP method (GET, POST, PUT, DELETE)
   * @returns boolean
   */
  static canPerformApiOperation(
    userPermissions: string[], 
    endpoint: string, 
    method: string
  ): boolean {
    const endpointConfig = apiPermissionMapping[endpoint as keyof typeof apiPermissionMapping];
    if (!endpointConfig) {
      return false;
    }

    const requiredPermissions = endpointConfig[method as keyof typeof endpointConfig] as string[];
    if (!requiredPermissions || !Array.isArray(requiredPermissions)) {
      return false;
    }

    // User needs at least one of the required permissions
    return requiredPermissions.some(permission => 
      this.hasPermission(userPermissions, permission)
    );
  }

  /**
   * Get permissions for a role
   * @param role - User role
   * @returns Array of permissions
   */
  static getPermissionsForRole(role: string): string[] {
    return rolePermissionMapping[role as keyof typeof rolePermissionMapping] || [];
  }

  /**
   * Check if user can delete (requires fullaccess)
   * @param userPermissions - Array of user's permissions
   * @param resource - Resource type (users, roles, etc.)
   * @returns boolean
   */
  static canDelete(userPermissions: string[], resource: string): boolean {
    return this.hasPermission(userPermissions, `${resource}.fullaccess`);
  }

  /**
   * Check if user can view resource
   * @param userPermissions - Array of user's permissions
   * @param resource - Resource type
   * @returns boolean
   */
  static canView(userPermissions: string[], resource: string): boolean {
    return this.hasPermission(userPermissions, `${resource}.view`);
  }

  /**
   * Check if user can manage resource (create, update)
   * @param userPermissions - Array of user's permissions
   * @param resource - Resource type
   * @returns boolean
   */
  static canManage(userPermissions: string[], resource: string): boolean {
    return this.hasPermission(userPermissions, `${resource}.manage`);
  }

  /**
   * Filter permissions by resource
   * @param userPermissions - Array of user's permissions
   * @param resource - Resource to filter by
   * @returns Array of permissions for the resource
   */
  static getResourcePermissions(userPermissions: string[], resource: string): string[] {
    return userPermissions.filter(permission => 
      this.extractResource(permission) === resource
    );
  }
}