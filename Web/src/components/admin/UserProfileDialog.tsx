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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Eye, 
  Mail, 
  Calendar, 
  Shield, 
  Activity,
  Cloud,
  Edit,
  Save,
  X,
  Plus,
  Trash2,
  Upload,
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
  const [editingProfile, setEditingProfile] = useState(false);
  const [editedUsername, setEditedUsername] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [managingRoles, setManagingRoles] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const userData = await UserService.getUser(userId);
      setUser(userData);
      setEditedUsername(userData.Username);
      // Remove roles API call from here
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

  // Fetch roles only when the roles tab is activated
  const fetchRolesIfNeeded = async () => {
    if (!isOwnProfile && availableRoles.length === 0) {
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

  const handleSaveProfile = async () => {
    if (!user) return;
    
    try {
      await UserService.updateUser(userId, {
        Username: editedUsername
      });
      
      setUser({ ...user, Username: editedUsername });
      setEditingProfile(false);
      
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select a valid image file",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      // Get presigned URL
      const response = await fetch(`/users/${userId}?action=profile_image`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Username: user?.Username || "",
          ContentType: file.type
        })
      });

      if (response.ok) {
        const uploadResponse = await response.json();
        
        if (uploadResponse.PreSignedURL) {
          // Upload image to S3
          const uploadToS3 = await fetch(uploadResponse.PreSignedURL, {
            method: 'PUT',
            body: file
          });

          if (uploadToS3.ok) {
            // Refresh user data to get new profile image
            await fetchUserData();
            toast({
              title: "Success",
              description: "Profile image updated successfully",
            });
          } else {
            throw new Error('Failed to upload to S3');
          }
        }
      } else {
        throw new Error('Failed to get presigned URL');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: "Failed to upload image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
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
      const currentRoles = Array.isArray(user.Roles) ? user.Roles : [user.Roles];
      setUser({
        ...user,
        Roles: [...currentRoles, selectedRole]
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
      const currentRoles = Array.isArray(user.Roles) ? user.Roles : [user.Roles];
      setUser({
        ...user,
        Roles: currentRoles.filter(role => role !== roleName)
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

  const getUserRoles = () => {
    if (!user?.Roles) return [];
    return Array.isArray(user.Roles) ? user.Roles : [user.Roles];
  };

  // Update getAvailableRolesToAssign to filter out roles the user already has (by 'Role')
  const getAvailableRolesToAssign = () => {
    let userRoles: string[] = [];
    if (Array.isArray((user as any)?.Roles)) {
      userRoles = (user as any).Roles;
    } else if (Array.isArray((user as any)?.Role)) {
      userRoles = (user as any).Role;
    }
    return availableRoles.filter(roleObj => {
      const roleName = roleObj.Role || roleObj.RoleName;
      return roleName && !userRoles.includes(roleName);
    });
  };

  return (
    <Dialog onOpenChange={(open) => open && fetchUserData()}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <Eye className="w-4 h-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isOwnProfile ? "My Profile" : "User Profile"}</DialogTitle>
          <DialogDescription>
            {isOwnProfile ? "View and edit your profile information" : "View and manage user information"}
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading user data...</span>
          </div>
        ) : user ? (
          <Tabs value={activeTab} onValueChange={async (tab) => {
            setActiveTab(tab);
            if (tab === "roles") {
              await fetchRolesIfNeeded();
            }
          }} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              {!isOwnProfile && <TabsTrigger value="roles">Role Management</TabsTrigger>}
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              {/* User Header */}
              <div className="flex items-center space-x-6">
                <div className="relative">
                  <Avatar className="w-20 h-20">
                    {user.ProfileImageURL ? (
                      <AvatarImage src={user.ProfileImageURL} alt={user.Username} />
                    ) : (
                      <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                        {user.Username.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {isOwnProfile && (
                    <div className="absolute -bottom-2 -right-2">
                      <Label htmlFor="profile-image" className="cursor-pointer">
                        <div className="bg-primary text-primary-foreground rounded-full p-2 shadow-lg hover:bg-primary/90 transition-colors">
                          {uploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                        </div>
                      </Label>
                      <Input
                        id="profile-image"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={uploading}
                      />
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  {editingProfile ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          value={editedUsername}
                          onChange={(e) => setEditedUsername(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex space-x-2">
                        <Button onClick={handleSaveProfile} size="sm">
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setEditingProfile(false);
                            setEditedUsername(user.Username);
                          }}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-2xl font-semibold">{user.Username}</h3>
                        {isOwnProfile && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setEditingProfile(true)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-muted-foreground flex items-center">
                        <Mail className="w-4 h-4 mr-2" />
                        {user.Email}
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        {getUserRoles().map(role => (
                          <Badge key={role} variant="secondary">
                            <Shield className="w-3 h-3 mr-1" />
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* User Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Account Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">User ID</Label>
                      <div className="mt-1">
                        <code className="bg-muted px-2 py-1 rounded text-sm">{user.UserId}</code>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                      <div className="flex items-center mt-1">
                        <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span>{user.Email}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Active Roles</Label>
                      <div className="flex items-center mt-1">
                        <Shield className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span>{getUserRoles().length} role{getUserRoles().length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Account Status</Label>
                      <div className="flex items-center mt-1">
                        <Activity className="w-4 h-4 mr-2 text-green-500" />
                        <span className="text-green-600">Active</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>User's recent actions and events</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between py-3 border-b">
                      <span className="text-muted-foreground">Profile accessed</span>
                      <span className="text-muted-foreground">Just now</span>
                    </div>
                    <div className="flex justify-between py-3 border-b">
                      <span className="text-muted-foreground">Last login to system</span>
                      <span className="text-muted-foreground">2 hours ago</span>
                    </div>
                    <div className="flex justify-between py-3 border-b">
                      <span className="text-muted-foreground">Profile information updated</span>
                      <span className="text-muted-foreground">1 day ago</span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-muted-foreground">Account created</span>
                      <span className="text-muted-foreground">30 days ago</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {!isOwnProfile && (
              <TabsContent value="roles" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Role Management</CardTitle>
                    <CardDescription>Assign or remove roles for this user</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Current Roles */}
                    <div>
                      <Label className="text-sm font-medium">Current Roles</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {getUserRoles().map(role => (
                          <div key={role} className="flex items-center space-x-2">
                            <Badge variant="secondary">
                              <Shield className="w-3 h-3 mr-1" />
                              {role}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRole(role)}
                              disabled={managingRoles}
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        {getUserRoles().length === 0 && (
                          <span className="text-muted-foreground text-sm">No roles assigned</span>
                        )}
                      </div>
                    </div>

                    {/* Assign New Role */}
                    {getAvailableRolesToAssign().length > 0 && (
                      <div>
                        <Label className="text-sm font-medium">Assign New Role</Label>
                        <div className="flex space-x-2 mt-2">
                          <Select value={selectedRole} onValueChange={setSelectedRole}>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailableRolesToAssign().map((role) => (
                                <SelectItem key={role.Role || role.RoleName} value={role.Role || role.RoleName || ""}>
                                  {role.Role || role.RoleName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button 
                            onClick={handleAssignRole}
                            disabled={!selectedRole || managingRoles}
                          >
                            {managingRoles ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <Plus className="w-4 h-4 mr-2" />
                            )}
                            Assign
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
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