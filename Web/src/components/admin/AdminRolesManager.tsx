
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { 
  Shield, 
  Plus, 
  Edit, 
  Trash2,
  Users,
  Search,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProtectedButton } from "@/components/ui/protected-button";
import RoleDetailsDialog from "./RoleDetailsDialog";

interface Role {
  Role: string;
  Description: string;
  Users: string[];
  Permissions?: string[];
  CreatedBy: string;
  CreationTime: string;
  LastUpdatedBy: string;
  LastUpdationTime: string;
}

interface ApiResponse {
  Roles: Role[];
  Pagination: {
    Count: number;
    TotalCount: number;
    NextAvailable: boolean;
  };
}

interface CreateRolePayload {
  name: string;
  description: string;
  permissions: {
    workspaces: 'Fullaccess' | 'Manage' | 'View';
    datasources: 'Fullaccess' | 'Manage' | 'View';
    users: 'Fullaccess' | 'Manage' | 'View';
    roles: 'Fullaccess' | 'Manage' | 'View';
    glue: 'Fullaccess' | 'Manage' | 'View';
    stepfunction: 'Fullaccess' | 'Manage' | 'View';
    s3: 'Fullaccess' | 'Manage' | 'View';
  };
}

interface ApiCreateRolePayload {
  Role: string;
  Description: string;
  Permissions: string[];
}

const AdminRolesManager = () => {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<CreateRolePayload>({
    name: "",
    description: "",
    permissions: {
      workspaces: 'View',
      datasources: 'View',
      users: 'View',
      roles: 'View',
      glue: 'View',
      stepfunction: 'View',
      s3: 'View',
    }
  });

  const apiUrl = import.meta.env.VITE_API_URL;

  const getAuthToken = () => {
    return localStorage.getItem('accessToken') || '';
  };

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const searchParams = new URLSearchParams({
        limit: limit.toString(),
        offset: currentPage.toString(), // Changed: offset is now the page number (starting from 1)
      });

      if (searchTerm.trim()) {
        searchParams.append('filter', searchTerm.trim());
      }

      console.log('Fetching roles with params:', searchParams.toString());

      const response = await fetch(`${apiUrl}/roles?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch roles: ${response.status} ${response.statusText}`);
      }

      const data: ApiResponse = await response.json();
      console.log('API Response:', data);
      
      if (data && data.Roles && Array.isArray(data.Roles)) {
        setRoles(data.Roles);
        setTotalCount(data.Pagination?.TotalCount || data.Roles.length);
      } else {
        console.error('Invalid API response structure:', data);
        setRoles([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch roles. Please try again.",
        variant: "destructive"
      });
      setRoles([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const transformPermissionsForApi = (permissions: CreateRolePayload['permissions']): string[] => {
    const apiPermissions: string[] = [];
    
    Object.entries(permissions).forEach(([service, level]) => {
      const formattedLevel = level.toLowerCase() === 'fullaccess' ? 'fullaccess' : level.toLowerCase();
      apiPermissions.push(`${service}.${formattedLevel}`);
    });
    
    return apiPermissions;
  };

  const createRole = async () => {
    try {
      const token = getAuthToken();
      
      const apiPayload: ApiCreateRolePayload = {
        Role: newRole.name,
        Description: newRole.description,
        Permissions: transformPermissionsForApi(newRole.permissions)
      };

      console.log('Sending role payload:', apiPayload);

      const response = await fetch(`${apiUrl}/roles`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create role error:', errorText);
        throw new Error('Failed to create role');
      }

      toast({
        title: "Role Created",
        description: `The role "${newRole.name}" has been created successfully.`,
      });

      setIsCreateDialogOpen(false);
      setNewRole({
        name: "",
        description: "",
        permissions: {
          workspaces: 'View',
          datasources: 'View',
          users: 'View',
          roles: 'View',
          glue: 'View',
          stepfunction: 'View',
          s3: 'View',
        }
      });
      
      await fetchRoles();
    } catch (error) {
      console.error('Error creating role:', error);
      toast({
        title: "Error",
        description: "Failed to create role. Please try again.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchRoles();
  }, [currentPage, limit, searchTerm]);

  const totalPages = Math.ceil(totalCount / limit);

  const getPermissionsList = (role: Role) => {
    const permissions = Array.isArray(role.Permissions) ? role.Permissions : [];
    
    console.log('Role permissions:', permissions);
    
    const permissionMap: Record<string, string> = {
      'users.view': 'View Users',
      'users.manage': 'Manage Users', 
      'users.fullaccess': 'Full Access Users',
      'workspaces.view': 'View Workspaces',
      'workspaces.manage': 'Manage Workspaces',
      'workspaces.fullaccess': 'Full Access Workspaces',
      'datasources.view': 'View Datasources',
      'datasources.manage': 'Manage Datasources',
      'datasources.fullaccess': 'Full Access Datasources',
      'roles.view': 'View Roles',
      'roles.manage': 'Manage Roles',
      'roles.fullaccess': 'Full Access Roles',
      'glue.view': 'View Glue',
      'glue.manage': 'Manage Glue',
      'glue.fullaccess': 'Full Access Glue',
      'stepfunction.view': 'View Step Functions',
      'stepfunction.manage': 'Manage Step Functions',
      'stepfunction.fullaccess': 'Full Access Step Functions',
      's3.view': 'View S3',
      's3.manage': 'Manage S3',
      's3.fullaccess': 'Full Access S3'
    };

    const allDisplayPermissions = permissions.map(permission => 
      permissionMap[permission] || permission
    );

    const displayPermissions = allDisplayPermissions.slice(0, 3);
    const remainingCount = Math.max(0, allDisplayPermissions.length - 3);

    return { displayPermissions, remainingCount };
  };

  const getRoleType = (role: Role) => {
    return role.CreatedBy === 'SYSTEM' ? 'System' : 'Custom';
  };

  const safeRoles = Array.isArray(roles) ? roles : [];

  return (
    <Card className="w-full">
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
              <ProtectedButton resource="roles" action="manage">
                <Plus className="w-4 h-4 mr-2" />
                Create Role
              </ProtectedButton>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Role</DialogTitle>
                <DialogDescription>
                  Define a new role with specific permissions
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Role Name</Label>
                    <Input
                      id="name"
                      placeholder="Enter role name"
                      value={newRole.name}
                      onChange={(e) => setNewRole({...newRole, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="Describe this role's purpose"
                      value={newRole.description}
                      onChange={(e) => setNewRole({...newRole, description: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Platform Permissions</h3>
                    <div className="grid grid-cols-2 gap-6">
                      {(['workspaces', 'datasources', 'users', 'roles'] as const).map((permission) => (
                        <div key={permission} className="space-y-3">
                          <Label className="text-sm font-medium capitalize">{permission}</Label>
                          <RadioGroup
                            value={newRole.permissions[permission]}
                            onValueChange={(value) => 
                              setNewRole({
                                ...newRole,
                                permissions: {
                                  ...newRole.permissions,
                                  [permission]: value as 'Fullaccess' | 'Manage' | 'View'
                                }
                              })
                            }
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Fullaccess" id={`${permission}-full`} />
                              <Label htmlFor={`${permission}-full`}>Full Access</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Manage" id={`${permission}-manage`} />
                              <Label htmlFor={`${permission}-manage`}>Manage</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="View" id={`${permission}-view`} />
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
                            value={newRole.permissions[service]}
                            onValueChange={(value) => 
                              setNewRole({
                                ...newRole,
                                permissions: {
                                  ...newRole.permissions,
                                  [service]: value as 'Fullaccess' | 'Manage' | 'View'
                                }
                              })
                            }
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Fullaccess" id={`${service}-full`} />
                              <Label htmlFor={`${service}-full`}>Full Access</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Manage" id={`${service}-manage`} />
                              <Label htmlFor={`${service}-manage`}>Manage</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="View" id={`${service}-view`} />
                              <Label htmlFor={`${service}-view`}>View</Label>
                            </div>
                          </RadioGroup>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={createRole}
                  disabled={!newRole.name || !newRole.description}
                >
                  Create Role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search roles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={limit.toString()} onValueChange={(value) => setLimit(Number(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 per page</SelectItem>
              <SelectItem value="10">10 per page</SelectItem>
              <SelectItem value="20">20 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Roles Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Role</TableHead>
                  <TableHead className="w-[100px]">Users</TableHead>
                  <TableHead className="w-[200px]">Permissions</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading roles...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : safeRoles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No roles found
                    </TableCell>
                  </TableRow>
                ) : (
                  safeRoles.map((role, index) => {
                    const { displayPermissions, remainingCount } = getPermissionsList(role);
                    
                    return (
                      <RoleDetailsDialog
                        role={role}
                        onRoleUpdated={fetchRoles}
                        trigger={
                          <TableRow key={index} className="hover:bg-gray-50 cursor-pointer">
                            <TableCell className="w-[200px]">
                              <div>
                                <div className="font-medium truncate">{role.Role || 'N/A'}</div>
                                <div className="text-sm text-gray-500 truncate">{role.Description || 'No description'}</div>
                              </div>
                            </TableCell>
                            <TableCell className="w-[100px]">
                              <div className="flex items-center space-x-1">
                                <Users className="w-4 h-4 text-gray-400" />
                                <span>{Array.isArray(role.Users) ? role.Users.length : 0}</span>
                              </div>
                            </TableCell>
                            <TableCell className="w-[200px]">
                              <div className="flex flex-wrap gap-1">
                                {displayPermissions.map((permission, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {permission}
                                  </Badge>
                                ))}
                                {remainingCount > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{remainingCount} more
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="w-[100px]">
                              <Badge 
                                className={`transition-colors duration-200 ${
                                  getRoleType(role) === 'System' 
                                    ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                                    : 'bg-green-100 text-green-800 hover:bg-green-200'
                                }`}
                              >
                                {getRoleType(role)}
                              </Badge>
                            </TableCell>
                            <TableCell className="w-[100px]">
                              <div className="flex items-center">
                                <Edit className="w-4 h-4 text-gray-400" />
                              </div>
                            </TableCell>
                          </TableRow>
                        }
                      />
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + Math.max(1, currentPage - 2);
                if (pageNum > totalPages) return null;
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      href="#"
                      isActive={pageNum === currentPage}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(pageNum);
                      }}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminRolesManager;
