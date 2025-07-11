
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Settings, Users, Database, Trash2, Power } from "lucide-react";
import { ApiClient } from "../lib/apiClient";

interface WorkspaceSettingsProps {
  workspaceName: string;
  workspaceId?: string;
  workspaceStatus: string;
  onWorkspaceDeleted?: () => void;
  onWorkspaceStatusChange?: (newStatus: string) => void;
}

const WorkspaceSettings = ({ workspaceName, workspaceId, workspaceStatus, onWorkspaceDeleted, onWorkspaceStatusChange }: WorkspaceSettingsProps) => {
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDeleteWorkspace = () => {
    toast({
      title: "Workspace Deleted",
      description: "The workspace has been deleted successfully.",
      variant: "destructive",
    });
    setIsDeleteDialogOpen(false);
    onWorkspaceDeleted?.();
  };

  const handleStatusChange = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const action = workspaceStatus === "Inactive" ? "enable" : "disable";
      await ApiClient.put(`/workspaces/${workspaceId}?action=${action}`);
      toast({
        title: `Workspace ${action === "enable" ? "Activated" : "Deactivated"}`,
        description: `The workspace has been ${action === "enable" ? "activated" : "deactivated"} successfully.`,
      });
      onWorkspaceStatusChange?.(action === "enable" ? "Active" : "Inactive");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || `Failed to ${workspaceStatus === "Inactive" ? "activate" : "deactivate"} workspace.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsStatusDialogOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Workspace Settings
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem>
            <Users className="w-4 h-4 mr-2" />
            Manage Users
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Database className="w-4 h-4 mr-2" />
            Data Sources
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setIsStatusDialogOpen(true)}
            className="text-yellow-600 focus:text-yellow-600"
          >
            <Power className="w-4 h-4 mr-2" />
            {workspaceStatus === "Inactive" ? "Activate Workspace" : "Deactivate Workspace"}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{workspaceName}"? This action cannot be undone and all data will be permanently lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteWorkspace}>
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{workspaceStatus === "Inactive" ? "Activate Workspace" : "Deactivate Workspace"}</DialogTitle>
            <DialogDescription>
              {workspaceStatus === "Inactive"
                ? `Are you sure you want to activate "${workspaceName}"? Users will regain access to this workspace.`
                : `Are you sure you want to deactivate "${workspaceName}"? Users will lose access to this workspace, but data will be preserved and you can reactivate it later.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleStatusChange} loading={loading}>
              {workspaceStatus === "Inactive" ? "Activate Workspace" : "Deactivate Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSettings;
