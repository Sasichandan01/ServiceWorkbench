
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Shield, 
  Plus, 
  Edit, 
  Trash2,
  Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: {
    canCreateWorkspaces: boolean;
    canManageDataSources: boolean;
    canViewAnalytics: boolean;
    canManageUsers: boolean;
    canAccessAdminPanel: boolean;
    canDeleteWorkspaces: boolean;
    canManageRoles: boolean;
    canViewAuditLogs: boolean;
  };
  isSystem: boolean;
  createdAt: string;
}

const AdminRolesManager = () => {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([
    {
      id: "1",
      name: "Administrator",
      description: "Full system access and management capabilities",
      userCount: 3,
      permissions: {
        canCreateWorkspaces: true,
        canManageDataSources: true,
        canViewAnalytics: true,
        canManageUsers: true,
        canAccessAdminPanel: true,
        canDeleteWorkspaces: true,
        canManageRoles: true,
        canViewAuditLogs: true,
      },
      isSystem: true,
      createdAt: "2024-01-01"
    },
    {
      id: "2",
      name: "Editor",
      description: "Can create and manage workspaces and data sources",
      userCount: 15,
      permissions: {
        canCreateWorkspaces: true,
        canManageDataSources: true,
        canViewAnalytics: true,
        canManageUsers: false,
        canAccessAdminPanel: false,
        canDeleteWorkspaces: false,
        canManageRoles: false,
        canViewAuditLogs: false,
      },
      isSystem: true,
      createdAt: "2024-01-01"
    },
    {
      id: "3",
      name: "Data Analyst",
      description: "Custom role for data analysis team",
      userCount: 8,
      permissions: {
        canCreateWorkspaces: false,
        canManageDataSources: true,
        canViewAnalytics: true,
        canManageUsers: false,
        canAccessAdminPanel: false,
        canDeleteWorkspaces: false,
        canManageRoles: false,
        canViewAuditLogs: false,
      },
      isSystem: false,
      createdAt: "2024-02-15"
    }
  ]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
    permissions: {
      canCreateWorkspaces: false,
      canManageDataSources: false,
      canViewAnalytics: false,
      canManageUsers: false,
      canAccessAdminPanel: false,
      canDeleteWorkspaces: false,
      canManageRoles: false,
      canViewAuditLogs: false,
    }
  });

  const permissionLabels = {
    canCreateWorkspaces: "Create Workspaces",
    canManageDataSources: "Manage Data Sources",
    canViewAnalytics: "View Analytics",
    canManageUsers: "Manage Users",
    canAccessAdminPanel: "Access Admin Panel",
    canDeleteWorkspaces: "Delete Workspaces",
    canManageRoles: "Manage Roles",
    canViewAuditLogs: "View Audit Logs",
  };

  const handleCreateRole = () => {
    const role: Role = {
      id: Date.now().toString(),
      name: newRole.name,
      description: newRole.description,
      userCount: 0,
      permissions: newRole.permissions,
      isSystem: false,
      createdAt: new Date().toISOString().split('T')[0]
    };

    setRoles([...roles, role]);
    setNewRole({
      name: "",
      description: "",
      permissions: {
        canCreateWorkspaces: false,
        canManageDataSources: false,
        canViewAnalytics: false,
        canManageUsers: false,
        canAccessAdminPanel: false,
        canDeleteWorkspaces: false,
        canManageRoles: false,
        canViewAuditLogs: false,
      }
    });
    setIsCreateDialogOpen(false);

    toast({
      title: "Role Created",
      description: `The role "${role.name}" has been created successfully.`,
    });
  };

  const handleDeleteRole = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (role?.isSystem) {
      toast({
        title: "Cannot Delete System Role",
        description: "System roles cannot be deleted.",
        variant: "destructive"
      });
      return;
    }

    setRoles(roles.filter(r => r.id !== roleId));
    toast({
      title: "Role Deleted",
      description: `The role has been deleted successfully.`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Role Management</span>
            </CardTitle>
            <CardDescription>
              Create and manage custom roles with specific permissions
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Role</DialogTitle>
                <DialogDescription>
                  Define a new role with specific permissions
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium">Role Name</label>
                  <Input
                    placeholder="Enter role name"
                    value={newRole.name}
                    onChange={(e) => setNewRole({...newRole, name: e.target.value})}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    placeholder="Describe this role's purpose"
                    value={newRole.description}
                    onChange={(e) => setNewRole({...newRole, description: e.target.value})}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Permissions</label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(permissionLabels).map(([key, label]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={key}
                          checked={newRole.permissions[key as keyof typeof newRole.permissions]}
                          onCheckedChange={(checked) => 
                            setNewRole({
                              ...newRole,
                              permissions: {
                                ...newRole.permissions,
                                [key]: checked as boolean
                              }
                            })
                          }
                        />
                        <label htmlFor={key} className="text-sm cursor-pointer">
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateRole}
                  disabled={!newRole.name || !newRole.description}
                >
                  Create Role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Key Permissions</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{role.name}</div>
                      <div className="text-sm text-gray-500">{role.description}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{role.userCount}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(role.permissions)
                        .filter(([_, value]) => value)
                        .slice(0, 3)
                        .map(([key, _]) => (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {permissionLabels[key as keyof typeof permissionLabels]}
                          </Badge>
                        ))}
                      {Object.values(role.permissions).filter(Boolean).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{Object.values(role.permissions).filter(Boolean).length - 3} more
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={role.isSystem ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}>
                      {role.isSystem ? 'System' : 'Custom'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm" disabled={role.isSystem}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteRole(role.id)}
                        disabled={role.isSystem}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminRolesManager;
