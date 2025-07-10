import React from 'react';
import { ProtectedButton } from '../components/ui/protected-button';
import { ProtectedContent } from '../components/ui/protected-content';
import { PermissionGuard } from '../components/auth/PermissionGuard';
import { usePermissions } from '../hooks/usePermissions';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

/**
 * Example component showing different ways to use RBAC
 */
export const RBACUsageExample: React.FC = () => {
  const { 
    canView, 
    canManage, 
    canDelete, 
    canPerformApiOperation,
    userRole,
    userPermissions 
  } = usePermissions();

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>RBAC Usage Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Current Role: <span className="font-semibold">{userRole || 'None'}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Permissions: {userPermissions.join(', ') || 'None'}
            </p>
          </div>

          {/* Method 1: Using ProtectedButton */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Protected Buttons</h3>
            <div className="flex gap-2">
              <ProtectedButton 
                resource="users" 
                action="view"
                fallbackTooltip="You need users.view permission"
              >
                View Users
              </ProtectedButton>
              
              <ProtectedButton 
                resource="users" 
                action="manage"
                fallbackTooltip="You need users.manage permission"
              >
                Edit User
              </ProtectedButton>
              
              <ProtectedButton 
                resource="users" 
                action="delete"
                variant="destructive"
                fallbackTooltip="You need users.fullaccess permission"
              >
                Delete User
              </ProtectedButton>
            </div>
          </div>

          {/* Method 2: Using ProtectedContent */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Protected Content</h3>
            <ProtectedContent 
              resource="roles" 
              action="manage"
              fallbackMessage="You need roles.manage permission to create roles"
            >
              <Card className="p-4">
                <p>This content is only visible to users who can manage roles.</p>
                <Button className="mt-2">Create New Role</Button>
              </Card>
            </ProtectedContent>
          </div>

          {/* Method 3: Using PermissionGuard directly */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Permission Guard</h3>
            <PermissionGuard 
              permission="workspaces.fullaccess"
              fallback={<p className="text-red-500">You need full access to workspaces</p>}
            >
              <Card className="p-4 border-green-200">
                <p>This is visible only to users with workspace full access!</p>
              </Card>
            </PermissionGuard>
          </div>

          {/* Method 4: Using hooks directly */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Using Hooks Directly</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p>Can view users: {canView('users') ? '✅' : '❌'}</p>
                <p>Can manage users: {canManage('users') ? '✅' : '❌'}</p>
                <p>Can delete users: {canDelete('users') ? '✅' : '❌'}</p>
              </div>
              <div>
                <p>GET /users: {canPerformApiOperation('/users', 'GET') ? '✅' : '❌'}</p>
                <p>POST /roles: {canPerformApiOperation('/roles', 'POST') ? '✅' : '❌'}</p>
                <p>DELETE /roles/admin: {canPerformApiOperation('/roles/{role_name}', 'DELETE') ? '✅' : '❌'}</p>
              </div>
            </div>
          </div>

          {/* Method 5: API Operation Protection */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">API Operation Protection</h3>
            <div className="flex gap-2">
              <ProtectedButton 
                endpoint="/users" 
                method="POST"
                fallbackTooltip="You cannot create users"
              >
                Create User (POST /users)
              </ProtectedButton>
              
              <ProtectedButton 
                endpoint="/roles/{role_name}" 
                method="DELETE"
                variant="destructive"
                fallbackTooltip="You cannot delete roles"
              >
                Delete Role (DELETE /roles/*)
              </ProtectedButton>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};