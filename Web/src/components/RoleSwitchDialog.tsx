import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { UserService } from '@/services/userService';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { setAuth } from '@/store/slices/authSlice';
import { clearPermissions } from '@/store/slices/permissionsSlice';
import { useToast } from '@/hooks/use-toast';
import { updateUserAttributes } from '@/lib/auth';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface RoleSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleSwitchDialog({ open, onOpenChange }: RoleSwitchDialogProps) {
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  const currentRole = user?.role;

  useEffect(() => {
    if (open && user?.sub) {
      fetchUserRoles();
    }
  }, [open, user?.sub]);

  const fetchUserRoles = async () => {
    if (!user?.sub) return;
    
    setLoading(true);
    try {
      const userData = await UserService.getUser(user.username);
      
      // Filter out current role from available roles
      const otherRoles = userData.Roles.filter(role => role !== currentRole);
      setAvailableRoles(otherRoles);
      
      if (otherRoles.length === 0) {
        toast({
          title: "No Other Roles",
          description: "You don't have any other roles to switch to.",
          variant: "destructive"
        });
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error fetching user roles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch user roles. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSwitch = async () => {
    if (!selectedRole || !user) return;
    
    setSwitching(true);
    try {
      // Update Cognito custom attribute for role
      await updateUserAttributes([
        {
          Name: 'custom:role',
          Value: selectedRole
        }
      ]);

      // Update Redux state with new role
      dispatch(setAuth({
        user: {
          ...user,
          role: selectedRole
        },
        isAuthenticated: true
      }));

      // Clear permissions to force re-fetch with new role
      dispatch(clearPermissions());

      toast({
        title: "Role Switched",
        description: `Successfully switched to ${selectedRole} role.`,
      });

      onOpenChange(false);
      setSelectedRole('');
      
      // Reload the page to ensure all components reflect the new role
      window.location.reload();
    } catch (error) {
      console.error('Error switching role:', error);
      toast({
        title: "Error",
        description: "Failed to switch role. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSwitching(false);
    }
  };

  const handleCancel = () => {
    setSelectedRole('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Switch Role
          </DialogTitle>
          <DialogDescription>
            Select a different role to switch to. Your current role is <strong>{currentRole}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading available roles...</span>
            </div>
          ) : availableRoles.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="text-sm">No other roles available</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Available Roles</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role to switch to" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRole && (
                <div className="p-3 bg-muted rounded-lg border">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-foreground">Important:</p>
                      <p className="text-muted-foreground">
                        Switching roles will change your permissions and may affect your access to certain features.
                        The page will reload to apply the new role.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={handleCancel} disabled={switching}>
            Cancel
          </Button>
          <Button 
            onClick={handleRoleSwitch}
            disabled={!selectedRole || switching}
          >
            {switching ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Switching...
              </>
            ) : (
              'Switch Role'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}