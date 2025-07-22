import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Edit, Key } from "lucide-react";

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
            <Input id="username" value={user.Username || ""} readOnly className="bg-muted" />
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
