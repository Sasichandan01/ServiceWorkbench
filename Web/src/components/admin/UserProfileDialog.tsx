import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Eye, 
  Mail, 
  Shield, 
  Clock,
  Plus,
  X,
  Loader2
} from "lucide-react";
import { UserService, User } from "../../services/userService";
import { RoleService, Role } from "../../services/roleService";
import { useToast } from "@/hooks/use-toast";

interface UserProfileDialogProps {
  userId: string;
  trigger?: React.ReactNode;
  isOwnProfile?: boolean;
}

const UserProfileDialog = ({ userId, trigger, isOwnProfile = false }: UserProfileDialogProps) => {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [managingRoles, setManagingRoles] = useState(false);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const userData = await UserService.getUser(userId);
      setUser(userData);
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch user data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    if (!isOwnProfile) {
      try {
        const rolesData = await RoleService.getRoles();
        setAvailableRoles(rolesData.Roles || []);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch roles. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  const handleAssignRole = async () => {
    if (!selectedRole || !user) return;
    
    setManagingRoles(true);
    try {
      await RoleService.assignRole({
        UserId: userId,
        Role: selectedRole
      });
      
      // Update user roles locally
      setUser({
        ...user,
        Roles: [...user.Roles, selectedRole]
      });
      
      setSelectedRole("");
      toast({
        title: "Success",
        description: `Role ${selectedRole} assigned successfully`,
      });
    } catch (error) {
      console.error('Error assigning role:', error);
      toast({
        title: "Error",
        description: "Failed to assign role. Please try again.",
        variant: "destructive"
      });
    } finally {
      setManagingRoles(false);
    }
  };

  const handleRemoveRole = async (roleName: string) => {
    if (!user) return;
    
    setManagingRoles(true);
    try {
      await RoleService.removeRole({
        UserId: userId,
        RoleName: roleName
      });
      
      // Update user roles locally
      setUser({
        ...user,
        Roles: user.Roles.filter(role => role !== roleName)
      });
      
      toast({
        title: "Success",
        description: `Role ${roleName} removed successfully`,
      });
    } catch (error) {
      console.error('Error removing role:', error);
      toast({
        title: "Error",
        description: "Failed to remove role. Please try again.",
        variant: "destructive"
      });
    } finally {
      setManagingRoles(false);
    }
  };

  // Filter out roles the user already has
  const getAvailableRolesToAssign = () => {
    return availableRoles.filter(role => role.Role && !user?.Roles?.includes(role.Role));
  };

  useEffect(() => {
    if (user && !isOwnProfile) {
      fetchRoles();
    }
  }, [user, isOwnProfile]);

  return (
    <Dialog onOpenChange={(open) => open && fetchUserData()}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <Eye className="w-4 h-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isOwnProfile ? "My Profile" : "User Profile"}</DialogTitle>
          <DialogDescription>
            {isOwnProfile ? "View your profile information" : "View and manage user information"}
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading user data...</span>
          </div>
        ) : user ? (
          <div className="space-y-6">
            {/* Profile Header */}
            <div className="flex items-center space-x-4">
              <Avatar className="w-16 h-16">
                {user.ProfileImageURL ? (
                  <AvatarImage src={user.ProfileImageURL} alt={user.Username} />
                ) : (
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                    {user.Username.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{user.Username}</h3>
                <div className="flex items-center text-muted-foreground mt-1">
                  <Mail className="w-4 h-4 mr-2" />
                  {user.Email}
                </div>
                <div className="flex items-center text-muted-foreground mt-1">
                  <Clock className="w-4 h-4 mr-2" />
                  {user.LastLoginTime ? `Last login: ${user.LastLoginTime}` : 'Never logged in'}
                </div>
              </div>
            </div>

            <Separator />

            {/* Active Roles */}
            <div>
              <Label className="text-base font-medium">Active Roles</Label>
              <div className="flex flex-wrap gap-2 mt-3">
                {user.Roles && user.Roles.length > 0 ? (
                  user.Roles.map(role => (
                    <div key={role} className="flex items-center">
                      <Badge variant="secondary" className="text-sm">
                        <Shield className="w-3 h-3 mr-1" />
                        {role}
                        {!isOwnProfile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 h-auto p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveRole(role)}
                            disabled={managingRoles}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <span className="text-muted-foreground">No roles assigned</span>
                )}
              </div>
            </div>

            {/* Assign New Role - Only for non-own profiles */}
            {!isOwnProfile && (
              <>
                <Separator />
                <div>
                  <Label className="text-base font-medium">Assign New Role</Label>
                  <div className="flex items-center space-x-3 mt-3">
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a role to assign" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableRolesToAssign().map(role => (
                          <SelectItem key={role.Role} value={role.Role || ""}>
                            <div className="flex flex-col">
                              <span className="font-medium">{role.Role}</span>
                              {role.Description && (
                                <span className="text-xs text-muted-foreground">{role.Description}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleAssignRole} 
                      disabled={!selectedRole || managingRoles}
                      size="sm"
                    >
                      {managingRoles ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Assign
                    </Button>
                  </div>
                  {getAvailableRolesToAssign().length === 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      All available roles are already assigned to this user.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* User Statistics */}
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{user.Roles?.length || 0}</div>
                    <div className="text-sm text-muted-foreground">Active Roles</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">Active</div>
                    <div className="text-sm text-muted-foreground">Account Status</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Failed to load user data
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;