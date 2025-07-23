import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Edit, Key } from "lucide-react";
import { useState } from "react";
import { UserService } from "@/services/userService";
import { useToast } from "@/hooks/use-toast";

interface PersonalInfoProps {
  user: {
    Username?: string;
    UserId?: string;
    Email?: string;
    Roles?: string[];
    ProfileImageURL?: string;
    LastLoginTime?: string;
  };
}

const PersonalInfo = ({ user = {} }: PersonalInfoProps) => {
  const [username, setUsername] = useState(user.Username || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast ? useToast() : { toast: () => {} };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
  };

  const handleEditClick = () => {
    setEditing(true);
  };

  const handleSaveClick = async () => {
    if (!user.UserId) return;
    setSaving(true);
    try {
      await UserService.updateUser(user.UserId, { Username: username });
      setEditing(false);
      toast && toast({ title: "Username updated", description: "Your username has been updated successfully." });
    } catch (err: any) {
      toast && toast({ title: "Error", description: err.message || "Failed to update username.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <User className="w-5 h-5 text-primary" />
          <span>Personal Information</span>
        </CardTitle>
        <CardDescription>Your account details and profile information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center space-x-4">
          <Avatar className="w-20 h-20">
            {user.ProfileImageURL ? (
              <AvatarImage src={user.ProfileImageURL} alt={user.Username || "User"} />
            ) : (
              <AvatarFallback className="text-xl bg-muted text-primary">
                {user.Username ? user.Username[0].toUpperCase() : "U"}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <Button variant="outline" size="sm">
              <Edit className="w-4 h-4 mr-2" />
              Change Photo
            </Button>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="username" className="font-medium">Username</Label>
            <div className="flex space-x-2">
              <Input
                id="username"
                value={username}
                onChange={handleUsernameChange}
                readOnly={!editing}
                className={editing ? "" : "bg-muted"}
              />
              {!editing ? (
                <Button variant="outline" size="sm" onClick={handleEditClick}>
                  Edit
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleSaveClick} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="userId" className="font-medium">User ID</Label>
            <Input id="userId" value={user.UserId || ""} readOnly className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-medium">Email Address</Label>
            <Input id="email" type="email" value={user.Email || ""} readOnly className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="roles" className="font-medium">Roles</Label>
            <Input id="roles" value={user.Roles ? user.Roles.join(", ") : ""} readOnly className="bg-muted" />
          </div>
        </div>
        <div className="pt-4">
          <Button variant="outline">
            <Key className="w-4 h-4 mr-2" />
            Change Password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PersonalInfo;
