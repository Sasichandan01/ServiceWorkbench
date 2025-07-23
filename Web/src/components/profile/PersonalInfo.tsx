import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Edit, Key } from "lucide-react";
import { useState } from "react";
import { UserService } from "@/services/userService";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useRef } from "react";

interface PersonalInfoProps {
  user: {
    Username?: string;
    UserId?: string;
    Email?: string;
    Roles?: string[];
    ProfileImageURL?: string;
    LastLoginTime?: string;
  };
  onProfileImageUpdated?: () => void;
}

const PersonalInfo = ({ user = {}, onProfileImageUpdated }: PersonalInfoProps) => {
  const [username, setUsername] = useState(user.Username || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast ? useToast() : { toast: () => {} };
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleChangePhotoClick = () => {
    setUploadDialogOpen(true);
    setUploadError(null);
    setUploadProgress(0);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      // Only allow image files
      if (!/^image\/(jpeg|png|gif)$/.test(file.type)) {
        setUploadError("Only JPEG, PNG, or GIF images are allowed.");
        setUploading(false);
        return;
      }
      if (!user.UserId) throw new Error("User ID not found");
      // Step 1: Get presigned URL
      const presignedUrl = await UserService.getProfileImageUploadUrl(user.UserId, file.type);
      // Step 2: Upload to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setUploadProgress((event.loaded / event.total) * 100);
          }
        });
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve();
          } else {
            reject(new Error("Upload failed: " + xhr.statusText));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });
      setUploading(false);
      setUploadDialogOpen(false);
      toast && toast({ title: "Profile image updated", description: "Your profile photo has been updated." });
      if (onProfileImageUpdated) onProfileImageUpdated();
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload image");
      setUploading(false);
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
            <Button variant="outline" size="sm" onClick={handleChangePhotoClick}>
              <Edit className="w-4 h-4 mr-2" />
              Change Photo
            </Button>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Profile Photo</DialogTitle>
                  <DialogDescription>Select a JPEG, PNG, or GIF image to use as your profile photo.</DialogDescription>
                </DialogHeader>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="mb-2"
                />
                {uploading && (
                  <div className="mb-2 text-sm text-blue-600">Uploading... {uploadProgress.toFixed(0)}%</div>
                )}
                {uploadError && (
                  <div className="mb-2 text-sm text-red-600">{uploadError}</div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={uploading}>Cancel</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
