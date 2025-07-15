import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ProtectedButton } from "@/components/ui/protected-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Eye, Shield, Clock, User, CheckCircle, XCircle, Edit, Trash2, Save, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RoleDetailsDialogProps {
  role: any;
  trigger: React.ReactNode;
  onRoleUpdated?: () => void;
}

interface RoleData {
  Role: string;
  Permissions: string[];
  Description: string;
  CreatedBy: string;
  CreationTime: string;
  LastUpdatedBy: string;
  LastUpdationTime: string;
}

const RoleDetailsDialog = ({ role, trigger, onRoleUpdated }: RoleDetailsDialogProps) => {
  const { toast } = useToast();
  const [roleDetails, setRoleDetails] = useState<RoleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    description: "",
    permissions: {
      workspaces: 'view' as 'fullaccess' | 'manage' | 'view',
      datasources: 'view' as 'fullaccess' | 'manage' | 'view',
      users: 'view' as 'fullaccess' | 'manage' | 'view',
      roles: 'view' as 'fullaccess' | 'manage' | 'view',
      glue: 'view' as 'fullaccess' | 'manage' | 'view',
      stepfunction: 'view' as 'fullaccess' | 'manage' | 'view',
      s3: 'view' as 'fullaccess' | 'manage' | 'view',
    }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [loadingRoleType, setLoadingRoleType] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL;

  const getAuthToken = () => {
    return localStorage.getItem('accessToken') || '';
  };

  const fetchRoleDetails = async (roleName: string) => {
    setLoading(true);
    // Set initial loading role type based on prop role
    setLoadingRoleType(role?.CreatedBy === 'SYSTEM' ? 'system' : 'custom');
    try {
      const token = getAuthToken();
      const response = await fetch(`${apiUrl}/roles/${roleName}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fetch role details error:', errorText);
        throw new Error(`Failed to fetch role details: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Role details fetched:', data);
      
      // Handle the nested structure - API returns { Role: { ... } }
      const roleData = data.Role || data;
      setRoleDetails(roleData);
      
      // Initialize edit form with current data
      setEditForm({
        description: roleData.Description || "",
        permissions: parsePermissionsForForm(roleData.Permissions || [])
      });
    } catch (error: any) {
      console.error('Error fetching role details:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const parsePermissionsForForm = (permissions: string[]) => {
    const formPermissions = {
      workspaces: 'view' as 'fullaccess' | 'manage' | 'view',
      datasources: 'view' as 'fullaccess' | 'manage' | 'view',
      users: 'view' as 'fullaccess' | 'manage' | 'view',
      roles: 'view' as 'fullaccess' | 'manage' | 'view',
      glue: 'view' as 'fullaccess' | 'manage' | 'view',
      stepfunction: 'view' as 'fullaccess' | 'manage' | 'view',
      s3: 'view' as 'fullaccess' | 'manage' | 'view',
    };

    if (Array.isArray(permissions)) {
      permissions.forEach(permission => {
        const [service, level] = permission.split('.');
        if (service && level && service in formPermissions) {
          formPermissions[service as keyof typeof formPermissions] = level as 'fullaccess' | 'manage' | 'view';
        }
      });
    }

    return formPermissions;
  };

  const transformPermissionsForApi = (permissions: typeof editForm.permissions): string[] => {
    const apiPermissions: string[] = [];
    
    Object.entries(permissions).forEach(([service, level]) => {
      apiPermissions.push(`${service}.${level}`);
    });
    
    return apiPermissions;
  };

  const updateRole = async () => {
    if (!roleDetails) return;

    try {
      const token = getAuthToken();
      const payload = {
        Permissions: transformPermissionsForApi(editForm.permissions),
        Description: editForm.description
      };

      const response = await fetch(`${apiUrl}/roles/${roleDetails.Role}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Update role error:', errorText);
        throw new Error(`Failed to update role: ${response.status} ${response.statusText}`);
      }

      toast({
        title: "Role Updated",
        description: `The role "${roleDetails.Role}" has been updated successfully.`,
      });

      setIsEditing(false);
      await fetchRoleDetails(roleDetails.Role);
      onRoleUpdated?.();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const deleteRole = async () => {
    if (!roleDetails) {
      return;
    }

    try {
      const token = getAuthToken();
      const response = await fetch(`${apiUrl}/roles/${roleDetails.Role}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Delete role error:', errorText);
        throw new Error(`Failed to delete role: ${response.status} ${response.statusText}`);
      }

      toast({
        title: "Role Deleted",
        description: `The role "${roleDetails.Role}" has been deleted successfully.`,
      });

      setIsOpen(false);
      setShowDeleteConfirm(false);
      onRoleUpdated?.();
    } catch (error: any) {
      console.error('Error deleting role:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (isOpen && role) {
      const roleName = typeof role === 'string' ? role : (role?.Role || role?.RoleName || '');
      if (roleName) {
        fetchRoleDetails(roleName);
      }
    }
  }, [isOpen, role]);

  if (!role) return null;

  const isCustomRole = roleDetails?.CreatedBy !== 'SYSTEM';

  const getRoleTypeBadge = () => {
    return isCustomRole ? (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        <User className="w-3 h-3 mr-1" />
        Custom
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
        <Shield className="w-3 h-3 mr-1" />
        System
      </Badge>
    );
  };

  const formatDateString = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const safeString = (value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    return String(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold flex items-center">
              Role Details
              {loading && !roleDetails ? (
                <Badge 
                  variant="outline" 
                  className={`ml-3 ${
                    loadingRoleType === 'system' 
                      ? 'bg-purple-50 text-purple-700 border-purple-200' 
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {loadingRoleType === 'system' ? (
                    <>
                      <Shield className="w-3 h-3 mr-1" />
                      System
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3 mr-1" />
                      Custom
                    </>
                  )}
                </Badge>
              ) : roleDetails && (
                getRoleTypeBadge()
              )}
            </DialogTitle>
            <div className="flex items-center space-x-2">
              {isCustomRole && !isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading role details...</span>
            </div>
          </div>
        ) : roleDetails ? (
          <div className="space-y-6">
            {/* Role Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                    <Shield className="w-4 h-4 mr-2" />
                    Role Name
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold text-gray-900">{safeString(roleDetails.Role)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    Created
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatDateString(roleDetails.CreationTime)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    Created By
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold text-gray-900">{safeString(roleDetails.CreatedBy)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-2">
                    <Label htmlFor="description">Role Description</Label>
                    <Textarea
                      id="description"
                      value={editForm.description}
                      onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                      placeholder="Enter role description"
                    />
                  </div>
                ) : (
                  <p className="text-gray-900">{safeString(roleDetails.Description) || 'No description provided'}</p>
                )}
              </CardContent>
            </Card>

            {/* Permissions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  Permissions
                </CardTitle>
                <CardDescription>
                  Access permissions assigned to this role
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Platform Permissions</h3>
                      <div className="grid grid-cols-2 gap-6">
                        {(['workspaces', 'datasources', 'users', 'roles'] as const).map((permission) => (
                          <div key={permission} className="space-y-3">
                            <Label className="text-sm font-medium capitalize">{permission}</Label>
                            <RadioGroup
                              value={editForm.permissions[permission]}
                              onValueChange={(value) => 
                                setEditForm({
                                  ...editForm,
                                  permissions: {
                                    ...editForm.permissions,
                                    [permission]: value as 'fullaccess' | 'manage' | 'view'
                                  }
                                })
                              }
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="fullaccess" id={`${permission}-full`} />
                                <Label htmlFor={`${permission}-full`}>Full Access</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="manage" id={`${permission}-manage`} />
                                <Label htmlFor={`${permission}-manage`}>Manage</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="view" id={`${permission}-view`} />
                                <Label htmlFor={`${permission}-view`}>View</Label>
                              </div>
                            </RadioGroup>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-4">AWS Services</h3>
                      <div className="grid grid-cols-2 gap-6">
                        {(['glue', 'stepfunction', 's3'] as const).map((service) => (
                          <div key={service} className="space-y-3">
                            <Label className="text-sm font-medium capitalize">
                              {service === 'stepfunction' ? 'Step Functions' : service.toUpperCase()}
                            </Label>
                            <RadioGroup
                              value={editForm.permissions[service]}
                              onValueChange={(value) => 
                                setEditForm({
                                  ...editForm,
                                  permissions: {
                                    ...editForm.permissions,
                                    [service]: value as 'fullaccess' | 'manage' | 'view'
                                  }
                                })
                              }
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="fullaccess" id={`${service}-full`} />
                                <Label htmlFor={`${service}-full`}>Full Access</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="manage" id={`${service}-manage`} />
                                <Label htmlFor={`${service}-manage`}>Manage</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="view" id={`${service}-view`} />
                                <Label htmlFor={`${service}-view`}>View</Label>
                              </div>
                            </RadioGroup>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  roleDetails.Permissions && Array.isArray(roleDetails.Permissions) && roleDetails.Permissions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {roleDetails.Permissions.map((permission: string, index: number) => (
                        <Badge key={index} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                          {safeString(permission)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No permissions assigned</p>
                  )
                )}
              </CardContent>
            </Card>

            {/* Role Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Role Information</CardTitle>
                <CardDescription>Additional details about this role</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Created By:</span>
                    <span className="ml-2 text-gray-900">{safeString(roleDetails.CreatedBy)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Last Updated:</span>
                    <span className="ml-2 text-gray-900">
                      {formatDateString(roleDetails.LastUpdationTime)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Last Updated By:</span>
                    <span className="ml-2 text-gray-900">{safeString(roleDetails.LastUpdatedBy)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Failed to load role details
          </div>
        )}

        {/* Action Buttons at Bottom */}
        {!loading && roleDetails && isCustomRole && isEditing && (
          <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
            <Button
              variant="outline"
              onClick={() => setIsEditing(false)}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              onClick={updateRole}
            >
              <Save className="w-4 h-4 mr-1" />
              Save Changes
            </Button>
          </div>
        )}
        
        {!loading && roleDetails && isCustomRole && !isEditing && (
          <div className="flex justify-end pt-4 border-t mt-6">
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <AlertDialogTrigger asChild>
                <ProtectedButton 
                  resource="roles" 
                  action="fullaccess"
                  variant="destructive"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Role
                </ProtectedButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Role</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete the role "{roleDetails.Role}"? This action cannot be undone and will remove all permissions associated with this role.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={deleteRole}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Role
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RoleDetailsDialog;
