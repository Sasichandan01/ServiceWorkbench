
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Edit, 
  Shield, 
  Save,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  workspaces: number;
  createdAt: string;
}

interface UserPermissionsDialogProps {
  user: User;
}

const UserPermissionsDialog = ({ user }: UserPermissionsDialogProps) => {
  const [selectedRole, setSelectedRole] = useState(user.role);
  const [selectedStatus, setSelectedStatus] = useState(user.status);
  const [permissions, setPermissions] = useState({
    canCreateWorkspaces: true,
    canManageDataSources: true,
    canViewAnalytics: true,
    canManageUsers: user.role === 'Admin',
    canAccessAdminPanel: user.role === 'Admin',
    canDeleteWorkspaces: user.role === 'Admin',
  });
  
  const { toast } = useToast();

  const roles = [
    { value: 'Admin', label: 'Administrator', color: 'bg-purple-100 text-purple-800' },
    { value: 'Editor', label: 'Editor', color: 'bg-blue-100 text-blue-800' },
    { value: 'Viewer', label: 'Viewer', color: 'bg-gray-100 text-gray-800' },
    { value: 'Custom', label: 'Custom Role', color: 'bg-orange-100 text-orange-800' }
  ];

  const statuses = [
    { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
    { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
    { value: 'suspended', label: 'Suspended', color: 'bg-red-100 text-red-800' }
  ];

  const handleRoleChange = (newRole: string) => {
    setSelectedRole(newRole);
    
    // Update permissions based on role
    if (newRole === 'Admin') {
      setPermissions({
        canCreateWorkspaces: true,
        canManageDataSources: true,
        canViewAnalytics: true,
        canManageUsers: true,
        canAccessAdminPanel: true,
        canDeleteWorkspaces: true,
      });
    } else if (newRole === 'Editor') {
      setPermissions({
        canCreateWorkspaces: true,
        canManageDataSources: true,
        canViewAnalytics: true,
        canManageUsers: false,
        canAccessAdminPanel: false,
        canDeleteWorkspaces: false,
      });
    } else if (newRole === 'Viewer') {
      setPermissions({
        canCreateWorkspaces: false,
        canManageDataSources: false,
        canViewAnalytics: true,
        canManageUsers: false,
        canAccessAdminPanel: false,
        canDeleteWorkspaces: false,
      });
    }
  };

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value as 'active' | 'inactive' | 'suspended');
  };

  const handleSave = () => {
    // In real app, this would make an API call
    toast({
      title: "User Updated",
      description: `${user.name}'s role and permissions have been updated successfully.`,
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Edit className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5" />
            <span>Edit User Permissions</span>
          </DialogTitle>
          <DialogDescription>
            Update role and permissions for {user.name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Role Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Role</label>
            <Select value={selectedRole} onValueChange={handleRoleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex items-center space-x-2">
                      <Badge className={role.color}>{role.label}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Account Status</label>
            <Select value={selectedStatus} onValueChange={handleStatusChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    <div className="flex items-center space-x-2">
                      <Badge className={status.color}>{status.label}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Permissions */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Permissions</label>
            <div className="space-y-3">
              {Object.entries(permissions).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={value}
                    onCheckedChange={(checked) => 
                      setPermissions(prev => ({ ...prev, [key]: checked as boolean }))
                    }
                    disabled={selectedRole !== 'Custom'}
                  />
                  <label 
                    htmlFor={key} 
                    className="text-sm cursor-pointer"
                  >
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </label>
                </div>
              ))}
            </div>
            {selectedRole !== 'Custom' && (
              <p className="text-xs text-gray-500">
                Permissions are automatically set based on the selected role. 
                Choose "Custom Role" to modify individual permissions.
              </p>
            )}
          </div>

          {/* Warning for critical changes */}
          {(selectedStatus === 'suspended' || selectedRole !== user.role) && (
            <div className="flex items-start space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Critical Change Warning</p>
                <p>This action will immediately affect the user's access to the system.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {}}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserPermissionsDialog;
